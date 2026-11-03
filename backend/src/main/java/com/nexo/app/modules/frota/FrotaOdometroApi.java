package com.nexo.app.modules.frota;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

/**
 * Porta pública do livro-razão do odômetro.
 *
 * <p>Checklist, abastecimento, manutenção e telemetria registram KM ou horas por aqui, sempre
 * na unidade do veículo. A chamada
 * é idempotente por {@code (origem, idOrigem)}: reenviar o mesmo registro devolve a
 * leitura já gravada. Nas origens de campo (checklist e abastecimento), o valor menor que a
 * última leitura válida ou acima da trava de salto é recusado com o intervalo aceito; nas
 * demais, a leitura incoerente é aceita e marcada, e quem decide é o gestor.</p>
 */
public interface FrotaOdometroApi {

    enum OrigemLeitura { CHECKLIST, ABASTECIMENTO, MANUTENCAO, TELEMETRIA, IMPORTACAO }

    /** Unidade da medição do veículo: odômetro em km ou horímetro em horas. */
    enum Unidade { KM, HORAS }

    /**
     * @param kmAtual   valor atual do painel em uso (km ou horas, conforme a unidade); o nome fica
     *                  por compatibilidade
     * @param acumulado valor atual somado ao que os painéis anteriores rodaram (trocas de painel)
     */
    record ResultadoLeitura(UUID idLeitura, boolean valida, String motivoInconsistencia, Long kmAtual,
                            Unidade unidade, Long acumulado) {
        public ResultadoLeitura(UUID idLeitura, boolean valida, String motivoInconsistencia, Long kmAtual) {
            this(idLeitura, valida, motivoInconsistencia, kmAtual, Unidade.KM, kmAtual);
        }
    }

    /**
     * Medição atual do veículo. Preventiva e custo por km/hora usam o {@code acumulado}; o
     * {@code valor} é o que o painel mostra hoje.
     */
    record Medicao(long valor, Unidade unidade, long acumulado) {
    }

    ResultadoLeitura registrarLeitura(UUID idVeiculo, long km, OffsetDateTime lidoEm,
                                      OrigemLeitura origem, UUID idOrigem, UUID idUsuario);

    /** Maior valor entre as leituras válidas do painel em uso (km ou horas). */
    Optional<Long> kmAtual(UUID idVeiculo);

    /** Valor do painel em uso, unidade e acumulado; vazio se o veículo não tem leitura válida. */
    Optional<Medicao> medicaoAtual(UUID idVeiculo);
}
