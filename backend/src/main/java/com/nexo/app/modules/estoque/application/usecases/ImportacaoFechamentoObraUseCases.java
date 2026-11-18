package com.nexo.app.modules.estoque.application.usecases;

import com.nexo.app.modules.estoque.application.dto.FechamentoImportacaoDTO;
import com.nexo.app.modules.estoque.application.dto.FechamentoObraRequests;
import com.nexo.app.modules.estoque.application.dto.FechamentoObraResponses;
import com.nexo.app.modules.estoque.application.dto.ProcessamentoImportacao;
import com.nexo.app.modules.estoque.application.services.ValidadorImportacaoFechamentoObraService;
import com.nexo.app.shared.application.dto.ImportacaoStatus;
import com.nexo.app.shared.domain.exception.BaseBusinessException;
import com.nexo.app.shared.domain.exception.PreenchimentoInvalidoException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.StringReader;
import java.math.BigDecimal;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/** Importação de solicitações de encerramento por planilha: modelo, validação, revalidação e confirmação. */
@Service
@RequiredArgsConstructor
@Slf4j
public class ImportacaoFechamentoObraUseCases {

    private static final long TAMANHO_MAXIMO = 5L * 1024 * 1024;
    private static final int LIMITE_LINHAS = 2000;
    private static final List<String> CABECALHOS = List.of(
            "Numero Obra", "Almoxarifado Atendimento", "Tipo Movimentacao", "Codigo Material",
            "Quantidade", "Numero Reserva", "Data Reserva", "Observacao");
    private static final List<String> OBRIGATORIOS = CABECALHOS.subList(0, 5);

    private final ValidadorImportacaoFechamentoObraService validador;
    private final FechamentoObraUseCases fechamento;

    public byte[] modeloCsv() {
        StringBuilder csv = new StringBuilder("﻿");
        csv.append("# Modelo de importacao de solicitacoes de encerramento de obra\r\n");
        csv.append("# Cada Obra + Almoxarifado + Tipo + Reserva vira uma solicitacao. Tipo: 221, 921, 222 ou 922.\r\n");
        csv.append("# Reserva e data sao opcionais. Datas: DD/MM/AAAA. Quantidade: ate 3 casas decimais.\r\n");
        csv.append(String.join(";", CABECALHOS)).append("\r\n");
        csv.append("OBRA-1001;ALMOX CENTRAL;221;MAT-001;10.500;;;Sobra levantada na vistoria\r\n");
        csv.append("OBRA-1001;ALMOX CENTRAL;221;MAT-002;2;;;\r\n");
        csv.append("OBRA-1001;ALMOX CENTRAL;222;MAT-003;5;1234567890;05/11/2026;\r\n");
        return csv.toString().getBytes(StandardCharsets.UTF_8);
    }

    public FechamentoObraResponses.Importacao validarArquivo(MultipartFile arquivo) {
        return revalidar(ler(arquivo));
    }

    public FechamentoObraResponses.Importacao revalidar(List<FechamentoImportacaoDTO> registros) {
        var validacao = validador.validar(exigirRegistros(registros));
        int falhas = (int) validacao.registros().stream().filter(ImportacaoFechamentoObraUseCases::comErro).count();
        int sucessos = validacao.registros().size() - falhas;
        return new FechamentoObraResponses.Importacao(validacao.registros(), validacao.registros().size(), sucessos,
                falhas, validacao.grupos().size(), ProcessamentoImportacao.validacao(sucessos, falhas));
    }

    /** Cada solicitação grava na sua própria transação: uma falha não desfaz as demais. */
    public FechamentoObraResponses.Importacao confirmar(
            List<FechamentoImportacaoDTO> registros,
            UUID idUsuario,
            String chaveIdempotencia
    ) {
        var validacao = validador.validar(exigirRegistros(registros));
        List<FechamentoImportacaoDTO> resultado = new ArrayList<>(validacao.registros());
        int criadas = 0;
        for (var grupo : validacao.grupos()) {
            ImportacaoStatus status = ImportacaoStatus.CONCLUIDO;
            String erro = null;
            try {
                fechamento.criar(pedido(grupo), idUsuario, chaveDoGrupo(chaveIdempotencia, grupo.chave()));
                criadas++;
            } catch (RuntimeException ex) {
                log.warn("Falha ao criar solicitacao de fechamento importada: tipo={}, erro={}",
                        grupo.tipo(), ex.getClass().getSimpleName());
                status = ImportacaoStatus.COM_ERRO;
                erro = mensagem(ex);
            }
            for (int indice : grupo.indices()) {
                resultado.set(indice, resultado.get(indice).comResultado(status, null, erro));
            }
        }
        int falhas = (int) resultado.stream().filter(ImportacaoFechamentoObraUseCases::comErro).count();
        int sucessos = resultado.size() - falhas;
        return new FechamentoObraResponses.Importacao(resultado, resultado.size(), sucessos, falhas, criadas,
                ProcessamentoImportacao.confirmacao(sucessos, falhas));
    }

    private static boolean comErro(FechamentoImportacaoDTO registro) {
        return registro.status() == ImportacaoStatus.COM_ERRO;
    }

    private static List<FechamentoImportacaoDTO> exigirRegistros(List<FechamentoImportacaoDTO> registros) {
        if (registros == null || registros.isEmpty()) {
            throw erroArquivo("A planilha não tem linhas de dados.");
        }
        if (registros.size() > LIMITE_LINHAS) {
            throw erroArquivo("A planilha passa do limite de 2.000 linhas.");
        }
        return registros;
    }

