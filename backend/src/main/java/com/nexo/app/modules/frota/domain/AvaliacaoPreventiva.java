package com.nexo.app.modules.frota.domain;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;

/**
 * Situação de um controle preventivo agora: próxima medição e data, quanto falta em cada
 * uma (negativo quando passou), a etapa e a previsão de data pela média de uso.
 *
 * <p>Calculada na leitura, a partir da medição acumulada atual: qualquer leitura nova, de
 * qualquer origem, já muda a situação. Vence pelo que chegar primeiro, uso ou tempo.</p>
 *
 * @param proximaMedicao nula quando o plano não mede pela unidade do veículo ou a base ainda não tem medição
 * @param faltaMedicao   nula nas mesmas condições, ou quando o veículo ainda não tem leitura
 * @param proximaData    nula quando o plano não tem frequência em dias
 * @param previsao       a data mais provável: a menor entre a próxima data e a estimativa pelo uso
 */
public record AvaliacaoPreventiva(
        SituacaoPreventiva situacao,
        UnidadeMedicao unidade,
        Long proximaMedicao,
        Long faltaMedicao,
        LocalDate proximaData,
        Long faltaDias,
        LocalDate previsao,
        String falta
) {

    /**
     * @param medicaoAtual acumulada na unidade atual do veículo; nula sem leitura
     * @param usoDiario    média de uso por dia (km ou h); nula sem histórico suficiente
     */
    public static AvaliacaoPreventiva avaliar(ControlePreventivo controle, Long medicaoAtual,
                                              UnidadeMedicao unidadeAtual, LocalDate hoje, Double usoDiario) {
        PlanoPreventivo plano = controle.getPlano();
        boolean mesmaUnidade = controle.getBaseUnidade() == unidadeAtual;
        Long intervalo = plano.intervalo(unidadeAtual);

        Long proximaMedicao = intervalo != null && mesmaUnidade && controle.getBaseMedicao() != null
                ? controle.getBaseMedicao() + intervalo : null;
        Long faltaMedicao = proximaMedicao != null && medicaoAtual != null ? proximaMedicao - medicaoAtual : null;
        LocalDate proximaData = plano.getIntervaloDias() == null ? null : controle.getBaseData().plusDays(plano.getIntervaloDias());
        Long faltaDias = proximaData == null ? null : ChronoUnit.DAYS.between(hoje, proximaData);

        boolean vencidaUso = faltaMedicao != null && faltaMedicao <= 0;
        boolean vencidaTempo = faltaDias != null && faltaDias <= 0;
        boolean proximaUso = faltaMedicao != null && faltaMedicao <= plano.antecedencia(unidadeAtual);
        boolean proximaTempo = faltaDias != null && faltaDias <= plano.antecedenciaEmDias();
        SituacaoPreventiva situacao = vencidaUso || vencidaTempo ? SituacaoPreventiva.VENCIDA
                : proximaUso || proximaTempo ? SituacaoPreventiva.PROXIMA
                : SituacaoPreventiva.EM_DIA;

        LocalDate previsao = proximaData;
        if (faltaMedicao != null && usoDiario != null && usoDiario > 0) {
            LocalDate pelaMedia = faltaMedicao <= 0 ? hoje : hoje.plusDays((long) Math.ceil(faltaMedicao / usoDiario));
            previsao = previsao == null || pelaMedia.isBefore(previsao) ? pelaMedia : previsao;
        }
        if (previsao != null && previsao.isBefore(hoje) && situacao != SituacaoPreventiva.VENCIDA) {
            previsao = hoje;
        }

        String falta = descrever(situacao, unidadeAtual, faltaMedicao, faltaDias, vencidaUso, vencidaTempo,
                proximaUso, proximaTempo);
        return new AvaliacaoPreventiva(situacao, unidadeAtual, proximaMedicao, faltaMedicao, proximaData, faltaDias,
                previsao, falta);
    }

    /**
     * Texto curto do que importa: na vencida e na próxima, a medida que causou a etapa; em
     * dia, as duas. Ex.: "passou 120 km", "faltam 10 dias", "faltam 3.200 km ou 95 dias".
     */
    private static String descrever(SituacaoPreventiva situacao, UnidadeMedicao unidade, Long faltaMedicao,
                                    Long faltaDias, boolean vencidaUso, boolean vencidaTempo,
                                    boolean proximaUso, boolean proximaTempo) {
        var partes = new ArrayList<String>();
        if (situacao == SituacaoPreventiva.VENCIDA) {
            if (vencidaUso) partes.add(faltaMedicao == 0 ? "chegou no limite" : "passou " + Medidas.formatar(-faltaMedicao, unidade));
            if (vencidaTempo) partes.add(faltaDias == 0 ? "vence hoje" : "passou " + dias(-faltaDias));
            return String.join(" e ", partes);
        }
        boolean todas = situacao == SituacaoPreventiva.EM_DIA;
        if (faltaMedicao != null && (todas || proximaUso)) partes.add(Medidas.formatar(faltaMedicao, unidade));
        if (faltaDias != null && (todas || proximaTempo)) partes.add(dias(faltaDias));
        if (partes.isEmpty()) return "aguardando a primeira leitura";
        String verbo = partes.size() == 1 && partes.get(0).startsWith("1 ") ? "falta " : "faltam ";
        return verbo + String.join(" ou ", partes);
    }

    private static String dias(long dias) {
        return dias + (dias == 1 ? " dia" : " dias");
    }
}
