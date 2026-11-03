package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.ProvedorTelemetria;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** Uso do veículo pela telemetria (ficha do veículo) e saúde dos rastreadores (cadastro). */
public final class UsoFrotaDtos {

    private UsoFrotaDtos() {
    }

    // ── Uso do veículo ─────────────────────────────────────────────────────────

    /**
     * Uso do veículo nos últimos {@code dias}. {@code rastreado}: tem rastreador; {@code medido}:
     * há posição no período. {@code saidasRecortadas}: o período passa de 31 dias e as saídas
     * fora do expediente mostram só os últimos 31.
     */
    public record UsoVeiculoResponse(int dias, LocalDate de, LocalDate ate, String expediente, boolean rastreado, boolean medido,
                                     double km, double kmPorDiaUtil, int diasComUso, int diasUteisMedidos, boolean rodaPouco,
                                     int kmDiaRodaPouco, int minutosAndando, int minutosLigadoParado, double litrosOciosos,
                                     double kmForaExpediente, int diasForaExpediente, List<SaidaForaExpediente> saidas,
                                     boolean saidasRecortadas, CustoVeiculo custo) {
    }

    /** Uma saída fora do expediente: movimento contínuo, com o trajeto ({latitude, longitude}). */
    public record SaidaForaExpediente(OffsetDateTime inicio, OffsetDateTime fim, double km, int minutos, String diaSemana,
                                      List<double[]> trajeto) {
    }

    /**
     * Custos do veículo desde {@code desde} (o primeiro dia com rastreador no período) e o custo por
     * km rodado. {@code custoOcioso}: os litros estimados com o motor ligado parado, ao preço pago.
     */
    public record CustoVeiculo(LocalDate desde, BigDecimal combustivel, BigDecimal litros, BigDecimal manutencao,
                               BigDecimal despesas, BigDecimal locacao, BigDecimal total, BigDecimal porKm,
                               BigDecimal kmPorLitro, BigDecimal custoOcioso) {
    }

    // ── Saúde dos rastreadores ──────────────────────────────────────────────────

    public record SaudeResponse(List<Duplicado> duplicados, List<RastreadorProblema> problemas, OffsetDateTime geradoEm) {
    }

    /** Mesma placa em mais de um rastreador: dois equipamentos pagos no mesmo veículo. */
    public record Duplicado(String placa, UUID idVeiculo, String modelo, String base, List<RastreadorDuplicado> rastreadores) {
    }

    /** {@code manter}: o que comunica melhor (mais recente e com odômetro); os demais são candidatos a cancelar. */
    public record RastreadorDuplicado(UUID idRastreador, ProvedorTelemetria provedor, String provedorRotulo,
                                      OffsetDateTime ultimaComunicacao, boolean comOdometro, boolean manter) {
    }

    public enum Problema {
        SEM_SINAL("Sem sinal há mais de 24 h"),
        SEM_POSICAO("Comunica sem posição"),
        SEM_ODOMETRO("Não informa o odômetro");

        private final String rotulo;

        Problema(String rotulo) {
            this.rotulo = rotulo;
        }

        public String getRotulo() {
            return rotulo;
        }
    }

    public record RastreadorProblema(UUID idRastreador, UUID idVeiculo, String placa, String base,
                                     ProvedorTelemetria provedor, String provedorRotulo, Problema problema,
                                     String problemaRotulo, OffsetDateTime ultimaComunicacao) {
    }
}
