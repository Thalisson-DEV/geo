package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Plano preventivo, controle por veículo e a avaliação da situação (uso ou tempo, o que vencer primeiro). */
class PreventivaTest {

    private static final LocalDate HOJE = LocalDate.of(2026, 10, 24);

    private final UUID picape = UUID.randomUUID();
    private final UUID munck = UUID.randomUUID();
    private ItemManutencao oleo;

    @BeforeEach
    void setUp() {
        oleo = new ItemManutencao("TROCA DE ÓLEO", NaturezaServico.SUSPENSAO_FREIOS, null, null);
        ReflectionTestUtils.setField(oleo, "id", UUID.randomUUID());
    }

    private PlanoPreventivo.Dados dados(Long km, Integer dias, Long antecedenciaKm, Integer antecedenciaDias) {
        return new PlanoPreventivo.Dados("Revisão 10 mil km", null, Set.of(picape), Set.of(), km, null, dias,
                antecedenciaKm, null, antecedenciaDias, null, false, List.of(oleo, oleo),
                List.of("Trocar o óleo", "  ", "Conferir o filtro"));
    }

    private PlanoPreventivo plano() {
        return new PlanoPreventivo(dados(10_000L, 180, 1_000L, 15));
    }

    private ControlePreventivo controle(PlanoPreventivo plano, LocalDate data, Long medicao) {
        return ControlePreventivo.iniciar(UUID.randomUUID(), plano, data, medicao, UnidadeMedicao.KM,
                OrigemBasePreventiva.ORDEM_SERVICO);
    }

    @Test
    void planoGuardaItensSemRepetirERoteiroSemLinhasVazias() {
        var plano = plano();
        assertThat(plano.getItens()).containsExactly(oleo);
        assertThat(plano.getTarefas()).containsExactly("Trocar o óleo", "Conferir o filtro");
        assertThat(plano.roteiroNumerado()).isEqualTo("1. Trocar o óleo\n2. Conferir o filtro");
        assertThat(plano.frequenciaDescrita()).isEqualTo("a cada 10.000 km ou 180 dias");
        assertThat(plano.getCriticidade()).isEqualTo(Criticidade.MEDIA);
    }

    @Test
    void planoExigeFrequenciaAbrangenciaEAntecedenciaMenor() {
        assertThatThrownBy(() -> new PlanoPreventivo(dados(null, null, null, null)))
                .isInstanceOf(InvarianteVioladaException.class).hasMessage("Informe ao menos uma frequência: km, horas ou dias.");
        assertThatThrownBy(() -> new PlanoPreventivo(dados(5_000L, null, 6_000L, null)))
                .hasMessage("A antecedência em km precisa ser menor que a frequência.");
        assertThatThrownBy(() -> new PlanoPreventivo(new PlanoPreventivo.Dados("Sem tipo", null, Set.of(), Set.of(),
                1_000L, null, null, null, null, null, null, false, List.of(oleo), List.of())))
                .hasMessage("Escolha as placas (ou os tipos de veículo) para as quais o plano vale.");
    }

    @Test
    void planoValePeloTipoOuPeloImplementoAcoplado() {
        var porImplemento = new PlanoPreventivo(new PlanoPreventivo.Dados("Munck 250 h", null, Set.of(), Set.of(munck),
                null, 250L, null, null, 25L, null, Criticidade.ALTA, false, List.of(oleo), List.of()));
        assertThat(plano().aplicaA(picape, Set.of())).isTrue();
        assertThat(plano().aplicaA(UUID.randomUUID(), Set.of())).isFalse();
        assertThat(porImplemento.aplicaA(UUID.randomUUID(), Set.of(munck))).isTrue();
        assertThat(porImplemento.mede(UnidadeMedicao.HORAS)).isTrue();
        assertThat(porImplemento.mede(UnidadeMedicao.KM)).as("só horas, sem dias").isFalse();
    }

    @Test
    void venceNoKmMesmoComTempoSobrando() {
        var avaliacao = AvaliacaoPreventiva.avaliar(controle(plano(), HOJE.minusDays(30), 40_000L), 50_120L,
                UnidadeMedicao.KM, HOJE, null);
        assertThat(avaliacao.situacao()).isEqualTo(SituacaoPreventiva.VENCIDA);
        assertThat(avaliacao.proximaMedicao()).isEqualTo(50_000L);
        assertThat(avaliacao.falta()).isEqualTo("passou 120 km");
    }

    @Test
    void proximaPeloTempo() {
        var avaliacao = AvaliacaoPreventiva.avaliar(controle(plano(), HOJE.minusDays(170), 40_000L), 41_000L,
                UnidadeMedicao.KM, HOJE, null);
        assertThat(avaliacao.situacao()).isEqualTo(SituacaoPreventiva.PROXIMA);
        assertThat(avaliacao.faltaDias()).isEqualTo(10);
        assertThat(avaliacao.falta()).isEqualTo("faltam 10 dias");
        assertThat(avaliacao.previsao()).isEqualTo(HOJE.plusDays(10));
    }

