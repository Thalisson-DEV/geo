package com.nexo.app.modules.obras.application.dto;

import com.nexo.app.modules.obras.domain.EvidenciaPonto;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

/** Revisão das fotos de campo antes da medição: fila de revisão, decisão e ranking de qualidade por equipe. */
public final class RevisaoFotosDtos {

    private RevisaoFotosDtos() {
    }

    /** Filtro da fila de revisão (p-table lazy). Sem status, traz as pendentes. */
    public record RevisaoFotoFilter(EvidenciaPonto.Revisao status, UUID idObra, UUID idEquipe, String numeroObra, LocalDate de, LocalDate ate) {
    }

    public record FotoParaRevisao(UUID id, UUID idObra, String numeroObra, UUID idPonto, String numeroPonto, String tituloItem,
                                  EvidenciaPonto.Etapa etapa, String legenda, OffsetDateTime dataFoto, BigDecimal latitude,
                                  BigDecimal longitude, UUID idEquipe, String equipe, boolean doApp, EvidenciaPonto.Revisao status,
                                  EvidenciaPonto.Inconformidade inconformidade, String rotuloInconformidade, String motivo,
                                  String revisadaPor, OffsetDateTime revisadaEm) {
    }

    /** Aprovar, ou reprovar com a inconformidade (e o motivo, obrigatório em "Outra"). */
    public record Decisao(@NotNull(message = "Informe se aprova") Boolean aprovar,
                          EvidenciaPonto.Inconformidade inconformidade,
                          @Size(max = 500) String motivo) {
    }

    /** Qualidade das fotos por equipe no período. */
    public record LinhaRanking(UUID idEquipe, String equipe, long total, long aprovadas, long reprovadas, long pendentes,
                               BigDecimal percentualAprovacao, String principalInconformidade) {
    }

    public record OpcaoInconformidade(EvidenciaPonto.Inconformidade valor, String rotulo) {
    }
}
