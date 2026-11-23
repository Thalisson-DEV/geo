package com.nexo.app.modules.obras.application.usecases;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.nexo.app.modules.obras.application.usecases.ExtratorVetorialPdf.Desenho;
import com.nexo.app.modules.obras.application.usecases.ExtratorVetorialPdf.Segmento;
import com.nexo.app.modules.obras.application.usecases.ExtratorVetorialPdf.Simbolo;
import com.nexo.app.modules.obras.application.usecases.ReconhecedorGlifos.Linha;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import lombok.extern.slf4j.Slf4j;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.stereotype.Component;

import java.awt.geom.Rectangle2D;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Lê o projeto direto do desenho vetorial do PDF, sem IA, quando o programa de projeto exportou os rótulos como letras
 * desenhadas (é o caso do GeoRede e de vários CADs). Cada poste é o símbolo da rede; o rótulo ao lado traz código, poste,
 * estruturas e coordenada UTM. A coordenada ajusta a escala e a posição da folha, então cada rótulo encontra o seu
 * símbolo mesmo quando o projetista o afastou. Os vãos são os traços que ligam dois postes; a metragem e o cabo vêm do
 * texto escrito ao longo do traço.
 *
 * <p>Devolve a leitura no mesmo JSON que o modelo de visão devolveria, para o {@link InterpretadorPropostaProjeto}
 * cuidar de numeração, kits e conferência de metragem do mesmo jeito.</p>
 */
@Slf4j
@Component
public class LeitorVetorialProjeto {

    /** Mínimo de letras desenhadas para valer a leitura vetorial; abaixo disso o PDF não é desse tipo. */
    private static final int MINIMO_GLIFOS = 40;
    private static final int PRETO = 0x000000;
    private static final int AZUL = 0x0000FF;
    private static final int BRANCO = 0xFFFFFF;
    /** Cor de "elemento projetado" na legenda das concessionárias (magenta; vermelho em algumas). */
    private static final List<Integer> CORES_PROJETADO = List.of(0xFF00FF, 0xFF0000);
    /** Caracteres da fonte de simbologia que desenham poste. */
    private static final Set<String> POSTES = Set.of("/", "%", "!", "K", "L", "c", "y", "u", "I");
    private static final double METROS_POR_PONTO_EM_1 = 0.0254 / 72;

    private static final Pattern IDENTIFICADOR = Pattern.compile("^[0-9A-Z]{6,10}$");
    private static final Pattern UTM = Pattern.compile("^(\\d{6})/(\\d{7})$");
    private static final Pattern POSTE = Pattern.compile("\\d+\\s*/\\s*\\d+");
    private static final Pattern TEXTO_VAO = Pattern.compile("^(\\d+(?:[.,]\\d+)?)\\s*m\\b\\s*(.*)$");
    private static final Pattern PROVISORIO = Pattern.compile("^0+(\\d{1,4})$");
    /** Linha com semelhança média abaixo disso está sobreposta a outro desenho: não se aproveita. */
    private static final double CONFIANCA_MINIMA_LINHA = 0.3;

    private static final ObjectMapper JSON = new ObjectMapper();

    /**
     * @param json     leitura no formato do modelo de visão, com x e y em [0,1] da página como ela aparece
     * @param pontos   pontos de obra encontrados
     * @param vaos     vãos encontrados
     * @param escala   denominador da escala medida pela georreferência, nulo sem coordenadas
     */
    public record Leitura(String json, int pontos, int vaos, Integer escala) {
    }

    /** Só confere se a folha é do tipo vetorial, sem ler os rótulos: decide se a tela precisa perguntar a orientação. */
    public boolean folhaVetorial(byte[] pdf, int pagina) {
        try (PDDocument documento = Loader.loadPDF(pdf)) {
            return pagina >= 1 && pagina <= documento.getNumberOfPages()
                    && ExtratorVetorialPdf.extrair(documento.getPage(pagina - 1)).glifos().size() >= MINIMO_GLIFOS;
        } catch (IOException e) {
            return false;
        }
    }

    /**
     * Relação entre a coordenada UTM e a posição na folha, ajustada pelos postes cujo rótulo traz a coordenada. É o que
     * permite pôr na folha um ponto lido de outra fonte, como o DXF do mesmo projeto.
     */
    public record Georreferencia(Semelhanca semelhanca, double larguraPt, double alturaPt) {

        /** Posição em [0,1] da página como ela aparece; fora de [0,1] o ponto não está nesta folha. */
        public double[] naFolha(double leste, double norte) {
            double[] pt = semelhanca.aplicar(new double[]{leste, norte});
            return new double[]{pt[0] / larguraPt, pt[1] / alturaPt};
        }

        public double metrosPorPonto() {
            return semelhanca.metrosPorPonto();
        }

        /** Ajuste a partir de pares (UTM, posição na folha em pontos de PDF), como os códigos achados no texto do PDF. */
        static Optional<Georreferencia> ajustar(List<double[]> utm, List<double[]> folhaPt, double larguraPt, double alturaPt) {
            Semelhanca s = Semelhanca.ajustar(utm, folhaPt);
            return s == null ? Optional.empty() : Optional.of(new Georreferencia(s, larguraPt, alturaPt));
        }
    }

