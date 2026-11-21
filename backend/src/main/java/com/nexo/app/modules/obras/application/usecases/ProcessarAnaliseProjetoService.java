package com.nexo.app.modules.obras.application.usecases;

import com.nexo.app.modules.assistente.CopilotoApi;
import com.nexo.app.modules.obras.domain.AnalisePlanejamento;
import com.nexo.app.modules.obras.domain.PontoPlanejamento;
import com.nexo.app.modules.obras.domain.PropostaPlanejamento;
import com.nexo.app.modules.obras.infrastructure.persistence.AnalisePlanejamentoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.KitConstrutivoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.ObraRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.PlanejamentoObraRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.PontoPlanejamentoRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Lê a página do projeto com o modelo de visão, fora de transação, porque cada bloco pode levar dezenas de segundos.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ProcessarAnaliseProjetoService {

    static final String INSTRUCOES = """
            Você lê projetos de rede de distribuição elétrica. A imagem é uma folha ou parte dela.
            Liste só o que está visível no desenho, sem deduzir nem completar.

            Pontos: postes, transformadores, chaves e outras estruturas. O símbolo costuma ser um quadrado pequeno na
            rede, ligado por uma linha fina a um balão redondo ou a uma caixa de texto. No balão, de cima para baixo:
            o número do ponto, o código do poste (uma letra e 5 a 7 dígitos), as estruturas de média e de baixa tensão
            lado a lado (um traço quando não há) e, embaixo, o poste em altura e esforço (como 11-600 ou 11/600).
            O número do ponto vai em numero e o código em barramento; só preencha numero se ele estiver escrito.
            Balão riscado com um X é estrutura a retirar: informe retirar true.
            Vãos: trechos de rede entre dois pontos, seguindo as linhas de um símbolo ao outro. Não ligue pontos de
            redes diferentes nem cruze linhas que só passam perto. Quando escrita ao lado do trecho, informe a metragem
            e o condutor.

            x e y são o centro do símbolo na imagem, não o do balão nem o do texto: de 0 a 1, a partir do canto
            superior esquerdo. confianca vai de 0 a 1. Ignore carimbo, legenda, notas, marcas d'água, coordenadas X= Y=
            e áreas verdes do mapa. Se o carimbo trouxer a escala (ESCALA 1:N), informe o denominador N em escala.

            Responda apenas com JSON, sem comentários, neste formato. Os valores abaixo só mostram o tipo de cada
            campo: nunca os repita; use o que estiver escrito na folha ou null.
            {"escala":null,"pontos":[{"id":null,"numero":"<número do balão>","tipo":"POSTE|TRANSFORMADOR|CHAVE|ESTRUTURA|OUTRO",
            "x":0.0,"y":0.0,"barramento":"<código lido>","poste":"<altura e esforço>","estruturas":["<estrutura>"],
            "retirar":false,"confianca":0.0}],
            "vaos":[{"de":"<número ou código>","para":"<número ou código>","metragem":null,"condutor":null,"confianca":0.0}]}
            """;

    static final String ORIENTACAO = """
            As imagens A, B, C e D são a mesma folha de projeto de rede elétrica, girada de quatro formas; a letra está
            no quadrado vermelho do canto. Em qual delas os textos do desenho e do carimbo estão de pé, legíveis
            normalmente da esquerda para a direita, sem estar de lado nem de cabeça para baixo?
            Responda apenas com JSON: {"imagem":"A"}, {"imagem":"B"}, {"imagem":"C"} ou {"imagem":"D"}.
            """;

    static final String PERGUNTA_VAOS = """
            Os círculos vermelhos numerados marcam os pontos já encontrados nesta folha. Siga as linhas da rede e liste
            os vãos entre eles: cada trecho que liga diretamente um círculo a outro. Use em de e para o número escrito
            ao lado do círculo. Não ligue círculos que só estão perto, sem linha entre eles. Informe a metragem e o
            condutor escritos ao lado do trecho, quando houver. Devolva pontos vazio.
            """;

    private static final int LIMITE_TOKENS = 16384;
    private static final int CONSULTAS_SIMULTANEAS = 4;
    private static final Pattern IMAGEM = Pattern.compile("\"imagem\"\\s*:\\s*\"([ABCD])\"");

    private final AnalisePlanejamentoRepository analiseRepository;
    private final AnexoObraUseCases anexoUseCases;
    private final RenderizadorPaginaProjeto renderizador;
    private final LeitorCamadaProjeto leitorCamada;
    private final CopilotoApi copiloto;
    private final ObraRepository obraRepository;
    private final PontoPlanejamentoRepository pontoRepository;
    private final KitConstrutivoRepository kitRepository;
    private final PlanejamentoObraRepository planejamentoRepository;
    private final PlanejamentoObraUseCases planejamentoUseCases;

    @Async
    public void processar(UUID idAnalise, boolean orientacaoConferida) {
        AnalisePlanejamento analise = analiseRepository.findById(idAnalise).orElse(null);
        if (analise == null) {
            return;
        }
        try {
            analise.concluir(ler(analise, orientacaoConferida));
        } catch (Exception e) {
            log.warn("Falha na análise do projeto {}", idAnalise, e);
            analise.falhar("Não foi possível ler esta página do projeto. Tente de novo ou planeje manualmente.");
        }
        analiseRepository.save(analise);
    }

    private PropostaPlanejamento ler(AnalisePlanejamento analise, boolean orientacaoConferida) throws Exception {
        byte[] pdf;
        try (var stream = anexoUseCases.baixar(analise.getIdObra(), analise.getIdAnexo()).stream()) {
            pdf = stream.readAllBytes();
        }
        List<PontoPlanejamento> existentes = pontoRepository.findByIdObraAndAtivoTrueOrderByPaginaAscNumeroAsc(analise.getIdObra());
        Map<String, String> barramentos = new HashMap<>();
        existentes.stream()
                .filter(p -> p.getBarramento() != null)
                .forEach(p -> barramentos.put(p.getBarramento().toUpperCase(Locale.ROOT), p.getNumero()));
        InterpretadorPropostaProjeto interpretador = new InterpretadorPropostaProjeto(analise.getPagina(),
                existentes.stream().map(PontoPlanejamento::getNumero).toList(), barramentos, catalogo(analise.getIdObra()));

        LeitorCamadaProjeto.CamadaPagina camada = leitorCamada.ler(pdf, analise.getPagina());
        interpretador.adicionarCamada(camada);
        int rotacao = rotacao(analise, pdf, orientacaoConferida, interpretador);
        if (camada.candidatos().isEmpty()) {
            lerPorBlocos(analise.getId(), pdf, analise.getPagina(), rotacao, interpretador);
        } else {
            lerComCandidatos(pdf, analise.getPagina(), rotacao, interpretador);
        }
        return interpretador.concluir();
    }

    /**
     * Usa a rotação que a pessoa deixou na tela. Sem ela, pergunta ao modelo se o desenho está deitado: texto de lado
     * é a principal causa de leitura errada. A rotação achada fica salva, para a tela mostrar a folha igual.
     */
    private int rotacao(AnalisePlanejamento analise, byte[] pdf, boolean orientacaoConferida, InterpretadorPropostaProjeto interpretador) {
        Integer salva = planejamentoRepository.findByIdObraAndAtivoTrue(analise.getIdObra())
                .map(p -> p.getRotacoes().get(String.valueOf(analise.getPagina())))
                .orElse(null);
        if (salva != null || orientacaoConferida) {
            return salva != null ? salva : 0;
        }
        int detectada;
        try {
            List<RenderizadorPaginaProjeto.Bloco> opcoes = renderizador.renderizarOrientacoes(pdf, analise.getPagina());
            String resposta = copiloto.completarComImagensProjeto(ORIENTACAO, "Em qual imagem o texto está de pé?",
                    opcoes.stream().map(o -> new CopilotoApi.Imagem("image/jpeg", o.base64Jpeg())).toList(), 0.0, 400, false);
            detectada = graus(resposta);
            log.debug("Orientação da folha {}: resposta {} → {}°", analise.getPagina(), resposta, detectada);
        } catch (Exception e) {
            log.warn("Não foi possível saber a orientação da folha; seguindo sem girar", e);
            return 0;
        }
        if (detectada != 0) {
            try {
                planejamentoUseCases.girarPagina(analise.getIdObra(), analise.getPagina(), detectada);
            } catch (Exception e) {
                log.warn("Não foi possível salvar a rotação da folha {}", analise.getPagina(), e);
            }
            interpretador.avisar("O desenho desta folha estava deitado: a Bússola girou a folha " + detectada
                    + "° para ler o texto de pé. Se ficou de cabeça para baixo, gire na tela e peça a leitura de novo.");
        }
        return detectada;
    }

    /** A letra escolhida vira a rotação: A = 0°, B = 90°, C = 180°, D = 270°. */
    static int graus(String resposta) {
        Matcher letra = IMAGEM.matcher(resposta != null ? resposta : "");
        return letra.find() ? (letra.group(1).charAt(0) - 'A') * 90 : 0;
    }

    /**
     * Sem texto no PDF: tudo vem do modelo, por blocos, para os balões continuarem legíveis. Os blocos são lidos ao
     * mesmo tempo e juntados na ordem; depois, uma passada na folha inteira liga os pontos achados.
     */
    private void lerPorBlocos(UUID idAnalise, byte[] pdf, int pagina, int rotacao, InterpretadorPropostaProjeto interpretador) {
        List<RenderizadorPaginaProjeto.Bloco> blocos = renderizador.renderizar(pdf, pagina, rotacao);
        log.debug("Folha {} girada {}°: {} blocos com desenho", pagina, rotacao, blocos.size());
        ExecutorService executor = Executors.newFixedThreadPool(CONSULTAS_SIMULTANEAS);
        try {
            List<Future<String[]>> respostas = new ArrayList<>();
            AtomicInteger lidos = new AtomicInteger();
            int total = blocos.size();
            progresso(idAnalise, "dividida em " + total + " partes");
            for (RenderizadorPaginaProjeto.Bloco bloco : blocos) {
                respostas.add(executor.submit(() -> {
                    String[] resposta = lerBloco("Liste os pontos e vãos desta parte da folha.", bloco);
                    progresso(idAnalise, lidos.incrementAndGet() + " de " + total + " partes lidas");
                    return resposta;
                }));
            }
            for (int i = 0; i < blocos.size(); i++) {
                String[] resposta;
                try {
                    resposta = respostas.get(i).get();
                } catch (ExecutionException e) {
                    log.warn("Falha ao ler um bloco do projeto", e.getCause());
                    interpretador.avisar("Parte da folha não pôde ser interpretada e ficou de fora.");
                    continue;
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException("Leitura do projeto interrompida.", e);
                }
                log.debug("Bloco {} ({}, {}): {}", i, blocos.get(i).inicioX(), blocos.get(i).inicioY(),
                        resposta[0] == null ? null : resposta[0].substring(0, Math.min(600, resposta[0].length())));
                if (!interpretador.tentarBloco(resposta[0], blocos.get(i))) {
                    interpretador.adicionarBloco(resposta[1], blocos.get(i));
                }
            }
        } finally {
            executor.shutdownNow();
        }
        progresso(idAnalise, "ligando os pontos encontrados");
        ligarPontos(pdf, pagina, rotacao, interpretador);
    }

    private void progresso(UUID idAnalise, String texto) {
        try {
            analiseRepository.registrarProgresso(idAnalise, texto);
        } catch (RuntimeException e) {
            log.debug("Progresso da leitura não registrado", e);
        }
    }

    /** Cada bloco só vê os vãos inteiros dentro dele; com os pontos marcados na folha inteira, o modelo liga o resto. */
    private void ligarPontos(byte[] pdf, int pagina, int rotacao, InterpretadorPropostaProjeto interpretador) {
        if (interpretador.quantidadePontos() < 2) {
            return;
        }
        try {
            RenderizadorPaginaProjeto.Bloco folha = renderizador.renderizarComMarcadores(pdf, pagina, rotacao, interpretador.marcadores());
            if (!interpretador.adicionarVaos(perguntar(PERGUNTA_VAOS, folha, true))) {
                interpretador.adicionarVaos(perguntar(PERGUNTA_VAOS + "\nResponda somente com o JSON.", folha, false));
            }
        } catch (Exception e) {
            log.warn("Não foi possível ligar os pontos na folha inteira", e);
            interpretador.avisar("Os vãos entre partes diferentes da folha não puderam ser ligados: confira as ligações.");
        }
    }

    /**
     * Com texto no PDF, os pontos já são conhecidos: o modelo vê a folha inteira para achar os símbolos e seguir as
     * ligações. Se ele falhar, o que foi lido do PDF continua valendo.
     */
    private void lerComCandidatos(byte[] pdf, int pagina, int rotacao, InterpretadorPropostaProjeto interpretador) {
        RenderizadorPaginaProjeto.Bloco folha = renderizador.renderizarInteira(pdf, pagina, rotacao);
        String pergunta = """
                Estes pontos já foram lidos do texto do PDF:
                %s
                Devolva cada um deles em pontos, com o código em id e o x e y do símbolo. Os ids CX são caixas ou balões
                de texto: se estiver ligado por uma linha a um ponto da lista, devolva pertence_a com o id desse ponto; se
                for de um poste sem código, devolva o x e y do símbolo dele. Se o balão tiver o número do ponto, informe em
                numero. Inclua também os pontos visíveis que não estão na lista. Nos vãos, use em de e para o id do ponto.
                """.formatted(interpretador.descreverCandidatos());
        try {
            String[] resposta = lerBloco(pergunta, folha);
            if (!interpretador.tentarBloco(resposta[0], folha)) {
                interpretador.adicionarBloco(resposta[1], folha);
            }
        } catch (Exception e) {
            log.warn("Modelo indisponível na leitura do projeto; seguindo só com o texto do PDF", e);
            interpretador.avisar("A Bússola não conseguiu analisar o desenho: vieram só os pontos lidos do texto do PDF, sem vãos.");
        }
    }

    /**
     * Tenta primeiro com raciocínio, mais preciso. Se a resposta vier vazia ou fora do formato, repete sem ele.
     *
     * @return a primeira resposta e, quando ela não serve, a segunda (a segunda é nula se a primeira já é JSON)
     */
    private String[] lerBloco(String pergunta, RenderizadorPaginaProjeto.Bloco bloco) {
        String resposta;
        try {
            resposta = perguntar(pergunta, bloco, true);
        } catch (RuntimeException e) {
            // Com raciocínio, uma parte cheia de balões pode passar do tempo do provedor: sem ele a resposta sai antes.
            log.warn("Leitura com raciocínio falhou ({}); tentando sem raciocínio", e.getMessage());
            resposta = null;
        }
        if (InterpretadorPropostaProjeto.respostaValida(resposta)) {
            return new String[]{resposta, null};
        }
        log.warn("Resposta fora do formato na leitura do projeto ({} caracteres); tentando sem raciocínio", resposta != null ? resposta.length() : 0);
        return new String[]{resposta, perguntar(pergunta + "\nResponda somente com o JSON, sem texto antes ou depois.", bloco, false)};
    }

    private String perguntar(String pergunta, RenderizadorPaginaProjeto.Bloco bloco, boolean comRaciocinio) {
        return copiloto.completarComImagensProjeto(INSTRUCOES, pergunta,
                List.of(new CopilotoApi.Imagem("image/jpeg", bloco.base64Jpeg())), 0.0, LIMITE_TOKENS, comRaciocinio);
    }

    private List<InterpretadorPropostaProjeto.KitCatalogo> catalogo(UUID idObra) {
        UUID idContrato = obraRepository.findById(idObra).map(o -> o.getIdContrato()).orElse(null);
        if (idContrato == null) {
            return List.of();
        }
        return kitRepository.findByIdContratoAndAtivoTrue(idContrato).stream()
                .map(k -> new InterpretadorPropostaProjeto.KitCatalogo(k.getId(), k.getCodigo(), k.getDescricao(), k.getGrupo()))
                .toList();
    }
}
