package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.EstadoMapa;
import com.nexo.app.modules.frota.application.dto.VeiculoFrotaResumoResponse;
import com.nexo.app.modules.frota.domain.FonteTelemetria;
import com.nexo.app.modules.frota.domain.ProvedorTelemetria;
import com.nexo.app.modules.frota.domain.RastreadorTelemetria;
import com.nexo.app.modules.frota.domain.RegimeVeiculo;
import com.nexo.app.modules.frota.domain.SituacaoOperacional;
import com.nexo.app.modules.frota.domain.UnidadeMedicao;
import com.nexo.app.modules.frota.infrastructure.persistence.EventoTelemetriaRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.RastreadorTelemetriaRepository;
import com.nexo.app.shared.application.dto.PageResponse;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.data.domain.PageImpl;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class TelemetriaFrotaMapaTest {

    @Mock
    private RastreadorTelemetriaRepository rastreadores;
    @Mock
    private EventoTelemetriaRepository eventos;
    @Mock
    private ReferenciasFrota referencias;
    @Mock
    private VeiculoFrotaUseCases veiculos;
    @Mock
    private SincronizacaoTelemetriaUseCases sincronizacao;
    @Mock
    private com.nexo.app.modules.frota.infrastructure.persistence.SincronizacaoTelemetriaRepository sincronizacoes;
    @Mock
    private com.nexo.app.modules.frota.infrastructure.persistence.AbastecimentoRepository abastecimentos;
    @Mock
    private com.nexo.app.modules.frota.infrastructure.persistence.OrdemServicoRepository ordens;
    @Mock
    private com.nexo.app.modules.frota.infrastructure.persistence.PendenciaChecklistRepository pendenciasChecklist;
    @Mock
    private com.nexo.app.modules.frota.infrastructure.persistence.CondutorRepository condutores;
    @Mock
    private ChecklistConsultaUseCases checklists;
    @Mock
    private ParametrosFrotaUseCases parametros;
    @Mock
    private com.nexo.app.modules.frota.infrastructure.persistence.PosicaoTelemetriaRepository posicoes;
    @InjectMocks
    private TelemetriaFrotaUseCases useCases;

    @org.junit.jupiter.api.BeforeEach
    void expedienteComercial() {
        var p = mock(com.nexo.app.modules.frota.domain.ParametrosFrota.class);
        when(p.expediente()).thenReturn(new com.nexo.app.modules.frota.domain.Expediente(
                java.time.LocalTime.of(6, 0), java.time.LocalTime.of(19, 0), false));
        when(parametros.obter()).thenReturn(p);
    }

    private final OffsetDateTime agora = OffsetDateTime.now();

    private static FonteTelemetria.Leitura leitura(OffsetDateTime em, Double velocidade, Boolean ignicao, Double lat) {
        return new FonteTelemetria.Leitura(em, lat, lat == null ? null : -38.5, velocidade, ignicao, 1_000L, null, null);
    }

    private static RastreadorTelemetria rastreador(String id, UUID idVeiculo, FonteTelemetria.Leitura leitura) {
        var r = new RastreadorTelemetria(ProvedorTelemetria.ZUQ, id);
        ReflectionTestUtils.setField(r, "id", UUID.randomUUID());
        r.vincularAutomaticamente(idVeiculo);
        r.registrarLeitura(leitura, null);
        return r;
    }

    @Test
    void estadoPeloUltimoEstadoDoRastreador() {
        UUID v = UUID.randomUUID();
        assertThat(TelemetriaFrotaUseCases.estado(rastreador("1", v, leitura(agora, 60.0, true, -12.0)), agora)).isEqualTo(EstadoMapa.EM_MOVIMENTO);
        assertThat(TelemetriaFrotaUseCases.estado(rastreador("2", v, leitura(agora, 1.0, true, -12.0)), agora)).isEqualTo(EstadoMapa.LIGADO_PARADO);
        assertThat(TelemetriaFrotaUseCases.estado(rastreador("3", v, leitura(agora, 0.0, false, -12.0)), agora)).isEqualTo(EstadoMapa.DESLIGADO);
        assertThat(TelemetriaFrotaUseCases.estado(rastreador("4", v, leitura(agora.minusDays(2), 60.0, true, -12.0)), agora))
                .isEqualTo(EstadoMapa.SEM_SINAL);
        assertThat(TelemetriaFrotaUseCases.estado(rastreador("5", v, leitura(agora.minusHours(2), 79.0, true, -12.0)), agora))
                .as("última leitura andando, mas velha: não está andando agora").isEqualTo(EstadoMapa.DESLIGADO);
    }

    @Test
    void mapaJuntaOVeiculoDaFrotaComORastreadorMaisRecente() {
        UUID idVeiculo = UUID.randomUUID();
        UUID semPosicao = UUID.randomUUID();
        var resumo = mock(VeiculoFrotaResumoResponse.class);
        when(resumo.idVeiculo()).thenReturn(idVeiculo);
        when(resumo.placa()).thenReturn("ABC1D23");
        when(resumo.modelo()).thenReturn("Strada");
        when(resumo.baseOperacional()).thenReturn("FEIRA");
        when(resumo.situacao()).thenReturn(SituacaoOperacional.ATIVO);
        when(resumo.condutorAtual()).thenReturn("João Lima");
        when(resumo.kmAtual()).thenReturn(120_085L);
        when(resumo.unidadeMedicao()).thenReturn(UnidadeMedicao.KM);
        when(resumo.regime()).thenReturn(RegimeVeiculo.PROPRIO);
        var outro = mock(VeiculoFrotaResumoResponse.class);
        when(outro.idVeiculo()).thenReturn(semPosicao);
        when(veiculos.listar(any(), any())).thenReturn(PageResponse.fromPage(new PageImpl<>(List.of(resumo, outro))));
        var antigo = rastreador("1", idVeiculo, leitura(agora.minusHours(3), 0.0, false, -13.0));
        var recente = rastreador("2", idVeiculo, leitura(agora.minusMinutes(2), 72.0, true, -12.2));
        var semCoordenada = rastreador("3", semPosicao, leitura(agora, 0.0, false, null));
        when(rastreadores.findAllByIdVeiculoInAndAtivoTrue(anyCollection())).thenReturn(List.of(antigo, recente, semCoordenada));
        var contagem = mock(EventoTelemetriaRepository.ContagemVeiculo.class);
        when(contagem.getIdVeiculo()).thenReturn(idVeiculo);
        when(contagem.getTotal()).thenReturn(4L);
        when(eventos.contarPorVeiculoDesde(any())).thenReturn(List.of(contagem));
        when(referencias.nomesColaboradores(anyCollection())).thenReturn(Map.of());

        var mapa = useCases.mapa(null);

        assertThat(mapa.semPosicao()).isEqualTo(1);
        assertThat(mapa.posicoesAtrasadasDesde()).as("sem provedor ligado não há atraso").isNull();
        assertThat(mapa.veiculos()).singleElement().satisfies(v -> {
            assertThat(v.ultimaComunicacao()).isEqualTo(recente.getUltimaComunicacao());
            assertThat(v.latitude()).isEqualTo(-12.2);
            assertThat(v.estado()).isEqualTo(EstadoMapa.EM_MOVIMENTO);
            assertThat(v.condutorVinculado()).isEqualTo("João Lima");
            assertThat(v.eventos24h()).isEqualTo(4);
            assertThat(v.kmAtual()).isEqualTo(120_085L);
        });
    }

    @Test
    void mapaApontaOQuePedeDecisaoEmCadaVeiculo() {
        UUID idVeiculo = UUID.randomUUID();
        UUID idCondutor = UUID.randomUUID();
        var resumo = mock(VeiculoFrotaResumoResponse.class);
        when(resumo.idVeiculo()).thenReturn(idVeiculo);
        when(resumo.placa()).thenReturn("ABC1D23");
        when(resumo.idCondutorAtual()).thenReturn(idCondutor);
        when(resumo.unidadeMedicao()).thenReturn(UnidadeMedicao.KM);
        when(veiculos.listar(any(), any())).thenReturn(PageResponse.fromPage(new PageImpl<>(List.of(resumo))));
        when(rastreadores.findAllByIdVeiculoInAndAtivoTrue(anyCollection()))
                .thenReturn(List.of(rastreador("1", idVeiculo, leitura(agora.minusMinutes(1), 60.0, true, -12.0))));
        when(referencias.nomesColaboradores(anyCollection())).thenReturn(Map.of());
        // Expediente vazio: andar agora é sempre fora dele.
        var p = mock(com.nexo.app.modules.frota.domain.ParametrosFrota.class);
        when(p.expediente()).thenReturn(new com.nexo.app.modules.frota.domain.Expediente(java.time.LocalTime.MIDNIGHT, java.time.LocalTime.MIDNIGHT, false));
        when(parametros.obter()).thenReturn(p);

        var pendente = mock(com.nexo.app.modules.frota.domain.OrdemServico.class);
        when(pendente.getIdVeiculo()).thenReturn(idVeiculo);
        when(pendente.getId()).thenReturn(UUID.randomUUID());
        when(pendente.getNumero()).thenReturn(7L);
        when(pendente.getSituacao()).thenReturn(com.nexo.app.modules.frota.domain.SituacaoOrdemServico.PENDENTE);
        when(pendente.getAbertaEm()).thenReturn(agora.minusDays(1));
        var parada = mock(com.nexo.app.modules.frota.domain.OrdemServico.class);
        UUID idParada = UUID.randomUUID();
        when(parada.getIdVeiculo()).thenReturn(idVeiculo);
        when(parada.getId()).thenReturn(idParada);
        when(parada.getNumero()).thenReturn(9L);
        when(parada.getSituacao()).thenReturn(com.nexo.app.modules.frota.domain.SituacaoOrdemServico.EM_ANDAMENTO);
        when(parada.isVeiculoParado()).thenReturn(true);
        when(parada.getPrevisaoTermino()).thenReturn(agora.minusHours(3));
        when(parada.getAbertaEm()).thenReturn(agora.minusDays(4));
        when(ordens.findAllByIdVeiculoInAndSituacaoInAndAtivoTrue(anyCollection(), anyCollection())).thenReturn(List.of(pendente, parada));
        var pendencia = mock(com.nexo.app.modules.frota.domain.PendenciaChecklist.class);
        when(pendencia.getIdVeiculo()).thenReturn(idVeiculo);
        when(pendenciasChecklist.findAllByIdVeiculoInAndSituacaoAndAtivoTrue(anyCollection(), any())).thenReturn(List.of(pendencia, pendencia));
        when(checklists.semChecklistHoje(any())).thenReturn(List.of(
                new com.nexo.app.modules.frota.application.dto.VeiculoSemChecklistResponse(idVeiculo, "ABC1D23", null, null, "Usado hoje sem checklist", null, null)));
        var condutor = mock(com.nexo.app.modules.frota.domain.Condutor.class);
        when(condutor.getIdColaborador()).thenReturn(idCondutor);
        when(condutor.isAtivo()).thenReturn(true);
        when(condutor.isCnhVencidaEm(any())).thenReturn(true);
        when(condutores.findAllByIdColaboradorIn(anyCollection())).thenReturn(List.of(condutor));

        var atencao = useCases.mapa(null).veiculos().getFirst().atencao();

        assertThat(atencao.os().id()).as("a parada em curso vem antes da pendente").isEqualTo(idParada);
        assertThat(atencao.os().atrasada()).isTrue();
        assertThat(atencao.osAbertas()).isEqualTo(2);
        assertThat(atencao.pendenciasChecklist()).isEqualTo(2);
        assertThat(atencao.semChecklistHoje()).isTrue();
        assertThat(atencao.cnhVencida()).isTrue();
        assertThat(atencao.idCondutor()).isEqualTo(idCondutor);
        assertThat(atencao.abastecimento()).isNull();
        assertThat(atencao.foraDoExpediente()).isTrue();
    }

    @Test
    void posicaoGravaSempreAndandoEParadaNoMaximoACada30Min() {
        var r = new RastreadorTelemetria(ProvedorTelemetria.ZUQ, "1");
        var intervalo = Duration.ofMinutes(30);
        var parada = leitura(agora, 0.0, false, -12.0);
        assertThat(r.deveGravarPosicao(parada, null, intervalo)).as("primeira posição").isTrue();
        r.marcarPosicaoGravada(agora);

        assertThat(r.deveGravarPosicao(leitura(agora.plusMinutes(2), 0.0, false, -12.0), false, intervalo)).isFalse();
        assertThat(r.deveGravarPosicao(leitura(agora.plusMinutes(2), 0.0, true, -12.0), false, intervalo)).as("ligou").isTrue();
        assertThat(r.deveGravarPosicao(leitura(agora.plusMinutes(2), 45.0, true, -12.0), true, intervalo)).as("andando").isTrue();
        assertThat(r.deveGravarPosicao(leitura(agora.plusMinutes(31), 0.0, false, -12.0), false, intervalo)).isTrue();
    }

    @Test
    void trajetoVemDoHistoricoDoProvedorEPelasPosicoesGravadasQuandoEleFalha() {
        UUID v = UUID.randomUUID();
        var r = rastreador("9", v, leitura(agora, 40.0, true, -12.0));
        r.atualizarCadastro("TDU8F84", null);
        when(rastreadores.findAllByIdVeiculoAndAtivoTrueOrderByUltimaComunicacaoDesc(v)).thenReturn(List.of(r));
        var fonte = mock(FonteTelemetria.class);
        when(fonte.provedor()).thenReturn(ProvedorTelemetria.ZUQ);
        when(fonte.configurada()).thenReturn(true);
        ReflectionTestUtils.setField(useCases, "fontes", List.of(fonte));
        var de = agora.minusHours(3);
        when(fonte.historico("9", "TDU8F84", de, agora)).thenReturn(List.of(
                leitura(de.minusMinutes(5), 0.0, false, -11.9), leitura(de.plusMinutes(1), 30.0, true, -12.0),
                leitura(de.plusMinutes(2), 35.0, true, -12.01), leitura(de.plusMinutes(3), 38.0, true, -12.02)));

        var doProvedor = useCases.trajeto(v, de, agora);
        assertThat(doProvedor.pontos()).as("só o que está no período").hasSize(3);
        assertThat(doProvedor.pontos().getFirst().velocidadeKmh()).isEqualTo(30.0);

        when(fonte.historico(any(), any(), any(), any())).thenThrow(new FonteTelemetria.FalhaTelemetria("fora do ar"));
        when(posicoes.trajeto(anyCollection(), any(), any(), org.mockito.ArgumentMatchers.anyInt())).thenReturn(List.of(
                new com.nexo.app.modules.frota.infrastructure.persistence.PosicaoTelemetriaRepository.Ponto(de.plusMinutes(1), -12.0, -38.5, 30.0, true, null, null)));
        assertThat(useCases.trajeto(v, de, agora).pontos()).hasSize(1);
    }

    @Test
    void espacarMantemOPrimeiroEOUltimo() {
        var pontos = java.util.stream.IntStream.range(0, 10_000).boxed().toList();
        var espacados = TelemetriaFrotaUseCases.espacar(pontos, 3000);
        assertThat(espacados).hasSize(3000).startsWith(0).endsWith(9_999);
    }
}
