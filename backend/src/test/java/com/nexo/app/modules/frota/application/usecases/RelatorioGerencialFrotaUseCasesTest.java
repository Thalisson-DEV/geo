package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.execucao.TurnoVeiculoApi;
import com.nexo.app.modules.financeiro.FinanceiroApi;
import com.nexo.app.modules.frota.application.dto.RelatorioGerencialFrotaFilter;
import com.nexo.app.modules.frota.infrastructure.persistence.RelatorioGerencialFrotaRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.RelatorioGerencialFrotaRepository.CustoMes;
import com.nexo.app.modules.frota.infrastructure.persistence.RelatorioGerencialFrotaRepository.Ficha;
import com.nexo.app.modules.frota.infrastructure.persistence.RelatorioGerencialFrotaRepository.HorasParado;
import com.nexo.app.modules.frota.infrastructure.persistence.RelatorioGerencialFrotaRepository.KmMes;
import com.nexo.app.modules.rh.BaseOperacionalApi;
import com.nexo.app.modules.rh.ColaboradorApi;
import com.nexo.app.modules.rh.EquipeApi;
import com.nexo.app.modules.sst.SstAnalyticsApi;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class RelatorioGerencialFrotaUseCasesTest {

    @Mock
    private RelatorioGerencialFrotaRepository repositorio;
    @Mock
    private PreventivaUseCases preventiva;
    @Mock
    private BaseOperacionalApi bases;
    @Mock
    private EquipeApi equipes;
    @Mock
    private ColaboradorApi colaboradores;
    @Mock
    private TurnoVeiculoApi turnos;
    @Mock
    private SstAnalyticsApi sst;
    @Mock
    private FinanceiroApi financeiro;
    @InjectMocks
    private RelatorioGerencialFrotaUseCases useCases;

    private static final OffsetDateTime AGORA = OffsetDateTime.parse("2026-10-30T12:00:00-03:00");
    private final UUID base = UUID.randomUUID();

    @AfterEach
    void limparSessao() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void locadoDeSeisMilPorMesSomaDezoitoMilEmNoventaDias() {
        logar("frota:veiculo:read");
        var locado = ficha("LOC1A23", "LOCADO", "ATIVO", new BigDecimal("6000"));
        when(repositorio.fichas()).thenReturn(List.of(locado));

        var r = useCases.gerar(filtro(LocalDate.of(2026, 7, 1), LocalDate.of(2026, 9, 28)), AGORA);

        assertThat(r.periodo().dias()).isEqualTo(90);
        assertThat(r.veiculos().get(0).locacao()).isEqualByComparingTo("18000.00");
        assertThat(r.resumo().custoTotal().atual()).isEqualByComparingTo("18000.00");
    }

    @Test
    void semLeituraDeSegurosOCustoTotalDizQueOSeguroFicouDeFora() {
        logar("frota:veiculo:read", "frota:os:read");
        when(repositorio.fichas()).thenReturn(List.of(ficha("ABC1D23", "PROPRIO", "ATIVO", null)));

        var r = useCases.gerar(filtro(LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 30)), AGORA);

        assertThat(r.partesOmitidas()).contains("Seguro", "Combustível").doesNotContain("Manutenção", "Locação");
        assertThat(r.combustivel()).isNull();
        assertThat(r.manutencao()).isNotNull();
        verify(repositorio, never()).coberturas(any(), any());
    }

    @Test
    void quarentaEOitoHorasParadoEmTrintaDiasComDezVeiculosDaNoventaENovePontoTresPorCento() {
        logar("frota:veiculo:read", "frota:os:read");
        List<Ficha> frota = new ArrayList<>();
        for (int i = 0; i < 10; i++) frota.add(ficha("AAA0A0" + i, "PROPRIO", "ATIVO", null));
        when(repositorio.fichas()).thenReturn(frota);
        when(repositorio.horasParado(any(), any(), any(), any())).thenReturn(List.of(new HorasParado(frota.get(0).idVeiculo(), 48)));

        // Período inteiro no passado: 30 dias × 24 h × 10 veículos.
        var r = useCases.gerar(filtro(LocalDate.of(2026, 9, 1), LocalDate.of(2026, 9, 30)), AGORA);

        assertThat(r.resumo().disponibilidade().atual()).isEqualByComparingTo("0.9933");
    }

    @Test
    void custoPorKmUsaSoOsVeiculosQueRodaram() {
        logar("frota:veiculo:read", "frota:os:read");
        var rodou = ficha("ROD1A11", "PROPRIO", "ATIVO", null);
        var parado = ficha("PAR1A11", "PROPRIO", "ATIVO", null);
        when(repositorio.fichas()).thenReturn(List.of(rodou, parado));
        when(repositorio.custosPorMes(any(), any(), any(), anyBoolean(), anyBoolean(), anyBoolean())).thenReturn(List.of(
                new CustoMes(rodou.idVeiculo(), LocalDate.of(2026, 9, 1), "MANUTENCAO", new BigDecimal("1000")),
                new CustoMes(parado.idVeiculo(), LocalDate.of(2026, 9, 1), "MANUTENCAO", new BigDecimal("5000"))));
        when(repositorio.kmPorMes(any(), any(), any())).thenReturn(List.of(new KmMes(rodou.idVeiculo(), LocalDate.of(2026, 9, 1), 2000)));

        var r = useCases.gerar(filtro(LocalDate.of(2026, 9, 1), LocalDate.of(2026, 9, 30)), AGORA);

        assertThat(r.resumo().custoTotal().atual()).isEqualByComparingTo("6000");
        assertThat(r.resumo().custoPorKm().atual()).isEqualByComparingTo("0.5");
        assertThat(r.veiculos().get(0).placa()).isEqualTo("PAR1A11");
    }

    @Test
    void veiculoSemKmESemTurnoEhOcioso() {
        logar("frota:veiculo:read");
        var usado = ficha("USA1A11", "PROPRIO", "ATIVO", null);
        var ocioso = ficha("OCI1A11", "PROPRIO", "RESERVA", null);
        when(repositorio.fichas()).thenReturn(List.of(usado, ocioso));
        when(turnos.producaoPorVeiculo(any(), any())).thenReturn(List.of(
                new TurnoVeiculoApi.ProducaoDoVeiculo(usado.idVeiculo(), 20, 80, new BigDecimal("40000"))));

        var r = useCases.gerar(filtro(LocalDate.of(2026, 9, 1), LocalDate.of(2026, 9, 30)), AGORA);

        assertThat(r.uso().ociosos()).extracting(x -> x.placa()).containsExactly("OCI1A11");
        assertThat(r.uso().faturado().atual()).isEqualByComparingTo("40000");
    }

    @Test
    void recortePorRegimeDeixaSoOsLocados() {
        logar("frota:veiculo:read");
        when(repositorio.fichas()).thenReturn(List.of(ficha("PRO1A11", "PROPRIO", "ATIVO", null),
                ficha("LOC1A11", "LOCADO", "ATIVO", new BigDecimal("3000"))));

        var f = new RelatorioGerencialFrotaFilter(LocalDate.of(2026, 9, 1), LocalDate.of(2026, 9, 30), null, null, null,
                List.of("locado"), null, null);
        var r = useCases.gerar(f, AGORA);

        assertThat(r.veiculos()).extracting(x -> x.placa()).containsExactly("LOC1A11");
        assertThat(r.recorte().locados()).isEqualTo(1);
    }

    @Test
    void periodoMaiorQueVinteEQuatroMesesEhRecusado() {
        logar("frota:veiculo:read");
        assertThatThrownBy(() -> useCases.gerar(filtro(LocalDate.of(2024, 1, 1), LocalDate.of(2026, 6, 30)), AGORA))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("24 meses");
    }

    @Test
    void periodoAnteriorTemAMesmaDuracaoEAcabaNaVespera() {
        logar("frota:veiculo:read");
        when(repositorio.fichas()).thenReturn(List.of());

        var r = useCases.gerar(filtro(LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 30)), AGORA);

        assertThat(r.periodo().anteriorAte()).isEqualTo(LocalDate.of(2026, 9, 30));
        assertThat(r.periodo().anteriorDe()).isEqualTo(LocalDate.of(2026, 9, 1));
    }

    @Test
    void rateioDistribuiOValorDiarioPelosMeses() {
        var janela = new RelatorioGerencialFrotaUseCases.Janela(LocalDate.of(2026, 1, 20), LocalDate.of(2026, 3, 10), AGORA);
        Map<LocalDate, BigDecimal> meses = new java.util.TreeMap<>();
        RelatorioGerencialFrotaUseCases.ratear(LocalDate.of(2026, 2, 1), null, janela, BigDecimal.TEN,
                (mes, valor) -> meses.merge(mes, valor, BigDecimal::add));

        assertThat(meses).containsOnlyKeys(LocalDate.of(2026, 2, 1), LocalDate.of(2026, 3, 1));
        assertThat(meses.get(LocalDate.of(2026, 2, 1))).isEqualByComparingTo("280");
        assertThat(meses.get(LocalDate.of(2026, 3, 1))).isEqualByComparingTo("100");
    }

    @Test
    void diasUteisContaDeSegundaASexta() {
        // Outubro de 2026: 22 dias úteis.
        assertThat(RelatorioGerencialFrotaUseCases.diasUteis(LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 31))).isEqualTo(22);
    }

    private Ficha ficha(String placa, String regime, String situacao, BigDecimal locacao) {
        return new Ficha(UUID.randomUUID(), placa, base, null, "PICAPE", situacao, regime, locacao,
                locacao == null ? null : LocalDate.of(2025, 1, 1), null, new BigDecimal("9.5"), "KM");
    }

    private static RelatorioGerencialFrotaFilter filtro(LocalDate de, LocalDate ate) {
        return new RelatorioGerencialFrotaFilter(de, ate, null, null, null, null, null, null);
    }

    private static void logar(String... autoridades) {
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken("gestor", null, autoridades));
    }
}
