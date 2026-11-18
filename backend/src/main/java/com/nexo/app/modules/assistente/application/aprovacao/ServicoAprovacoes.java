package com.nexo.app.modules.assistente.application.aprovacao;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.nexo.app.modules.assistente.application.agent.AcaoComPrevia.PreviaAcao;
import com.nexo.app.modules.assistente.application.agent.AcaoComPrevia.ResultadoAcao;
import com.nexo.app.modules.assistente.application.agent.ToolException;
import com.nexo.app.modules.assistente.application.cadastro.CatalogoCadastros;
import com.nexo.app.shared.application.analytics.SemanticQueryContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.text.NumberFormat;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Aprovacoes pela Bússola e pelas IAs conectadas. Junta as filas dos modulos ({@link ProvedorAprovacoes}),
 * filtradas pela permissao do usuario, e monta a decisao em lote: cada solicitacao e identificada pelo numero
 * da tela e conferida (existe, ainda espera decisao, valor confere com o que o usuario viu) antes de qualquer
 * gravacao. O que nao confere fica fora da decisao, com o motivo.
 */
@Service
public class ServicoAprovacoes {

    private static final Logger LOGGER = LoggerFactory.getLogger(ServicoAprovacoes.class);
    public static final int MAXIMO_POR_DECISAO = 50;
    private static final int LIMITE_FILA = 200;
    private static final Locale BRASIL = Locale.of("pt", "BR");
    private static final ZoneId FUSO = ZoneId.of("America/Sao_Paulo");
    private static final DateTimeFormatter DATA = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final BigDecimal TOLERANCIA = new BigDecimal("0.01");

    private final List<ProvedorAprovacoes> provedores;
    private final ObjectMapper mapper;

    public ServicoAprovacoes(List<ProvedorAprovacoes> provedores, ObjectMapper mapper) {
        this.provedores = List.copyOf(provedores);
        this.mapper = mapper;
    }

    /** Filas que o usuario pode decidir. */
    public List<ProvedorAprovacoes> permitidos(Set<String> autoridades) {
        return provedores.stream().filter(p -> p.autoridades().stream().anyMatch(autoridades::contains)).toList();
    }

    public Set<String> todasAutoridades() {
        return provedores.stream().flatMap(p -> p.autoridades().stream()).collect(Collectors.toUnmodifiableSet());
    }

    // ---------------------------------------------------------------------------------- consulta

    /** Fila de um tipo resolvida pelo que o modelo escreveu ("pagamento", "compras", "solicitacao_compra"). */
    public Optional<ProvedorAprovacoes> tipo(String texto, Set<String> autoridades) {
        if (texto == null || texto.isBlank()) return Optional.empty();
        String t = CatalogoCadastros.normalizar(texto);
        List<ProvedorAprovacoes> lista = permitidos(autoridades);
        return lista.stream().filter(p -> t.equals(p.tipo())).findFirst()
                .or(() -> lista.stream().filter(p -> t.contains(p.tipo()) || p.tipo().contains(t)
                        || CatalogoCadastros.normalizar(p.rotulo()).contains(t)).findFirst());
    }

    public record Pendente(ProvedorAprovacoes provedor, SolicitacaoEmAprovacao solicitacao) {
    }

    public List<Pendente> pendentes(SemanticQueryContext seguranca, String tipo, String busca) {
        List<ProvedorAprovacoes> filas = filas(seguranca, tipo);
        String termo = CatalogoCadastros.normalizar(busca);
        List<Pendente> lista = new ArrayList<>();
        for (ProvedorAprovacoes fila : filas) {
            for (SolicitacaoEmAprovacao s : fila.pendentes(LIMITE_FILA)) {
                if (!termo.isBlank() && !CatalogoCadastros.normalizar(String.join(" ", s.numero() + "", s.titulo(),
                        nulo(s.solicitante()), nulo(s.fornecedor()), nulo(s.descricao()), nulo(s.base()))).contains(termo)) {
                    continue;
                }
                lista.add(new Pendente(fila, s));
            }
        }
        return lista;
    }

