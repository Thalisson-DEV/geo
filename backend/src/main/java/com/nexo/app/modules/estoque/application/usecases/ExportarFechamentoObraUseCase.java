package com.nexo.app.modules.estoque.application.usecases;

import com.nexo.app.modules.estoque.application.dto.FechamentoObraFilter;
import com.nexo.app.modules.estoque.application.dto.FechamentoObraResponses;
import com.nexo.app.modules.estoque.domain.ItemSolicitacao;
import com.nexo.app.modules.estoque.domain.Material;
import com.nexo.app.modules.estoque.domain.SituacaoFechamentoObra;
import com.nexo.app.modules.estoque.domain.SituacaoFechamentoSolicitacao;
import com.nexo.app.modules.estoque.domain.SituacaoPrazoFechamento;
import com.nexo.app.modules.estoque.domain.SolicitacaoMaterial;
import com.nexo.app.shared.domain.HorasUteis;
import lombok.RequiredArgsConstructor;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVPrinter;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.io.StringWriter;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

/** Exporta o recorte da lista de fechamento: uma linha por solicitação ou uma linha por material. */
@Service
@RequiredArgsConstructor
public class ExportarFechamentoObraUseCase {

    private static final DateTimeFormatter DATA_HORA = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");
    private static final DateTimeFormatter DATA = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    private static final List<String> CABECALHO_BASE = List.of(
            "ID Solicitação", "Tipo", "Situação", "Encerramento da Obra", "Número Obra", "Título Obra",
            "Almoxarifado", "Número Reserva", "Data Reserva", "Solicitante", "Encarregado", "Supervisor",
            "Coordenador", "Data Solicitação", "Prazo Vigente", "Situação do Prazo", "Com Pendência",
            "Movimentação Concluída Em", "Observação");
    private static final List<String> CABECALHO_RESUMO = Stream.concat(CABECALHO_BASE.stream(), Stream.of(
            "Qtd Itens", "Qtd Total Solicitada", "Qtd Total Movimentada", "Qtd Total Pendente")).toList();
    private static final List<String> CABECALHO_DETALHADO = Stream.concat(CABECALHO_BASE.stream(), Stream.of(
            "Código Material", "Descrição Material", "Unidade", "Qtd Solicitada", "Qtd Movimentada",
            "Qtd Pendente", "Pendência do Material")).toList();

    private static final Map<SituacaoFechamentoSolicitacao, String> SITUACOES = Map.of(
            SituacaoFechamentoSolicitacao.AGUARDANDO_RESERVA, "Aguardando reserva",
            SituacaoFechamentoSolicitacao.AGUARDANDO_MOVIMENTACAO, "Aguardando movimentação",
            SituacaoFechamentoSolicitacao.MOVIMENTADA_PARCIALMENTE, "Movimentada em parte",
            SituacaoFechamentoSolicitacao.MOVIMENTADA, "Movimentada",
            SituacaoFechamentoSolicitacao.CANCELADA, "Cancelada");
    private static final Map<SituacaoFechamentoObra, String> SITUACOES_OBRA = Map.of(
            SituacaoFechamentoObra.SEM_SOLICITACOES, "Sem solicitações",
            SituacaoFechamentoObra.PENDENTE, "Pendente",
            SituacaoFechamentoObra.PARCIAL, "Parcial",
            SituacaoFechamentoObra.FINALIZADO, "Finalizado");
    private static final Map<SituacaoPrazoFechamento, String> PRAZOS = Map.of(
            SituacaoPrazoFechamento.NO_PRAZO, "No prazo",
            SituacaoPrazoFechamento.VENCE_EM_BREVE, "Vence em breve",
            SituacaoPrazoFechamento.ATRASADO, "Atrasado",
            SituacaoPrazoFechamento.CUMPRIDO, "Cumprido",
            SituacaoPrazoFechamento.CUMPRIDO_COM_ATRASO, "Cumprido com atraso");

    private final FechamentoObraUseCases fechamento;

    @Transactional(readOnly = true)
    public byte[] resumo(FechamentoObraFilter filtro) {
        return gerar(CABECALHO_RESUMO, filtro, (printer, solicitacao, resumo) -> {
            List<Object> linha = base(solicitacao, resumo);
            linha.add(resumo.totalItens());
            linha.add(numero(resumo.quantidadeSolicitada()));
            linha.add(numero(resumo.quantidadeMovimentada()));
            linha.add(numero(pendente(solicitacao.getItens())));
            printer.printRecord(linha);
        });
    }

