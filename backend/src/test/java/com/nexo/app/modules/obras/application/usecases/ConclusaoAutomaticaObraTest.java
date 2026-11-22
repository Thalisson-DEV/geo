package com.nexo.app.modules.obras.application.usecases;

import com.nexo.app.modules.execucao.TurnoApi;
import com.nexo.app.modules.obras.domain.Obra;
import com.nexo.app.modules.obras.domain.StatusObra;
import com.nexo.app.modules.obras.infrastructure.persistence.ApontamentoExecucaoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.AprTurnoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.AtividadeTurnoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.ItemPlanejadoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.KitAplicadoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.ObraRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.OcorrenciaTurnoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.ProgramacaoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.StatusObraRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/** O apontamento que fecha o último serviço planejado conclui a obra sozinho. */
@ExtendWith(MockitoExtension.class)
class ConclusaoAutomaticaObraTest {

    @Mock private ApontamentoExecucaoRepository repository;
    @Mock private ProgramacaoRepository programacaoRepository;
    @Mock private AtividadeTurnoRepository atividadeRepository;
    @Mock private AprTurnoRepository aprRepository;
    @Mock private OcorrenciaTurnoRepository ocorrenciaRepository;
    @Mock private ObraRepository obraRepository;
    @Mock private StatusObraRepository statusObraRepository;
    @Mock private ProgramacaoObraUseCases programacaoUseCases;
    @Mock private KitAplicadoRepository kitRepository;
    @Mock private ItemPlanejadoRepository itemRepository;
    @Mock private TurnoApi turnoApi;
    @Mock private ApplicationEventPublisher eventPublisher;

    private ApontamentoExecucaoUseCases useCases;
    private Obra obra;
    private final StatusObra concluida = new StatusObra("CONCLUÍDA", 3, true);

    @BeforeEach
    void setUp() {
        useCases = new ApontamentoExecucaoUseCases(repository, programacaoRepository, atividadeRepository, aprRepository, ocorrenciaRepository,
                obraRepository, statusObraRepository, programacaoUseCases, kitRepository, itemRepository, turnoApi, eventPublisher);
        obra = ProcessarImportacaoCarteiraServiceTest.novaObra("7100001");
        ReflectionTestUtils.setField(obra, "id", UUID.randomUUID());
        when(obraRepository.findById(obra.getId())).thenReturn(Optional.of(obra));
        lenient().when(statusObraRepository.findByNomeIgnoreCase("CONCLUÍDA")).thenReturn(Optional.of(concluida));
    }

    @Test
    void ultimoServicoExecutadoConcluiAObraComADataDoApontamento() {
        when(itemRepository.contarServicosEAbertos(obra.getId())).thenReturn(List.<Object[]>of(new Object[]{4L, 0L}));

        useCases.concluirObraSeTudoExecutado(obra.getId(), LocalDate.of(2026, 11, 20));

        assertThat(obra.getStatusObra()).isSameAs(concluida);
        assertThat(obra.getDataFimEfetiva()).isEqualTo(LocalDate.of(2026, 11, 20));
        assertThat(obra.getObservacaoStatus()).contains("automaticamente");
    }

    @Test
    void servicoAindaAbertoMantemOStatus() {
        when(itemRepository.contarServicosEAbertos(obra.getId())).thenReturn(List.<Object[]>of(new Object[]{4L, 1L}));

        useCases.concluirObraSeTudoExecutado(obra.getId(), LocalDate.of(2026, 11, 20));

        assertThat(obra.getStatusObra().getNome()).isEqualTo("PLANEJADA");
    }

    @Test
    void obraSemServicoPlanejadoNaoEConcluida() {
        when(itemRepository.contarServicosEAbertos(obra.getId())).thenReturn(List.<Object[]>of(new Object[]{0L, 0L}));

        useCases.concluirObraSeTudoExecutado(obra.getId(), LocalDate.of(2026, 11, 20));

        assertThat(obra.getStatusObra().getNome()).isEqualTo("PLANEJADA");
    }
}