    /** Georreferência da folha vetorial pelos rótulos com coordenada; vazia em folha sem rótulos desenhados ou sem UTM. */
    public Optional<Georreferencia> georreferenciar(byte[] pdf, int pagina) {
        try (PDDocument documento = Loader.loadPDF(pdf)) {
            if (pagina < 1 || pagina > documento.getNumberOfPages()) {
                return Optional.empty();
            }
            Desenho desenho = ExtratorVetorialPdf.extrair(documento.getPage(pagina - 1));
            if (desenho.glifos().size() < MINIMO_GLIFOS) {
                return Optional.empty();
            }
            List<Linha> linhas = ReconhecedorGlifos.ler(desenho.glifos());
            double h = ReconhecedorGlifos.alturaTipica(desenho.glifos());
            int corProjetado = corProjetado(linhas);
            List<Ponto> pontos = blocos(linhas, h, corProjetado, riscadas(linhas, desenho.segmentos()));
            List<Segmento> rede = desenho.segmentos().stream().filter(s -> s.cor() != AZUL && s.cor() != BRANCO).toList();
            Semelhanca geo = pontos.isEmpty() ? null : associar(pontos, candidatos(desenho.simbolos(), rede), h, corProjetado);
            return geo == null ? Optional.empty() : Optional.of(new Georreferencia(geo, desenho.largura(), desenho.altura()));
        } catch (IOException e) {
            log.debug("PDF sem desenho vetorial legível", e);
            return Optional.empty();
        }
    }

    public Optional<Leitura> ler(byte[] pdf, int pagina) {
        try (PDDocument documento = Loader.loadPDF(pdf)) {
            if (pagina < 1 || pagina > documento.getNumberOfPages()) {
                throw new InvarianteVioladaException("O projeto não tem a página " + pagina + ".");
            }
            Desenho desenho = ExtratorVetorialPdf.extrair(documento.getPage(pagina - 1));
            if (desenho.glifos().size() < MINIMO_GLIFOS) {
                return Optional.empty();
            }
            return montar(desenho);
        } catch (IOException e) {
            log.debug("PDF sem desenho vetorial legível", e);
            return Optional.empty();
        }
    }

    // ---- montagem ----

    private static final class Ponto {
        String codigo;
        boolean projetado;
        String poste;
        final List<String> estruturas = new ArrayList<>();
        final List<String> novas = new ArrayList<>();
        final List<String> retirar = new ArrayList<>();
        final List<String> existentes = new ArrayList<>();
        double[] utm;
        Rectangle2D bloco;
        double x;
        double y;
        Rectangle2D simbolo;
        double distancia = -1;
        boolean georreferenciado;
        boolean posteNovo;
        int ilegiveis;
        double nota;

        /** Poste que entra ou é trocado: os vãos ligados a ele são obra, mesmo sem cota escrita. */
        boolean novo() {
            return projetado || posteNovo;
        }

        /** Poste novo de verdade (código provisório do projeto), não a troca de um poste que já existe no lugar. */
        boolean intercalado() {
            return projetado && provisorio();
        }

        boolean temObra() {
            return projetado || posteNovo || !novas.isEmpty() || !retirar.isEmpty();
        }

        boolean provisorio() {
            return PROVISORIO.matcher(codigo).matches();
        }
    }

    private static final class Vao {
        final Ponto a;
        final Ponto b;
        Double metragem;
        String condutor;
        /** A metragem saiu da medida no desenho georreferenciado, não da cota escrita. */
        boolean medida;
        /** O cabo veio do vão vizinho do mesmo ramal, não do texto deste vão. */
        boolean condutorHerdado;

        boolean temTexto() {
            return metragem != null || condutor != null;
        }

        Vao(Ponto a, Ponto b) {
            this.a = a;
            this.b = b;
        }
    }

    private record Candidato(String caracteres, int cor, double x, double y, Rectangle2D caixa, boolean poste) {
    }

