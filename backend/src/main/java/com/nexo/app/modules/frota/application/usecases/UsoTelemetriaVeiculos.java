package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.domain.Expediente;
import com.nexo.app.modules.frota.infrastructure.persistence.AnaliseTelemetriaRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.AnaliseTelemetriaRepository.Dia;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Uso de cada veículo pela telemetria num período, a partir do resumo diário: km, tempo andando e
 * com o motor ligado parado, uso fora do expediente e se ele roda pouco. Os limiares são fixos e
 * conservadores: o gestor vê o sinal, não configura régua.
 */
@Component
@RequiredArgsConstructor
class UsoTelemetriaVeiculos {

    /** Janela da lista de veículos. */
    static final int DIAS_RECENTES = 30;
    /** Consumo estimado com o motor ligado e o veículo parado (veículo leve em marcha lenta). */
    static final double LITROS_HORA_OCIOSO = 1.0;
    /** Média por dia útil abaixo da qual o veículo roda pouco. */
    static final int KM_DIA_RODA_POUCO = 20;
    /** Com menos dias úteis medidos que isto, ainda não dá para dizer que o veículo roda pouco. */
    static final int MINIMO_DIAS_MEDIDOS = 5;
    /** Dia com pelo menos isto andando fora do expediente conta como dia de uso fora do expediente. */
    static final int MINUTOS_DIA_FORA = 5;

    private final AnaliseTelemetriaRepository analises;
    private final ParametrosFrotaUseCases parametros;

    /**
     * {@code diasUteisMedidos}: os dias úteis desde que o rastreador passou a medir o veículo (a
     * média por dia usa só eles; o veículo recém-vinculado não roda pouco por falta de dado).
     */
    record Uso(UUID idVeiculo, double km, int minutosAndando, int minutosLigadoParado, double litrosOciosos,
               double kmForaExpediente, int minutosForaExpediente, int diasForaExpediente, int diasComUso,
               int diasUteisMedidos, double kmPorDiaUtil, boolean rodaPouco) {

        boolean usadoForaDoExpediente() {
            return diasForaExpediente > 0;
        }
    }

    /** Uso dos veículos informados (nulo: todos os medidos) de {@code de} a {@code ate}. */
    Map<UUID, Uso> calcular(Collection<UUID> idsVeiculo, LocalDate de, LocalDate ate) {
        if (idsVeiculo != null && idsVeiculo.isEmpty()) return Map.of();
        var dias = (idsVeiculo == null ? analises.listarDias(de, ate) : analises.listarDiasDosVeiculos(idsVeiculo, de, ate))
                .stream().collect(Collectors.groupingBy(Dia::idVeiculo));
        // Sem resumo não há o que medir (nem por que ler os parâmetros).
        if (dias.isEmpty()) return Map.of();
        var expediente = parametros.obter().expediente();
        var primeiroDia = analises.primeiroDiaPorVeiculo();
        var resultado = new HashMap<UUID, Uso>();
        dias.forEach((id, lista) -> resultado.put(id, uso(id, lista, primeiroDia.get(id), de, ate, expediente)));
        return resultado;
    }

    /** Uso dos últimos 30 dias, até hoje. */
    Map<UUID, Uso> recentes(Collection<UUID> idsVeiculo) {
        LocalDate hoje = LocalDate.now(Expediente.FUSO);
        return calcular(idsVeiculo, hoje.minusDays(DIAS_RECENTES - 1L), hoje);
    }

    /** Veículos que, nos últimos 30 dias, rodaram fora do expediente e/ou rodam pouco. */
    Set<UUID> comSinal(boolean foraExpediente, boolean rodaPouco) {
        return recentes(null).values().stream()
                .filter(u -> (!foraExpediente || u.usadoForaDoExpediente()) && (!rodaPouco || u.rodaPouco()))
                .map(Uso::idVeiculo).collect(Collectors.toSet());
    }

    static Uso uso(UUID id, List<Dia> dias, LocalDate primeiroDia, LocalDate de, LocalDate ate, Expediente expediente) {
        double km = dias.stream().mapToDouble(Dia::km).sum();
        int andando = dias.stream().mapToInt(Dia::minutosMovimento).sum();
        int ligado = dias.stream().mapToInt(Dia::minutosLigadoParado).sum();
        double kmFora = dias.stream().mapToDouble(Dia::kmForaExpediente).sum();
        int minutosFora = dias.stream().mapToInt(Dia::minutosForaExpediente).sum();
        int diasFora = (int) dias.stream().filter(d -> d.minutosForaExpediente() >= MINUTOS_DIA_FORA).count();
        int diasComUso = (int) dias.stream().filter(d -> d.minutosMovimento() > 0).count();
        LocalDate inicio = primeiroDia != null && primeiroDia.isAfter(de) ? primeiroDia : de;
        int medidos = diasUteis(inicio, ate, expediente);
        double kmDia = medidos == 0 ? 0 : km / medidos;
        return new Uso(id, arredondar(km), andando, ligado, arredondar(ligado / 60.0 * LITROS_HORA_OCIOSO), arredondar(kmFora),
                minutosFora, diasFora, diasComUso, medidos, arredondar(kmDia),
                medidos >= MINIMO_DIAS_MEDIDOS && kmDia < KM_DIA_RODA_POUCO);
    }

    /** Dias de expediente de {@code de} até {@code ate}, sem passar de hoje. */
    static int diasUteis(LocalDate de, LocalDate ate, Expediente expediente) {
        LocalDate hoje = LocalDate.now(Expediente.FUSO);
        LocalDate fim = ate.isAfter(hoje) ? hoje : ate;
        int total = 0;
        for (LocalDate d = de; !d.isAfter(fim); d = d.plusDays(1)) {
            DayOfWeek dia = d.getDayOfWeek();
            if (dia == DayOfWeek.SUNDAY || (dia == DayOfWeek.SATURDAY && !expediente.sabado())) continue;
            total++;
        }
        return total;
    }

    static double arredondar(double valor) {
        return Math.round(valor * 10) / 10.0;
    }
}
