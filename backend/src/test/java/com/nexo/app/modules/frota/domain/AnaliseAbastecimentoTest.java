package com.nexo.app.modules.frota.domain;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class AnaliseAbastecimentoTest {

    @Test
    void solicitacaoComMedicaoMenorIntervaloCurtoEFotoRepetida() {
        var alertas = AnaliseAbastecimento.analisarSolicitacao(new AnaliseAbastecimento.DadosSolicitacao(
                UnidadeMedicao.KM, new BigDecimal("45000"), new BigDecimal("45120"), 72L, 20L, 1));
        assertThat(alertas).extracting(AnaliseAbastecimento.Alerta::tipo).containsExactly(
                TipoAlertaAbastecimento.MEDICAO_MENOR, TipoAlertaAbastecimento.FREQUENCIA_ALTA, TipoAlertaAbastecimento.FOTO_REPETIDA);
        assertThat(alertas.getFirst().mensagem()).isEqualTo("Medição informada (45.000 km) menor que a última registrada (45.120 km).");
        assertThat(alertas.get(1).mensagem()).isEqualTo("Último abastecimento há 20 horas; o usual deste veículo é a cada 3 dias.");
    }

    @Test
    void solicitacaoNormalNaoGeraAlerta() {
        assertThat(AnaliseAbastecimento.analisarSolicitacao(new AnaliseAbastecimento.DadosSolicitacao(
                UnidadeMedicao.KM, new BigDecimal("45200"), new BigDecimal("45120"), 72L, 60L, 0))).isEmpty();
        assertThat(AnaliseAbastecimento.analisarSolicitacao(new AnaliseAbastecimento.DadosSolicitacao(
                UnidadeMedicao.KM, new BigDecimal("45200"), null, null, null, 0))).as("veículo sem histórico").isEmpty();
    }

    @Test
    void volumeAcimaDoTanque() {
        var alertas = AnaliseAbastecimento.analisarRealizado(realizado(new BigDecimal("95"), false, null, List.of(), null, null));
        assertThat(alertas).singleElement().satisfies(a -> {
            assertThat(a.tipo()).isEqualTo(TipoAlertaAbastecimento.VOLUME_ACIMA_TANQUE);
            assertThat(a.mensagem()).isEqualTo("Volume acima da capacidade do tanque: 95,00 l para um tanque de 80 l.");
        });
    }

    @Test
    void consumoForaDaMediaDosUltimosTanquesCheios() {
        // 45.650 - 45.000 = 650 km com 100 l (60 agora + 40 parciais) = 6,5 km/l; média 9,0.
        var alertas = AnaliseAbastecimento.analisarRealizado(realizado(new BigDecimal("60"), true, new BigDecimal("45000"),
                List.of(new BigDecimal("9"), new BigDecimal("9.2"), new BigDecimal("8.8")), null, null));
        assertThat(alertas).singleElement().satisfies(a -> {
            assertThat(a.tipo()).isEqualTo(TipoAlertaAbastecimento.CONSUMO_FORA_PADRAO);
            assertThat(a.mensagem()).isEqualTo("Consumo de 6,50 km/l, 28% abaixo da média (9,00 km/l).");
        });
    }

    @Test
    void consumoSemHistoricoUsaReferenciaDaFichaEDentroDaFaixaNaoAlerta() {
        assertThat(AnaliseAbastecimento.analisarRealizado(realizado(new BigDecimal("60"), true, new BigDecimal("45000"),
                List.of(new BigDecimal("9")), new BigDecimal("7"), null))).as("6,5 contra 7 da ficha: dentro dos 20%").isEmpty();
        assertThat(AnaliseAbastecimento.analisarRealizado(realizado(new BigDecimal("60"), false, new BigDecimal("45000"),
                List.of(new BigDecimal("9"), new BigDecimal("9"), new BigDecimal("9")), null, null))).as("tanque não completado").isEmpty();
    }

    @Test
    void precoAcimaDaMediaDaBase() {
        var alertas = AnaliseAbastecimento.analisarRealizado(realizado(new BigDecimal("60"), false, null, List.of(), null, new BigDecimal("6.00")));
        assertThat(alertas).singleElement().extracting(AnaliseAbastecimento.Alerta::mensagem)
                .isEqualTo("Diesel S10 a R$ 6,900/l, 15% acima da média da base (R$ 6,000/l).");
    }

    @Test
    void rendimentoEmHorasELitrosPorHora() {
        assertThat(AnaliseAbastecimento.rendimento(UnidadeMedicao.HORAS, new BigDecimal("10"), new BigDecimal("50")))
                .isEqualByComparingTo("5.00");
        assertThat(AnaliseAbastecimento.rendimento(UnidadeMedicao.KM, BigDecimal.ZERO, new BigDecimal("50"))).isNull();
    }

    private static AnaliseAbastecimento.DadosRealizado realizado(BigDecimal litros, boolean cheio, BigDecimal medicaoUltimoCheio,
                                                                List<BigDecimal> rendimentos, BigDecimal referencia, BigDecimal precoMedio) {
        return new AnaliseAbastecimento.DadosRealizado(UnidadeMedicao.KM, new BigDecimal("45650"), new BigDecimal("45600"),
                new BigDecimal("80"), litros, cheio, medicaoUltimoCheio, new BigDecimal("40"), rendimentos, referencia,
                "Diesel S10", new BigDecimal("6.900"), precoMedio, 0);
    }
}