    @Transactional(readOnly = true)
    public byte[] detalhado(FechamentoObraFilter filtro) {
        return gerar(CABECALHO_DETALHADO, filtro, (printer, solicitacao, resumo) -> {
            for (ItemSolicitacao item : solicitacao.getItens()) {
                Material material = item.getMaterial();
                List<Object> linha = base(solicitacao, resumo);
                linha.add(texto(material.getCodigo()));
                linha.add(texto(material.getDescricao()));
                linha.add(texto(material.getUnidadeMedida()));
                linha.add(numero(item.getQuantidade()));
                linha.add(numero(item.getQuantidadeOperadaLiquida()));
                linha.add(numero(item.getQuantidadePendente().max(BigDecimal.ZERO)));
                linha.add(item.getMotivoPendencia() == null ? "" : texto(item.getMotivoPendencia().getNome()));
                printer.printRecord(linha);
            }
        });
    }

    private byte[] gerar(List<String> cabecalho, FechamentoObraFilter filtro, Escritor escritor) {
        StringWriter saida = new StringWriter();
        saida.write('﻿');
        CSVFormat formato = CSVFormat.DEFAULT.builder()
                .setDelimiter(';')
                .setHeader(cabecalho.toArray(String[]::new))
                .build();
        try (CSVPrinter printer = new CSVPrinter(saida, formato)) {
            fechamento.percorrerRecorte(filtro, (solicitacao, resumo) -> {
                try {
                    escritor.escrever(printer, solicitacao, resumo);
                } catch (IOException ex) {
                    throw new UncheckedIOException(ex);
                }
            });
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        }
        return saida.toString().getBytes(StandardCharsets.UTF_8);
    }

    private static List<Object> base(SolicitacaoMaterial solicitacao, FechamentoObraResponses.Resumo resumo) {
        var reserva = solicitacao.getReserva();
        List<Object> linha = new ArrayList<>();
        linha.add(resumo.id());
        linha.add(resumo.tipo());
        linha.add(SITUACOES.getOrDefault(resumo.situacao(), ""));
        linha.add(SITUACOES_OBRA.getOrDefault(resumo.situacaoObra(), ""));
        linha.add(resumo.obra() == null ? "" : texto(resumo.obra().numero()));
        linha.add(resumo.obra() == null ? "" : texto(resumo.obra().titulo()));
        linha.add(resumo.almoxarifadoAtendimento() == null ? "" : texto(resumo.almoxarifadoAtendimento().nome()));
        linha.add(texto(resumo.numeroReserva()));
        linha.add(reserva == null || reserva.getDataCriacao() == null ? "" : reserva.getDataCriacao().format(DATA));
        linha.add(pessoa(resumo.solicitante()));
        linha.add(pessoa(resumo.encarregado()));
        linha.add(pessoa(resumo.supervisor()));
        linha.add(pessoa(resumo.coordenador()));
        linha.add(dataHora(resumo.criadaEm()));
        linha.add(dataHora(resumo.prazoVigente().limite()));
        linha.add(resumo.prazoVigente().situacao() == null ? "" : PRAZOS.get(resumo.prazoVigente().situacao()));
        linha.add(resumo.possuiPendencia() ? "Sim" : "Não");
        linha.add(dataHora(resumo.movimentacaoConcluidaEm()));
        linha.add(texto(solicitacao.getObservacao()));
        return linha;
    }

    private static BigDecimal pendente(Collection<ItemSolicitacao> itens) {
        return itens.stream().map(item -> item.getQuantidadePendente().max(BigDecimal.ZERO))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private static String pessoa(FechamentoObraResponses.Pessoa pessoa) {
        return pessoa == null ? "" : texto(pessoa.nome());
    }

    private static String dataHora(OffsetDateTime instante) {
        return instante == null ? "" : instante.atZoneSameInstant(HorasUteis.FUSO).format(DATA_HORA);
    }

    private static String numero(BigDecimal valor) {
        return valor == null ? "0" : valor.stripTrailingZeros().toPlainString();
    }

    /** Texto livre não pode virar fórmula ao abrir no Excel. */
    private static String texto(String valor) {
        if (valor == null) {
            return "";
        }
        String limpo = valor.trim();
        return !limpo.isEmpty() && "=+-@".indexOf(limpo.charAt(0)) >= 0 ? "'" + limpo : limpo;
    }

    @FunctionalInterface
    private interface Escritor {
        void escrever(CSVPrinter printer, SolicitacaoMaterial solicitacao, FechamentoObraResponses.Resumo resumo)
                throws IOException;
    }
}