    private Optional<Leitura> montar(Desenho desenho) {
        List<Linha> linhas = ReconhecedorGlifos.ler(desenho.glifos());
        double h = ReconhecedorGlifos.alturaTipica(desenho.glifos());
        int corProjetado = corProjetado(linhas);
        Set<Linha> riscadas = riscadas(linhas, desenho.segmentos());
        List<Segmento> rede = desenho.segmentos().stream().filter(s -> s.cor() != AZUL && s.cor() != BRANCO).toList();

        List<Ponto> pontos = blocos(linhas, h, corProjetado, riscadas);
        if (pontos.isEmpty()) {
            return Optional.empty();
        }
        List<Candidato> candidatos = candidatos(desenho.simbolos(), rede);
        Semelhanca geo = associar(pontos, candidatos, h, corProjetado);
        Double metrosPorPonto = geo != null ? geo.metrosPorPonto() : null;

        List<Segmento> partidos = new ArrayList<>();
        for (Segmento s : rede) {
            partidos.addAll(dividir(s, pontos));
        }
        Map<String, Vao> vaos = new LinkedHashMap<>();
        for (Segmento s : partidos) {
            Ponto a = pontoEm(s.ax(), s.ay(), pontos);
            Ponto b = pontoEm(s.bx(), s.by(), pontos);
            // Com uma ponta num poste, a outra pode cair num desenho vizinho do mesmo poste (sapata, cruzeta).
            if (a != null && b == null) {
                b = pontoProximo(s.bx(), s.by(), pontos);
            } else if (b != null && a == null) {
                a = pontoProximo(s.ax(), s.ay(), pontos);
            }
            if (a == null || b == null || a == b) {
                continue;
            }
            String chave = System.identityHashCode(a) < System.identityHashCode(b)
                    ? System.identityHashCode(a) + "|" + System.identityHashCode(b)
                    : System.identityHashCode(b) + "|" + System.identityHashCode(a);
            vaos.putIfAbsent(chave, new Vao(a, b));
        }
        lerTextosDeVao(linhas, vaos.values(), h);

        // Só entra o que é obra: o que é projetado, o que ganha ou perde estrutura e os vãos novos; os postes existentes
        // onde a rede nova chega entram como referência.
        List<Vao> vaosObra = vaos.values().stream()
                // Poste novo intercalado redivide o vão existente; poste só trocado no lugar não muda o vão.
                .filter(v -> v.temTexto() || v.a.intercalado() || v.b.intercalado())
                .toList();
        if (metrosPorPonto != null) {
            conferirMetragens(vaosObra, metrosPorPonto);
        }
        herdarCondutor(vaosObra);
        Set<Ponto> incluidos = new HashSet<>();
        pontos.stream().filter(Ponto::temObra).forEach(incluidos::add);
        vaosObra.forEach(v -> {
            incluidos.add(v.a);
            incluidos.add(v.b);
        });
        if (incluidos.isEmpty()) {
            return Optional.empty();
        }
        Integer escala = metrosPorPonto != null ? (int) Math.round(metrosPorPonto / METROS_POR_PONTO_EM_1) : null;
        List<Ponto> naObra = pontos.stream().filter(incluidos::contains).toList();
        String json = paraJson(naObra, vaosObra, ordemDaRede(naObra, vaosObra), escala, desenho);
        return Optional.of(new Leitura(json, incluidos.size(), vaosObra.size(), escala));
    }

    /** Cor dos rótulos projetados: a da legenda (magenta) ou vermelho, quando a folha não tem magenta. */
    private static int corProjetado(List<Linha> linhas) {
        for (int cor : CORES_PROJETADO) {
            if (linhas.stream().anyMatch(l -> l.cor() == cor)) {
                return cor;
            }
        }
        return CORES_PROJETADO.getFirst();
    }

    /** Texto riscado com um X é "elemento retirado" na legenda: dois traços curtos que se cruzam sobre a linha. */
    private static Set<Linha> riscadas(List<Linha> linhas, List<Segmento> segmentos) {
        List<Segmento> curtos = segmentos.stream().filter(s -> s.comprimento() < 12).toList();
        Set<Linha> riscadas = new HashSet<>();
        for (Linha l : linhas) {
            Rectangle2D c = l.caixa();
            double h = c.getHeight();
            List<Segmento> dentro = curtos.stream()
                    .filter(s -> (s.ax() + s.bx()) / 2 >= c.getMinX() - h && (s.ax() + s.bx()) / 2 <= c.getMaxX() + h
                            && (s.ay() + s.by()) / 2 >= c.getMinY() - h && (s.ay() + s.by()) / 2 <= c.getMaxY() + h
                            && Math.abs(s.ax() - s.bx()) > 0.3 * h && Math.abs(s.ay() - s.by()) > 0.3 * h)
                    .toList();
            externo:
            for (int i = 0; i < dentro.size(); i++) {
                for (int j = i + 1; j < dentro.size(); j++) {
                    double[] x = cruzamento(dentro.get(i), dentro.get(j));
                    if (x != null && x[0] >= c.getMinX() - 0.2 * h && x[0] <= c.getMaxX() + 0.2 * h
                            && x[1] >= c.getMinY() - 0.3 * h && x[1] <= c.getMaxY() + 0.3 * h) {
                        riscadas.add(l);
                        break externo;
                    }
                }
            }
        }
        return riscadas;
    }

    static double[] cruzamento(Segmento p, Segmento q) {
        double d1 = lado(q, p.ax(), p.ay());
        double d2 = lado(q, p.bx(), p.by());
        if (d1 * d2 >= 0 || lado(p, q.ax(), q.ay()) * lado(p, q.bx(), q.by()) >= 0) {
            return null;
        }
        double t = d1 / (d1 - d2);
        return new double[]{p.ax() + t * (p.bx() - p.ax()), p.ay() + t * (p.by() - p.ay())};
    }

    private static double lado(Segmento s, double x, double y) {
        return (s.bx() - s.ax()) * (y - s.ay()) - (s.by() - s.ay()) * (x - s.ax());
    }

    private static boolean horizontal(Linha l) {
        double a = ((l.angulo() + 180) % 360 + 360) % 360 - 180;
        return Math.abs(a) < 4;
    }

