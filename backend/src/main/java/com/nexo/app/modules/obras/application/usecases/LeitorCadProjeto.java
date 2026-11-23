package com.nexo.app.modules.obras.application.usecases;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.nexo.app.modules.obras.application.usecases.ArquivoDxf.Insercao;
import com.nexo.app.modules.obras.application.usecases.ArquivoDxf.Texto;
import com.nexo.app.modules.obras.application.usecases.ArquivoDxf.Traco;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Lê o projeto do arquivo CAD (DXF; o DWG chega aqui já convertido). Ao contrário do PDF, nada é adivinhado: as camadas
 * dizem o que é poste, rótulo, rede, o que é novo e o que sai, e as coordenadas são as do campo (UTM, em metros). A
 * metragem do vão é conferida com o comprimento real da linha.
 *
 * <p>A leitura é feita uma vez para o projeto inteiro ({@link #interpretar}) e depois posta numa folha do PDF pela
 * georreferência dela ({@link #naFolha}): o PDF continua sendo o projeto mestre, que a equipe vê no app.</p>
 */
@Component
public class LeitorCadProjeto {

    /** Linhas do rótulo ficam a 2,5 alturas de texto uma da outra no GeoRede. */
    private static final double PASSO_LINHA = 2.5;
    private static final int MAXIMO_LINHAS_ROTULO = 8;
    /** Largura média de uma letra, em alturas de texto, para achar a margem esquerda de texto centralizado. */
    private static final double LARGURA_LETRA = 0.8;
    /** Ponta de linha a até isso do poste é ligada a ele (a rede termina na cruzeta, não no centro do poste). */
    private static final double ALCANCE_POSTE_M = 3.5;
    /** Rótulo cuja coordenada escrita fica a até isso do poste é dele. */
    private static final double ALCANCE_COORDENADA_M = 2.5;
    private static final double ALCANCE_EQUIPAMENTO_M = 15;
    private static final double TOLERANCIA_COTA_M = 2;
    private static final double TOLERANCIA_COTA_RELATIVA = 0.22;
    private static final double METROS_POR_PONTO_EM_1 = 0.0254 / 72;

    private static final Pattern UTM = Pattern.compile("^(\\d{6}(?:[.,]\\d+)?)\\s*/\\s*(\\d{7}(?:[.,]\\d+)?)$");
    private static final Pattern COTA = Pattern.compile("^(\\d+(?:[.,]\\d+)?)\\s*m\\b\\s*(.*)$");
    private static final Pattern PROVISORIO = Pattern.compile("^0+(\\d{1,4})$");
    private static final ObjectMapper JSON = new ObjectMapper();

    /** Poste do projeto com o rótulo dele. */
    static final class PosteCad {
        final String codigo;
        final double leste;
        final double norte;
        boolean projetado;
        String poste;
        boolean posteNovo;
        final List<String> novas = new ArrayList<>();
        final List<String> retirar = new ArrayList<>();
        final List<String> existentes = new ArrayList<>();
        /** Outro número escrito no mesmo rótulo (ex.: o da chave instalada no poste). */
        final List<String> outrosCodigos = new ArrayList<>();
        /** O rótulo foi ligado ao poste pela coordenada escrita nele (certeza), não só pela proximidade. */
        boolean pelaCoordenada;

        PosteCad(String codigo, double leste, double norte) {
            this.codigo = codigo;
            this.leste = leste;
            this.norte = norte;
        }

        boolean provisorio() {
            return PROVISORIO.matcher(codigo).matches();
        }

        boolean intercalado() {
            return projetado && provisorio();
        }

        boolean novo() {
            return projetado || posteNovo;
        }

        boolean temObra() {
            return projetado || posteNovo || !novas.isEmpty() || !retirar.isEmpty();
        }
    }

    static final class VaoCad {
        final PosteCad a;
        final PosteCad b;
        final double comprimento;
        final boolean novo;
        final boolean primario;
        Double metragem;
        String condutor;
        boolean medida;

        VaoCad(PosteCad a, PosteCad b, double comprimento, boolean novo, boolean primario) {
            this.a = a;
            this.b = b;
            this.comprimento = comprimento;
            this.novo = novo;
            this.primario = primario;
        }
    }

    /**
     * @param postes todos os postes rotulados do arquivo (para georreferenciar uma folha pelos códigos)
     * @param pontos postes da obra: os que entram, mudam, ou onde a rede nova chega
     * @param vaos   vãos da obra
     */
    record ProjetoCad(String perfil, List<PosteCad> postes, List<PosteCad> pontos, List<VaoCad> vaos) {
    }

    /**
     * @param foraDaFolha pontos da obra que ficam fora desta folha (estão em outra, ou fora do recorte plotado)
     */
    public record Leitura(String json, int pontos, int vaos, int foraDaFolha, String perfil, Integer escala) {
    }

    /** Interpreta o DXF inteiro. Vazio quando as camadas não seguem nenhum perfil conhecido. */
    Optional<ProjetoCad> interpretar(byte[] dxf) {
        ArquivoDxf.Desenho desenho = ArquivoDxf.ler(dxf);
        Set<String> camadas = new LinkedHashSet<>();
        desenho.textos().forEach(t -> camadas.add(t.camada()));
        desenho.insercoes().forEach(i -> camadas.add(i.camada()));
        desenho.tracos().forEach(t -> camadas.add(t.camada()));
        Optional<PerfilCamadasCad> perfil = PerfilCamadasCad.detectar(camadas);
        return perfil.map(p -> interpretar(desenho, p));
    }

    private ProjetoCad interpretar(ArquivoDxf.Desenho desenho, PerfilCamadasCad perfil) {
        List<double[]> simbolos = posicoesDePoste(desenho.insercoes(), perfil);
        List<PosteCad> postes = rotular(desenho.textos(), simbolos, perfil);
        equipamentos(desenho.textos(), postes, perfil);
        List<VaoCad> vaos = vaos(desenho.tracos(), postes, perfil);
        cotas(desenho.textos(), vaos, perfil);
        conferirMetragens(vaos);

        // O que é obra: vão novo e vão existente redividido por poste novo intercalado; postes que mudam e as pontas.
        List<VaoCad> vaosObra = vaos.stream().filter(v -> v.novo || v.a.intercalado() || v.b.intercalado()).toList();
        Set<PosteCad> naObra = new LinkedHashSet<>();
        postes.stream().filter(PosteCad::temObra).forEach(naObra::add);
        vaosObra.forEach(v -> {
            naObra.add(v.a);
            naObra.add(v.b);
        });
        return new ProjetoCad(perfil.nome(), postes, List.copyOf(naObra), vaosObra);
    }

    /** Inserções de poste, sem repetir o que está no mesmo lugar (símbolo novo sobre o existente). */
    private static List<double[]> posicoesDePoste(List<Insercao> insercoes, PerfilCamadasCad perfil) {
        List<double[]> posicoes = new ArrayList<>();
        for (Insercao i : insercoes) {
            if (perfil.poste().matcher(i.camada()).matches()
                    && posicoes.stream().noneMatch(p -> Math.hypot(p[0] - i.x(), p[1] - i.y()) < 0.05)) {
                posicoes.add(new double[]{i.x(), i.y()});
            }
        }
        return posicoes;
    }

    private record Rotulo(Texto numero, List<Texto> linhas) {
    }

    /**
     * Monta o rótulo de cada poste: o código abre a pilha e as linhas seguintes ficam 2,5 alturas abaixo, cada uma, com
     * a margem esquerda alinhada; textos riscados ou novos ao lado entram na mesma linha. Depois liga o rótulo ao poste
     * pela coordenada escrita nele; sem coordenada, pelo poste livre mais perto.
     */
    private static List<PosteCad> rotular(List<Texto> textos, List<double[]> simbolos, PerfilCamadasCad perfil) {
        List<Texto> numeros = textos.stream().filter(t -> perfil.numero().matcher(t.camada()).matches() && !t.texto().isBlank()).toList();
        List<Texto> linhas = textos.stream().filter(t -> perfil.ehRotulo(t.camada())).toList();
        Map<Texto, List<Texto>> pilhas = new LinkedHashMap<>();
        numeros.forEach(n -> pilhas.put(n, new ArrayList<>()));
        for (Texto t : linhas) {
            Texto dono = null;
            double melhor = Double.MAX_VALUE;
            for (Texto n : numeros) {
                double h = altura(n);
                double linha = (n.y() - t.y()) / (PASSO_LINHA * h);
                // A coordenada às vezes fica meia linha fora da grade; ela se confere pelo próprio valor depois.
                double folgaLinha = perfil.coordenada().matcher(t.camada()).matches() ? 0.35 : 0.2;
                if (linha < 0.5 || linha > MAXIMO_LINHAS_ROTULO + 0.5 || Math.abs(linha - Math.round(linha)) > folgaLinha) {
                    continue;
                }
                double desvio = esquerda(t) - esquerda(n);
                if (desvio < -1.5 * h || desvio > 18 * h) {
                    continue;
                }
                double custo = linha * 10 + Math.abs(desvio) / h;
                if (custo < melhor) {
                    melhor = custo;
                    dono = n;
                }
            }
            if (dono != null) {
                pilhas.get(dono).add(t);
            }
        }
        Map<Texto, List<String>> outrosCodigos = juntarNumerosSobrepostos(pilhas);

        List<PosteCad> postes = new ArrayList<>();
        Set<Integer> usados = new HashSet<>();
        List<Rotulo> semCoordenada = new ArrayList<>();
        for (Map.Entry<Texto, List<Texto>> pilha : pilhas.entrySet()) {
            double[] escrita = coordenadaEscrita(pilha.getValue(), perfil);
            int simbolo = escrita == null ? -1 : maisPerto(simbolos, escrita[0], escrita[1], ALCANCE_COORDENADA_M, usados);
            if (simbolo >= 0) {
                usados.add(simbolo);
                PosteCad p = criar(pilha.getKey(), pilha.getValue(), simbolos.get(simbolo), perfil);
                p.pelaCoordenada = true;
                p.outrosCodigos.addAll(outrosCodigos.getOrDefault(pilha.getKey(), List.of()));
                postes.add(p);
            } else {
                semCoordenada.add(new Rotulo(pilha.getKey(), pilha.getValue()));
            }
        }
        // Sem coordenada no rótulo: o poste livre mais perto do rótulo, do par mais próximo para o mais distante.
        List<double[]> pares = new ArrayList<>();
        for (int r = 0; r < semCoordenada.size(); r++) {
            Texto n = semCoordenada.get(r).numero();
            double alcance = 25 * altura(n);
            for (int s = 0; s < simbolos.size(); s++) {
                double d = Math.hypot(simbolos.get(s)[0] - n.x(), simbolos.get(s)[1] - n.y());
                if (d < alcance) {
                    pares.add(new double[]{d, r, s});
                }
            }
        }
        pares.sort(Comparator.comparingDouble(p -> p[0]));
        Set<Integer> rotulados = new HashSet<>();
        for (double[] par : pares) {
            int r = (int) par[1];
            int s = (int) par[2];
            if (rotulados.contains(r) || usados.contains(s)) {
                continue;
            }
            rotulados.add(r);
            usados.add(s);
            PosteCad p = criar(semCoordenada.get(r).numero(), semCoordenada.get(r).linhas(), simbolos.get(s), perfil);
            p.outrosCodigos.addAll(outrosCodigos.getOrDefault(semCoordenada.get(r).numero(), List.of()));
            postes.add(p);
        }
        return postes;
    }

    /**
     * Poste com dois números (ex.: o código e o de uma chave nele) tem os dois textos quase um sobre o outro: viram uma
     * pilha só, com o número de cima como código e o outro guardado como informação.
     */
    private static Map<Texto, List<String>> juntarNumerosSobrepostos(Map<Texto, List<Texto>> pilhas) {
        Map<Texto, List<String>> outros = new HashMap<>();
        List<Texto> numeros = new ArrayList<>(pilhas.keySet());
        numeros.sort(Comparator.comparingDouble(t -> -t.y()));
        for (int i = 0; i < numeros.size(); i++) {
            Texto principal = numeros.get(i);
            if (!pilhas.containsKey(principal)) {
                continue;
            }
            double h = altura(principal);
            for (int j = i + 1; j < numeros.size(); j++) {
                Texto outro = numeros.get(j);
                if (pilhas.containsKey(outro) && principal.y() - outro.y() < PASSO_LINHA * h
                        && Math.abs(esquerda(outro) - esquerda(principal)) < 4 * h) {
                    pilhas.get(principal).addAll(pilhas.remove(outro));
                    outros.computeIfAbsent(principal, k -> new ArrayList<>()).add(outro.texto().trim());
                }
            }
        }
        return outros;
    }

    private static double altura(Texto t) {
        return t.altura() > 0 ? t.altura() : 1;
    }

    private static double esquerda(Texto t) {
        return t.x() - t.ancora() * t.texto().length() * LARGURA_LETRA * altura(t);
    }

    private static double[] coordenadaEscrita(List<Texto> linhas, PerfilCamadasCad perfil) {
        for (Texto t : linhas) {
            if (perfil.coordenada().matcher(t.camada()).matches()) {
                Matcher m = UTM.matcher(t.texto().trim());
                if (m.matches()) {
                    return new double[]{Double.parseDouble(m.group(1).replace(',', '.')), Double.parseDouble(m.group(2).replace(',', '.'))};
                }
            }
        }
        return null;
    }

    private static int maisPerto(List<double[]> pontos, double x, double y, double alcance, Set<Integer> usados) {
        int melhor = -1;
        double menor = alcance;
        for (int i = 0; i < pontos.size(); i++) {
            double d = Math.hypot(pontos.get(i)[0] - x, pontos.get(i)[1] - y);
            if (d < menor && !usados.contains(i)) {
                menor = d;
                melhor = i;
            }
        }
        return melhor;
    }

    private static PosteCad criar(Texto numero, List<Texto> linhas, double[] simbolo, PerfilCamadasCad perfil) {
        PosteCad p = new PosteCad(numero.texto().replace(" ", "").toUpperCase(Locale.ROOT), simbolo[0], simbolo[1]);
        p.projetado = perfil.ehNovo(numero.camada());
        List<Texto> ordem = new ArrayList<>(linhas);
        ordem.sort(Comparator.comparingDouble((Texto t) -> -t.y()).thenComparingDouble(Texto::x));
        for (Texto t : ordem) {
            String texto = t.texto().trim();
            if (texto.isEmpty() || perfil.coordenada().matcher(t.camada()).matches()) {
                continue;
            }
            boolean novo = perfil.ehNovo(t.camada());
            boolean retirado = perfil.ehRetirado(t.camada());
            boolean tipoPoste = perfil.tipoPoste().matcher(t.camada()).matches();
            if (retirado) {
                p.retirar.add(texto);
            } else if (tipoPoste && novo) {
                p.poste = texto;
                p.posteNovo = !p.projetado;
            } else if (tipoPoste) {
                p.existentes.add("poste " + texto);
            } else if (novo) {
                p.novas.add(texto);
            } else {
                p.existentes.add(texto);
            }
        }
        return p;
    }

    /**
     * Equipamento novo (ex.: "1234567-Chave Fusível-ABC-6K") entra como estrutura nova do poste. O texto novo costuma ficar
     * afastado; quando o equipamento já tem rótulo existente com o mesmo código ("1234567"), é ele que marca o poste.
     */
    private static void equipamentos(List<Texto> textos, List<PosteCad> postes, PerfilCamadasCad perfil) {
        Map<String, Texto> existentes = new HashMap<>();
        for (Texto t : textos) {
            if (perfil.equipamento().matcher(t.camada()).matches() && !perfil.ehNovo(t.camada()) && !t.texto().isBlank()) {
                existentes.putIfAbsent(t.texto().trim(), t);
            }
        }
        for (Texto t : textos) {
            if (!perfil.equipamento().matcher(t.camada()).matches() || !perfil.ehNovo(t.camada()) || t.texto().isBlank()) {
                continue;
            }
            String texto = t.texto().trim();
            Texto ancora = existentes.getOrDefault(texto.split("[-\\s]", 2)[0], t);
            PosteCad dono = null;
            double menor = ALCANCE_EQUIPAMENTO_M;
            for (PosteCad p : postes) {
                double d = Math.hypot(p.leste - ancora.x(), p.norte - ancora.y());
                if (d < menor) {
                    menor = d;
                    dono = p;
                }
            }
            if (dono != null) {
                dono.novas.add(texto);
            }
        }
    }

    /**
     * Vãos: as linhas de rede ligam um poste a outro, às vezes em vários pedaços. As pontas a até 3,5 m de um poste são
     * dele; as demais se juntam pelas pontas comuns até chegar a outro poste.
     */
    private static List<VaoCad> vaos(List<Traco> tracos, List<PosteCad> postes, PerfilCamadasCad perfil) {
        List<No> nos = new ArrayList<>();
        Map<PosteCad, No> noDoPoste = new HashMap<>();
        for (PosteCad p : postes) {
            No no = new No(p.leste, p.norte, p);
            nos.add(no);
            noDoPoste.put(p, no);
        }
        for (Traco t : tracos) {
            if (!perfil.trecho().matcher(t.camada()).matches() || t.vertices().size() < 2) {
                continue;
            }
            boolean novo = perfil.ehNovo(t.camada());
            boolean retirado = perfil.ehRetirado(t.camada());
            boolean primario = perfil.primario().matcher(t.camada()).find();
            for (int i = 0; i + 1 < t.vertices().size(); i++) {
                No a = no(nos, postes, t.vertices().get(i));
                No b = no(nos, postes, t.vertices().get(i + 1));
                if (a != b) {
                    Aresta aresta = new Aresta(a, b, Math.hypot(a.x - b.x, a.y - b.y), novo, retirado, primario);
                    a.arestas.add(aresta);
                    b.arestas.add(aresta);
                }
            }
        }
        Map<String, VaoCad> vaos = new LinkedHashMap<>();
        for (PosteCad origem : postes) {
            No inicio = noDoPoste.get(origem);
            for (Aresta primeira : inicio.arestas) {
                // Segue os pedaços sem poste até a próxima ponta que é poste.
                No anterior = inicio;
                Aresta atual = primeira;
                double comprimento = 0;
                boolean novo = false;
                boolean retirado = true;
                Set<No> vistos = new HashSet<>();
                No destino = null;
                while (atual != null) {
                    comprimento += atual.comprimento;
                    novo |= atual.novo;
                    retirado &= atual.retirado;
                    No proximo = atual.outro(anterior);
                    if (proximo.poste != null) {
                        destino = proximo;
                        break;
                    }
                    if (!vistos.add(proximo) || proximo.arestas.size() != 2) {
                        break;
                    }
                    Aresta seguinte = proximo.arestas.get(0) == atual ? proximo.arestas.get(1) : proximo.arestas.get(0);
                    anterior = proximo;
                    atual = seguinte;
                }
                if (destino == null || destino.poste == origem || retirado) {
                    continue;
                }
                // Primário e secundário entre os mesmos postes são vãos diferentes (cabos e cotas próprios).
                String chave = (primeira.primario ? "P" : "S")
                        + (System.identityHashCode(origem) < System.identityHashCode(destino.poste)
                        ? System.identityHashCode(origem) + "|" + System.identityHashCode(destino.poste)
                        : System.identityHashCode(destino.poste) + "|" + System.identityHashCode(origem));
                VaoCad existente = vaos.get(chave);
                if (existente == null || (novo && !existente.novo)) {
                    vaos.put(chave, new VaoCad(origem, destino.poste, comprimento, novo, primeira.primario));
                }
            }
        }
        return new ArrayList<>(vaos.values());
    }

    private static final class No {
        final double x;
        final double y;
        final PosteCad poste;
        final List<Aresta> arestas = new ArrayList<>();

        No(double x, double y, PosteCad poste) {
            this.x = x;
            this.y = y;
            this.poste = poste;
        }
    }

    private record Aresta(No a, No b, double comprimento, boolean novo, boolean retirado, boolean primario) {
        No outro(No no) {
            return no == a ? b : a;
        }
    }

    /** Nó da rede: o poste ao alcance, ou uma ponta solta (pontas a menos de 10 cm são a mesma). */
    private static No no(List<No> nos, List<PosteCad> postes, double[] v) {
        No melhor = null;
        double menor = ALCANCE_POSTE_M;
        for (No n : nos) {
            if (n.poste == null) {
                continue;
            }
            double d = Math.hypot(n.x - v[0], n.y - v[1]);
            if (d < menor) {
                menor = d;
                melhor = n;
            }
        }
        if (melhor != null) {
            return melhor;
        }
        for (No n : nos) {
            if (n.poste == null && Math.hypot(n.x - v[0], n.y - v[1]) < 0.1) {
                return n;
            }
        }
        No novo = new No(v[0], v[1], null);
        nos.add(novo);
        return novo;
    }

    /** Cota "33m AN 1 #35(35) MULT": fica com o vão mais perto, paralelo ao texto e do mesmo tipo (primário/secundário). */
    private static void cotas(List<Texto> textos, List<VaoCad> vaos, PerfilCamadasCad perfil) {
        for (Texto t : textos) {
            if (!perfil.cota().matcher(t.camada()).matches() || perfil.ehRetirado(t.camada())) {
                continue;
            }
            Matcher m = COTA.matcher(t.texto().trim());
            if (!m.matches()) {
                continue;
            }
            boolean novo = perfil.ehNovo(t.camada());
            boolean primario = perfil.primario().matcher(t.camada()).find();
            VaoCad melhor = null;
            double menor = Double.MAX_VALUE;
            for (VaoCad v : vaos) {
                if (v.novo != novo || v.primario != primario) {
                    continue;
                }
                double dx = v.b.leste - v.a.leste;
                double dy = v.b.norte - v.a.norte;
                double l2 = dx * dx + dy * dy;
                if (l2 == 0) {
                    continue;
                }
                double u = Math.max(0, Math.min(1, ((t.x() - v.a.leste) * dx + (t.y() - v.a.norte) * dy) / l2));
                double d = Math.hypot(t.x() - (v.a.leste + u * dx), t.y() - (v.a.norte + u * dy));
                double angulo = Math.toDegrees(Math.atan2(dy, dx));
                double diferenca = Math.abs(((t.rotacao() - angulo + 90) % 180 + 180) % 180 - 90);
                if (diferenca < 20 && d < menor) {
                    menor = d;
                    melhor = v;
                }
            }
            if (melhor != null && menor < 10 * altura(t)) {
                melhor.metragem = Double.parseDouble(m.group(1).replace(',', '.'));
                melhor.condutor = m.group(2).isBlank() ? null : m.group(2).trim();
            }
        }
    }

    /** As coordenadas do CAD são as do campo: o comprimento da linha confere a cota e a substitui quando falta. */
    private static void conferirMetragens(List<VaoCad> vaos) {
        for (VaoCad v : vaos) {
            double medida = Math.round(v.comprimento);
            if (medida <= 0) {
                continue;
            }
            boolean diverge = v.metragem != null
                    && Math.abs(v.metragem - medida) > Math.max(TOLERANCIA_COTA_M, TOLERANCIA_COTA_RELATIVA * medida);
            if (v.metragem == null || diverge) {
                v.metragem = medida;
                v.medida = true;
            }
        }
    }

    /** Põe o projeto numa folha do PDF; o que cai fora dela fica de fora e é contado. */
    Leitura naFolha(ProjetoCad projeto, LeitorVetorialProjeto.Georreferencia geo) {
        Map<PosteCad, double[]> posicoes = new LinkedHashMap<>();
        int fora = 0;
        for (PosteCad p : projeto.pontos()) {
            double[] f = geo.naFolha(p.leste, p.norte);
            if (f[0] >= 0 && f[0] <= 1 && f[1] >= 0 && f[1] <= 1) {
                posicoes.put(p, f);
            } else {
                fora++;
            }
        }
        List<VaoCad> vaos = projeto.vaos().stream().filter(v -> posicoes.containsKey(v.a) && posicoes.containsKey(v.b)).toList();
        List<PosteCad> pontos = new ArrayList<>(posicoes.keySet());
        Map<PosteCad, Integer> ordem = OrdemRede.ordenar(pontos, vaos.stream().map(v -> new OrdemRede.Ligacao<>(v.a, v.b)).toList(),
                PosteCad::novo, p -> posicoes.get(p)[0], p -> posicoes.get(p)[1]);
        Integer escala = (int) Math.round(geo.metrosPorPonto() / METROS_POR_PONTO_EM_1);

        ObjectNode raiz = JSON.createObjectNode();
        raiz.put("escala", escala);
        ArrayNode lista = raiz.putArray("pontos");
        for (PosteCad p : pontos) {
            ObjectNode no = lista.addObject();
            no.put("id", p.codigo);
            no.putNull("numero");
            if (p.provisorio()) {
                no.putNull("barramento");
            } else {
                no.put("barramento", p.codigo);
            }
            no.put("ordem", ordem.getOrDefault(p, Integer.MAX_VALUE));
            no.put("tipo", "POSTE");
            no.put("x", posicoes.get(p)[0]);
            no.put("y", posicoes.get(p)[1]);
            if (p.poste != null) {
                no.put("poste", p.poste);
            } else {
                no.putNull("poste");
            }
            ArrayNode estruturas = no.putArray("estruturas");
            if (p.provisorio()) {
                estruturas.add(InterpretadorPropostaProjeto.PREFIXO_PROJETO + "ponto " + p.codigo);
            }
            p.outrosCodigos.forEach(c -> estruturas.add(InterpretadorPropostaProjeto.PREFIXO_PROJETO + "também numerado " + c));
            p.novas.forEach(estruturas::add);
            p.retirar.forEach(r -> estruturas.add(InterpretadorPropostaProjeto.PREFIXO_RETIRAR + r));
            if (!p.temObra()) {
                estruturas.add(InterpretadorPropostaProjeto.PREFIXO_EXISTENTE + String.join(" ", p.existentes));
            }
            no.put("retirar", false);
            // Lido do CAD: o texto é exato; só a ligação rótulo → poste por proximidade deixa alguma dúvida.
            no.put("confianca", p.pelaCoordenada ? 0.98 : 0.9);
        }
        ArrayNode listaVaos = raiz.putArray("vaos");
        for (VaoCad v : vaos) {
            ObjectNode no = listaVaos.addObject();
            no.put("de", v.a.codigo);
            no.put("para", v.b.codigo);
            no.put("metragem", v.metragem);
            if (v.condutor != null) {
                no.put("condutor", v.condutor);
            } else {
                no.putNull("condutor");
            }
            if (v.medida) {
                no.put("metragemMedida", true);
            }
            no.put("confianca", v.medida ? 0.9 : 0.98);
        }
        return new Leitura(raiz.toString(), pontos.size(), vaos.size(), fora, projeto.perfil(), escala);
    }

    /**
     * Georreferência de uma folha sem rótulos desenhados (PDF com texto): liga os códigos de poste achados no texto do
     * PDF aos do CAD. A posição do código fica um pouco ao lado do poste, então a folha precisa de vários códigos.
     */
    Optional<LeitorVetorialProjeto.Georreferencia> georreferenciarPorCodigos(ProjetoCad projeto, LeitorCamadaProjeto.CamadaPagina camada) {
        Map<String, PosteCad> porCodigo = new HashMap<>();
        projeto.postes().forEach(p -> porCodigo.put(p.codigo, p));
        List<double[]> utm = new ArrayList<>();
        List<double[]> folha = new ArrayList<>();
        for (LeitorCamadaProjeto.Candidato c : camada.candidatos()) {
            PosteCad p = c.codigo() != null ? porCodigo.get(c.codigo().toUpperCase(Locale.ROOT)) : null;
            if (p != null) {
                utm.add(new double[]{p.leste, p.norte});
                folha.add(new double[]{c.x() * camada.larguraPt(), c.y() * camada.alturaPt()});
            }
        }
        return utm.size() < 3 ? Optional.empty()
                : LeitorVetorialProjeto.Georreferencia.ajustar(utm, folha, camada.larguraPt(), camada.alturaPt());
    }
}
