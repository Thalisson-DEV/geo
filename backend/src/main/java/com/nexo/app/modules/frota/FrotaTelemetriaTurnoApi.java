package com.nexo.app.modules.frota;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * O turno visto pela telemetria do veículo confirmado na abertura: quanto rodou, quando saiu da
 * base, onde parou e se as notas foram lançadas perto do veículo. A execução mostra isso nas
 * telas dela (lista e relatório do turno), sem o usuário ir à frota.
 *
 * <p>Turno sem veículo ou sem posição no período não aparece: não há o que mostrar.</p>
 */
public interface FrotaTelemetriaTurnoApi {

    /**
     * {@code minutosAteSairDaBase}: da abertura até o veículo deixar o raio da base (nulo sem base
     * com coordenadas). {@code producaoPorKm}: notas concluídas sobre o km do turno.
     */
    record ResumoTurno(
            UUID idTurno,
            double km,
            OffsetDateTime saidaBaseEm,
            Integer minutosAteSairDaBase,
            OffsetDateTime chegadaBaseEm,
            int minutosAndando,
            int minutosParadoEmServico,
            int minutosParadoSemServico,
            int minutosParadoNaBase,
            int notasForaDoLocal,
            BigDecimal producaoPorKm
    ) {
    }

    record PontoTrajeto(OffsetDateTime em, double latitude, double longitude) {
    }

    /** {@code tipo}: BASE, SERVICO ou SEM_SERVICO. */
    record Parada(OffsetDateTime de, OffsetDateTime ate, int minutos, double latitude, double longitude, String tipo,
                  String tipoRotulo) {
    }

    /**
     * Nota comparada com a posição do veículo no instante do lançamento. {@code situacao}: NO_LOCAL,
     * FORA_DO_LOCAL, SEM_POSICAO_VEICULO ou SEM_COORDENADA_NOTA.
     */
    record NotaNoTrajeto(UUID idExecucao, String situacao, String situacaoRotulo, Integer distanciaMetros,
                         Double latitudeVeiculo, Double longitudeVeiculo) {
    }

    record BaseNoMapa(String nome, double latitude, double longitude, int raioMetros) {
    }

    record TrajetoTurno(ResumoTurno resumo, BaseNoMapa base, List<PontoTrajeto> trajeto, List<Parada> paradas,
                        List<NotaNoTrajeto> notas, int raioNotaMetros) {
    }

    /** Resumo dos turnos informados que têm trajeto; o aberto é calculado na hora. */
    Map<UUID, ResumoTurno> resumir(Collection<UUID> idsTurnos);

    /** Trajeto do turno, calculado na hora (o aberto aparece ao vivo); vazio sem veículo ou sem posição. */
    Optional<TrajetoTurno> trajeto(UUID idTurno);
}