    /** Rótulo de poste: identificador na primeira linha e as demais logo abaixo, alinhadas à esquerda. */
    private static List<Ponto> blocos(List<Linha> linhas, double h, int corProjetado, Set<Linha> riscadas) {
        List<Linha> horiz = linhas.stream().filter(LeitorVetorialProjeto::horizontal)
                .filter(l -> l.cor() != AZUL)
                .sorted(Comparator.comparingDouble(l -> l.caixa().getMinY()))
                .toList();
        Set<Linha> usadas = new HashSet<>();
        List<Ponto> pontos = new ArrayList<>();
        for (Linha inicio : horiz) {
            if (usadas.contains(inicio) || !identificador(inicio.texto())) {
                continue;
            }
            List<Linha> grupo = new ArrayList<>(List.of(inicio));
            usadas.add(inicio);
            Linha ultima = inicio;
            for (Linha o : horiz) {
                if (usadas.contains(o) || o.caixa().getMinY() <= ultima.caixa().getMinY() || identificador(o.texto())) {
                    continue;
                }
                if (Math.abs(o.caixa().getMinX() - inicio.caixa().getMinX()) < 1.2 * h
                        && o.caixa().getMinY() - ultima.caixa().getMaxY() < 1.2 * h) {
                    grupo.add(o);
                    usadas.add(o);
                    ultima = o;
                }
            }
            // Estrutura nova ao lado da existente, na mesma altura (ex.: S3I magenta ao lado de S3I preto).
            for (Linha o : horiz) {
                if (usadas.contains(o)) {
                    continue;
                }
                for (Linha g : List.copyOf(grupo.subList(1, grupo.size()))) {
                    if (Math.abs(o.centroY() - g.centroY()) < 0.5 * h && o.caixa().getMinX() - g.caixa().getMaxX() > 0
                            && o.caixa().getMinX() - g.caixa().getMaxX() < 2.5 * h) {
                        grupo.add(o);
                        usadas.add(o);
                        break;
                    }
                }
            }
            pontos.add(interpretar(grupo, corProjetado, riscadas));
        }
        return pontos;
    }

    private static boolean identificador(String texto) {
        String t = texto.replace(" ", "");
        return IDENTIFICADOR.matcher(t).matches() && t.chars().filter(Character::isDigit).count() >= 5;
    }

    private static Ponto interpretar(List<Linha> grupo, int corProjetado, Set<Linha> riscadas) {
        Ponto p = new Ponto();
        Linha primeira = grupo.getFirst();
        p.codigo = primeira.texto().replace(" ", "");
        p.projetado = primeira.cor() == corProjetado;
        p.bloco = (Rectangle2D) primeira.caixa().clone();
        p.nota = primeira.confianca();
        for (Linha l : grupo.subList(1, grupo.size())) {
            p.bloco.add(l.caixa());
            p.nota = Math.min(p.nota, l.confianca());
            String t = corrigir(l.texto());
            if (riscadas.contains(l)) {
                p.retirar.add(t);
                continue;
            }
            Matcher utm = UTM.matcher(t.replace(" ", ""));
            if (utm.matches()) {
                p.utm = new double[]{Double.parseDouble(utm.group(1)), Double.parseDouble(utm.group(2))};
                continue;
            }
            if (coordenadaIlegivel(t) || l.confianca() < CONFIANCA_MINIMA_LINHA) {
                // Rótulo atravessado pela rede ou por outro texto: não vira estrutura inventada.
                p.ilegiveis++;
                continue;
            }
            boolean nova = l.cor() == corProjetado;
            if (p.poste == null && p.existentes.stream().noneMatch(e -> e.startsWith("poste ")) && POSTE.matcher(t).find()) {
                if (nova || p.projetado) {
                    // Poste magenta em rótulo de poste existente: o poste é trocado.
                    p.poste = t;
                    p.posteNovo = !p.projetado;
                } else {
                    p.existentes.add("poste " + t);
                }
                continue;
            }
            if (nova && !p.projetado) {
                p.novas.add(t);
            } else if (p.projetado) {
                p.estruturas.add(t);
            } else {
                p.existentes.add(t);
            }
        }
        return p;
    }

    /** "E / N" com letras no meio dos algarismos: coordenada que a rede atravessou. */
    static boolean coordenadaIlegivel(String texto) {
        return texto.contains(" / ") && texto.chars().filter(Character::isDigit).count() >= 6;
    }

    /** Nestes rótulos só há maiúsculas; o "l" minúsculo é sempre o "I" (o "m" da metragem fica). */
    static String corrigir(String texto) {
        // "S3 l": letra estreita depois de algarismo às vezes ganha um espaço que não existe na folha.
        return texto.replaceAll("(?<=[A-Z0-9]) [lI](?![a-z])", "I").replaceAll("(?<=[A-Z0-9])l|l(?=[A-Z0-9])", "I");
    }

    /** Símbolos sobrepostos (poste, cruzeta, para-raio) são um ponto só; vale o que é poste ou onde a rede termina. */
    private static List<Candidato> candidatos(List<Simbolo> simbolos, List<Segmento> rede) {
        List<List<Simbolo>> grupos = new ArrayList<>();
        for (Simbolo s : simbolos) {
            if (s.cor() == AZUL) {
                continue;
            }
            List<Simbolo> destino = null;
            for (List<Simbolo> g : grupos) {
                if (g.stream().anyMatch(o -> Math.hypot(s.x() - o.x(), s.y() - o.y()) < 7)) {
                    destino = g;
                    break;
                }
            }
            if (destino == null) {
                destino = new ArrayList<>();
                grupos.add(destino);
            }
            destino.add(s);
        }
        List<Candidato> candidatos = new ArrayList<>();
        for (List<Simbolo> g : grupos) {
            Rectangle2D caixa = (Rectangle2D) g.getFirst().caixa().clone();
            g.forEach(s -> caixa.add(s.caixa()));
            Simbolo poste = g.stream().filter(s -> POSTES.contains(s.caractere())).findFirst().orElse(null);
            Simbolo referencia = poste != null ? poste : g.getFirst();
            int cor = g.stream().map(Simbolo::cor).filter(CORES_PROJETADO::contains).findFirst().orElse(referencia.cor());
            long nos = rede.stream().filter(s -> contem(caixa, s.ax(), s.ay(), 1.5) || contem(caixa, s.bx(), s.by(), 1.5)).count();
            if (poste != null || nos >= 2) {
                StringBuilder caracteres = new StringBuilder();
                g.forEach(s -> caracteres.append(s.caractere()));
                candidatos.add(new Candidato(caracteres.toString(), cor, referencia.x(), referencia.y(), caixa, poste != null));
            }
        }
        return candidatos;
    }

