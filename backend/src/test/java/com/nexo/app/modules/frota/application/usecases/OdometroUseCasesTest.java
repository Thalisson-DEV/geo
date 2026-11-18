package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.FrotaOdometroApi;
import com.nexo.app.modules.frota.application.dto.RegistrarLeituraRequest;
import com.nexo.app.modules.frota.application.dto.TrocaPainelRequest;
import com.nexo.app.modules.frota.domain.FichaVeiculo;
import com.nexo.app.modules.frota.domain.LeituraOdometro;
import com.nexo.app.modules.frota.domain.OrigemLeituraOdometro;
import com.nexo.app.modules.frota.domain.ParametrosFrota;
import com.nexo.app.modules.frota.domain.SituacaoLeituraOdometro;
import com.nexo.app.modules.frota.domain.TipoLeituraOdometro;
import com.nexo.app.modules.frota.domain.UnidadeMedicao;
import com.nexo.app.modules.frota.infrastructure.persistence.FichaVeiculoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.LeituraOdometroRepository;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.infrastructure.security.SecurityUtils;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OdometroUseCasesTest {

    @Mock
    private LeituraOdometroRepository repository;
    @Mock
    private FichaVeiculoRepository fichaRepository;
    @Mock
    private ParametrosFrotaUseCases parametros;
    @Mock
    private ReferenciasFrota referencias;
    @InjectMocks
    private OdometroUseCases useCases;

    private final UUID idVeiculo = UUID.randomUUID();
    private LeituraOdometro anterior;

    @BeforeEach
    void setUp() throws Exception {
        var ficha = FichaVeiculo.provisionar(idVeiculo, "ABC1D23", null);
        lenient().when(fichaRepository.findByIdVeiculo(idVeiculo)).thenReturn(Optional.of(ficha));
        lenient().when(fichaRepository.findAllByIdVeiculoIn(anyCollection())).thenReturn(List.of(ficha));
        var ctor = ParametrosFrota.class.getDeclaredConstructor();
        ctor.setAccessible(true);
        ParametrosFrota valores = ctor.newInstance();
        valores.atualizar(List.of(30, 15, 7, 0), 1500);
        lenient().when(parametros.obter()).thenReturn(valores);
        lenient().when(repository.save(any(LeituraOdometro.class))).thenAnswer(i -> {
            LeituraOdometro l = i.getArgument(0);
            ReflectionTestUtils.setField(l, "id", UUID.randomUUID());
            return l;
        });
        anterior = LeituraOdometro.registrar(idVeiculo, UnidadeMedicao.KM, 50_000, OffsetDateTime.now().minusDays(1),
                OrigemLeituraOdometro.MANUAL, null, null, null, null, 1500);
        lenient().when(repository.findFirstByIdVeiculoAndSituacaoAndLidoEmBetweenOrderByLidoEmDescKmDesc(
                eq(idVeiculo), eq(SituacaoLeituraOdometro.VALIDA), any(), any())).thenReturn(Optional.of(anterior));
        // Leituras de painel se comparam só com painel (a telemetria fica de fora).
        lenient().when(repository.findFirstByIdVeiculoAndSituacaoAndOrigemNotAndLidoEmBetweenOrderByLidoEmDescKmDesc(
                eq(idVeiculo), eq(SituacaoLeituraOdometro.VALIDA), eq(OrigemLeituraOdometro.TELEMETRIA), any(), any()))
                .thenReturn(Optional.of(anterior));
    }

    @Test
    void lancamentoManualIncoerenteEhRecusado() {
        try (MockedStatic<SecurityUtils> security = Mockito.mockStatic(SecurityUtils.class)) {
            security.when(SecurityUtils::getUsuarioLogadoId).thenReturn(UUID.randomUUID());

            assertThatThrownBy(() -> useCases.registrarManual(idVeiculo,
                    new RegistrarLeituraRequest(49_000L, OffsetDateTime.now())))
                    .isInstanceOf(InvarianteVioladaException.class)
                    .hasMessageContaining("Confira o valor digitado");
            verify(repository, never()).save(any());
        }
    }

    @Test
    void leituraDoCampoForaDaTravaEhRecusada() {
        assertThatThrownBy(() -> useCases.registrarLeitura(idVeiculo, 49_000, OffsetDateTime.now(),
                FrotaOdometroApi.OrigemLeitura.CHECKLIST, UUID.randomUUID(), UUID.randomUUID()))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("menor que o último registrado")
                .hasMessageContaining("entre 50.000 e 52.000 km");
        assertThatThrownBy(() -> useCases.registrarLeitura(idVeiculo, 500_009, OffsetDateTime.now(),
                FrotaOdometroApi.OrigemLeitura.ABASTECIMENTO, UUID.randomUUID(), UUID.randomUUID()))
                .hasMessageContaining("casa decimal");
        verify(repository, never()).save(any());
    }

    @Test
    void leituraAutomaticaIncoerenteEhGuardadaComoInconsistente() {
        var resultado = useCases.registrarLeitura(idVeiculo, 49_000, OffsetDateTime.now(),
                FrotaOdometroApi.OrigemLeitura.MANUTENCAO, UUID.randomUUID(), UUID.randomUUID());

        assertThat(resultado.valida()).isFalse();
        assertThat(resultado.motivoInconsistencia()).contains("menor que a leitura anterior");
        verify(repository).save(any(LeituraOdometro.class));
    }

    @Test
    void lancamentoManualAcimaDaTravaPedeJustificativa() {
        try (MockedStatic<SecurityUtils> security = Mockito.mockStatic(SecurityUtils.class)) {
            security.when(SecurityUtils::getUsuarioLogadoId).thenReturn(UUID.randomUUID());
            var lidoEm = OffsetDateTime.now();

            assertThatThrownBy(() -> useCases.registrarManual(idVeiculo, new RegistrarLeituraRequest(53_400L, lidoEm)))
                    .hasMessageContaining("informe a justificativa");
            var aceita = useCases.registrarManual(idVeiculo, new RegistrarLeituraRequest(53_400L, lidoEm,
                    "Viagem a Salvador sem abastecimento no sistema"));
            assertThat(aceita.situacao()).isEqualTo(SituacaoLeituraOdometro.VALIDA);
        }
    }

    @Test
    void acumuladoSomaOPainelAntigoAoValorAtual() {
        var troca = LeituraOdometro.registrarTrocaPainel(idVeiculo, UnidadeMedicao.KM, 264_656, 0,
                OffsetDateTime.now().minusHours(5), null, null, null);
        var atual = LeituraOdometro.registrar(idVeiculo, UnidadeMedicao.KM, 120, OffsetDateTime.now(),
                OrigemLeituraOdometro.MANUAL, null, null, troca, null, 1500);
        when(repository.findFirstByIdVeiculoAndSituacaoAndLidoEmGreaterThanEqualOrderByKmDescLidoEmDesc(
                eq(idVeiculo), eq(SituacaoLeituraOdometro.VALIDA), any())).thenReturn(Optional.of(atual));
        when(repository.findAllByIdVeiculoInAndTipoAndSituacaoOrderByLidoEmAsc(anyCollection(),
                eq(TipoLeituraOdometro.TROCA_PAINEL), eq(SituacaoLeituraOdometro.VALIDA))).thenReturn(List.of(troca));

        var medicao = useCases.medicaoAtual(idVeiculo).orElseThrow();

        assertThat(medicao.valor()).isEqualTo(120);
        assertThat(medicao.unidade()).isEqualTo(FrotaOdometroApi.Unidade.KM);
        assertThat(medicao.acumulado()).isEqualTo(264_776);
    }

    @Test
    void trocaComMudancaDeUnidadeZeraADeslocamentoAnterior() {
        var primeira = LeituraOdometro.registrarTrocaPainel(idVeiculo, UnidadeMedicao.KM, 5_000, 0,
                OffsetDateTime.now().minusDays(3), null, null, null);
        var mudanca = LeituraOdometro.registrarTrocaPainel(idVeiculo, UnidadeMedicao.HORAS, 7_000, 100,
                OffsetDateTime.now().minusDays(2), null, primeira, null);
        var depois = LeituraOdometro.registrarTrocaPainel(idVeiculo, UnidadeMedicao.HORAS, 150, 0,
                OffsetDateTime.now().minusDays(1), null, mudanca, null);

        assertThat(OdometroUseCases.deslocamentoAcumulado(List.of(primeira, mudanca, depois))).isEqualTo(150);
    }

    @Test
    void leituraSoBuscaVizinhasDentroDoTrechoDaUltimaTroca() {
        var troca = LeituraOdometro.registrarTrocaPainel(idVeiculo, UnidadeMedicao.KM, 50_000, 0,
                OffsetDateTime.now().minusHours(5), null, anterior, null);
        when(repository.findFirstByIdVeiculoAndTipoAndSituacaoAndLidoEmLessThanEqualOrderByLidoEmDesc(
                eq(idVeiculo), eq(TipoLeituraOdometro.TROCA_PAINEL), eq(SituacaoLeituraOdometro.VALIDA), any()))
                .thenReturn(Optional.of(troca));
        when(repository.findFirstByIdVeiculoAndSituacaoAndOrigemNotAndLidoEmBetweenOrderByLidoEmDescKmDesc(
                eq(idVeiculo), eq(SituacaoLeituraOdometro.VALIDA), eq(OrigemLeituraOdometro.TELEMETRIA),
                eq(troca.getLidoEm()), any()))
                .thenReturn(Optional.of(troca));

        var resultado = useCases.registrarLeitura(idVeiculo, 120, OffsetDateTime.now(),
                FrotaOdometroApi.OrigemLeitura.CHECKLIST, UUID.randomUUID(), null);

        assertThat(resultado.valida()).isTrue();
        verify(repository).findFirstByIdVeiculoAndSituacaoAndOrigemNotAndLidoEmBetweenOrderByLidoEmDescKmDesc(
                eq(idVeiculo), eq(SituacaoLeituraOdometro.VALIDA), eq(OrigemLeituraOdometro.TELEMETRIA),
                eq(troca.getLidoEm()), any());
    }

    @Test
    void leituraAtrasadaFicaNaUnidadeDoTrechoAntigo() {
        var ficha = fichaRepository.findByIdVeiculo(idVeiculo).orElseThrow();
        ficha.trocarPainel(UnidadeMedicao.HORAS);
        UUID idChecklist = UUID.randomUUID();

        var resultado = useCases.registrarLeitura(idVeiculo, 50_050, OffsetDateTime.now().minusHours(12),
                FrotaOdometroApi.OrigemLeitura.CHECKLIST, idChecklist, null);

        assertThat(resultado.valida()).isTrue();
        assertThat(resultado.unidade()).isEqualTo(FrotaOdometroApi.Unidade.KM);
    }

    @Test
    void trocaComUnidadeNovaMudaAFichaDoVeiculo() {
        when(repository.findFirstByIdVeiculoAndSituacaoOrderByLidoEmDescKmDesc(idVeiculo, SituacaoLeituraOdometro.VALIDA))
                .thenReturn(Optional.of(anterior));
        try (MockedStatic<SecurityUtils> security = Mockito.mockStatic(SecurityUtils.class)) {
            security.when(SecurityUtils::getUsuarioLogadoId).thenReturn(UUID.randomUUID());

            var resposta = useCases.trocarPainel(idVeiculo, new TrocaPainelRequest(50_000L, 0L,
                    UnidadeMedicao.HORAS, OffsetDateTime.now(), "Painel trocado para horímetro"));

            assertThat(resposta.tipo()).isEqualTo(TipoLeituraOdometro.TROCA_PAINEL);
            assertThat(resposta.unidade()).isEqualTo(UnidadeMedicao.HORAS);
            assertThat(resposta.deslocamento()).isNull();
            assertThat(fichaRepository.findByIdVeiculo(idVeiculo).orElseThrow().getUnidadeMedicao())
                    .isEqualTo(UnidadeMedicao.HORAS);
        }
    }

    @Test
    void naoAnulaTrocaComLeituraValidaDepois() {
        var troca = LeituraOdometro.registrarTrocaPainel(idVeiculo, UnidadeMedicao.KM, 50_000, 0,
                OffsetDateTime.now().minusHours(5), null, anterior, null);
        ReflectionTestUtils.setField(troca, "id", UUID.randomUUID());
        when(repository.findById(troca.getId())).thenReturn(Optional.of(troca));
        when(repository.findFirstByIdVeiculoAndSituacaoAndLidoEmAfterAndLidoEmBeforeOrderByLidoEmAscKmAsc(
                eq(idVeiculo), eq(SituacaoLeituraOdometro.VALIDA), any(), any())).thenReturn(Optional.of(anterior));

        assertThatThrownBy(() -> useCases.anular(troca.getId(), "Troca lançada por engano"))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("Anule-as antes");
    }

    @Test
    void checklistMenorQueAEstimativaDaTelemetriaEntraEAnulaAEstimativa() {
        var estimativa = LeituraOdometro.registrar(idVeiculo, UnidadeMedicao.KM, 50_085, OffsetDateTime.now().minusHours(2),
                OrigemLeituraOdometro.TELEMETRIA, UUID.randomUUID(), null, anterior, null, 1500);
        when(repository.findAllByIdVeiculoAndSituacaoAndOrigemAndLidoEmBetweenAndKmGreaterThan(eq(idVeiculo),
                eq(SituacaoLeituraOdometro.VALIDA), eq(OrigemLeituraOdometro.TELEMETRIA), any(), any(), eq(50_080L)))
                .thenReturn(List.of(estimativa));

        var resultado = useCases.registrarLeitura(idVeiculo, 50_080, OffsetDateTime.now(),
                FrotaOdometroApi.OrigemLeitura.CHECKLIST, UUID.randomUUID(), null);

        assertThat(resultado.valida()).isTrue();
        assertThat(estimativa.getSituacao()).isEqualTo(SituacaoLeituraOdometro.ANULADA);
        assertThat(estimativa.getJustificativaAnulacao()).startsWith("Superada pela leitura do painel");
        verify(repository).saveAll(List.of(estimativa));
    }

    @Test
    void travaDoCampoIgnoraAEstimativaDaTelemetria() {
        when(repository.findFirstByIdVeiculoAndSituacaoAndOrigemNotAndLidoEmGreaterThanEqualOrderByKmDescLidoEmDesc(
                eq(idVeiculo), eq(SituacaoLeituraOdometro.VALIDA), eq(OrigemLeituraOdometro.TELEMETRIA), any()))
                .thenReturn(Optional.of(anterior));

        var trava = useCases.trava(idVeiculo);

        assertThat(trava.referencia()).isEqualTo(50_000L);
        verify(repository, never()).findFirstByIdVeiculoAndSituacaoAndLidoEmGreaterThanEqualOrderByKmDescLidoEmDesc(
                any(), any(), any());
    }

    @Test
    void mesmoRegistroDeOrigemNaoDuplicaALeitura() {
        UUID idChecklist = UUID.randomUUID();
        var existente = LeituraOdometro.registrar(idVeiculo, UnidadeMedicao.KM, 50_100, OffsetDateTime.now(),
                OrigemLeituraOdometro.CHECKLIST, idChecklist, null, anterior, null, 1500);
        when(repository.findByOrigemAndIdOrigem(OrigemLeituraOdometro.CHECKLIST, idChecklist))
                .thenReturn(Optional.of(existente));

        useCases.registrarLeitura(idVeiculo, 50_100, OffsetDateTime.now(),
                FrotaOdometroApi.OrigemLeitura.CHECKLIST, idChecklist, null);

        verify(repository, never()).save(any());
    }
}