    private static FechamentoObraRequests.Criar pedido(ValidadorImportacaoFechamentoObraService.Grupo grupo) {
        return new FechamentoObraRequests.Criar(grupo.idObra(), grupo.idAlmoxarifado(), null, null, grupo.observacao(),
                List.of(new FechamentoObraRequests.Criar.Solicitacao(
                        grupo.tipo(), grupo.numeroReserva(), grupo.dataReserva(), grupo.itens())));
    }

    /** Uma chave por solicitação: reenviar a mesma confirmação não cria nada de novo. */
    private static String chaveDoGrupo(String chave, String grupo) {
        if (chave == null || chave.isBlank()) {
            return null;
        }
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256")
                    .digest((chave + ":" + grupo).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 indisponivel", ex);
        }
    }

    private static String mensagem(RuntimeException ex) {
        if (ex instanceof PreenchimentoInvalidoException preenchimento) {
            return String.join(" ", preenchimento.getErros().values());
        }
        if (ex instanceof BaseBusinessException) {
            return ex.getMessage();
        }
        return "Não foi possível criar esta solicitação. Tente novamente.";
    }

    private static List<FechamentoImportacaoDTO> ler(MultipartFile arquivo) {
        if (arquivo == null || arquivo.isEmpty()) {
            throw erroArquivo("Selecione um arquivo .csv preenchido conforme o modelo.");
        }
        if (arquivo.getSize() > TAMANHO_MAXIMO) {
            throw erroArquivo("O arquivo passa do limite de 5 MB.");
        }
        String nome = arquivo.getOriginalFilename() == null ? "" : arquivo.getOriginalFilename().toLowerCase(Locale.ROOT);
        if (!nome.endsWith(".csv")) {
            throw erroArquivo("Envie um arquivo .csv separado por ponto e vírgula (;).");
        }
        String conteudo = decodificar(arquivo);
        CSVFormat formato = CSVFormat.DEFAULT.builder()
                .setDelimiter(';')
                .setHeader()
                .setSkipHeaderRecord(true)
                .setIgnoreEmptyLines(true)
                .setTrim(true)
                .setCommentMarker('#')
                .build();
        try (CSVParser parser = formato.parse(new StringReader(conteudo))) {
            Map<String, Integer> colunas = colunas(parser.getHeaderNames());
            List<FechamentoImportacaoDTO> registros = new ArrayList<>();
            for (CSVRecord linha : parser) {
                if (registros.size() >= LIMITE_LINHAS) {
                    throw erroArquivo("A planilha passa do limite de 2.000 linhas.");
                }
                registros.add(registro(linha, colunas, (int) parser.getCurrentLineNumber()));
            }
            return registros;
        } catch (IOException | IllegalArgumentException | IllegalStateException ex) {
            throw erroArquivo("Não foi possível ler o CSV. Use o modelo, separado por ponto e vírgula (;).");
        }
    }

    private static String decodificar(MultipartFile arquivo) {
        try {
            String conteudo = StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(arquivo.getBytes())).toString();
            return conteudo.startsWith("﻿") ? conteudo.substring(1) : conteudo;
        } catch (CharacterCodingException ex) {
            throw erroArquivo("Salve o CSV com a codificação UTF-8.");
        } catch (IOException ex) {
            throw erroArquivo("Não foi possível ler o arquivo enviado.");
        }
    }

    private static Map<String, Integer> colunas(List<String> cabecalhos) {
        Map<String, Integer> colunas = new HashMap<>();
        for (int indice = 0; indice < cabecalhos.size(); indice++) {
            colunas.put(normalizar(cabecalhos.get(indice)), indice);
        }
        List<String> faltando = OBRIGATORIOS.stream().filter(nome -> !colunas.containsKey(normalizar(nome))).toList();
        if (!faltando.isEmpty()) {
            throw erroArquivo("Faltam colunas do modelo: " + String.join(", ", faltando) + ".");
        }
        return colunas;
    }

    private static FechamentoImportacaoDTO registro(CSVRecord linha, Map<String, Integer> colunas, int numero) {
        return new FechamentoImportacaoDTO(
                numero,
                valor(linha, colunas, "Numero Obra"),
                null,
                valor(linha, colunas, "Almoxarifado Atendimento"),
                valor(linha, colunas, "Tipo Movimentacao"),
                valor(linha, colunas, "Codigo Material"),
                null,
                quantidade(valor(linha, colunas, "Quantidade")),
                valor(linha, colunas, "Numero Reserva"),
                valor(linha, colunas, "Data Reserva"),
                valor(linha, colunas, "Observacao"),
                ImportacaoStatus.AGUARDANDO_PROCESSAMENTO,
                null,
                null);
    }

    private static String valor(CSVRecord linha, Map<String, Integer> colunas, String coluna) {
        Integer indice = colunas.get(normalizar(coluna));
        return indice == null || indice >= linha.size() ? "" : linha.get(indice);
    }

    /** Quantidade ilegível fica vazia e a validação aponta na linha. */
    private static BigDecimal quantidade(String valor) {
        try {
            return valor.isBlank() ? null : new BigDecimal(valor.trim().replace(',', '.'));
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private static String normalizar(String cabecalho) {
        String semAcento = Normalizer.normalize(cabecalho == null ? "" : cabecalho, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "");
        return semAcento.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
    }

    private static PreenchimentoInvalidoException erroArquivo(String mensagem) {
        return new PreenchimentoInvalidoException(Map.of("arquivo", mensagem));
    }
}
