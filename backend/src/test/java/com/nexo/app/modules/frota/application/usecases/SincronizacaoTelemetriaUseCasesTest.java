package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.FrotaCondutorApi;
import com.nexo.app.modules.frota.FrotaOdometroApi;
import com.nexo.app.modules.frota.application.TelemetriaFrotaProperties;
import com.nexo.app.modules.frota.domain.Condutor;
import com.nexo.app.modules.frota.domain.EventoTelemetria;
import com.nexo.app.modules.frota.domain.FichaVeiculo;
import com.nexo.app.modules.frota.domain.FonteTelemetria;
import com.nexo.app.modules.frota.domain.LeituraOdometro;
import com.nexo.app.modules.frota.domain.OrigemCondutorTelemetria;
import com.nexo.app.modules.frota.domain.OrigemLeituraOdometro;
import com.nexo.app.modules.frota.domain.ProvedorTelemetria;
import com.nexo.app.modules.frota.domain.RastreadorTelemetria;
import com.nexo.app.modules.frota.domain.RotinaTelemetria;
import com.nexo.app.modules.frota.domain.SincronizacaoTelemetria;
import com.nexo.app.modules.frota.domain.SituacaoRastreador;
import com.nexo.app.modules.frota.domain.SituacaoSincronizacaoTelemetria;
import com.nexo.app.modules.frota.domain.TipoEventoTelemetria;
import com.nexo.app.modules.frota.domain.UnidadeMedicao;
import com.nexo.app.modules.frota.infrastructure.persistence.CondutorRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.EventoTelemetriaRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.FichaVeiculoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.PosicaoTelemetriaRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.RastreadorTelemetriaRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.SincronizacaoTelemetriaRepository;
import com.nexo.app.shared.domain.events.FrotaTelemetriaEventoEvent;
import com.nexo.app.shared.domain.events.FrotaTelemetriaFalhaEvent;
import com.nexo.app.shared.infrastructure.security.HashUtils;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SincronizacaoTelemetriaUseCasesTest {

    @Mock
    private FonteTelemetria fonte;
    @Mock
    private RastreadorTelemetriaRepository rastreadores;
    @Mock
    private EventoTelemetriaRepository eventos;
    @Mock
    private SincronizacaoTelemetriaRepository sincronizacoes;
    @Mock
    private PosicaoTelemetriaRepository posicoes;
    @Mock
    private FichaVeiculoRepository fichas;
    @Mock
    private OdometroUseCases odometro;
    @Mock
    private FrotaCondutorApi condutorApi;
    @Mock
    private CondutorRepository condutorRepository;
    @Mock
    private ReferenciasFrota referencias;
    @Mock
    private ApplicationEventPublisher eventPublisher;
    @Mock
    private PlatformTransactionManager transactionManager;

    private SincronizacaoTelemetriaUseCases useCases;
    private final TelemetriaFrotaProperties properties = new TelemetriaFrotaProperties();
    private final Map<String, RastreadorTelemetria> salvos = new HashMap<>();
    private final Map<RotinaTelemetria, SincronizacaoTelemetria> situacoes = new HashMap<>();
    private final UUID idVeiculo = UUID.randomUUID();
    private FichaVeiculo ficha;

    @BeforeEach
    void setUp() {
        when(transactionManager.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        when(fonte.provedor()).thenReturn(ProvedorTelemetria.ZUQ);
        when(fonte.configurada()).thenReturn(true);
        useCases = new SincronizacaoTelemetriaUseCases(List.of(fonte), rastreadores, eventos, sincronizacoes, posicoes, fichas,
                odometro, condutorApi, new CondutoresTelemetria(condutorRepository, referencias), referencias, eventPublisher,
                properties, transactionManager);

        ficha = FichaVeiculo.provisionar(idVeiculo, "ABC1D23", null);
        when(fichas.findByIdVeiculo(idVeiculo)).thenReturn(Optional.of(ficha));
        when(fichas.findAllByIdVeiculoIn(anyCollection())).thenReturn(List.of(ficha));
        when(referencias.idsVeiculosPorPlaca()).thenReturn(Map.of("ABC1D23", idVeiculo));
        when(rastreadores.saveAndFlush(any(RastreadorTelemetria.class))).thenAnswer(i -> {
            RastreadorTelemetria r = i.getArgument(0);
            if (r.getId() == null) ReflectionTestUtils.setField(r, "id", UUID.randomUUID());
            salvos.put(r.getIdExterno(), r);
            return r;
        });
        when(rastreadores.save(any(RastreadorTelemetria.class))).thenAnswer(i -> {
            RastreadorTelemetria r = i.getArgument(0);
            if (r.getId() == null) ReflectionTestUtils.setField(r, "id", UUID.randomUUID());
            salvos.put(r.getIdExterno(), r);
            return r;
        });
        when(rastreadores.findById(any())).thenAnswer(i -> salvos.values().stream()
                .filter(r -> r.getId().equals(i.getArgument(0))).findFirst());
        when(sincronizacoes.findByProvedorAndRotina(eq(ProvedorTelemetria.ZUQ), any()))
                .thenAnswer(i -> Optional.ofNullable(situacoes.get(i.<RotinaTelemetria>getArgument(1))));
        when(sincronizacoes.saveAndFlush(any())).thenAnswer(i -> {
            SincronizacaoTelemetria s = i.getArgument(0);
            ReflectionTestUtils.setField(s, "id", UUID.randomUUID());
            situacoes.put(s.getRotina(), s);
            return s;
        });
        when(eventos.save(any())).thenAnswer(i -> {
            EventoTelemetria e = i.getArgument(0);
            ReflectionTestUtils.setField(e, "id", UUID.randomUUID());
            return e;
        });
    }

    private static FonteTelemetria.VeiculoProvedor veiculo(String placa, OffsetDateTime em, long odometroMetros,
                                                           FonteTelemetria.Motorista motorista) {
        return new FonteTelemetria.VeiculoProvedor("4410", placa, "PIC-07",
                new FonteTelemetria.Leitura(em, -12.9, -38.5, 60.0, true, odometroMetros, null, motorista));
    }

    @Test
    void casaPelaPlacaPreencheAFichaEGravaAPosicao() {
        var agora = OffsetDateTime.now();
        when(fonte.veiculos()).thenReturn(List.of(veiculo("abc-1d23", agora, 50_000_000L, null)));

        useCases.sincronizarVeiculos();

        var r = salvos.get("4410");
        assertThat(r.getSituacao()).isEqualTo(SituacaoRastreador.VINCULADO);
        assertThat(r.getIdVeiculo()).isEqualTo(idVeiculo);
        assertThat(ficha.getProvedorTelemetria()).isEqualTo(ProvedorTelemetria.ZUQ);
        assertThat(ficha.getIdRastreador()).isEqualTo("4410");
        verify(posicoes).inserir(eq(r.getId()), any());
        assertThat(situacoes.get(RotinaTelemetria.VEICULOS).getSituacao()).isEqualTo(SituacaoSincronizacaoTelemetria.OK);
    }

    @Test
    void placaDesconhecidaFicaSemVeiculo() {
        when(fonte.veiculos()).thenReturn(List.of(veiculo("XYZ9Z99", OffsetDateTime.now(), 1L, null)));

        useCases.sincronizarVeiculos();

        assertThat(salvos.get("4410").getSituacao()).isEqualTo(SituacaoRastreador.SEM_VEICULO);
        verify(odometro, never()).registrarLeitura(any(), anyLong(), any(), any(), any(), any());
    }

    @Test
    void kmCalibradoPelaUltimaLeituraDePainel() {
        properties.setRegistrarKm(true);
        var agora = OffsetDateTime.now();
        var ancora = LeituraOdometro.registrar(idVeiculo, UnidadeMedicao.KM, 120_000, agora.minusHours(6),
                OrigemLeituraOdometro.CHECKLIST, UUID.randomUUID(), null, null, null, 1500);
        when(odometro.ultimaLeituraPainel(idVeiculo)).thenReturn(Optional.of(ancora));
        when(odometro.medicaoAtual(idVeiculo)).thenReturn(Optional.of(new FrotaOdometroApi.Medicao(120_000, FrotaOdometroApi.Unidade.KM, 120_000)));
        when(posicoes.pontoEm(anyCollection(), eq(ancora.getLidoEm()), any(), eq(false))).thenReturn(Optional.of(
                new PosicaoTelemetriaRepository.Ponto(ancora.getLidoEm(), null, null, null, null, 50_000_000L, null)));
        when(fonte.veiculos()).thenReturn(List.of(veiculo("ABC1D23", agora, 50_085_700L, null)));

        useCases.sincronizarVeiculos();

        verify(odometro).registrarLeitura(eq(idVeiculo), eq(120_085L), eq(agora),
                eq(FrotaOdometroApi.OrigemLeitura.TELEMETRIA), any(), eq(null));
        assertThat(salvos.get("4410").getLeituraRegistradaEm()).isNotNull();
    }

    @Test
    void kmDaTelemetriaDesligadoNaoGravaLeitura() {
        var agora = OffsetDateTime.now();
        var ancora = LeituraOdometro.registrar(idVeiculo, UnidadeMedicao.KM, 120_000, agora.minusHours(6),
                OrigemLeituraOdometro.CHECKLIST, UUID.randomUUID(), null, null, null, 1500);
        when(odometro.ultimaLeituraPainel(idVeiculo)).thenReturn(Optional.of(ancora));
        when(fonte.veiculos()).thenReturn(List.of(veiculo("ABC1D23", agora, 50_085_700L, null)));

        useCases.sincronizarVeiculos();

        verify(odometro, never()).registrarLeitura(any(), anyLong(), any(), any(), any(), any());
    }

    @Test
    void semLeituraDePainelNaoGravaKm() {
        properties.setRegistrarKm(true);
        when(odometro.ultimaLeituraPainel(idVeiculo)).thenReturn(Optional.empty());
        when(fonte.veiculos()).thenReturn(List.of(veiculo("ABC1D23", OffsetDateTime.now(), 50_085_700L, null)));

        useCases.sincronizarVeiculos();

        verify(odometro, never()).registrarLeitura(any(), anyLong(), any(), any(), any(), any());
    }

    @Test
    void estimativaQueNaoAvancaOKmAtualNaoEhGravada() {
        var agora = OffsetDateTime.now();
        var ancora = LeituraOdometro.registrar(idVeiculo, UnidadeMedicao.KM, 120_000, agora.minusHours(6),
                OrigemLeituraOdometro.CHECKLIST, UUID.randomUUID(), null, null, null, 1500);
        when(odometro.ultimaLeituraPainel(idVeiculo)).thenReturn(Optional.of(ancora));
        when(odometro.medicaoAtual(idVeiculo)).thenReturn(Optional.of(new FrotaOdometroApi.Medicao(120_090, FrotaOdometroApi.Unidade.KM, 120_090)));
        when(posicoes.pontoEm(anyCollection(), any(), any(), anyBoolean())).thenReturn(Optional.of(
                new PosicaoTelemetriaRepository.Ponto(ancora.getLidoEm(), null, null, null, null, 50_000_000L, null)));
        when(fonte.veiculos()).thenReturn(List.of(veiculo("ABC1D23", agora, 50_085_700L, null)));

        useCases.sincronizarVeiculos();

        verify(odometro, never()).registrarLeitura(any(), anyLong(), any(), any(), any(), any());
    }

    @Test
    void provedorSemChaveNaoEhChamado() {
        when(fonte.configurada()).thenReturn(false);

        useCases.sincronizarVeiculos();

        verify(fonte, never()).veiculos();
        assertThat(situacoes.get(RotinaTelemetria.VEICULOS).getSituacao()).isEqualTo(SituacaoSincronizacaoTelemetria.NAO_CONFIGURADO);
    }

    @Test
    void falhaDepoisDaToleranciaAvisaUmaVez() {
        var antiga = new SincronizacaoTelemetria(ProvedorTelemetria.ZUQ, RotinaTelemetria.VEICULOS);
        ReflectionTestUtils.setField(antiga, "id", UUID.randomUUID());
        antiga.registrarSucesso(OffsetDateTime.now().minusHours(2), 10);
        situacoes.put(RotinaTelemetria.VEICULOS, antiga);
        when(fonte.veiculos()).thenThrow(new FonteTelemetria.FalhaTelemetria("O provedor recusou a chave (HTTP 401)."));

        useCases.sincronizarVeiculos();
        useCases.sincronizarVeiculos();

        var captor = ArgumentCaptor.forClass(FrotaTelemetriaFalhaEvent.class);
        verify(eventPublisher).publishEvent(captor.capture());
        assertThat(captor.getValue().mensagem()).contains("HTTP 401");
        assertThat(antiga.getFalhasSeguidas()).isEqualTo(2);
    }

    @Test
    void eventosComCondutorPelaCnhOuPeloVinculoSemDuplicar() {
        var r = new RastreadorTelemetria(ProvedorTelemetria.ZUQ, "4410");
        ReflectionTestUtils.setField(r, "id", UUID.randomUUID());
        r.vincularAutomaticamente(idVeiculo);
        salvos.put("4410", r);
        when(rastreadores.findAllByProvedorAndSituacaoAndAtivoTrue(ProvedorTelemetria.ZUQ, SituacaoRastreador.VINCULADO))
                .thenReturn(List.of(r));
        var agora = OffsetDateTime.now();
        var maria = new FonteTelemetria.Motorista("77", "Maria Souza", "12345678909", "01234567890");
        var lidos = new ArrayList<FonteTelemetria.EventoProvedor>();
        lidos.add(evento("1", TipoEventoTelemetria.EXCESSO_VELOCIDADE, agora.minusHours(1), maria));
        lidos.add(evento("2", TipoEventoTelemetria.FRENAGEM_BRUSCA, agora.minusMinutes(30), null));
        lidos.add(evento("3", TipoEventoTelemetria.PANICO, agora.minusMinutes(10), null));
        lidos.add(new FonteTelemetria.EventoProvedor("9", "9999", null, TipoEventoTelemetria.PANICO, agora, null, null, null,
                null, null, null, null, null));
        when(fonte.eventos(any(), any())).thenReturn(new FonteTelemetria.EventosLidos(lidos, Map.of("4410", agora)));
        when(eventos.idsExternosExistentes(eq(ProvedorTelemetria.ZUQ), anyCollection())).thenReturn(List.of("3"));
        UUID idMaria = UUID.randomUUID();
        UUID idJoao = UUID.randomUUID();
        var condutora = mock(Condutor.class);
        when(condutora.getIdColaborador()).thenReturn(idMaria);
        when(condutorApi.condutorEm(eq(idVeiculo), any())).thenReturn(Optional.of(idJoao));

        try (MockedStatic<HashUtils> hash = Mockito.mockStatic(HashUtils.class)) {
            hash.when(() -> HashUtils.gerarBlindIndex("01234567890")).thenReturn("h-cnh");
            when(condutorRepository.findAllByCnhNumeroHashAndAtivoTrue("h-cnh")).thenReturn(List.of(condutora));

            useCases.sincronizarEventos();
        }

        var captor = ArgumentCaptor.forClass(EventoTelemetria.class);
        verify(eventos, Mockito.times(2)).save(captor.capture());
        var gravados = captor.getAllValues();
        assertThat(gravados.get(0).getIdColaborador()).isEqualTo(idMaria);
        assertThat(gravados.get(0).getOrigemCondutor()).isEqualTo(OrigemCondutorTelemetria.PROVEDOR);
        assertThat(gravados.get(0).getPlaca()).isEqualTo("ABC1D23");
        assertThat(gravados.get(1).getIdColaborador()).isEqualTo(idJoao);
        assertThat(gravados.get(1).getOrigemCondutor()).isEqualTo(OrigemCondutorTelemetria.VINCULO);
        verify(eventPublisher, Mockito.times(2)).publishEvent(any(FrotaTelemetriaEventoEvent.class));
        assertThat(r.getEventosAte()).isEqualTo(agora);
        assertThat(situacoes.get(RotinaTelemetria.EVENTOS).getItens()).isEqualTo(2);
    }

    private static FonteTelemetria.EventoProvedor evento(String id, TipoEventoTelemetria tipo, OffsetDateTime em,
                                                         FonteTelemetria.Motorista motorista) {
        return new FonteTelemetria.EventoProvedor(id, "4410", "ABC-1D23", tipo, em, -12.9, -38.5, "BR-324",
                98.0, 80.0, null, null, motorista);
    }

    private static long anyLong() {
        return org.mockito.ArgumentMatchers.anyLong();
    }
}