    private static boolean contem(Rectangle2D r, double x, double y, double folga) {
        return x >= r.getMinX() - folga && x <= r.getMaxX() + folga && y >= r.getMinY() - folga && y <= r.getMaxY() + folga;
    }

    private record Par(double custo, double distancia, int ponto, int candidato) {
    }

    /**
     * Liga cada rótulo ao seu símbolo. Primeiro pelo mais perto; com dois ou mais pares confiáveis que têm UTM, ajusta a
     * semelhança UTM → folha e refaz a ligação pela posição prevista, que acerta mesmo com rótulo afastado.
     *
     * @return a georreferência (UTM → folha) ajustada pelos rótulos com coordenada, ou nula sem coordenadas
     */
    private static Semelhanca associar(List<Ponto> pontos, List<Candidato> candidatos, double h, int corProjetado) {
        List<Par> pares = new ArrayList<>();
        for (int i = 0; i < pontos.size(); i++) {
            Ponto p = pontos.get(i);
            for (int j = 0; j < candidatos.size(); j++) {
                Candidato c = candidatos.get(j);
                double d = Math.hypot(Math.max(Math.max(p.bloco.getMinX() - c.x(), 0), c.x() - p.bloco.getMaxX()),
                        Math.max(Math.max(p.bloco.getMinY() - c.y(), 0), c.y() - p.bloco.getMaxY()));
                if (d < 14 * h) {
                    boolean mesmaCor = (c.cor() == corProjetado) == p.projetado;
                    pares.add(new Par(d + (mesmaCor ? 0 : 6 * h) + (c.poste() ? 0 : 3 * h), d, i, j));
                }
            }
        }
        Map<Integer, Par> ligados = guloso(pares, Set.of());

        List<double[]> utm = new ArrayList<>();
        List<double[]> folha = new ArrayList<>();
        ligados.forEach((i, par) -> {
            if (pontos.get(i).utm != null && par.distancia() < 25) {
                utm.add(pontos.get(i).utm);
                Candidato c = candidatos.get(par.candidato());
                folha.add(new double[]{c.x(), c.y()});
            }
        });
        Semelhanca geo = Semelhanca.ajustar(utm, folha);
        if (geo != null) {
            List<Par> previstos = new ArrayList<>();
            for (int i = 0; i < pontos.size(); i++) {
                Ponto p = pontos.get(i);
                if (p.utm == null) {
                    continue;
                }
                double[] prev = geo.aplicar(p.utm);
                for (int j = 0; j < candidatos.size(); j++) {
                    Candidato c = candidatos.get(j);
                    double d = Math.hypot(c.x() - prev[0], c.y() - prev[1]);
                    if (d < 8 * h) {
                        boolean mesmaCor = (c.cor() == corProjetado) == p.projetado;
                        previstos.add(new Par(d + (c.poste() ? 0 : 6) + (mesmaCor ? 0 : 4), d, i, j));
                    }
                }
            }
            Map<Integer, Par> pelaUtm = guloso(previstos, Set.of());
            Set<Integer> tomados = new HashSet<>();
            pelaUtm.values().forEach(par -> tomados.add(par.candidato()));
            List<Par> semUtm = pares.stream().filter(par -> pontos.get(par.ponto()).utm == null).toList();
            Map<Integer, Par> resto = guloso(semUtm, tomados);
            ligados = new HashMap<>(pelaUtm);
            ligados.putAll(resto);
            pelaUtm.keySet().forEach(i -> pontos.get(i).georreferenciado = true);
        }
        for (int i = 0; i < pontos.size(); i++) {
            Ponto p = pontos.get(i);
            Par par = ligados.get(i);
            if (par != null) {
                Candidato c = candidatos.get(par.candidato());
                p.x = c.x();
                p.y = c.y();
                p.simbolo = c.caixa();
                p.distancia = par.distancia();
            } else if (geo != null && p.utm != null) {
                double[] prev = geo.aplicar(p.utm);
                p.x = prev[0];
                p.y = prev[1];
                p.simbolo = new Rectangle2D.Double(prev[0] - 4, prev[1] - 4, 8, 8);
            } else {
                p.x = p.bloco.getMinX();
                p.y = p.bloco.getMinY();
            }
        }
        return geo;
    }

    private static Map<Integer, Par> guloso(List<Par> pares, Set<Integer> jaTomados) {
        Map<Integer, Par> ligados = new HashMap<>();
        Set<Integer> tomados = new HashSet<>(jaTomados);
        pares.stream().sorted(Comparator.comparingDouble(Par::custo)).forEach(par -> {
            if (!ligados.containsKey(par.ponto()) && !tomados.contains(par.candidato())) {
                ligados.put(par.ponto(), par);
                tomados.add(par.candidato());
            }
        });
        return ligados;
    }