    public List<Pendente> detalhar(SemanticQueryContext seguranca, String tipo, long numero) {
        List<Pendente> achados = new ArrayList<>();
        for (ProvedorAprovacoes fila : filas(seguranca, tipo)) {
            fila.buscar(numero).ifPresent(s -> achados.add(new Pendente(fila, s)));
        }
        return achados;
    }

    private List<ProvedorAprovacoes> filas(SemanticQueryContext seguranca, String tipo) {
        if (tipo == null || tipo.isBlank()) return permitidos(seguranca.autoridades());
        return List.of(tipo(tipo, seguranca.autoridades()).orElseThrow(() -> new ToolException(
                "Tipo de aprovacao indisponivel: '" + tipo + "'. Disponiveis: " + permitidos(seguranca.autoridades())
                        .stream().map(ProvedorAprovacoes::tipo).collect(Collectors.joining(", ")))));
    }

    // ---------------------------------------------------------------------------------- decisao

    /** Situacao de um item da decisao depois de conferido. */
    private record Analise(int indice, ObjectNode argumento, ProvedorAprovacoes fila, SolicitacaoEmAprovacao solicitacao,
            Decisao.Acao acao, BigDecimal valorAprovado, String texto, String problema, String falta) {

        boolean valido() {
            return problema == null;
        }

        boolean pronto() {
            return problema == null && falta == null;
        }
    }

    public PreviaAcao preparar(JsonNode argumentos, SemanticQueryContext seguranca) {
        return previa(normalizar(argumentos), seguranca);
    }

    public PreviaAcao revisar(JsonNode argumentos, JsonNode alteracoes, SemanticQueryContext seguranca) {
        return previa(aplicar(argumentos, alteracoes), seguranca);
    }

    public ResultadoAcao confirmar(JsonNode argumentos, JsonNode alteracoes, SemanticQueryContext seguranca) {
        ObjectNode atuais = aplicar(argumentos, alteracoes);
        List<Analise> analises = analisar(atuais, seguranca);
        PreviaAcao previa = montarPrevia(atuais, analises);
        if (!previa.pronta()) return new ResultadoAcao(false, null, previa.paraModelo(), null, previa);
        return decidir(analises, seguranca);
    }

