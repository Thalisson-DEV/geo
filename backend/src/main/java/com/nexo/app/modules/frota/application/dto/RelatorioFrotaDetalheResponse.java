package com.nexo.app.modules.frota.application.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Registros de origem dos dashboards da frota, no mesmo recorte do relatório gerencial. Cada
 * dashboard pede os seus (custos, manutenção, combustível, uso, conformidade) e cruza com os
 * indicadores para o drill-down: todo número da tela abre as linhas que o compõem.
 */
public final class RelatorioFrotaDetalheResponse {

    private RelatorioFrotaDetalheResponse() {
    }

    // ── Custos ─────────────────────────────────────────────────────────────────────

    /** Lançamentos do período, do maior para o menor. Seguro e locação são rateios e não entram aqui. */
    public record Custos(List<Lancamento> lancamentos) {
    }

    public record Lancamento(String categoria, UUID id, Long numero, OffsetDateTime data, UUID idVeiculo, String placa,
                             String descricao, String contraparte, BigDecimal valor) {
    }

    // ── Manutenção ─────────────────────────────────────────────────────────────────

    public record Manutencao(List<Os> concluidas, List<Os> concluidasAnterior, List<OsAberta> abertas, List<ItemOs> itens,
                             List<PecaOs> pecas, List<ServicoOs> servicos) {
    }

    /**
     * OS concluída. {@code horasReparo}: do veículo parado à liberação (ou do início ao fim real);
     * {@code diasAteInicio}: da abertura ao início do serviço; {@code baixaPendente}: concluída sem a baixa.
     */
    public record Os(UUID id, Long numero, UUID idVeiculo, String placa, String tipoManutencao, String origem, String causa,
                     String criticidade, String tipoOficina, String oficina, BigDecimal valor, BigDecimal valorPecas,
                     BigDecimal valorServicos, OffsetDateTime abertaEm, OffsetDateTime inicioReal, OffsetDateTime fimReal,
                     boolean veiculoParado, BigDecimal horasReparo, BigDecimal diasAteInicio, boolean baixaPendente,
                     String descricao) {
    }

    public record OsAberta(UUID id, Long numero, UUID idVeiculo, String placa, String situacao, String tipoManutencao,
                           String origem, String criticidade, String tipoOficina, String oficina, OffsetDateTime abertaEm,
                           OffsetDateTime agendadaPara, OffsetDateTime previsaoTermino, boolean veiculoParado,
                           OffsetDateTime paradoDesde, long diasAberta, boolean atrasada, String descricao) {
    }

    public record ItemOs(UUID idOs, String item, String tipo, boolean retrabalho) {
    }

    public record PecaOs(UUID idOs, String descricao, String origem, BigDecimal quantidade, String unidade, BigDecimal valor) {
    }

    public record ServicoOs(UUID idOs, String descricao, String mecanico, BigDecimal valor) {
    }

    // ── Combustível ────────────────────────────────────────────────────────────────

    public record Combustivel(List<Abastecimento> atual, List<Abastecimento> anterior) {
    }

    /**
     * Abastecimento realizado. {@code litros} e {@code valorCombustivel} só de combustível (sem ARLA e
     * óleo); {@code kmDesdeAnterior} pela medição do abastecimento anterior do veículo.
     */
    public record Abastecimento(UUID id, OffsetDateTime realizadoEm, UUID idVeiculo, String placa, UUID idPosto, String posto,
                                UUID idCondutor, String condutor, String origem, BigDecimal litros, BigDecimal valorCombustivel,
                                BigDecimal valorTotal, BigDecimal precoLitro, String produtos, BigDecimal medicao,
                                BigDecimal kmDesdeAnterior, BigDecimal kmPorLitro, BigDecimal horasAprovacao,
                                List<String> alertas) {
    }

    // ── Uso ────────────────────────────────────────────────────────────────────────

    public record Uso(List<KmMes> kmMensal, List<ProducaoMes> producaoMensal) {
    }

    public record KmMes(UUID idVeiculo, LocalDate mes, long km) {
    }

    public record ProducaoMes(UUID idVeiculo, LocalDate mes, long turnos, long notas, BigDecimal faturado) {
    }

    // ── Conformidade ───────────────────────────────────────────────────────────────

    /** {@code dias}: dias até o vencimento (negativo = vencido há tantos dias). */
    public record Conformidade(List<Documento> documentos, List<Cnh> cnh, List<Pendencia> pendencias) {
    }

    public record Documento(UUID id, UUID idVeiculo, String placa, String tipo, String descricao, LocalDate vencimento,
                            long dias, boolean comArquivo) {
    }

    public record Cnh(UUID idCondutor, UUID idColaborador, String nome, String categoria, LocalDate validade, Long dias,
                      List<String> placas) {
    }

    public record Pendencia(UUID id, UUID idChecklist, UUID idVeiculo, String placa, String item, String grupo,
                            OffsetDateTime abertaEm, long dias, String comentario, UUID idOrdemServico) {
    }
}
