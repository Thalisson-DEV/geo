package com.nexo.app.modules.frota;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

/**
 * Porta pública do histórico de condução. Multas, infrações de telemetria e avarias
 * usam para saber quem respondia pelo veículo num instante.
 */
public interface FrotaCondutorApi {

    /** Colaborador vinculado ao veículo no instante informado, se houver. */
    Optional<UUID> condutorEm(UUID idVeiculo, OffsetDateTime instante);

    enum SituacaoCnh { APTO, SEM_CNH, VENCIDA, CATEGORIA_INSUFICIENTE }

    /**
     * @param validade          validade da CNH registrada (nula sem CNH)
     * @param categoriaExigida  mínima do tipo de veículo (nula se o tipo não exige)
     * @param categoriaAtual    registrada (nula sem CNH)
     * @param mensagem          texto pronto para o usuário
     */
    record SituacaoParaConduzir(SituacaoCnh situacao, LocalDate validade, String categoriaExigida,
                                String categoriaAtual, String mensagem) {
        public boolean apto() {
            return situacao == SituacaoCnh.APTO;
        }
    }

    /** Se o colaborador pode conduzir o veículo na data, pela CNH registrada (sem considerar liberações). */
    SituacaoParaConduzir situacaoParaConduzir(UUID idColaborador, UUID idVeiculo, LocalDate data);
}
