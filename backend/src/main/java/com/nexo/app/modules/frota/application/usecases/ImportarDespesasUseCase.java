package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.application.dto.DespesaImportacaoLinha;
import com.nexo.app.modules.frota.application.dto.DespesaVeiculoRequest;
import com.nexo.app.modules.frota.application.dto.ImportacaoDespesasResponse;
import com.nexo.app.modules.frota.domain.DespesaVeiculo;
import com.nexo.app.modules.frota.domain.FormaPagamentoDespesa;
import com.nexo.app.modules.frota.domain.ReferenciaExterna;
import com.nexo.app.modules.frota.domain.SubtipoDespesa;
import com.nexo.app.modules.frota.domain.TipoDespesa;
import com.nexo.app.modules.frota.domain.TipoDocumentoFiscal;
import com.nexo.app.modules.frota.infrastructure.persistence.DespesaVeiculoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.TipoDespesaRepository;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Importação de despesas pelo modelo GEO (CSV com ";"), em duas etapas: validar (pré-visualização
 * linha a linha) e confirmar. Com id externo, a mesma linha importada de novo atualiza a despesa em
 * vez de duplicar; a migração do EXP converte para este modelo.
 */
@Service
@RequiredArgsConstructor
public class ImportarDespesasUseCase {

    static final String PRONTA = "AGUARDANDO_PROCESSAMENTO";
    static final String COM_ERRO = "COM_ERRO";
    static final String PROCESSADA = "PROCESSADO";
    private static final int LIMITE_LINHAS = 2000;
    private static final String SISTEMA_PADRAO = "EXP";
    private static final DateTimeFormatter DATA_BR = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    static final String CABECALHO = "Placa;Data;Tipo;Subtipo;Valor;Descrição;Fornecedor;Documento;Número do documento;"
            + "Forma de pagamento;Sistema de origem;Id externo";

    private final DespesaVeiculoRepository repository;
    private final TipoDespesaRepository tipos;
    private final DespesaVeiculoUseCases despesas;
    private final ReferenciasFrota referencias;

    @Transactional(readOnly = true)
    public ImportacaoDespesasResponse validar(MultipartFile arquivo) {
        if (arquivo == null || arquivo.isEmpty()) {
            throw new InvarianteVioladaException("Envie a planilha CSV.");
        }
        List<DespesaImportacaoLinha> linhas = new ArrayList<>();
        try (var reader = new BufferedReader(new InputStreamReader(arquivo.getInputStream(), StandardCharsets.UTF_8))) {
            String texto;
            int numero = 0;
            while ((texto = reader.readLine()) != null) {
                numero++;
                if (numero == 1 || texto.isBlank() || texto.trim().startsWith("#")) {
                    continue;
                }
                if (linhas.size() >= LIMITE_LINHAS) {
                    throw new InvarianteVioladaException("A planilha passa de " + LIMITE_LINHAS + " linhas. Divida em arquivos menores.");
                }
                linhas.add(ler(texto, numero));
            }
        } catch (IOException e) {
            throw new InvarianteVioladaException("Não foi possível ler a planilha. Salve como CSV (separado por ponto e vírgula).");
        }
        var placas = referencias.idsVeiculosPorPlaca();
        return responder(linhas.stream().map(l -> conferir(l, placas, false)).toList());
    }

    @Transactional
    public ImportacaoDespesasResponse confirmar(List<DespesaImportacaoLinha> linhas) {
        var placas = referencias.idsVeiculosPorPlaca();
        var conferidas = linhas.stream().map(l -> conferir(l, placas, false)).toList();
        if (conferidas.stream().anyMatch(l -> COM_ERRO.equals(l.status()))) {
            return responder(conferidas);
        }
        List<DespesaImportacaoLinha> resultado = new ArrayList<>();
        for (var linha : conferidas) {
            resultado.add(conferir(linha, placas, true));
        }
        return responder(resultado);
    }

