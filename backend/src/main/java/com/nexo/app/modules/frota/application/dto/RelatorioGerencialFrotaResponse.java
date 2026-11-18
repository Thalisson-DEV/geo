package com.nexo.app.modules.frota.application.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Relatórios gerenciais da frota num recorte. Cada seção é nula para quem não tem a leitura do
 * assunto; {@code partesOmitidas} diz o que ficou fora do custo total. As definições dos
 * indicadores estão no design da change {@code modulo-gestao-frota-relatorios-gerenciais}.
 */
public record RelatorioGerencialFrotaResponse(
        Periodo periodo,
        Recorte recorte,
        List<String> partesOmitidas,
        Resumo resumo,
        Custos custos,
        Manutencao manutencao,
        Combustivel combustivel,
        Uso uso,
        Conformidade conformidade,
        List<VeiculoLinha> veiculos
) {

    /** Valor no período e no período anterior de mesma duração (nulos quando não se aplicam). */
    public record Indicador(BigDecimal atual, BigDecimal anterior) {
    }

    public record Periodo(LocalDate de, LocalDate ate, LocalDate anteriorDe, LocalDate anteriorAte, int dias,
                          int diasUteis, OffsetDateTime calculadoEm) {
    }

    public record Recorte(int veiculos, int emOperacao, int baixados, int locados) {
    }

    public record Resumo(Indicador custoTotal, Indicador custoPorKm, Indicador custoVeiculoMes, Indicador km,
                         Indicador disponibilidade, Indicador percentualPreventiva, Indicador custoSobreFaturamento,
                         BigDecimal aguardandoFinanceiro) {
    }

    public record Contagem(String chave, String rotulo, long total) {
    }

    // ── Custos ─────────────────────────────────────────────────────────────────────

    public record Custos(List<Categoria> porCategoria, List<MesCusto> mensal, List<Grupo> porBase,
                         List<Grupo> porTipo, List<Grupo> porRegime, List<Grupo> porProcesso,
                         List<Grupo> despesasPorTipo) {
    }

    public record Categoria(String categoria, String rotulo, BigDecimal valor, BigDecimal anterior) {
    }

    public record MesCusto(LocalDate mes, BigDecimal manutencao, BigDecimal combustivel, BigDecimal despesas,
                           BigDecimal seguro, BigDecimal locacao, BigDecimal franquias, BigDecimal total, long km) {
    }

    public record Grupo(String id, String nome, int veiculos, BigDecimal valor, long km, BigDecimal custoPorKm) {
    }

    // ── Manutenção ─────────────────────────────────────────────────────────────────

    public record Manutencao(Indicador osConcluidas, long corretivas, long preventivas, Indicador valor,
                             Indicador percentualPreventiva, Indicador mttrHoras, Indicador mtbfDias,
                             Indicador disponibilidade, Fila fila, List<OsFila> filaMaisAntiga,
                             List<VeiculoParado> paradosAgora, List<Contagem> porOrigem, List<Contagem> porCausa,
                             List<Oficina> porOficina, List<RetrabalhoLinha> retrabalho, long preventivasVencidas,
                             long preventivasProximas, List<MesManutencao> mensal) {
    }

    public record Fila(long total, long ate7Dias, long de8a30Dias, long acima30Dias, long atrasadas, long comVeiculoParado) {
    }

    public record OsFila(UUID idOs, Long numero, UUID idVeiculo, String placa, String situacao, String criticidade,
                         String tipoManutencao, OffsetDateTime abertaEm, long diasAberta, boolean atrasada,
                         boolean veiculoParado) {
    }

    public record VeiculoParado(UUID idVeiculo, String placa, UUID idOs, Long numeroOs, OffsetDateTime desde,
                                long dias, String descricao) {
    }

    public record Oficina(String nome, long os, BigDecimal valor, BigDecimal horasMedias) {
    }

    public record RetrabalhoLinha(UUID idOs, Long numero, UUID idVeiculo, String placa, String item,
                                  Long numeroAnterior, int dias) {
    }

    public record MesManutencao(LocalDate mes, long corretivas, long preventivas, BigDecimal valor) {
    }

    // ── Combustível ────────────────────────────────────────────────────────────────

    public record Combustivel(Indicador litros, Indicador valor, Indicador precoMedio, Indicador kmPorLitro,
                              long abastecimentos, long veiculosForaDoPadrao, List<Produto> porProduto,
                              List<Posto> porPosto, List<Contagem> alertas, List<MesCombustivel> mensal) {
    }

    public record Produto(String nome, String categoria, BigDecimal quantidade, BigDecimal valor) {
    }

    public record Posto(UUID idPosto, String nome, long abastecimentos, BigDecimal litros, BigDecimal valor,
                        BigDecimal precoMedio) {
    }

    public record MesCombustivel(LocalDate mes, BigDecimal litros, BigDecimal valor, BigDecimal precoMedio) {
    }

    // ── Uso ────────────────────────────────────────────────────────────────────────

    public record Uso(Indicador km, long veiculosComKm, List<VeiculoRef> ociosos, long turnos, long notas,
                      Indicador faturado, Indicador custoSobreFaturamento, boolean comTelemetria,
                      BigDecimal horasLigadoParado, BigDecimal kmForaExpediente, List<MesUso> mensal) {
    }

    public record VeiculoRef(UUID idVeiculo, String placa, String base, String tipo, String situacao) {
    }

    public record MesUso(LocalDate mes, long km) {
    }

    // ── Conformidade e risco ───────────────────────────────────────────────────────

    public record Conformidade(Indicador coberturaChecklist, long veiculosChecklistAbaixoMeta, long pendenciasAbertas,
                               long documentosVencidos, long documentosAVencer, List<Documento> documentos,
                               long cnhVencidas, long cnhAVencer, List<Cnh> cnh, List<VeiculoRef> semSeguro,
                               List<Apolice> apolicesVencendo, Sinistros sinistros, Eventos eventosConducao,
                               List<Condutor> condutores, Acidentes acidentes) {
    }

    public record Documento(UUID id, UUID idVeiculo, String placa, String tipo, String descricao, LocalDate vencimento,
                            boolean vencido) {
    }

    public record Cnh(UUID idCondutor, UUID idColaborador, String nome, String categoria, LocalDate validade,
                      boolean vencida) {
    }

    public record Apolice(UUID id, String numero, String seguradora, LocalDate vigenciaFim, int veiculos) {
    }

    public record Sinistros(Indicador total, long comCulpaDoCondutor, BigDecimal franquias, List<Contagem> porTipo,
                            List<Sinistro> lista) {
    }

    public record Sinistro(UUID id, Long numero, UUID idVeiculo, String placa, String tipo, String situacao,
                           Boolean culpaCondutor, BigDecimal franquia, OffsetDateTime ocorridoEm) {
    }

    public record Eventos(Indicador total, Indicador por100Km, List<Contagem> porTipo) {
    }

    public record Condutor(UUID idColaborador, String nome, long eventos, long sinistros, long sinistrosComCulpa) {
    }

    public record Acidentes(long total, long diasPerdidos, List<Contagem> porTipo, List<Acidente> lista) {
    }

    public record Acidente(UUID idEvento, UUID idVeiculo, String placa, String tipo, String rotulo,
                           OffsetDateTime ocorridoEm, int diasPerdidos) {
    }

    // ── Por veículo ────────────────────────────────────────────────────────────────

    public record VeiculoLinha(UUID idVeiculo, String placa, String base, String tipo, String regime, String situacao,
                               String processo, BigDecimal manutencao, BigDecimal combustivel, BigDecimal despesas,
                               BigDecimal seguro, BigDecimal locacao, BigDecimal franquias, BigDecimal total, long km,
                               BigDecimal custoPorKm, BigDecimal litros, BigDecimal kmPorLitro,
                               BigDecimal kmPorLitroReferencia, long osConcluidas, long corretivas, long preventivas,
                               BigDecimal horasParado, BigDecimal disponibilidade, long preventivasVencidas,
                               long turnos, long notas, BigDecimal faturado, BigDecimal custoSobreFaturamento,
                               Long diasComChecklist, BigDecimal coberturaChecklist, Long pendenciasChecklist,
                               Long eventosConducao, Long sinistros, BigDecimal horasLigadoParado,
                               BigDecimal kmForaExpediente, UUID idBase, UUID idTipo, UUID idProcesso,
                               BigDecimal totalAnterior, long kmAnterior) {
    }
}
