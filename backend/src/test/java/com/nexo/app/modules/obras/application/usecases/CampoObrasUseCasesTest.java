package com.nexo.app.modules.obras.application.usecases;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.nexo.app.modules.execucao.TurnoApi;
import com.nexo.app.modules.execucao.application.dto.TurnoResponse;
import com.nexo.app.modules.obras.application.dto.CampoObrasRequests;
import com.nexo.app.modules.obras.application.dto.CampoObrasResponses;
import com.nexo.app.modules.obras.domain.OcorrenciaTurno;
import com.nexo.app.modules.obras.domain.PresencaObra;
import com.nexo.app.modules.obras.domain.TipoOcorrenciaTurno;
import com.nexo.app.modules.obras.infrastructure.persistence.*;
import com.nexo.app.modules.rh.EquipeApi;
import com.nexo.app.modules.rh.EquipeResponse;
import com.nexo.app.shared.domain.exception.AcessoNegadoException;
import com.nexo.app.shared.domain.exception.IdLocalReutilizadoException;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class CampoObrasUseCasesTest {

    @Mock TurnoApi turnoApi;
    @Mock EquipeApi equipeApi;
    @Mock ObraRepository obraRepository;
    @Mock ProgramacaoRepository programacaoRepository;
    @Mock AprTurnoRepository aprRepository;
    @Mock OcorrenciaTurnoRepository ocorrenciaRepository;
    @Mock AtividadeTurnoRepository atividadeRepository;
    @Mock ApontamentoExecucaoRepository apontamentoRepository;
    @Mock PresencaObraRepository presencaRepository;
    @Mock EvidenciaPontoRepository evidenciaRepository;
    @Mock VaoPlanejamentoRepository vaoRepository;
    @Mock RelatorioTurnoRepository relatorioRepository;
    @Mock ApontamentoExecucaoUseCases apontamentos;
    @Mock EvidenciaPontoUseCases evidencias;

    private CampoObrasUseCases useCases;

    private final UUID usuario = UUID.randomUUID();
    private final UUID equipe = UUID.randomUUID();
    private final UUID processo = UUID.randomUUID();
    private final UUID obra = UUID.randomUUID();
    private final OffsetDateTime abertura = OffsetDateTime.now().minusHours(4);
    private final TurnoResponse turno = new TurnoResponse(UUID.randomUUID(), equipe, usuario, abertura, null, null, null, null, false, null);

    @BeforeEach
    void preparar() {
        ObjectMapper mapper = new ObjectMapper().registerModule(new JavaTimeModule());
        useCases = new CampoObrasUseCases(turnoApi, equipeApi, obraRepository, programacaoRepository, aprRepository,
                ocorrenciaRepository, atividadeRepository, apontamentoRepository, presencaRepository, evidenciaRepository,
                vaoRepository, relatorioRepository, apontamentos, evidencias, mapper);
        when(equipeApi.buscarIdEquipePorUsuario(usuario)).thenReturn(Optional.of(equipe));
        EquipeResponse dados = mock(EquipeResponse.class);
        var proc = mock(com.nexo.app.modules.rh.ProcessoNegocioResponse.class);
        when(proc.id()).thenReturn(processo);
        when(dados.processo()).thenReturn(proc);
        when(dados.codigo()).thenReturn("FIC-01");
        when(equipeApi.buscarPorIdResponse(any())).thenReturn(Optional.of(dados));
        when(obraRepository.listarProcessosComObras()).thenReturn(List.of(processo));
        when(obraRepository.existsById(obra)).thenReturn(true);
        when(turnoApi.listarSobrepostosAoPeriodo(any(), any(), anyCollection())).thenReturn(List.of(turno));
        when(ocorrenciaRepository.save(any())).thenAnswer(i -> comId(i.getArgument(0)));
        when(presencaRepository.save(any())).thenAnswer(i -> comId(i.getArgument(0)));
    }

    private static <T> T comId(T entidade) {
        ReflectionTestUtils.setField(entidade, "id", UUID.randomUUID());
        return entidade;
    }

    private CampoObrasRequests.Campo campo(UUID idLocal, UUID idTurno) {
        return new CampoObrasRequests.Campo(idLocal, idTurno, OffsetDateTime.now().minusHours(1), null, null, null);
    }

    private CampoObrasRequests.Ocorrencia ocorrencia(UUID idLocal, UUID idTurno, String descricao) {
        return new CampoObrasRequests.Ocorrencia(campo(idLocal, idTurno), obra, null, TipoOcorrenciaTurno.CLIMA, descricao, true);
    }

    @Test
    void idProvisorioDoTurnoCaiNoTurnoQueAEquipeTinhaAbertoNaHora() {
        when(turnoApi.buscarPorId(any())).thenThrow(new RecursoNaoEncontradoException("Turno não encontrado"));

        CampoObrasResponses.Resultado r = useCases.registrarOcorrencia(ocorrencia(UUID.randomUUID(), UUID.randomUUID(), "Chuva"), usuario);

        assertThat(r.idTurno()).isEqualTo(turno.id());
        assertThat(r.jaRecebido()).isFalse();
        ArgumentCaptor<OcorrenciaTurno> salva = ArgumentCaptor.forClass(OcorrenciaTurno.class);
        verify(ocorrenciaRepository).save(salva.capture());
        assertThat(salva.getValue().getIdTurno()).isEqualTo(turno.id());
        assertThat(salva.getValue().getCampo().getDataOrigem()).isBefore(OffsetDateTime.now());
    }

    @Test
    void reenvioIgualDevolveOMesmoRegistroEConteudoDiferenteERecusado() {
        UUID idLocal = UUID.randomUUID();
        useCases.registrarOcorrencia(ocorrencia(idLocal, null, "Chuva"), usuario);
        ArgumentCaptor<OcorrenciaTurno> salva = ArgumentCaptor.forClass(OcorrenciaTurno.class);
        verify(ocorrenciaRepository).save(salva.capture());
        when(ocorrenciaRepository.findByCampoIdLocal(idLocal)).thenReturn(Optional.of(salva.getValue()));

        // Reenvio com o turno já trocado pelo id definitivo: o turno não conta no conteúdo.
        CampoObrasRequests.Ocorrencia reenvio = new CampoObrasRequests.Ocorrencia(new CampoObrasRequests.Campo(idLocal, turno.id(),
                salva.getValue().getCampo().getDataOrigem(), null, null, null), obra, null, TipoOcorrenciaTurno.CLIMA, "Chuva", true);

        CampoObrasResponses.Resultado r = useCases.registrarOcorrencia(reenvio, usuario);
        assertThat(r.jaRecebido()).isTrue();
        assertThat(r.ids()).containsExactly(salva.getValue().getId());
        verify(ocorrenciaRepository, times(1)).save(any());

        CampoObrasRequests.Ocorrencia outra = new CampoObrasRequests.Ocorrencia(new CampoObrasRequests.Campo(idLocal, null,
                salva.getValue().getCampo().getDataOrigem(), null, null, null), obra, null, TipoOcorrenciaTurno.CLIMA, "Granizo", true);
        assertThatThrownBy(() -> useCases.registrarOcorrencia(outra, usuario)).isInstanceOf(IdLocalReutilizadoException.class);
    }

    @Test
    void turnoDeOutraEquipeERecusadoCom403() {
        TurnoResponse alheio = new TurnoResponse(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), abertura, null, null, null, null, false, null);
        when(turnoApi.buscarPorId(alheio.id())).thenReturn(alheio);

        assertThatThrownBy(() -> useCases.registrarOcorrencia(ocorrencia(UUID.randomUUID(), alheio.id(), "Chuva"), usuario))
                .isInstanceOf(AcessoNegadoException.class);
    }

    @Test
    void semTurnoNaHoraDoRegistroOMotivoDizQuandoFoi() {
        when(turnoApi.listarSobrepostosAoPeriodo(any(), any(), anyCollection())).thenReturn(List.of());

        assertThatThrownBy(() -> useCases.registrarPresenca(new CampoObrasRequests.Presenca(campo(UUID.randomUUID(), null), obra, null,
                PresencaObra.Tipo.CHEGADA), usuario))
                .isInstanceOf(InvarianteVioladaException.class).hasMessageContaining("não tinha turno aberto");
    }

    @Test
    void chegadaFicaNoTurnoEComAEquipe() {
        CampoObrasResponses.Resultado r = useCases.registrarPresenca(new CampoObrasRequests.Presenca(campo(UUID.randomUUID(), null), obra,
                null, PresencaObra.Tipo.CHEGADA), usuario);

        ArgumentCaptor<PresencaObra> salva = ArgumentCaptor.forClass(PresencaObra.class);
        verify(presencaRepository).save(salva.capture());
        assertThat(salva.getValue().getIdEquipe()).isEqualTo(equipe);
        assertThat(salva.getValue().getTipo()).isEqualTo(PresencaObra.Tipo.CHEGADA);
        assertThat(r.tipo()).isEqualTo("PRESENCA");
    }

    @Test
    void tudoFeitoExigeOPonto() {
        assertThatThrownBy(() -> useCases.apontar(new CampoObrasRequests.Apontamento(campo(UUID.randomUUID(), null), UUID.randomUUID(),
                null, null, true, null, null), usuario))
                .isInstanceOf(InvarianteVioladaException.class).hasMessageContaining("ponto");
    }

    @Test
    void conclusaoAntesDaAprChegarFicaAguardando() {
        when(aprRepository.findByCampoIdLocal(any())).thenReturn(Optional.empty());
        when(aprRepository.findById(any())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> useCases.concluirApr(new CampoObrasRequests.ConclusaoApr(campo(UUID.randomUUID(), null), UUID.randomUUID()), usuario))
                .isInstanceOf(InvarianteVioladaException.class).hasMessageContaining("ainda não chegou");
    }
}