    @Test
    void emDiaMostraAsDuasMedidasEPrevePelaMediaDeUso() {
        var avaliacao = AvaliacaoPreventiva.avaliar(controle(plano(), HOJE.minusDays(20), 40_000L), 49_150L - 2_000L,
                UnidadeMedicao.KM, HOJE, 85.0);
        assertThat(avaliacao.situacao()).isEqualTo(SituacaoPreventiva.EM_DIA);
        assertThat(avaliacao.falta()).isEqualTo("faltam 2.850 km ou 160 dias");
        assertThat(avaliacao.previsao()).as("2.850 km a 85 km/dia").isEqualTo(HOJE.plusDays(34));
    }

    @Test
    void semLeituraContaSoOTempo() {
        var controle = ControlePreventivo.iniciar(UUID.randomUUID(), plano(), HOJE, null, UnidadeMedicao.KM,
                OrigemBasePreventiva.INICIO);
        var avaliacao = AvaliacaoPreventiva.avaliar(controle, null, UnidadeMedicao.KM, HOJE, null);
        assertThat(avaliacao.situacao()).isEqualTo(SituacaoPreventiva.EM_DIA);
        assertThat(avaliacao.proximaMedicao()).isNull();
        assertThat(avaliacao.falta()).isEqualTo("faltam 180 dias");
        assertThat(controle.isSemHistorico()).isTrue();
        assertThat(controle.completarMedicaoInicial(12_000L, UnidadeMedicao.KM)).isTrue();
        assertThat(controle.getBaseMedicao()).isEqualTo(12_000L);
    }

    @Test
    void realizacaoInformadaViraBaseERecusaMedicaoAcimaDaAtual() {
        var controle = controle(plano(), HOJE.minusDays(200), 30_000L);
        assertThatThrownBy(() -> controle.informarRealizacao(HOJE.minusDays(10), 60_000L, 50_000L, UnidadeMedicao.KM,
                null, HOJE, null)).hasMessage("A medição informada passa a atual do veículo (50.000 km).");
        assertThatThrownBy(() -> controle.informarRealizacao(HOJE.plusDays(1), 41_000L, 50_000L, UnidadeMedicao.KM,
                null, HOJE, null)).hasMessage("A data da realização não pode estar no futuro.");

        var realizacao = controle.informarRealizacao(HOJE.minusDays(10), 41_500L, 50_000L, UnidadeMedicao.KM,
                "Concessionária", HOJE, null);
        assertThat(controle.getBaseOrigem()).isEqualTo(OrigemBasePreventiva.INFORMADA);
        assertThat(controle.getBaseMedicao()).isEqualTo(41_500L);
        assertThat(realizacao.getSituacao()).isEqualTo(SituacaoRealizacaoPreventiva.CONCLUIDA);
    }

    @Test
    void osConcluidaRecomecaOCicloEZeraOsAvisos() {
        var controle = controle(plano(), HOJE.minusDays(200), 30_000L);
        controle.registrarAviso(SituacaoPreventiva.VENCIDA, HOJE.minusDays(5));
        assertThat(controle.precisaAvisar(SituacaoPreventiva.PROXIMA)).as("vencida avisada cobre a próxima").isFalse();

        var realizacao = RealizacaoPreventiva.porOrdemServico(controle, UUID.randomUUID(), UnidadeMedicao.KM, null);
        ReflectionTestUtils.setField(realizacao, "id", UUID.randomUUID());
        controle.vincularRealizacao(realizacao);
        assertThat(realizacao.getRoteiro()).startsWith("1. Trocar o óleo");
        assertThatThrownBy(() -> controle.vincularRealizacao(realizacao)).hasMessageContaining("já tem uma OS aberta");

        realizacao.concluir(HOJE, 50_300L, UnidadeMedicao.KM);
        controle.concluirRealizacao(realizacao);
        assertThat(controle.temRealizacaoAberta()).isFalse();
        assertThat(controle.getBaseMedicao()).isEqualTo(50_300L);
        assertThat(controle.precisaAvisar(SituacaoPreventiva.VENCIDA)).isTrue();
        var avaliacao = AvaliacaoPreventiva.avaliar(controle, 50_300L, UnidadeMedicao.KM, HOJE, null);
        assertThat(avaliacao.situacao()).isEqualTo(SituacaoPreventiva.EM_DIA);
        assertThat(avaliacao.proximaData()).isEqualTo(HOJE.plusDays(180));
    }
}
