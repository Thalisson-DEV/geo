package com.nexo.app.modules.estoque.application.usecases;

import com.nexo.app.modules.estoque.application.services.AlocacaoObraService;
import com.nexo.app.modules.estoque.application.services.DebitoSaldoService;
import com.nexo.app.modules.estoque.domain.*;
import com.nexo.app.modules.estoque.domain.MovimentacaoEstoque.TipoMovimentacao;
import com.nexo.app.modules.estoque.infrastructure.persistence.*;
import com.nexo.app.modules.obras.ObraApi;
import com.nexo.app.shared.domain.events.ApontamentoEstornadoEvent;
import com.nexo.app.shared.domain.events.ItemExecutadoEvent;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AplicacaoMaterialObraUseCasesTest {

    @Mock private EstoqueRepository estoqueRepository;
    @Mock private MaterialRepository materialRepository;
    @Mock private SaldoRepository saldoRepository;
    @Mock private MovimentacaoEstoqueRepository movimentacaoRepository;
    @Mock private DebitoSaldoService debitoSaldoService;
    @Mock private AlocacaoObraService alocacao;
    @Mock private EstoqueObraProvisioningService estoqueObraService;
    @Mock private ObraApi obraApi;
    @InjectMocks private AplicacaoMaterialObraUseCases useCases;

    private final UUID idEquipe = UUID.randomUUID();
    private final UUID obraA = UUID.randomUUID();
    private final UUID obraB = UUID.randomUUID();
    private Estoque caminhao;
    private Material poste;

    @BeforeEach
    void preparar() {
        caminhao = comId(new Estoque("CON-PDR-01", comId(new TipoEstoque("CAMPO"))));
        poste = comId(new Material("300117", "Poste DT 10/300", "UN", "MATR", null, null, false, UUID.randomUUID()));
        lenient().when(estoqueRepository.findByIdEquipe(idEquipe)).thenReturn(Optional.of(caminhao));
        lenient().when(materialRepository.findById(poste.getId())).thenReturn(Optional.of(poste));
        lenient().when(obraApi.buscarPorId(any())).thenReturn(Optional.empty());
        lenient().when(saldoRepository.findWithLockByEstoqueIdAndMaterialIdAndCondicao(any(), any(), any())).thenReturn(Optional.empty());
    }

    @Test
    @DisplayName("Aplicar material de outra obra gera um movimento por origem, com a obra que cedeu")
    void aplicarComMaterialDeOutraObra() {
        when(alocacao.consumir(caminhao, poste, CondicaoMaterial.NOVO, obraB, new BigDecimal("3"))).thenReturn(List.of(
                new AlocacaoObraService.Parcela(obraB, new BigDecimal("1"), false),
                new AlocacaoObraService.Parcela(obraA, new BigDecimal("2"), false)));

        useCases.aoExecutar(evento(obraB, "3", false));

        verify(debitoSaldoService).debitar(caminhao, poste, CondicaoMaterial.NOVO, new BigDecimal("3"));
        ArgumentCaptor<MovimentacaoEstoque> movimentos = ArgumentCaptor.forClass(MovimentacaoEstoque.class);
        verify(movimentacaoRepository, times(2)).save(movimentos.capture());
        assertThat(movimentos.getAllValues()).extracting(MovimentacaoEstoque::getTipo, MovimentacaoEstoque::getIdObra,
                        MovimentacaoEstoque::getIdObraOrigem)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(TipoMovimentacao.APLICACAO, obraB, obraB),
                        org.assertj.core.groups.Tuple.tuple(TipoMovimentacao.APLICACAO, obraB, obraA));
    }

    @Test
    @DisplayName("Retirada entra no caminhão como sucata da obra")
    void retirada() {
        useCases.aoExecutar(evento(obraB, "2", true));

        verify(alocacao).alocar(caminhao, poste, CondicaoMaterial.SUCATA, obraB, new BigDecimal("2"));
        verify(saldoRepository).save(any(Saldo.class));
        verify(movimentacaoRepository).save(org.mockito.ArgumentMatchers.argThat(m -> m.getTipo() == TipoMovimentacao.RETIRADA));
    }

    @Test
    @DisplayName("Serviço não mexe no estoque")
    void servicoNaoMexe() {
        useCases.aoExecutar(new ItemExecutadoEvent(UUID.randomUUID(), UUID.randomUUID(), obraB, UUID.randomUUID(), idEquipe,
                UUID.randomUUID(), LocalDate.now(), BigDecimal.ONE, BigDecimal.TEN, null, false));

        verifyNoInteractions(alocacao, debitoSaldoService, movimentacaoRepository);
    }

    @Test
    @DisplayName("Estornar o apontamento devolve ao caminhão e à obra de onde o material veio")
    void estorno() {
        UUID idApontamento = UUID.randomUUID();
        MovimentacaoEstoque aplicada = MovimentacaoEstoque.criarPorObra(caminhao, null, poste, new BigDecimal("2"),
                TipoMovimentacao.APLICACAO, CondicaoMaterial.NOVO, obraB, obraA, idEquipe, UUID.randomUUID(), idApontamento, null);
        when(movimentacaoRepository.existsByTipoAndIdReferenciaOperacao(TipoMovimentacao.ESTORNO, idApontamento)).thenReturn(false);
        when(movimentacaoRepository.findAllByIdReferenciaOperacaoInOrderByDataHoraAscIdAsc(List.of(idApontamento)))
                .thenReturn(List.of(aplicada));

        useCases.aoEstornar(new ApontamentoEstornadoEvent(idApontamento, obraB, idEquipe));

        verify(alocacao).alocar(caminhao, poste, CondicaoMaterial.NOVO, obraA, new BigDecimal("2"));
        verify(movimentacaoRepository).save(org.mockito.ArgumentMatchers.argThat(m -> m.getTipo() == TipoMovimentacao.ESTORNO
                && obraA.equals(m.getIdObraOrigem())));
    }

    @Test
    @DisplayName("Estorno repetido não desfaz duas vezes")
    void estornoIdempotente() {
        UUID idApontamento = UUID.randomUUID();
        when(movimentacaoRepository.existsByTipoAndIdReferenciaOperacao(eq(TipoMovimentacao.ESTORNO), eq(idApontamento))).thenReturn(true);

        useCases.aoEstornar(new ApontamentoEstornadoEvent(idApontamento, obraB, idEquipe));

        verify(movimentacaoRepository, never()).save(any());
    }

    private ItemExecutadoEvent evento(UUID obra, String quantidade, boolean retirada) {
        return new ItemExecutadoEvent(UUID.randomUUID(), UUID.randomUUID(), obra, UUID.randomUUID(), idEquipe, UUID.randomUUID(),
                LocalDate.now(), new BigDecimal(quantidade), BigDecimal.ZERO, poste.getId(), retirada);
    }

    private static <T> T comId(T entidade) {
        ReflectionTestUtils.setField(entidade, "id", UUID.randomUUID());
        return entidade;
    }
}