    /** Traço que passa por cima de um poste no meio do caminho vira dois vãos. */
    private static List<Segmento> dividir(Segmento s, List<Ponto> pontos) {
        double dx = s.bx() - s.ax();
        double dy = s.by() - s.ay();
        double l2 = dx * dx + dy * dy;
        if (l2 == 0) {
            return List.of(s);
        }
        List<double[]> meio = new ArrayList<>();
        for (Ponto p : pontos) {
            if (p.simbolo == null) {
                continue;
            }
            double u = ((p.x - s.ax()) * dx + (p.y - s.ay()) * dy) / l2;
            if (u > 0.02 && u < 0.98 && Math.hypot(p.x - (s.ax() + u * dx), p.y - (s.ay() + u * dy)) < 2.0) {
                meio.add(new double[]{u, p.x, p.y});
            }
        }
        if (meio.isEmpty()) {
            return List.of(s);
        }
        meio.sort(Comparator.comparingDouble(m -> m[0]));
        List<Segmento> partes = new ArrayList<>();
        double ax = s.ax();
        double ay = s.ay();
        for (double[] m : meio) {
            partes.add(new Segmento(ax, ay, m[1], m[2], s.cor(), s.largura(), s.tracejado()));
            ax = m[1];
            ay = m[2];
        }
        partes.add(new Segmento(ax, ay, s.bx(), s.by(), s.cor(), s.largura(), s.tracejado()));
        return partes;
    }

    /** Ponto cujo símbolo fica a menos de meia diagonal da ponta da linha. */
    private static Ponto pontoProximo(double x, double y, List<Ponto> pontos) {
        Ponto melhor = null;
        double menor = Double.MAX_VALUE;
        for (Ponto p : pontos) {
            if (p.simbolo == null) {
                continue;
            }
            double d = Math.hypot(x - p.x, y - p.y);
            double alcance = 0.6 * Math.hypot(p.simbolo.getWidth(), p.simbolo.getHeight());
            if (d < alcance && d < menor) {
                menor = d;
                melhor = p;
            }
        }
        return melhor;
    }

    private static Ponto pontoEm(double x, double y, List<Ponto> pontos) {
        Ponto melhor = null;
        double menor = Double.MAX_VALUE;
        for (Ponto p : pontos) {
            if (p.simbolo != null && contem(p.simbolo, x, y, 1.5)) {
                double d = Math.hypot(x - p.x, y - p.y);
                if (d < menor) {
                    menor = d;
                    melhor = p;
                }
            }
        }
        return melhor;
    }

    /** Cabo escrito sem a cota na frente (o número ficou sob outro desenho): "AN 1 #35(35) MULT". */
    private static final Pattern SO_CONDUTOR = Pattern.compile("^[A-Z]{1,5}\\s*\\d+\\s*#.+$");
    /** Cabo como a legenda escreve: fases, bitola e tipo ("AN 1 #35(35) MULT", "A 1 #1/0 AWG CAA"). */
    private static final Pattern CONDUTOR = Pattern.compile("^[A-Z]{1,5}\\s\\d\\s#[0-9X/()]+(\\s[A-Z]{2,5})*$");

    /** Diferença aceita entre a cota escrita e a medida no desenho georreferenciado. */
    private static final double TOLERANCIA_COTA_M = 2;
    private static final double TOLERANCIA_COTA_RELATIVA = 0.22;

