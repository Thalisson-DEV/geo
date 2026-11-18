package com.nexo.app.modules.dashboard.application.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.util.List;
import java.util.UUID;

/**
 * Painel da meta física: a meta de cada base por tipo de serviço no mês e as notas
 * concluídas dia a dia, por base, tipo e equipe. O painel cruza esses números no
 * navegador (ritmo, projeção, distribuição pelos dias úteis).
 *
 * <p>Cada nota conta uma vez para a meta, pelo tipo de serviço da nota.</p>
 */
@Schema(description = "Meta física da Concessionária: metas do mês e notas concluídas por dia, base, tipo e equipe")
public record DashboardMetaFisicaResponse(
        @Schema(type = "string", example = "2026-11")
        YearMonth competencia,
        LocalDate inicio,
        LocalDate fim,
        @Schema(description = "Hoje no fuso de São Paulo")
        LocalDate hoje,
        OffsetDateTime geradoEm,
        int diasUteis,
        @Schema(description = "Dias úteis do mês até ontem")
        int diasUteisEncerrados,
        @Schema(description = "Dias úteis de hoje até o fim do mês")
        int diasUteisRestantes,
        List<Dia> calendario,
        List<Base> bases,
        List<TipoServico> tipos,
        List<Meta> metas,
        List<Equipe> equipes,
        List<Producao> producao,
        List<Historico> historico
) {

    public record Dia(LocalDate data, boolean util) {
    }

    public record Base(UUID id, String nome) {
    }

    public record TipoServico(UUID id, String codigo, String descricao) {
    }

    /** Meta do mês de uma base num tipo de serviço. */
    public record Meta(UUID idMeta, UUID idBaseOperacional, UUID idTipoServico, int quantidade) {
    }

    public record Equipe(UUID id, String codigo, UUID idBaseOperacional) {
    }

    /** Notas concluídas num dia por uma equipe, num tipo de serviço. */
    public record Producao(LocalDate data, UUID idBaseOperacional, UUID idTipoServico, UUID idEquipe, int notas) {
    }

    /** Meta e realizado de um mês anterior (ou do próprio mês) por base e tipo; meta nula quando não havia. */
    public record Historico(@Schema(type = "string") YearMonth competencia, UUID idBaseOperacional,
                            UUID idTipoServico, Integer meta, int realizado) {
    }
}
