package com.nexo.app.modules.frota.application.usecases;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nexo.app.modules.assistente.CopilotoApi;
import java.util.Base64;
import com.nexo.app.modules.frota.application.dto.AnaliseIaResponse;
import com.nexo.app.modules.frota.application.dto.FotoChecklistResponse;
import com.nexo.app.modules.frota.domain.Abastecimento;
import com.nexo.app.modules.frota.domain.AlvoAnaliseIa;

import com.nexo.app.modules.frota.domain.AnaliseIaFrota;
import com.nexo.app.modules.frota.domain.ParecerAnaliseIa;
import com.nexo.app.modules.frota.domain.PendenciaChecklist;
import com.nexo.app.modules.frota.domain.TipoFotoChecklist;
import com.nexo.app.modules.frota.infrastructure.persistence.AnaliseIaFrotaRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.PendenciaChecklistRepository;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.infrastructure.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import java.awt.Image;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Supplier;

/**
 * Análise da IA nos relatórios da frota: junta os dados do registro e as fotos, pede ao
 * modelo de visão um parecer e a leitura de cada foto, e guarda o resultado. A IA só aponta
 * divergências; aprovar, liberar ou abrir OS continua com o gestor.
 */
@Service
@RequiredArgsConstructor
public class AnaliseIaFrotaUseCases {

    private static final Logger LOGGER = LoggerFactory.getLogger(AnaliseIaFrotaUseCases.class);

    /** Fotos por análise: acima disso o custo e o tempo crescem sem ganho para o relatório. */
    static final int MAXIMO_FOTOS = 10;
    /** Maior lado da imagem enviada; o celular manda fotos de 4 mil pixels que a IA não precisa. */
    private static final int LADO_MAXIMO = 1280;
    private static final int LIMITE_BYTES = 15 * 1024 * 1024;
    private static final int LIMITE_CONTEXTO = 40_000;
    private static final int LIMITE_SEGUNDOS = 150;
    private static final java.time.format.DateTimeFormatter DIA = java.time.format.DateTimeFormatter.ofPattern("dd/MM");

    private final CopilotoApi assistente;
    private final AnaliseIaFrotaRepository repository;
    private final OrdemServicoUseCases ordens;
    private final DocumentoFiscalOrdemServicoUseCases documentosFiscais;
    private final ChecklistConsultaUseCases checklists;
    private final AbastecimentoUseCases abastecimentos;
    private final PendenciaChecklistRepository pendencias;
    private final ReferenciasFrota referencias;
    private final ObjectMapper objectMapper;
    private final PrecoPostoUseCases precos;

    /** Foto pronta para a IA, com a referência que o modelo usa na resposta. */
    record FotoEnviada(String ref, String origem, UUID idOrigem, UUID idFoto, String rotulo, String tipoConteudo, byte[] conteudo) {
    }

    /** Uma foto candidata: o download só acontece se couber no limite. */
    private record Candidata(String origem, UUID idOrigem, UUID idFoto, String rotulo, String tipoConteudo,
                             Supplier<InputStream> conteudo) {
    }

    private record Coleta(Object dados, List<Candidata> fotos, List<String> naoLidas) {
    }

    public AnaliseIaResponse.Estado estado(AlvoAnaliseIa alvo, UUID idAlvo) {
        boolean disponivel = assistente.visaoDisponivel();
        var ultima = repository.findFirstByAlvoAndIdAlvoAndAtivoTrueOrderByDataCriacaoDesc(alvo, idAlvo)
                .map(this::response).orElse(null);
        return new AnaliseIaResponse.Estado(disponivel,
                disponivel ? null : "O Assistente não está configurado para ler fotos neste ambiente.", ultima);
    }

    /**
     * Análise que roda sozinha quando o registro chega com as fotos (gestores, 23/10/2026). Sem
     * modelo de visão no ambiente, não faz nada; falha só fica no log, porque o registro já foi
     * gravado e o relatório oferece tentar de novo.
     */
    public void analisarAutomaticamente(AlvoAnaliseIa alvo, UUID idAlvo) {
        if (!assistente.visaoDisponivel()) {
            return;
        }
        try {
            analisar(alvo, idAlvo);
        } catch (RuntimeException e) {
            LOGGER.warn("Análise automática do Assistente em {} {} não foi feita: {}", alvo, idAlvo, e.getMessage());
        }
    }

