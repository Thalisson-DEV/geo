package com.nexo.app.modules.frota.domain;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * Histórico de uma pergunta do checklist num veículo, para a análise rápida do gestor: desde
 * quando o item vem sendo marcado com problema, em quantos checklists seguidos, quantas vezes
 * nos últimos 30 dias e quando esteve OK pela última vez.
 *
 * @param problemaDesde      primeiro checklist da sequência atual de problemas (nulo se a última resposta foi OK)
 * @param checklistsSeguidos checklists seguidos com problema até o atual
 * @param vezes30Dias        respostas com problema nos 30 dias até o atual
 * @param ultimoOkEm         última resposta sem problema antes da sequência (nulo se nunca esteve OK)
 */
public record HistoricoItemChecklist(OffsetDateTime problemaDesde, int checklistsSeguidos, int vezes30Dias,
                                     OffsetDateTime ultimoOkEm) {

    private static final Duration JANELA = Duration.ofDays(30);

    /** Uma resposta anterior (ou a atual) da mesma pergunta no mesmo veículo. */
    public record Ocorrencia(OffsetDateTime preenchidoEm, boolean problema) {
    }

    /**
     * @param ocorrencias do mais recente para o mais antigo, começando pela resposta analisada
     */
    public static HistoricoItemChecklist calcular(List<Ocorrencia> ocorrencias) {
        if (ocorrencias.isEmpty()) {
            return new HistoricoItemChecklist(null, 0, 0, null);
        }
        var atual = ocorrencias.getFirst().preenchidoEm();
        var inicioJanela = atual.minus(JANELA);
        int vezes = (int) ocorrencias.stream()
                .filter(o -> o.problema() && !o.preenchidoEm().isBefore(inicioJanela))
                .count();

        OffsetDateTime desde = null;
        int seguidos = 0;
        OffsetDateTime ultimoOk = null;
        for (var o : ocorrencias) {
            if (!o.problema()) {
                ultimoOk = o.preenchidoEm();
                break;
            }
            desde = o.preenchidoEm();
            seguidos++;
        }
        return new HistoricoItemChecklist(desde, seguidos, vezes, ultimoOk);
    }

    /** Dias inteiros desde o início da sequência até o instante informado. */
    public long diasComProblema(OffsetDateTime ate) {
        return problemaDesde == null ? 0 : Duration.between(problemaDesde, ate).toDays();
    }
}