    /**
     * O desenho está em coordenada UTM real: o comprimento do vão na folha é a metragem do campo. Vale como conferência
     * da cota escrita (cota de outro vão ou mal lida diverge) e como metragem quando a cota não pôde ser lida.
     */
    private static void conferirMetragens(List<Vao> vaos, double metrosPorPonto) {
        for (Vao v : vaos) {
            double medida = Math.round(Math.hypot(v.b.x - v.a.x, v.b.y - v.a.y) * metrosPorPonto);
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

    /**
     * Ramal novo costuma seguir com o mesmo cabo: vão sem cabo legível (texto atravessado) fica com o do vão vizinho que
     * passa pelo mesmo poste novo, avisado para conferência.
     */
    private static void herdarCondutor(List<Vao> vaos) {
        boolean mudou = true;
        while (mudou) {
            mudou = false;
            for (Vao v : vaos) {
                if (v.condutor != null) {
                    continue;
                }
                for (Vao vizinho : vaos) {
                    if (vizinho == v || vizinho.condutor == null || vizinho.condutorHerdado) {
                        continue;
                    }
                    Ponto comum = v.a == vizinho.a || v.a == vizinho.b ? v.a : v.b == vizinho.a || v.b == vizinho.b ? v.b : null;
                    if (comum != null && comum.intercalado()) {
                        v.condutor = vizinho.condutor;
                        v.condutorHerdado = true;
                        mudou = true;
                        break;
                    }
                }
            }
        }
    }

    /** Nas cotas e nos cabos só há algarismos depois de "#" e antes de "m": o "J" é um "3" mal lido no texto miúdo. */
    static String corrigirCota(String texto) {
        return texto.replaceAll("(?<=\\d)J|J(?=\\d)", "3");
    }

    private static final Pattern INICIO_COTA = Pattern.compile("(?<![\\w#(])(?=\\d+(?:[.,]\\d+)?m\\b)");

    private record TextoVao(String texto, double x, double y, double angulo) {
    }

    /**
     * Duas cotas no mesmo alinhamento (vãos seguidos) podem ter virado uma linha só: separa em cada "NNm" e reparte a
     * posição ao longo da linha, na proporção das letras.
     */
    private static List<TextoVao> textosDeVao(Linha l) {
        String texto = corrigirCota(corrigir(l.texto()));
        String[] partes = INICIO_COTA.split(texto);
        double rad = Math.toRadians(l.angulo());
        double ux = Math.cos(rad);
        double uy = Math.sin(rad);
        // Comprimento da linha ao longo do sentido de leitura, pela caixa.
        double comprimento = Math.abs(l.caixa().getWidth() * ux) + Math.abs(l.caixa().getHeight() * uy);
        List<TextoVao> textos = new ArrayList<>();
        int inicio = 0;
        for (String parte : partes) {
            String limpa = parte.trim();
            double meio = (inicio + parte.length() / 2.0) / texto.length() - 0.5;
            if (!limpa.isEmpty()) {
                textos.add(new TextoVao(limpa, l.centroX() + ux * meio * comprimento, l.centroY() + uy * meio * comprimento, l.angulo()));
            }
            inicio += parte.length();
        }
        return textos;
    }

    /** "33m AN 1 #35(35) MULT" escrito ao longo do traço: fica com o vão mais perto e paralelo ao texto. */
    private static void lerTextosDeVao(List<Linha> linhas, java.util.Collection<Vao> vaos, double h) {
        for (Linha linha : linhas) {
            for (TextoVao l : textosDeVao(linha)) {
                Matcher m = TEXTO_VAO.matcher(l.texto());
                boolean soCondutor = !m.matches() && SO_CONDUTOR.matcher(l.texto()).matches();
                if (!m.matches() && !soCondutor) {
                    continue;
                }
                Vao melhor = null;
                double menor = Double.MAX_VALUE;
                for (Vao v : vaos) {
                    double dx = v.b.x - v.a.x;
                    double dy = v.b.y - v.a.y;
                    double l2 = dx * dx + dy * dy;
                    if (l2 == 0) {
                        continue;
                    }
                    double u = Math.max(0, Math.min(1, ((l.x() - v.a.x) * dx + (l.y() - v.a.y) * dy) / l2));
                    double d = Math.hypot(l.x() - (v.a.x + u * dx), l.y() - (v.a.y + u * dy));
                    double anguloVao = Math.toDegrees(Math.atan2(dy, dx));
                    double diferenca = Math.abs(((l.angulo() - anguloVao + 90) % 180 + 180) % 180 - 90);
                    if (diferenca < 15 && d < menor) {
                        menor = d;
                        melhor = v;
                    }
                }
                if (melhor != null && menor < 6 * h) {
                    String condutor = soCondutor ? l.texto().trim() : m.group(2).trim();
                    // Cabo atravessado por outro texto vira letra sem sentido: fica em branco para a revisão completar.
                    boolean condutorValido = CONDUTOR.matcher(condutor).matches();
                    if (soCondutor) {
                        if (melhor.condutor == null && condutorValido) {
                            melhor.condutor = condutor;
                        }
                    } else {
                        melhor.metragem = Double.parseDouble(m.group(1).replace(',', '.'));
                        melhor.condutor = condutorValido ? condutor : melhor.condutor;
                    }
                }
            }
        }
    }

    private static Map<Ponto, Integer> ordemDaRede(List<Ponto> pontos, List<Vao> vaos) {
        return OrdemRede.ordenar(pontos, vaos.stream().map(v -> new OrdemRede.Ligacao<>(v.a, v.b)).toList(),
                Ponto::novo, p -> p.x, p -> p.y);
    }

    private static String paraJson(List<Ponto> pontos, List<Vao> vaos, Map<Ponto, Integer> ordem, Integer escala, Desenho desenho) {
        ObjectNode raiz = JSON.createObjectNode();
        if (escala != null) {
            raiz.put("escala", escala);
        }
        ArrayNode lista = raiz.putArray("pontos");
        for (Ponto p : pontos) {
            ObjectNode no = lista.addObject();
            // O número sai da ordem da rede; o código provisório do projeto (00000003) fica só como informação.
            no.put("id", p.codigo);
            no.putNull("numero");
            if (p.provisorio()) {
                no.putNull("barramento");
            } else {
                no.put("barramento", p.codigo);
            }
            no.put("ordem", ordem.getOrDefault(p, Integer.MAX_VALUE));
            no.put("tipo", "POSTE");
            no.put("x", limitar(p.x / desenho.largura()));
            no.put("y", limitar(p.y / desenho.altura()));
            if (p.poste != null) {
                no.put("poste", p.poste);
            } else {
                no.putNull("poste");
            }
            ArrayNode estruturas = no.putArray("estruturas");
            if (p.provisorio()) {
                estruturas.add(InterpretadorPropostaProjeto.PREFIXO_PROJETO + "ponto " + p.codigo);
            }
            p.estruturas.forEach(estruturas::add);
            p.novas.forEach(estruturas::add);
            p.retirar.forEach(r -> estruturas.add(InterpretadorPropostaProjeto.PREFIXO_RETIRAR + r));
            if (!p.temObra()) {
                estruturas.add(InterpretadorPropostaProjeto.PREFIXO_EXISTENTE + String.join(" ", p.existentes));
            }
            no.put("retirar", false);
            no.put("confianca", confianca(p));
        }
        ArrayNode listaVaos = raiz.putArray("vaos");
        for (Vao v : vaos) {
            ObjectNode no = listaVaos.addObject();
            no.put("de", v.a.codigo);
            no.put("para", v.b.codigo);
            if (v.metragem != null) {
                no.put("metragem", v.metragem);
            } else {
                no.putNull("metragem");
            }
            if (v.condutor != null) {
                no.put("condutor", v.condutor);
            } else {
                no.putNull("condutor");
            }
            if (v.medida) {
                no.put("metragemMedida", true);
            }
            if (v.condutorHerdado) {
                no.put("condutorHerdado", true);
            }
            no.put("confianca", v.metragem != null && !v.medida ? 0.95 : 0.85);
        }
        return raiz.toString();
    }

    /** Alta quando o símbolo bate com a coordenada ou fica colado no rótulo; cai com letra mal lida ou ponto sem símbolo. */
    private static double confianca(Ponto p) {
        double base = p.simbolo == null ? 0.5 : p.georreferenciado ? 0.95 : p.distancia >= 0 && p.distancia < 25 ? 0.9 : 0.7;
        if (p.ilegiveis > 0) {
            base -= 0.15;
        }
        return Math.round(Math.min(base, 0.5 + p.nota) * 100) / 100.0;
    }

    private static double limitar(double v) {
        return Math.max(0, Math.min(1, v));
    }

    /** Transformação de semelhança UTM → folha (escala, giro e deslocamento; o norte da UTM sobe, o y da folha desce). */
    public record Semelhanca(double a, double b, double c, double d, double e0, double n0) {

        /** Erro aceito, em pontos de PDF, para um par contar como concordante. */
        private static final double TOLERANCIA_PT = 6;

        /**
         * Consenso: cada dupla de pares define uma semelhança exata; fica a que mais pares confirmam, refeita com todos
         * eles. Um rótulo ligado ao símbolo errado não entra na conta.
         */
        static Semelhanca ajustar(List<double[]> utm, List<double[]> folha) {
            if (utm.size() < 2) {
                return null;
            }
            List<Integer> melhores = List.of();
            for (int i = 0; i < utm.size(); i++) {
                for (int j = i + 1; j < utm.size(); j++) {
                    Semelhanca s = resolver(utm, folha, List.of(i, j));
                    if (s == null) {
                        continue;
                    }
                    List<Integer> concordam = new ArrayList<>();
                    for (int k = 0; k < utm.size(); k++) {
                        double[] p = s.aplicar(utm.get(k));
                        if (Math.hypot(p[0] - folha.get(k)[0], p[1] - folha.get(k)[1]) < TOLERANCIA_PT) {
                            concordam.add(k);
                        }
                    }
                    if (concordam.size() > melhores.size()) {
                        melhores = concordam;
                    }
                }
            }
            if (melhores.size() < 2) {
                return null;
            }
            return resolver(utm, folha, melhores);
        }

        private static Semelhanca resolver(List<double[]> utm, List<double[]> folha, List<Integer> usados) {
            double e0 = usados.stream().mapToDouble(i -> utm.get(i)[0]).average().orElse(0);
            double n0 = usados.stream().mapToDouble(i -> utm.get(i)[1]).average().orElse(0);
            // Mínimos quadrados das equações x = a·e + b·n + c e y = b·e − a·n + d.
            double[][] ata = new double[4][4];
            double[] atb = new double[4];
            for (int i : usados) {
                double e = utm.get(i)[0] - e0;
                double n = utm.get(i)[1] - n0;
                acumular(ata, atb, new double[]{e, n, 1, 0}, folha.get(i)[0]);
                acumular(ata, atb, new double[]{-n, e, 0, 1}, folha.get(i)[1]);
            }
            double[] s = resolverSistema(ata, atb);
            if (s == null || Math.hypot(s[0], s[1]) == 0) {
                return null;
            }
            return new Semelhanca(s[0], s[1], s[2], s[3], e0, n0);
        }

        private static void acumular(double[][] ata, double[] atb, double[] linha, double valor) {
            for (int r = 0; r < 4; r++) {
                for (int c = 0; c < 4; c++) {
                    ata[r][c] += linha[r] * linha[c];
                }
                atb[r] += linha[r] * valor;
            }
        }

        private static double[] resolverSistema(double[][] m, double[] v) {
            int n = v.length;
            double[][] a = new double[n][n + 1];
            for (int i = 0; i < n; i++) {
                System.arraycopy(m[i], 0, a[i], 0, n);
                a[i][n] = v[i];
            }
            for (int col = 0; col < n; col++) {
                int pivo = col;
                for (int r = col + 1; r < n; r++) {
                    if (Math.abs(a[r][col]) > Math.abs(a[pivo][col])) {
                        pivo = r;
                    }
                }
                if (Math.abs(a[pivo][col]) < 1e-12) {
                    return null;
                }
                double[] t = a[col];
                a[col] = a[pivo];
                a[pivo] = t;
                for (int r = 0; r < n; r++) {
                    if (r != col) {
                        double f = a[r][col] / a[col][col];
                        for (int c = col; c <= n; c++) {
                            a[r][c] -= f * a[col][c];
                        }
                    }
                }
            }
            double[] x = new double[n];
            for (int i = 0; i < n; i++) {
                x[i] = a[i][n] / a[i][i];
            }
            return x;
        }

        double[] aplicar(double[] utm) {
            double e = utm[0] - e0;
            double n = utm[1] - n0;
            return new double[]{a * e + b * n + c, b * e - a * n + d};
        }

        double metrosPorPonto() {
            return 1 / Math.hypot(a, b);
        }
    }
}
