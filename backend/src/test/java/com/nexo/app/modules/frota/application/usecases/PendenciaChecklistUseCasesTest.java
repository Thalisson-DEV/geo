package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.domain.FinalidadeChecklist;
import com.nexo.app.modules.frota.domain.ModoFotoPergunta;
import com.nexo.app.modules.frota.application.dto.AbrirOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.AbrirOsPendenciasRequest;
import com.nexo.app.modules.frota.application.dto.ConcluirOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.OrdemServicoDetalheResponse;
import com.nexo.app.modules.frota.application.dto.OrdemServicoResponse;
import com.nexo.app.modules.frota.application.dto.ResolverPendenciasRequest;
import com.nexo.app.modules.frota.application.dto.ServicoOrdemServicoRequest;
import com.nexo.app.modules.frota.domain.CausaManutencao;
import com.nexo.app.modules.frota.domain.Checklist;
import com.nexo.app.modules.frota.domain.Criticidade;
import com.nexo.app.modules.frota.domain.FichaVeiculo;
import com.nexo.app.modules.frota.domain.ModeloChecklist;
import com.nexo.app.modules.frota.domain.OrigemOrdemServico;
import com.nexo.app.modules.frota.domain.PendenciaChecklist;
import com.nexo.app.modules.frota.domain.SituacaoPendenciaChecklist;
import com.nexo.app.modules.frota.domain.TipoModeloChecklist;
import com.nexo.app.modules.frota.domain.TipoOficina;
import com.nexo.app.modules.frota.domain.TipoRespostaChecklist;
import com.nexo.app.modules.frota.infrastructure.persistence.ChecklistRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.OrdemServicoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.PendenciaChecklistRepository;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PendenciaChecklistUseCasesTest {

    @Mock
    private PendenciaChecklistRepository repository;
    @Mock
    private ChecklistRepository checklists;
    @Mock
    private OrdemServicoUseCases ordens;
    @Mock
    private OrdemServicoRepository ordemRepository;
    @Mock
    private ExecucaoOrdemServicoUseCases execucao;
    @Mock
    private ReferenciasFrota referencias;
    @Mock
    private HistoricoChecklist historico;
    @InjectMocks
    private PendenciaChecklistUseCases useCases;

    private final UUID idCondutor = UUID.randomUUID();
    private final UUID idItem = UUID.randomUUID();
    private final UUID idOs = UUID.randomUUID();
    private Checklist checklist;
    private PendenciaChecklist pendencia;

    @BeforeEach
    void setUp() {
        var modelo = new ModeloChecklist(new ModeloChecklist.Dados("Geral", TipoModeloChecklist.PRINCIPAL, null, false,
                Set.of(), Set.of(), List.of(new ModeloChecklist.DadosPergunta(null, null, "Faróis", TipoRespostaChecklist.OK_NOK,
                ModoFotoPergunta.NUNCA, null, null)), null));
        modelo.getPerguntas().forEach(p -> ReflectionTestUtils.setField(p, "id", UUID.randomUUID()));
        var ficha = FichaVeiculo.provisionar(UUID.randomUUID(), "ABC1D23", UUID.randomUUID());
        var quando = OffsetDateTime.of(2026, 10, 15, 10, 12, 0, 0, ZoneOffset.UTC);
        checklist = Checklist.registrar(new Checklist.Registro(UUID.randomUUID(), FinalidadeChecklist.USO, idCondutor, UUID.randomUUID(), quando,
                100L, null, false, List.of(new Checklist.RespostaInformada(modelo.getPerguntas().getFirst().getId(), false,
                null, null, "Lado esquerdo", null)), null), ficha, modelo, List.of(), false, quando.plusHours(1));
        ReflectionTestUtils.setField(checklist, "id", UUID.randomUUID());
        pendencia = new PendenciaChecklist(checklist, checklist.problemas().getFirst());
        ReflectionTestUtils.setField(pendencia, "id", UUID.randomUUID());

        lenient().when(repository.findAllById(any())).thenReturn(List.of(pendencia));
        lenient().when(checklists.findAllById(any())).thenReturn(List.of(checklist));
        lenient().when(referencias.nomesColaboradores(anyCollection())).thenReturn(Map.of(idCondutor, "MARIA TESTE"));
    }

    private static OrdemServicoDetalheResponse osComId(UUID id) {
        var ordem = mock(OrdemServicoResponse.class);
        when(ordem.id()).thenReturn(id);
        var detalhe = mock(OrdemServicoDetalheResponse.class);
        when(detalhe.ordem()).thenReturn(ordem);
        return detalhe;
    }

    @Test
    void abreOsDeOrigemChecklistComADescricaoDoProblema() {
        var os = osComId(idOs);
        when(ordens.abrir(any())).thenReturn(os);

        useCases.abrirOs(new AbrirOsPendenciasRequest(List.of(pendencia.getId()), List.of(idItem), null, "Ver também o lado direito"));

        var captor = ArgumentCaptor.forClass(AbrirOrdemServicoRequest.class);
        verify(ordens).abrir(captor.capture());
        var pedido = captor.getValue();
        assertThat(pedido.origem()).isEqualTo(OrigemOrdemServico.CHECKLIST);
        assertThat(pedido.criticidade()).isEqualTo(Criticidade.MEDIA);
        assertThat(pedido.idCondutor()).isEqualTo(idCondutor);
        assertThat(pedido.descricao())
                .isEqualTo("Faróis — Não OK: Lado esquerdo (checklist de 15/10 07:12, MARIA TESTE). Ver também o lado direito");
        assertThat(pendencia.getSituacao()).isEqualTo(SituacaoPendenciaChecklist.OS_ABERTA);
        assertThat(pendencia.getIdOrdemServico()).isEqualTo(idOs);
    }

    @Test
    void resolvidoNaHoraPorColaboradorLancaOServicoEConclui() {
        UUID executor = UUID.randomUUID();
        UUID base = UUID.randomUUID();
        when(referencias.colaboradorAtivo(executor)).thenReturn(true);
        when(referencias.nomesBases(List.of(base))).thenReturn(Map.of(base, "JUAZEIRO"));
        var os = osComId(idOs);
        when(ordens.abrir(any())).thenReturn(os);

        useCases.resolverNaHora(new ResolverPendenciasRequest(List.of(pendencia.getId()), List.of(idItem),
                "Lâmpada trocada pelo condutor", executor, null, base, null));

        var abertura = ArgumentCaptor.forClass(AbrirOrdemServicoRequest.class);
        verify(ordens).abrir(abertura.capture());
        assertThat(abertura.getValue().tipoOficina()).isEqualTo(TipoOficina.INTERNA);
        assertThat(abertura.getValue().veiculoParado()).isFalse();
        var servico = ArgumentCaptor.forClass(ServicoOrdemServicoRequest.class);
        verify(execucao).lancarServico(eq(idOs), servico.capture());
        assertThat(servico.getValue().idMecanico()).isEqualTo(executor);
        assertThat(servico.getValue().valorUnitario()).isEqualByComparingTo(BigDecimal.ZERO);
        var conclusao = ArgumentCaptor.forClass(ConcluirOrdemServicoRequest.class);
        verify(ordens).concluir(eq(idOs), conclusao.capture());
        assertThat(conclusao.getValue().descricaoServico()).isEqualTo("Lâmpada trocada pelo condutor (feito na base JUAZEIRO)");
        assertThat(conclusao.getValue().causa()).isEqualTo(CausaManutencao.SERVICO_CORRETIVO);
        assertThat(pendencia.getSituacao()).isEqualTo(SituacaoPendenciaChecklist.RESOLVIDA_NA_HORA);
    }

    @Test
    void resolvidoNaHoraPorNomeLivreViraOficinaExternaSemLancamento() {
        var os = osComId(idOs);
        when(ordens.abrir(any())).thenReturn(os);

        useCases.resolverNaHora(new ResolverPendenciasRequest(List.of(pendencia.getId()), List.of(idItem),
                "Pneu remendado", null, "Borracharia do posto", null, CausaManutencao.AVARIA));

        var conclusao = ArgumentCaptor.forClass(ConcluirOrdemServicoRequest.class);
        verify(ordens).concluir(eq(idOs), conclusao.capture());
        assertThat(conclusao.getValue().tipoOficina()).isEqualTo(TipoOficina.EXTERNA);
        assertThat(conclusao.getValue().oficinaNome()).isEqualTo("Borracharia do posto");
        verify(execucao, never()).lancarServico(any(), any());
    }

    @Test
    void recusaSemQuemFezOuComPendenciaJaTratada() {
        assertThatThrownBy(() -> useCases.resolverNaHora(new ResolverPendenciasRequest(List.of(pendencia.getId()), List.of(idItem),
                "Lâmpada trocada", null, " ", null, null)))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("quem fez o serviço");

        pendencia.descartar("Marcado por engano", null, OffsetDateTime.now());
        assertThatThrownBy(() -> useCases.abrirOs(new AbrirOsPendenciasRequest(List.of(pendencia.getId()), List.of(idItem), null, null)))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("já foi tratada");
        verify(ordens, never()).abrir(any());
    }
}