    /** Sem transação aberta: a chamada ao modelo leva dezenas de segundos. */
    public AnaliseIaResponse analisar(AlvoAnaliseIa alvo, UUID idAlvo) {
        if (!assistente.visaoDisponivel()) {
            throw new InvarianteVioladaException("O Assistente não está configurado para ler fotos neste ambiente.");
        }
        var coleta = switch (alvo) {
            case ORDEM_SERVICO -> coletarOrdemServico(idAlvo);
            case CHECKLIST -> coletarChecklist(idAlvo);
            case ABASTECIMENTO -> coletarAbastecimento(idAlvo);
        };
        var naoLidas = new ArrayList<>(coleta.naoLidas());
        var enviadas = preparar(coleta.fotos(), naoLidas);
        String resposta;
        try {
            resposta = assistente.completarComImagens(PromptAnaliseIaFrota.sistema(alvo), PromptAnaliseIaFrota.usuario(alvo,
                            contexto(coleta.dados()), enviadas),
                    enviadas.stream().map(f -> new CopilotoApi.Imagem(f.tipoConteudo(), Base64.getEncoder().encodeToString(f.conteudo()))).toList(), 0.1, 8192, true);
        } catch (RuntimeException e) {
            LOGGER.warn("Análise da IA de {} {} falhou: {}", alvo, idAlvo, e.getMessage());
            throw new InvarianteVioladaException("O Assistente não respondeu agora. Tente de novo em alguns instantes.");
        }
        var lido = ler(resposta, enviadas);
        var resultado = new LinkedHashMap<String, Object>();
        resultado.put("pontos", lido.pontos());
        resultado.put("fotos", lido.fotos());
        resultado.put("recomendacoes", lido.recomendacoes());
        resultado.put("fotosNaoLidas", naoLidas);
        String json;
        try {
            json = objectMapper.writeValueAsString(resultado);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
        var analise = repository.save(new AnaliseIaFrota(alvo, idAlvo, lido.parecer(), lido.resumo(), json,
                Objects.requireNonNullElse(assistente.modeloVisao(), "IA"), enviadas.size(), SecurityUtils.getUsuarioLogadoId()));
        if (alvo == AlvoAnaliseIa.ABASTECIMENTO) {
            sugerirPrecos(idAlvo, lido.precosCupom());
        }
        return response(analise);
    }

    /**
     * Preço por litro lido no cupom, diferente do cadastrado no posto, vira sugestão para uma
     * pessoa confirmar. O produto vem pelo nome do item, como foi enviado ao modelo.
     */
    private void sugerirPrecos(UUID idAbastecimento, Map<String, java.math.BigDecimal> precosCupom) {
        if (!precosCupom.isEmpty()) {
            precos.sugerirDoCupom(idAbastecimento, precosCupom);
        }
    }

    /** Nome do produto sem acento, caixa e pontuação, para casar o que o modelo leu com o item. */
    static String chave(String nome) {
        return PrecoPostoUseCases.chave(nome);
    }

    private Coleta coletarOrdemServico(UUID id) {
        var detalhe = ordens.detalhar(id);
        var fotos = new ArrayList<Candidata>();
        var naoLidas = new ArrayList<String>();
        // Fotos dos problemas do checklist que originaram a OS.
        var porChecklist = pendencias.findAllByIdOrdemServico(id).stream()
                .map(PendenciaChecklist::getIdChecklist).distinct().toList();
        for (UUID idChecklist : porChecklist) {
            var checklist = checklists.detalhar(idChecklist);
            for (var resposta : checklist.respostas()) {
                if (!id.equals(resposta.idOrdemServico())) {
                    continue;
                }
                for (var foto : resposta.fotos()) {
                    adicionarFotoChecklist(fotos, naoLidas, idChecklist, foto, "Checklist de origem: " + resposta.pergunta()
                            + " (" + resposta.resposta() + ")");
                }
            }
        }
        for (var documento : documentosFiscais.listar(id)) {
            if (!documento.possuiArquivo()) {
                continue;
            }
            String rotulo = documento.tipoRotulo() + " " + documento.numero();
            if (!imagem(documento.arquivoContentType())) {
                naoLidas.add(rotulo + ": arquivo " + documento.arquivoNome() + " não é imagem (a IA lê só fotos nesta versão)");
                continue;
            }
            fotos.add(new Candidata("DOCUMENTO_FISCAL", id, documento.id(), rotulo, documento.arquivoContentType(),
                    () -> documentosFiscais.baixar(id, documento.id()).conteudo()));
        }
        return new Coleta(detalhe, fotos, naoLidas);
    }

    private Coleta coletarChecklist(UUID id) {
        var detalhe = checklists.detalhar(id);
        var fotos = new ArrayList<Candidata>();
        var naoLidas = new ArrayList<String>();
        // Problemas primeiro: são o que o gestor precisa decidir.
        for (var resposta : detalhe.respostas()) {
            for (var foto : resposta.fotos()) {
                adicionarFotoChecklist(fotos, naoLidas, id, foto, (resposta.problema() ? "Não OK: " : "") + resposta.pergunta()
                        + " (" + resposta.resposta() + ")");
            }
        }
        for (var foto : detalhe.fotosRecebimento()) {
            adicionarFotoChecklist(fotos, naoLidas, id, foto, "Recebimento: " + Objects.requireNonNullElse(foto.descricao(), "foto do veículo"));
        }
        return new Coleta(detalhe, fotos, naoLidas);
    }

    private Coleta coletarAbastecimento(UUID id) {
        var detalhe = abastecimentos.detalhar(id);
        var fotos = new ArrayList<Candidata>();
        var naoLidas = new ArrayList<String>();
        for (var foto : detalhe.fotos()) {
            if (!foto.recebida()) {
                naoLidas.add(foto.tipoRotulo() + ": ainda no celular de quem pediu");
                continue;
            }
            fotos.add(new Candidata("ABASTECIMENTO", id, foto.id(), foto.tipoRotulo(), null,
                    () -> abastecimentos.baixarFoto(id, foto.id()).conteudo()));
        }
        // Painel do abastecimento anterior do veículo: o modelo compara e aponta foto repetida ou
        // parecida demais (o hash só pega o arquivo idêntico).
        abastecimentos.painelAnterior(id).ifPresent(p -> fotos.add(new Candidata("ABASTECIMENTO_ANTERIOR", p.idAbastecimento(),
                p.idFoto(), "Painel do pedido anterior do veículo (" + DIA.format(p.solicitadoEm().atZoneSameInstant(Abastecimento.FUSO))
                        + "), só para comparar", null, () -> abastecimentos.baixarFoto(p.idAbastecimento(), p.idFoto()).conteudo())));
        return new Coleta(detalhe, fotos, naoLidas);
    }

    private void adicionarFotoChecklist(List<Candidata> fotos, List<String> naoLidas, UUID idChecklist,
                                        FotoChecklistResponse foto, String rotulo) {
        if (!foto.recebida()) {
            naoLidas.add(rotulo + ": ainda no celular de quem preencheu");
            return;
        }
        String descricao = foto.tipo() == TipoFotoChecklist.RESPOSTA || foto.descricao() == null ? rotulo : rotulo + " — " + foto.descricao();
        fotos.add(new Candidata("CHECKLIST", idChecklist, foto.id(), descricao, null,
                () -> checklists.baixarFoto(idChecklist, foto.id()).conteudo()));
    }

    /** Baixa, reduz e numera as fotos (F1, F2...) até o limite. */
    private List<FotoEnviada> preparar(List<Candidata> candidatas, List<String> naoLidas) {
        var enviadas = new ArrayList<FotoEnviada>();
        for (var candidata : candidatas) {
            if (enviadas.size() >= MAXIMO_FOTOS) {
                naoLidas.add(candidata.rotulo() + ": acima do limite de " + MAXIMO_FOTOS + " fotos por análise");
                continue;
            }
            try (InputStream entrada = candidata.conteudo().get()) {
                byte[] jpeg = reduzir(entrada.readNBytes(LIMITE_BYTES));
                if (jpeg == null) {
                    naoLidas.add(candidata.rotulo() + ": formato de imagem não suportado");
                    continue;
                }
                enviadas.add(new FotoEnviada("F" + (enviadas.size() + 1), candidata.origem(), candidata.idOrigem(),
                        candidata.idFoto(), candidata.rotulo(), "image/jpeg", jpeg));
            } catch (IOException | RuntimeException e) {
                LOGGER.warn("Foto {} não pôde ser lida para a IA: {}", candidata.idFoto(), e.getMessage());
                naoLidas.add(candidata.rotulo() + ": não foi possível baixar a foto");
            }
        }
        return enviadas;
    }

    static byte[] reduzir(byte[] original) throws IOException {
        BufferedImage imagem = ImageIO.read(new java.io.ByteArrayInputStream(original));
        if (imagem == null) {
            return null;
        }
        int largura = imagem.getWidth();
        int altura = imagem.getHeight();
        double escala = Math.min(1.0, (double) LADO_MAXIMO / Math.max(largura, altura));
        int novaLargura = Math.max(1, (int) Math.round(largura * escala));
        int novaAltura = Math.max(1, (int) Math.round(altura * escala));
        var destino = new BufferedImage(novaLargura, novaAltura, BufferedImage.TYPE_INT_RGB);
        var grafico = destino.createGraphics();
        try {
            grafico.drawImage(imagem.getScaledInstance(novaLargura, novaAltura, Image.SCALE_SMOOTH), 0, 0, java.awt.Color.WHITE, null);
        } finally {
            grafico.dispose();
        }
        var saida = new ByteArrayOutputStream();
        var escritor = ImageIO.getImageWritersByFormatName("jpeg").next();
        try (var stream = ImageIO.createImageOutputStream(saida)) {
            escritor.setOutput(stream);
            ImageWriteParam parametros = escritor.getDefaultWriteParam();
            parametros.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            parametros.setCompressionQuality(0.82f);
            escritor.write(null, new IIOImage(destino, null, null), parametros);
        } finally {
            escritor.dispose();
        }
        return saida.toByteArray();
    }

    private String contexto(Object dados) {
        try {
            String json = objectMapper.writeValueAsString(dados);
            return json.length() > LIMITE_CONTEXTO ? json.substring(0, LIMITE_CONTEXTO) + "…" : json;
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    /** @param precosCupom R$ por unidade lido no cupom, pela chave do nome do produto */
    record Lido(ParecerAnaliseIa parecer, String resumo, List<AnaliseIaResponse.Ponto> pontos,
                List<AnaliseIaResponse.Foto> fotos, List<String> recomendacoes, Map<String, java.math.BigDecimal> precosCupom) {
    }

    /** Lê o JSON do modelo com tolerância: campos ausentes viram vazios, nunca erro. */
    Lido ler(String resposta, List<FotoEnviada> enviadas) {
        JsonNode raiz = json(resposta);
        if (raiz == null || !raiz.isObject()) {
            throw new InvarianteVioladaException("O Assistente respondeu fora do formato esperado. Tente de novo.");
        }
        var parecer = switch (raiz.path("parecer").asText("").trim().toUpperCase()) {
            case "CRITICO", "CRÍTICO" -> ParecerAnaliseIa.CRITICO;
            case "ATENCAO", "ATENÇÃO" -> ParecerAnaliseIa.ATENCAO;
            default -> ParecerAnaliseIa.SEM_RESSALVAS;
        };
        var pontos = new ArrayList<AnaliseIaResponse.Ponto>();
        for (JsonNode p : raiz.path("pontos")) {
            String titulo = p.path("titulo").asText("").trim();
            if (!titulo.isEmpty()) {
                pontos.add(new AnaliseIaResponse.Ponto(titulo, p.path("detalhe").asText("").trim(),
                        gravidade(p.path("gravidade").asText(""))));
            }
        }
        Map<String, JsonNode> porRef = new LinkedHashMap<>();
        for (JsonNode f : raiz.path("fotos")) {
            porRef.put(f.path("ref").asText("").trim().toUpperCase(), f);
        }
        var fotos = enviadas.stream().map(f -> {
            JsonNode lida = porRef.get(f.ref());
            return new AnaliseIaResponse.Foto(f.ref(), f.origem(), f.idOrigem(), f.idFoto(), f.rotulo(),
                    lida == null ? null : texto(lida.path("leitura")),
                    lida == null ? "ILEGIVEL" : resultado(lida.path("resultado").asText("")),
                    lida == null ? "O Assistente não comentou esta foto." : texto(lida.path("observacao")));
        }).toList();
        var recomendacoes = new ArrayList<String>();
        for (JsonNode r : raiz.path("recomendacoes")) {
            if (!r.asText("").isBlank()) {
                recomendacoes.add(r.asText().trim());
            }
        }
        var precosCupom = new LinkedHashMap<String, java.math.BigDecimal>();
        for (JsonNode p : raiz.path("precosCupom")) {
            var valor = p.path("precoUnitario");
            if (valor.isNumber() && valor.decimalValue().signum() > 0 && !p.path("produto").asText("").isBlank()) {
                precosCupom.put(chave(p.path("produto").asText()), valor.decimalValue());
            }
        }
        String resumo = raiz.path("resumo").asText("").trim();
        return new Lido(parecer, resumo.isEmpty() ? parecer.getRotulo() + "." : resumo, pontos, fotos, recomendacoes, precosCupom);
    }

    private JsonNode json(String resposta) {
        if (resposta == null) {
            return null;
        }
        int inicio = resposta.indexOf('{');
        int fim = resposta.lastIndexOf('}');
        if (inicio < 0 || fim <= inicio) {
            return null;
        }
        try {
            return objectMapper.readTree(resposta.substring(inicio, fim + 1));
        } catch (JsonProcessingException e) {
            return null;
        }
    }

    private static String texto(JsonNode no) {
        String valor = no.asText("").trim();
        return valor.isEmpty() ? null : valor;
    }

    private static String gravidade(String valor) {
        return switch (valor.trim().toUpperCase()) {
            case "CRITICO", "CRÍTICO" -> "CRITICO";
            case "ATENCAO", "ATENÇÃO" -> "ATENCAO";
            default -> "INFO";
        };
    }

    private static String resultado(String valor) {
        return switch (valor.trim().toUpperCase()) {
            case "CONFERE" -> "CONFERE";
            case "DIVERGE" -> "DIVERGE";
            case "SEM_RELACAO", "SEM RELAÇÃO", "SEM RELACAO" -> "SEM_RELACAO";
            default -> "ILEGIVEL";
        };
    }

    private static boolean imagem(String contentType) {
        return contentType != null && contentType.toLowerCase().startsWith("image/");
    }

    private AnaliseIaResponse response(AnaliseIaFrota analise) {
        JsonNode resultado;
        try {
            resultado = objectMapper.readTree(analise.getResultado());
        } catch (JsonProcessingException e) {
            resultado = objectMapper.createObjectNode();
        }
        String autor = analise.getIdUsuario() == null ? null
                : referencias.nomesPessoas(List.of(analise.getIdUsuario())).get(analise.getIdUsuario());
        return new AnaliseIaResponse(analise.getId(), analise.getAlvo(), analise.getIdAlvo(), analise.getParecer(),
                analise.getParecer().getRotulo(), analise.getResumo(),
                lista(resultado.path("pontos"), AnaliseIaResponse.Ponto.class),
                lista(resultado.path("fotos"), AnaliseIaResponse.Foto.class),
                lista(resultado.path("recomendacoes"), String.class),
                analise.getFotosAnalisadas(),
                lista(resultado.path("fotosNaoLidas"), String.class),
                analise.getModelo(), analise.getDataCriacao(), autor);
    }

    private <T> List<T> lista(JsonNode no, Class<T> tipo) {
        if (!no.isArray()) {
            return List.of();
        }
        return objectMapper.convertValue(no, objectMapper.getTypeFactory().constructCollectionType(List.class, tipo));
    }
}
