package com.nexo.app.modules.obras.application.usecases;

import com.nexo.app.modules.listas.ListasApi;
import com.nexo.app.modules.obras.application.dto.CampoObrasResponses;
import com.nexo.app.modules.obras.domain.Obra;
import com.nexo.app.modules.obras.domain.OcorrenciaTurno;
import com.nexo.app.modules.obras.domain.StatusObra;
import com.nexo.app.modules.obras.infrastructure.persistence.ItemPlanejadoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.ObraRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.OcorrenciaTurnoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.StatusObraRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * Critério de obra concluída: serviços executados, fotos obrigatórias recebidas (modelo que trava) e nenhuma ocorrência
 * de alteração de projeto ou de obra já executada por terceiros sem decisão do escritório.
 */
@ExtendWith(MockitoExtension.class)
class ConclusaoAutomaticaObraTest {

    @Mock private ObraRepository obraRepository;
    @Mock private StatusObraRepository statusObraRepository;
    @Mock private ItemPlanejadoRepository itemRepository;
    @Mock private OcorrenciaTurnoRepository ocorrenciaRepository;
    @Mock private PacoteCampoObras pacote;
    @Mock private ListasApi listasApi;
    @Mock private ObjectProvider<PacoteCampoObras> provedorPacote;

    private ConclusaoObraUseCases useCases;
    private Obra obra;
    private final StatusObra concluida = new StatusObra("CONCLUÍDA", 3, true);

    @BeforeEach
    void setUp() {
        lenient().when(provedorPacote.getObject()).thenReturn(pacote);
        useCases = new ConclusaoObraUseCases(obraRepository, statusObraRepository, itemRepository, ocorrenciaRepository, provedorPacote, listasApi);
        obra = ProcessarImportacaoCarteiraServiceTest.novaObra("7100001");
        ReflectionTestUtils.setField(obra, "id", UUID.randomUUID());
        when(obraRepository.findById(obra.getId())).thenReturn(Optional.of(obra));
        lenient().when(statusObraRepository.findByNomeIgnoreCase("CONCLUÍDA")).thenReturn(Optional.of(concluida));
        lenient().when(ocorrenciaRepository.findByIdObraAndTipoInAndResolvidaEmIsNullAndAtivoTrueOrderByDataCriacaoAsc(eq(obra.getId()), any()))
                .thenReturn(List.of());
        lenient().when(pacote.pendenciasFotoQueTravam(obra.getId())).thenReturn(List.of());
    }

    @Test
    void ultimoServicoExecutadoConcluiAObraComADataDoApontamento() {
        when(itemRepository.contarServicosEAbertos(obra.getId())).thenReturn(List.<Object[]>of(new Object[]{4L, 0L}));

        useCases.tentarConcluir(obra.getId(), LocalDate.of(2026, 11, 20));

        assertThat(obra.getStatusObra()).isSameAs(concluida);
        assertThat(obra.getDataFimEfetiva()).isEqualTo(LocalDate.of(2026, 11, 20));
        assertThat(obra.getObservacaoStatus()).contains("automaticamente");
    }

    @Test
    void servicoAindaAbertoMantemOStatus() {
        when(itemRepository.contarServicosEAbertos(obra.getId())).thenReturn(List.<Object[]>of(new Object[]{4L, 1L}));

        useCases.tentarConcluir(obra.getId(), LocalDate.of(2026, 11, 20));

        assertThat(obra.getStatusObra().getNome()).isEqualTo("PLANEJADA");
    }

    @Test
    void obraSemServicoPlanejadoNaoEConcluida() {
        when(itemRepository.contarServicosEAbertos(obra.getId())).thenReturn(List.<Object[]>of(new Object[]{0L, 0L}));

        useCases.tentarConcluir(obra.getId(), LocalDate.of(2026, 11, 20));

        assertThat(obra.getStatusObra().getNome()).isEqualTo("PLANEJADA");
    }

    @Test
    void fotoObrigatoriaQueFaltaSeguraAConclusaoAteChegar() {
        when(itemRepository.contarServicosEAbertos(obra.getId())).thenReturn(List.<Object[]>of(new Object[]{4L, 0L}));
        when(pacote.pendenciasFotoQueTravam(obra.getId()))
                .thenReturn(List.of(new CampoObrasResponses.PendenciaFoto(UUID.randomUUID(), "3", "poste", "Placa", null)));

        useCases.tentarConcluir(obra.getId(), LocalDate.of(2026, 11, 20));
        assertThat(obra.getStatusObra().getNome()).isEqualTo("PLANEJADA");

        // A foto chegou depois (o app estava sem sinal): a reavaliação conclui.
        when(pacote.pendenciasFotoQueTravam(obra.getId())).thenReturn(List.of());
        useCases.tentarConcluir(obra.getId(), LocalDate.of(2026, 11, 21));
        assertThat(obra.getStatusObra()).isSameAs(concluida);
    }

    @Test
    void alteracaoDeProjetoAbertaSeguraEResolverConclui() {
        when(itemRepository.contarServicosEAbertos(obra.getId())).thenReturn(List.<Object[]>of(new Object[]{4L, 0L}));
        OcorrenciaTurno ocorrencia = new OcorrenciaTurno(UUID.randomUUID(), obra.getId(), "ALTERACAO_DE_PROJETO", "Poste em outro lugar", false);
        UUID idOcorrencia = UUID.randomUUID();
        ReflectionTestUtils.setField(ocorrencia, "id", idOcorrencia);
        when(ocorrenciaRepository.findByIdObraAndTipoInAndResolvidaEmIsNullAndAtivoTrueOrderByDataCriacaoAsc(eq(obra.getId()), any()))
                .thenAnswer(inv -> ocorrencia.travaConclusao() ? List.of(ocorrencia) : List.of());
        when(ocorrenciaRepository.findByIdAndIdObraAndAtivoTrue(idOcorrencia, obra.getId())).thenReturn(Optional.of(ocorrencia));

        useCases.tentarConcluir(obra.getId(), LocalDate.of(2026, 11, 20));
        assertThat(obra.getStatusObra().getNome()).isEqualTo("PLANEJADA");

        useCases.resolverOcorrencia(obra.getId(), idOcorrencia, "Projeto revisado: poste fica no ponto 4");
        assertThat(ocorrencia.getResolvidaEm()).isNotNull();
        assertThat(obra.getStatusObra()).isSameAs(concluida);
    }
}
