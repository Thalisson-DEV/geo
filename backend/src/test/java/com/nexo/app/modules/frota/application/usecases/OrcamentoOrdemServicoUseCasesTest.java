package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.domain.Criticidade;
import com.nexo.app.modules.frota.domain.FichaVeiculo;
import com.nexo.app.modules.frota.domain.ItemManutencao;
import com.nexo.app.modules.frota.domain.NaturezaServico;
import com.nexo.app.modules.frota.domain.OrdemServico;
import com.nexo.app.modules.frota.domain.OrigemOrdemServico;
import com.nexo.app.modules.frota.domain.SolicitacaoOrdemServico;
import com.nexo.app.modules.frota.domain.TipoEventoOrdemServico;
import com.nexo.app.modules.frota.domain.TipoManutencao;
import com.nexo.app.modules.frota.infrastructure.persistence.OrdemServicoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.SolicitacaoOrdemServicoRepository;
import com.nexo.app.shared.domain.events.FrotaOrcamentoOsDecididoEvent;
import com.nexo.app.shared.domain.events.SolicitacaoFinanceiraCriadaEvent;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OrcamentoOrdemServicoUseCasesTest {

    @Mock
    private OrdemServicoRepository ordens;
    @Mock
    private SolicitacaoOrdemServicoRepository vinculos;
    @Mock
    private OrdemServicoUseCases ordemServico;
    @Mock
    private ApplicationEventPublisher eventPublisher;
    @InjectMocks
    private OrcamentoOrdemServicoUseCases useCases;

    private OrdemServico os;

    @BeforeEach
    void setUp() {
        var ficha = FichaVeiculo.provisionar(UUID.randomUUID(), "ABC1D23", null);
        var item = new ItemManutencao("PASTILHA", NaturezaServico.SUSPENSAO_FREIOS, null, null);
        ReflectionTestUtils.setField(item, "id", UUID.randomUUID());
        os = OrdemServico.abrir(ficha, new OrdemServico.Abertura(TipoManutencao.CORRETIVA, OrigemOrdemServico.VERBAL,
                Criticidade.MEDIA, null, "x", null, OffsetDateTime.now().minusHours(2), null, null, null, null, null),
                List.of(item), UUID.randomUUID());
        ReflectionTestUtils.setField(os, "id", UUID.randomUUID());
        ReflectionTestUtils.setField(os, "numero", 12L);
    }

    @Test
    void vinculaCompraCriadaComOrigemNaOs() {
        UUID idCompra = UUID.randomUUID();
        when(vinculos.findByIdSolicitacao(idCompra)).thenReturn(Optional.empty());
        when(ordens.findById(os.getId())).thenReturn(Optional.of(os));

        useCases.vincular(new SolicitacaoFinanceiraCriadaEvent(idCompra, "COMPRA", "FROTA_OS", os.getId()));

        var vinculo = ArgumentCaptor.forClass(SolicitacaoOrdemServico.class);
        verify(vinculos).save(vinculo.capture());
        assertThat(vinculo.getValue().getIdOrdemServico()).isEqualTo(os.getId());
        verify(ordemServico).registrar(eq(os), eq(TipoEventoOrdemServico.ORCAMENTO_VINCULADO), any(), any());
    }

    @Test
    void ignoraOrigemDeOutroModulo() {
        useCases.vincular(new SolicitacaoFinanceiraCriadaEvent(UUID.randomUUID(), "COMPRA", "OBRA", UUID.randomUUID()));

        verifyNoInteractions(ordens, vinculos);
    }

    @Test
    void osConcluidaRecusaNovoOrcamento() {
        os.cancelar("Duplicada", OffsetDateTime.now());
        UUID idCompra = UUID.randomUUID();
        when(vinculos.findByIdSolicitacao(idCompra)).thenReturn(Optional.empty());
        when(ordens.findById(os.getId())).thenReturn(Optional.of(os));

        assertThatThrownBy(() -> useCases.vincular(new SolicitacaoFinanceiraCriadaEvent(idCompra, "COMPRA",
                "FROTA_OS", os.getId()))).isInstanceOf(InvarianteVioladaException.class);
        verify(vinculos, never()).save(any());
    }

    @Test
    void aprovacaoEntraNoHistoricoEAvisaAOficina() {
        UUID idCompra = UUID.randomUUID();
        when(vinculos.findByIdSolicitacao(idCompra))
                .thenReturn(Optional.of(new SolicitacaoOrdemServico(os.getId(), idCompra, "COMPRA")));
        when(ordens.findById(os.getId())).thenReturn(Optional.of(os));

        useCases.registrarDecisao(idCompra, "COMPRA", 88L, true, new BigDecimal("1200.00"), null);

        verify(ordemServico).registrar(eq(os), eq(TipoEventoOrdemServico.ORCAMENTO_APROVADO),
                argThat(texto -> texto.startsWith("Solicitação de compra nº 88 aprovada (R$") && texto.contains("1.200,00")), eq(null));
        var evento = ArgumentCaptor.forClass(FrotaOrcamentoOsDecididoEvent.class);
        verify(eventPublisher).publishEvent(evento.capture());
        assertThat(evento.getValue().decisao()).isEqualTo("APROVADA");
        assertThat(evento.getValue().papeis()).containsKey("abertura");
    }

    @Test
    void decisaoDeSolicitacaoSemOsEIgnorada() {
        UUID idCompra = UUID.randomUUID();
        when(vinculos.findByIdSolicitacao(idCompra)).thenReturn(Optional.empty());

        useCases.registrarDecisao(idCompra, "COMPRA", 1L, false, null, "Sem verba");

        verifyNoInteractions(eventPublisher, ordemServico);
    }
}