    /**
     * Codigo que amarra a confirmacao das integracoes a lista apresentada: so decide o que foi mostrado ao usuario.
     * Muda se mudar qualquer solicitacao, decisao ou valor.
     */
    public String codigoConfirmacao(PreviaAcao previa, SemanticQueryContext seguranca) {
        StringBuilder base = new StringBuilder(String.valueOf(seguranca.usuarioId()));
        previa.exibicao().path("itens").forEach(item -> {
            if (item.hasNonNull("problema")) return;
            base.append('|').append(item.path("tipo").asText()).append(':').append(item.path("numero").asText())
                    .append(':').append(item.path("decisao").asText()).append(':').append(item.path("valorAprovado").asText(""));
        });
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(base.toString().getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().withUpperCase().formatHex(hash, 0, 3);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private PreviaAcao previa(ObjectNode argumentos, SemanticQueryContext seguranca) {
        return montarPrevia(argumentos, analisar(argumentos, seguranca));
    }

    /** Argumentos no formato guardado: {itens: [{tipo, numero, decisao, valor_conferido, valor_aprovado, observacao}]}. */
    private ObjectNode normalizar(JsonNode argumentos) {
        JsonNode entrada = ler(argumentos);
        JsonNode itens = ler(entrada.get("itens"));
        if ((itens == null || !itens.isArray()) && entrada.has("numero")) {
            itens = JsonNodeFactory.instance.arrayNode().add(entrada);
        }
        if (itens == null || !itens.isArray() || itens.isEmpty()) {
            throw new ToolException("Informe em 'itens' as solicitacoes a decidir, cada uma com tipo e numero.");
        }
        if (itens.size() > MAXIMO_POR_DECISAO) {
            throw new ToolException("No maximo " + MAXIMO_POR_DECISAO + " solicitacoes por decisao. Divida em partes.");
        }
        String decisaoGeral = texto(entrada, "decisao");
        String observacaoGeral = texto(entrada, "observacao");
        ObjectNode normalizados = JsonNodeFactory.instance.objectNode();
        ArrayNode lista = normalizados.putArray("itens");
        Set<String> vistos = new HashSet<>();
        for (JsonNode bruto : itens) {
            JsonNode item = ler(bruto);
            if (item == null || !item.isObject()) continue;
            Long numero = numero(item.get("numero"));
            String tipo = texto(item, "tipo");
            if (numero != null && !vistos.add((tipo == null ? "" : CatalogoCadastros.normalizar(tipo)) + ":" + numero)) continue;
            ObjectNode n = lista.addObject();
            if (tipo != null) n.put("tipo", tipo);
            if (numero != null) n.put("numero", numero);
            else if (item.hasNonNull("numero")) n.put("numero_informado", item.get("numero").asText());
            String decisao = Optional.ofNullable(texto(item, "decisao")).orElse(decisaoGeral);
            n.put("decisao", acao(decisao).name());
            BigDecimal conferido = valor(item.get("valor_solicitado"));
            if (conferido != null) n.put("valor_conferido", conferido);
            BigDecimal aprovado = valor(item.get("valor_aprovado"));
            if (aprovado != null) n.put("valor_aprovado", aprovado);
            String observacao = Optional.ofNullable(texto(item, "observacao")).or(() -> Optional.ofNullable(texto(item, "motivo")))
                    .orElse(observacaoGeral);
            if (observacao != null) n.put("observacao", observacao);
        }
        if (lista.isEmpty()) throw new ToolException("Nenhuma solicitacao valida em 'itens'. Informe tipo e numero de cada uma.");
        return normalizados;
    }

    /** Ajustes do cartao: [{registro, caminho, valor}] troca decisao, valor_aprovado ou observacao; {registro, remover} tira o item. */
    private ObjectNode aplicar(JsonNode argumentos, JsonNode alteracoes) {
        ObjectNode atuais = argumentos.deepCopy();
        if (alteracoes == null || !alteracoes.isArray()) return atuais;
        ArrayNode itens = (ArrayNode) atuais.withArray("itens");
        List<Integer> remover = new ArrayList<>();
        for (JsonNode alteracao : alteracoes) {
            int indice = alteracao.path("registro").asInt(-1);
            if (indice < 0 || indice >= itens.size()) continue;
            if (alteracao.path("remover").asBoolean(false) && !alteracao.hasNonNull("caminho")) {
                remover.add(indice);
                continue;
            }
            ObjectNode item = (ObjectNode) itens.get(indice);
            String caminho = alteracao.path("caminho").asText("");
            JsonNode valor = alteracao.get("valor");
            boolean limpar = alteracao.path("remover").asBoolean(false) || valor == null || valor.isNull()
                    || (valor.isTextual() && valor.asText().isBlank());
            switch (caminho) {
                case "decisao" -> { if (!limpar) item.put("decisao", acao(valor.asText()).name()); }
                case "observacao" -> {
                    if (limpar) item.remove("observacao");
                    else item.put("observacao", valor.asText().strip());
                }
                case "valor_aprovado" -> {
                    BigDecimal v = limpar ? null : valor(valor);
                    if (v == null) item.remove("valor_aprovado");
                    else item.put("valor_aprovado", v);
                }
                default -> { }
            }
        }
        remover.stream().sorted((a, b) -> b - a).forEach(itens::remove);
        return atuais;
    }

    private List<Analise> analisar(ObjectNode argumentos, SemanticQueryContext seguranca) {
        List<Analise> analises = new ArrayList<>();
        int indice = 0;
        for (JsonNode node : argumentos.withArray("itens")) {
            analises.add(analisar(indice++, (ObjectNode) node, seguranca));
        }
        return analises;
    }

    private Analise analisar(int indice, ObjectNode item, SemanticQueryContext seguranca) {
        Decisao.Acao acao = acao(item.path("decisao").asText(null));
        String texto = item.hasNonNull("observacao") ? item.get("observacao").asText() : null;
        BigDecimal aprovado = item.hasNonNull("valor_aprovado") ? item.get("valor_aprovado").decimalValue() : null;
        if (!item.hasNonNull("numero")) {
            String informado = item.path("numero_informado").asText("");
            return new Analise(indice, item, null, null, acao, aprovado, texto,
                    informado.isBlank() ? "Falta o número da solicitação." : "Número inválido: " + informado + ".", null);
        }
        long numero = item.get("numero").asLong();
        String tipo = item.path("tipo").asText(null);

        ProvedorAprovacoes fila;
        SolicitacaoEmAprovacao solicitacao;
        if (tipo == null || tipo.isBlank()) {
            List<Pendente> achados = detalhar(seguranca, null, numero);
            List<Pendente> aguardando = achados.stream().filter(p -> p.solicitacao().aguardando()).toList();
            List<Pendente> escolha = aguardando.isEmpty() ? achados : aguardando;
            if (escolha.size() != 1) {
                String problema = escolha.isEmpty() ? "Não encontrei solicitação nº " + numero + " que você possa decidir."
                        : "Existe mais de uma solicitação nº " + numero + " ("
                                + escolha.stream().map(p -> p.provedor().rotulo().toLowerCase(BRASIL)).collect(Collectors.joining(" e "))
                                + "). Diga qual é.";
                return new Analise(indice, item, null, null, acao, aprovado, texto, problema, null);
            }
            fila = escolha.getFirst().provedor();
            solicitacao = escolha.getFirst().solicitacao();
        } else {
            Optional<ProvedorAprovacoes> resolvida = tipo(tipo, seguranca.autoridades());
            if (resolvida.isEmpty()) {
                return new Analise(indice, item, null, null, acao, aprovado, texto,
                        "Você não tem permissão para decidir " + tipo + ".", null);
            }
            fila = resolvida.get();
            Optional<SolicitacaoEmAprovacao> achada = fila.buscar(numero);
            if (achada.isEmpty()) {
                return new Analise(indice, item, fila, null, acao, aprovado, texto,
                        fila.rotulo() + " nº " + numero + " não encontrada.", null);
            }
            solicitacao = achada.get();
        }
        item.put("tipo", fila.tipo());
        item.put("id", solicitacao.id().toString());

        String problema = null;
        if (!solicitacao.aguardando()) {
            problema = "Não está aguardando aprovação (situação: " + solicitacao.situacao().toLowerCase(BRASIL) + ").";
        } else if (item.hasNonNull("valor_conferido") && solicitacao.valor() != null
                && item.get("valor_conferido").decimalValue().subtract(solicitacao.valor()).abs().compareTo(TOLERANCIA) > 0) {
            problema = "O valor desta solicitação é " + moeda(solicitacao.valor()) + ", não "
                    + moeda(item.get("valor_conferido").decimalValue()) + ". Confira se é a solicitação certa.";
        } else if (acao == Decisao.Acao.APROVAR && aprovado != null && solicitacao.valor() != null
                && aprovado.compareTo(solicitacao.valor()) > 0) {
            problema = "O valor aprovado (" + moeda(aprovado) + ") não pode passar do solicitado (" + moeda(solicitacao.valor()) + ").";
        } else if (acao == Decisao.Acao.APROVAR && aprovado != null && aprovado.signum() <= 0) {
            problema = "O valor aprovado deve ser maior que zero.";
        }
        String falta = problema == null && acao == Decisao.Acao.REJEITAR && (texto == null || texto.isBlank())
                ? "Falta o motivo da rejeição." : null;
        return new Analise(indice, item, fila, solicitacao, acao, acao == Decisao.Acao.APROVAR ? aprovado : null, texto,
                problema, falta);
    }

    private PreviaAcao montarPrevia(ObjectNode argumentos, List<Analise> analises) {
        List<Analise> validas = analises.stream().filter(Analise::valido).toList();
        boolean pronta = !validas.isEmpty() && validas.stream().allMatch(Analise::pronto);
        long aprovar = validas.stream().filter(a -> a.acao() == Decisao.Acao.APROVAR).count();
        long rejeitar = validas.size() - aprovar;
        BigDecimal total = validas.stream().filter(a -> a.acao() == Decisao.Acao.APROVAR)
                .map(a -> a.valorAprovado() != null ? a.valorAprovado() : nuloZero(a.solicitacao().valor()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        ObjectNode exibicao = JsonNodeFactory.instance.objectNode();
        exibicao.put("tipo", "aprovacao");
        exibicao.put("chave", "aprovacao");
        exibicao.put("titulo", titulo(aprovar, rejeitar));
        exibicao.put("modulo", analises.stream().filter(a -> a.fila() != null).map(a -> a.fila().modulo()).distinct()
                .collect(Collectors.joining(", ")));
        exibicao.put("pronta", pronta);
        exibicao.put("total", validas.size());
        exibicao.put("aprovar", aprovar);
        exibicao.put("rejeitar", rejeitar);
        exibicao.put("valorAprovar", total);
        ArrayNode itens = exibicao.putArray("itens");
        for (Analise a : analises) {
            ObjectNode item = itens.addObject();
            item.put("indice", a.indice());
            item.put("decisao", a.acao().name());
            if (a.fila() != null) {
                item.put("tipo", a.fila().tipo());
                item.put("rotuloTipo", a.fila().rotulo());
            }
            if (a.argumento().hasNonNull("numero")) item.put("numero", a.argumento().get("numero").asLong());
            SolicitacaoEmAprovacao s = a.solicitacao();
            if (s != null) {
                item.put("id", s.id().toString());
                item.put("titulo", s.titulo());
                item.put("situacao", s.situacao());
                putSe(item, "solicitante", s.solicitante());
                putSe(item, "fornecedor", s.fornecedor());
                putSe(item, "descricao", resumir(s.descricao(), 180));
                putSe(item, "base", s.base());
                if (s.valor() != null) item.put("valor", s.valor());
                if (s.enviadaEm() != null) item.put("enviadaEm", s.enviadaEm().toString());
                putSe(item, "caminho", s.caminho());
            } else {
                item.put("titulo", (a.fila() == null ? "Solicitação" : a.fila().rotulo()) + " nº "
                        + a.argumento().path("numero").asText(a.argumento().path("numero_informado").asText("?")));
            }
            if (a.valorAprovado() != null) item.put("valorAprovado", a.valorAprovado());
            putSe(item, "observacao", a.texto());
            putSe(item, "problema", a.problema());
            putSe(item, "falta", a.falta());
        }

        ObjectNode modelo = JsonNodeFactory.instance.objectNode();
        modelo.put("status", "DECISAO_PREPARADA");
        modelo.put("nada_foi_decidido", true);
        modelo.put("pronto_para_confirmar", pronta);
        ArrayNode entram = modelo.putArray("serao_decididas");
        ArrayNode fora = modelo.putArray("fora_da_decisao");
        for (Analise a : analises) {
            if (a.valido()) {
                ObjectNode linha = entram.addObject();
                linha.put("solicitacao", descrever(a.solicitacao()));
                linha.put("decisao", a.acao() == Decisao.Acao.APROVAR ? "aprovar" : "rejeitar");
                if (a.valorAprovado() != null) linha.put("valor_aprovado", moeda(a.valorAprovado()));
                if (a.texto() != null) linha.put(a.acao() == Decisao.Acao.APROVAR ? "observacao" : "motivo", a.texto());
                if (a.falta() != null) linha.put("falta", a.falta());
            } else {
                fora.addObject().put("solicitacao", a.solicitacao() != null ? descrever(a.solicitacao())
                        : itens.get(a.indice()).path("titulo").asText()).put("motivo", a.problema());
            }
        }
        if (total.signum() > 0) modelo.put("total_a_aprovar", moeda(total));

        String resumo = validas.isEmpty() ? "Nenhuma solicitação para decidir"
                : titulo(aprovar, rejeitar) + (total.signum() > 0 ? " · " + moeda(total) : "");
        return new PreviaAcao(argumentos, exibicao, modelo.toString(), resumo, "aprovacao", pronta);
    }

    private ResultadoAcao decidir(List<Analise> analises, SemanticQueryContext seguranca) {
        ObjectNode resultado = JsonNodeFactory.instance.objectNode();
        resultado.put("tipo", "aprovacao_resultado");
        ArrayNode itens = resultado.putArray("itens");
        List<String> linhas = new ArrayList<>();
        int decididas = 0;
        int falhas = 0;
        for (Analise a : analises) {
            if (!a.valido()) continue;
            ObjectNode item = itens.addObject();
            item.put("indice", a.indice());
            item.put("titulo", a.solicitacao().titulo());
            putSe(item, "fornecedor", a.solicitacao().fornecedor());
            putSe(item, "solicitante", a.solicitacao().solicitante());
            if (a.solicitacao().valor() != null) item.put("valor", a.solicitacao().valor());
            putSe(item, "caminho", a.solicitacao().caminho());
            try {
                SolicitacaoEmAprovacao decidida = a.fila().decidir(a.solicitacao().id(),
                        new Decisao(a.acao(), a.valorAprovado(), a.texto()), seguranca.usuarioId());
                String status = a.acao() == Decisao.Acao.APROVAR ? "APROVADA" : "REJEITADA";
                item.put("status", status);
                if (decidida.valorAprovado() != null) item.put("valorAprovado", decidida.valorAprovado());
                linhas.add(descrever(a.solicitacao()) + ": " + (a.acao() == Decisao.Acao.APROVAR
                        ? "APROVADA" + (decidida.valorAprovado() != null ? " (" + moeda(decidida.valorAprovado()) + ")" : "")
                        : "REJEITADA"));
                decididas++;
            } catch (RuntimeException exception) {
                String mensagem = exception.getMessage() == null ? "Não foi possível decidir." : exception.getMessage();
                // Nunca afirmar o que nao aconteceu: a situacao real da solicitacao vai junto com o motivo.
                String atual = situacaoAtual(a);
                if (atual != null) mensagem = mensagem + " Situação atual: " + atual + ".";
                LOGGER.info("Decisao de {} pela Bússola recusada: {}", a.solicitacao().titulo(), mensagem);
                item.put("status", "FALHOU");
                item.put("mensagem", mensagem);
                linhas.add(descrever(a.solicitacao()) + ": NAO DECIDIDA (" + mensagem + ")");
                falhas++;
            }
        }
        for (Analise a : analises) {
            if (a.valido()) continue;
            ObjectNode item = itens.addObject();
            item.put("indice", a.indice());
            item.put("titulo", itensTitulo(a));
            item.put("status", "FORA");
            item.put("mensagem", a.problema());
            linhas.add(itensTitulo(a) + ": fora da decisao (" + a.problema() + ")");
        }
        resultado.put("decididas", decididas);
        resultado.put("falhas", falhas);
        String historico = "Decisao de aprovacao confirmada pelo usuario. " + String.join("; ", linhas) + ".";
        return new ResultadoAcao(decididas > 0, resultado, historico, null, null);
    }

    private static String situacaoAtual(Analise a) {
        try {
            return a.fila().buscar(a.solicitacao().numero()).map(SolicitacaoEmAprovacao::situacao)
                    .map(s -> s.toLowerCase(BRASIL)).orElse(null);
        } catch (RuntimeException exception) {
            return null;
        }
    }

    // ---------------------------------------------------------------------------------- apoio

    /** "Pagamento nº 1234 · Fornecedor X · R$ 1.450,00 · solicitante Maria": o que identifica sem duvida. */
    public static String descrever(SolicitacaoEmAprovacao s) {
        List<String> partes = new ArrayList<>();
        partes.add(s.titulo());
        if (s.fornecedor() != null) partes.add(s.fornecedor());
        if (s.valor() != null) partes.add(moeda(s.valor()));
        if (s.solicitante() != null) partes.add("solicitante " + s.solicitante());
        return String.join(" · ", partes);
    }

    private static String itensTitulo(Analise a) {
        if (a.solicitacao() != null) return descrever(a.solicitacao());
        return (a.fila() == null ? "Solicitação" : a.fila().rotulo()) + " nº " + a.argumento().path("numero").asText("?");
    }

    private static String titulo(long aprovar, long rejeitar) {
        List<String> partes = new ArrayList<>();
        if (aprovar > 0) partes.add("Aprovar " + aprovar + (aprovar == 1 ? " solicitação" : " solicitações"));
        if (rejeitar > 0) partes.add((aprovar > 0 ? "rejeitar " : "Rejeitar ") + rejeitar + (rejeitar == 1 ? " solicitação" : " solicitações"));
        return partes.isEmpty() ? "Aprovação de solicitações" : String.join(" e ", partes);
    }

    public static String moeda(BigDecimal valor) {
        return valor == null ? "-" : NumberFormat.getCurrencyInstance(BRASIL).format(valor).replace(' ', ' ');
    }

    public static String data(OffsetDateTime quando) {
        return quando == null ? null : quando.atZoneSameInstant(FUSO).format(DATA);
    }

    public static long diasAguardando(OffsetDateTime enviadaEm) {
        return enviadaEm == null ? 0 : Math.max(0, Duration.between(enviadaEm, OffsetDateTime.now()).toDays());
    }

    public static String resumir(String texto, int limite) {
        if (texto == null) return null;
        String t = texto.strip().replaceAll("\\s+", " ");
        return t.length() <= limite ? t : t.substring(0, limite - 1) + "…";
    }

    private static Decisao.Acao acao(String texto) {
        if (texto == null || texto.isBlank()) return Decisao.Acao.APROVAR;
        String t = CatalogoCadastros.normalizar(texto);
        if (t.startsWith("rej") || t.startsWith("repro") || t.startsWith("neg") || t.startsWith("recus")) {
            return Decisao.Acao.REJEITAR;
        }
        if (t.startsWith("apro") || t.startsWith("autoriz") || t.startsWith("aceit")) return Decisao.Acao.APROVAR;
        throw new ToolException("Decisao invalida: '" + texto + "'. Use 'aprovar' ou 'rejeitar'.");
    }

    private JsonNode ler(JsonNode node) {
        if (node != null && node.isTextual()) {
            String texto = node.asText().strip();
            if (texto.startsWith("[") || texto.startsWith("{")) {
                try {
                    return mapper.readTree(texto);
                } catch (Exception exception) {
                    throw new ToolException("'itens' nao e um JSON valido.");
                }
            }
        }
        return node == null ? JsonNodeFactory.instance.objectNode() : node;
    }

    private static String texto(JsonNode node, String campo) {
        JsonNode valor = node.get(campo);
        if (valor == null || valor.isNull()) return null;
        String texto = valor.asText().strip();
        return texto.isEmpty() ? null : texto;
    }

    static Long numero(JsonNode node) {
        if (node == null || node.isNull()) return null;
        if (node.canConvertToLong() && node.isIntegralNumber()) return node.asLong();
        String digitos = node.asText().replaceAll("[^0-9]", "");
        if (digitos.isEmpty() || digitos.length() > 12) return null;
        return Long.parseLong(digitos);
    }

    static BigDecimal valor(JsonNode node) {
        if (node == null || node.isNull()) return null;
        if (node.isNumber()) return node.decimalValue();
        String texto = node.asText().replace("R$", "").replace(" ", "").replace(" ", "").strip();
        if (texto.isEmpty()) return null;
        if (texto.contains(",")) texto = texto.replace(".", "").replace(',', '.');
        try {
            return new BigDecimal(texto);
        } catch (NumberFormatException exception) {
            throw new ToolException("Valor invalido: '" + node.asText() + "'.");
        }
    }

    private static void putSe(ObjectNode node, String campo, String valor) {
        if (valor != null && !valor.isBlank()) node.put(campo, valor);
    }

    private static String nulo(String texto) {
        return texto == null ? "" : texto;
    }

    private static BigDecimal nuloZero(BigDecimal valor) {
        return valor == null ? BigDecimal.ZERO : valor;
    }
}