    public byte[] modelo() {
        String exemplo = "# Exemplo (apague esta linha): ABC1D23;10/10/2026;Lavagem;Completa;80,00;Depois da obra;Lava Rápido Exemplo;"
                + "Recibo;123;A pagar;EXP;LAV-0001\n";
        String ajuda = "# Tipo: Lavagem, Estacionamento, Pedágio, Mensalidade, Taxa e licenciamento, Outras (ou um tipo criado nas configurações). "
                + "Documento: NF-e, NFS-e, Cupom, Recibo, Outro. Forma de pagamento: A pagar, Cartão, Reembolso, Já pago. "
                + "Id externo: a chave da despesa no sistema de origem; reimportar a mesma chave atualiza em vez de duplicar.\n";
        return ("﻿" + CABECALHO + "\n" + exemplo + ajuda).getBytes(StandardCharsets.UTF_8);
    }

    /** Valida a linha e, com {@code gravar}, grava (nova ou atualização pela chave externa). */
    private DespesaImportacaoLinha conferir(DespesaImportacaoLinha l, Map<String, UUID> placas, boolean gravar) {
        try {
            UUID idVeiculo = placas.get(normalizarPlaca(l.placa()));
            if (!StringUtils.hasText(l.placa())) throw new InvarianteVioladaException("Informe a placa.");
            if (idVeiculo == null) throw new InvarianteVioladaException("Placa " + l.placa() + " não encontrada na frota.");
            LocalDate data = data(l.data());
            TipoDespesa tipo = tipo(l.tipo());
            SubtipoDespesa subtipo = subtipo(tipo, l.subtipo());
            BigDecimal valor = valor(l.valor());
            TipoDocumentoFiscal documento = documento(l.documento());
            FormaPagamentoDespesa forma = forma(l.formaPagamento());
            var request = new DespesaVeiculoRequest(idVeiculo, data, tipo.getId(), subtipo == null ? null : subtipo.getId(), l.descricao(),
                    valor, null, null, null, l.fornecedor(), documento, l.numeroDocumento(), null, forma);
            var dados = despesas.dados(request);
            String sistema = StringUtils.hasText(l.sistemaOrigem()) ? l.sistemaOrigem().trim() : SISTEMA_PADRAO;
            Optional<DespesaVeiculo> existente = StringUtils.hasText(l.idExterno())
                    ? repository.findByReferenciaExternaSistemaOrigemAndReferenciaExternaIdExterno(sistema.toUpperCase(Locale.ROOT), l.idExterno().trim())
                    : Optional.empty();
            String acao = existente.isPresent() ? "Atualiza a despesa já importada" : StringUtils.hasText(l.idExterno())
                    ? "Nova" : "Nova (sem id externo: reimportar duplica)";
            if (gravar) {
                if (existente.isPresent()) {
                    existente.get().atualizar(dados, DespesaVeiculoUseCases.hoje());
                    repository.save(existente.get());
                } else if (StringUtils.hasText(l.idExterno())) {
                    repository.save(DespesaVeiculo.importar(dados, ReferenciaExterna.de(sistema, l.idExterno().trim()), DespesaVeiculoUseCases.hoje()));
                } else {
                    repository.save(DespesaVeiculo.importar(dados, null, DespesaVeiculoUseCases.hoje()));
                }
                return l.com(PROCESSADA, null, acao);
            }
            return l.com(PRONTA, null, acao);
        } catch (InvarianteVioladaException | com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException e) {
            return l.com(COM_ERRO, e.getMessage(), null);
        }
    }

    private static DespesaImportacaoLinha ler(String texto, int numero) {
        String[] c = texto.split(";", -1);
        java.util.function.IntFunction<String> col = i -> i < c.length ? limpar(c[i]) : null;
        return new DespesaImportacaoLinha(numero, col.apply(0), col.apply(1), col.apply(2), col.apply(3), col.apply(4), col.apply(5),
                col.apply(6), col.apply(7), col.apply(8), col.apply(9), col.apply(10), col.apply(11), PRONTA, null, null);
    }

    private static String limpar(String valor) {
        String v = valor.replace("﻿", "").trim();
        if (v.length() >= 2 && v.startsWith("\"") && v.endsWith("\"")) v = v.substring(1, v.length() - 1).trim();
        return v.isEmpty() ? null : v;
    }

    private TipoDespesa tipo(String nome) {
        if (!StringUtils.hasText(nome)) throw new InvarianteVioladaException("Informe o tipo da despesa.");
        String chave = chave(nome);
        return tipos.findAll().stream().filter(TipoDespesa::isAtivo)
                .filter(t -> chave(t.getNome()).equals(chave) || (t.getCodigo() != null && chave(t.getCodigo()).equals(chave)))
                .findFirst().orElseThrow(() -> new InvarianteVioladaException("Tipo \"" + nome + "\" não existe. Cadastre nas configurações da frota."));
    }

    private static SubtipoDespesa subtipo(TipoDespesa tipo, String nome) {
        if (!StringUtils.hasText(nome)) return null;
        return tipo.subtiposAtivos().stream().filter(s -> chave(s.getNome()).equals(chave(nome))).findFirst()
                .orElseThrow(() -> new InvarianteVioladaException("Subtipo \"" + nome + "\" não existe em " + tipo.getNome() + "."));
    }

    private static LocalDate data(String texto) {
        if (!StringUtils.hasText(texto)) throw new InvarianteVioladaException("Informe a data.");
        try {
            return texto.contains("/") ? LocalDate.parse(texto, DATA_BR) : LocalDate.parse(texto);
        } catch (DateTimeParseException e) {
            throw new InvarianteVioladaException("Data \"" + texto + "\" inválida. Use dd/mm/aaaa.");
        }
    }

    /** "80,00", "1.234,56" ou "80.00". */
    private static BigDecimal valor(String texto) {
        if (!StringUtils.hasText(texto)) throw new InvarianteVioladaException("Informe o valor.");
        String t = texto.replace("R$", "").replace(" ", "");
        if (t.contains(",")) t = t.replace(".", "").replace(",", ".");
        try {
            return new BigDecimal(t);
        } catch (NumberFormatException e) {
            throw new InvarianteVioladaException("Valor \"" + texto + "\" inválido. Use 80,00.");
        }
    }

    private static TipoDocumentoFiscal documento(String texto) {
        if (!StringUtils.hasText(texto)) return null;
        String c = chave(texto).replace("-", "").replace(" ", "");
        for (var t : TipoDocumentoFiscal.values()) {
            if (t.name().equals(c) || chave(t.getRotulo()).replace("-", "").replace(" ", "").equals(c)) return t;
        }
        if (c.startsWith("CUPOM")) return TipoDocumentoFiscal.CUPOM;
        throw new InvarianteVioladaException("Documento \"" + texto + "\" inválido. Use NF-e, NFS-e, Cupom, Recibo ou Outro.");
    }

    private static FormaPagamentoDespesa forma(String texto) {
        if (!StringUtils.hasText(texto)) return FormaPagamentoDespesa.A_PAGAR;
        String c = chave(texto).replace(" ", "_");
        return switch (c) {
            case "A_PAGAR", "PAGAR", "FINANCEIRO", "PAGAR_PELO_FINANCEIRO" -> FormaPagamentoDespesa.A_PAGAR;
            case "CARTAO", "CARTAO_CORPORATIVO" -> FormaPagamentoDespesa.CARTAO;
            case "REEMBOLSO" -> FormaPagamentoDespesa.REEMBOLSO;
            case "JA_PAGO", "PAGO" -> FormaPagamentoDespesa.JA_PAGO;
            default -> throw new InvarianteVioladaException("Forma de pagamento \"" + texto + "\" inválida. Use A pagar, Cartão, Reembolso ou Já pago.");
        };
    }

    static String normalizarPlaca(String placa) {
        return placa == null ? "" : placa.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
    }

    private static String chave(String texto) {
        return Normalizer.normalize(texto.trim(), Normalizer.Form.NFD).replaceAll("\\p{M}", "").toUpperCase(Locale.ROOT);
    }

    private static ImportacaoDespesasResponse responder(List<DespesaImportacaoLinha> linhas) {
        long falhas = linhas.stream().filter(l -> COM_ERRO.equals(l.status())).count();
        return new ImportacaoDespesasResponse(linhas, linhas.size(), (int) (linhas.size() - falhas), (int) falhas);
    }
}
