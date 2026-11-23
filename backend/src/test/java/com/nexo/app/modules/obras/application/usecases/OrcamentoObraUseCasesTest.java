package com.nexo.app.modules.obras.application.usecases;

import com.nexo.app.modules.contrato.AcaoResponse;
import com.nexo.app.modules.contrato.ContratoApi;
import com.nexo.app.modules.estoque.EstoqueApi;
import com.nexo.app.modules.obras.application.dto.AlterarItemOrcamentoObraRequest;
import com.nexo.app.modules.obras.application.dto.ItemOrcamentoObraRequest;
import com.nexo.app.modules.obras.application.dto.OrcamentoObraResponse;
import com.nexo.app.modules.obras.application.mappers.ImportacaoObraMapperImpl;
import com.nexo.app.modules.obras.domain.ItemOrcamentoObra;
import com.nexo.app.modules.obras.domain.Obra;
import com.nexo.app.modules.obras.domain.OperacaoItemKit;
import com.nexo.app.modules.obras.domain.OrigemOrcamento;
import com.nexo.app.modules.obras.domain.RevisaoOrcamentoObra;
import com.nexo.app.modules.obras.domain.TipoItemKit;
import com.nexo.app.modules.obras.infrastructure.persistence.ApontamentoExecucaoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.ItemOrcamentoObraRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.KitAplicadoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.KitConstrutivoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.MedicaoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.ObraRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.RevisaoOrcamentoObraRepository;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OrcamentoObraUseCasesTest {

    @Mock
    private ObraUseCases obraUseCases;
    @Mock
    private ObraRepository obraRepository;
    @Mock
    private ItemOrcamentoObraRepository itemRepository;
    @Mock
    private RevisaoOrcamentoObraRepository revisaoRepository;
    @Mock
    private KitAplicadoRepository kitRepository;
    @Mock
    private ApontamentoExecucaoRepository apontamentoRepository;
    @Mock
    private MedicaoRepository medicaoRepository;
    @Mock
    private KitConstrutivoUseCases kitUseCases;
    @Mock
    private KitConstrutivoRepository kitConstrutivoRepository;
    @Mock
    private ContratoApi contratoApi;
    @Mock
    private EstoqueApi estoqueApi;

    private OrcamentoObraUseCases useCases;
    private Obra obra;
    private final List<ItemOrcamentoObra> itens = new ArrayList<>();
    private final List<RevisaoOrcamentoObra> revisoes = new ArrayList<>();

    @BeforeEach
    void setUp() {
        useCases = new OrcamentoObraUseCases(obraUseCases, obraRepository, itemRepository, revisaoRepository, kitRepository,
                apontamentoRepository, medicaoRepository, kitUseCases, kitConstrutivoRepository, contratoApi, estoqueApi, new ImportacaoObraMapperImpl());
        obra = ProcessarImportacaoCarteiraServiceTest.novaObra("4000");
        ReflectionTestUtils.setField(obra, "id", UUID.randomUUID());
        lenient().when(obraUseCases.buscarEntidade(obra.getId())).thenReturn(obra);
        lenient().when(itemRepository.findByIdObraAndAtivoTrueOrderByCodigoAsc(any()))
                .thenAnswer(inv -> new ArrayList<>(itens.stream().filter(ItemOrcamentoObra::isAtivo).toList()));
        lenient().when(itemRepository.save(any())).thenAnswer(inv -> guardar(inv.getArgument(0)));
        lenient().when(itemRepository.saveAll(anyList())).thenAnswer(inv -> {
            List<ItemOrcamentoObra> lista = inv.getArgument(0);
            lista.forEach(this::guardar);
            return lista;
        });
        lenient().when(itemRepository.findByIdAndIdObraAndAtivoTrue(any(), any())).thenAnswer(inv ->
                itens.stream().filter(i -> i.isAtivo() && i.getId().equals(inv.getArgument(0))).findFirst());
        lenient().when(revisaoRepository.save(any())).thenAnswer(inv -> {
            RevisaoOrcamentoObra r = inv.getArgument(0);
            if (r.getId() == null) {
                ReflectionTestUtils.setField(r, "id", UUID.randomUUID());
                revisoes.add(r);
            }
            return r;
        });
        lenient().when(revisaoRepository.findFirstByIdObraAndAtivoTrueOrderByNumeroDesc(any()))
                .thenAnswer(inv -> revisoes.stream().max(Comparator.comparingInt(RevisaoOrcamentoObra::getNumero)));
        lenient().when(kitRepository.listarComItens(any())).thenReturn(List.of());
        lenient().when(medicaoRepository.listarDaObraComItens(any())).thenReturn(List.of());
        lenient().when(apontamentoRepository.somarPorItemDaObra(any())).thenReturn(List.of());
    }

    @Test
    void substituirAbreRevisaoNovaEAlimentaACarteira() {
        useCases.substituir(obra, OrigemOrcamento.IMPORTACAO, null, "Primeira", List.of(servico("A1", "2", "100")));
        ItemOrcamentoObra primeiro = itens.getFirst();

        RevisaoOrcamentoObra segunda = useCases.substituir(obra, OrigemOrcamento.PLANEJAMENTO, null, null,
                List.of(servico("A1", "3", "100"), material("MAT-1", "5")));

        assertThat(segunda.getNumero()).isEqualTo(2);
        assertThat(primeiro.isAtivo()).isFalse();
        assertThat(segunda.getValorServicos()).isEqualByComparingTo("300");
        assertThat(segunda.getQuantidadeItens()).isEqualTo(2);
        assertThat(obra.getValorServicoPrevisto()).isEqualByComparingTo("300");
        OrcamentoObraResponse orcamento = useCases.buscar(obra.getId());
        assertThat(orcamento.revisao().numero()).isEqualTo(2);
        assertThat(orcamento.contagens().naoPlanejados()).isEqualTo(2);
    }

    @Test
    void lancarServicoUsaOValorDoContratoEBarraRepetido() {
        obra.informarCarteira(UUID.randomUUID(), null, null, null, null, null, null);
        UUID acao = UUID.randomUUID();
        when(contratoApi.buscarAcaoPorIdResponse(acao))
                .thenReturn(Optional.of(new AcaoResponse(acao, "LMI-1", "Instalar poste", true, null, null)));
        when(kitUseCases.valoresVigentes(any(), any())).thenReturn(Map.of(acao, new BigDecimal("250")));

        OrcamentoObraResponse orcamento = useCases.adicionarItem(obra.getId(),
                new ItemOrcamentoObraRequest(TipoItemKit.SERVICO, acao, null, new BigDecimal("2"), null));

        assertThat(orcamento.revisao().origem()).isEqualTo(OrigemOrcamento.MANUAL);
        assertThat(orcamento.itens()).singleElement().satisfies(i -> {
            assertThat(i.orcadoValor()).isEqualByComparingTo("500");
            assertThat(i.idAcao()).isEqualTo(acao);
        });
        assertThatThrownBy(() -> useCases.adicionarItem(obra.getId(),
                new ItemOrcamentoObraRequest(TipoItemKit.SERVICO, acao, OperacaoItemKit.INSTALAR, BigDecimal.ONE, null)))
                .isInstanceOf(InvarianteVioladaException.class).hasMessageContaining("já está no orçamento");

        OrcamentoObraResponse alterado = useCases.alterarItem(obra.getId(), itens.getFirst().getId(),
                new AlterarItemOrcamentoObraRequest(null, new BigDecimal("4"), null));
        assertThat(alterado.totais().orcadoServicos()).isEqualByComparingTo("1000");
        assertThat(obra.getValorServicoPrevisto()).isEqualByComparingTo("1000");
    }

    @Test
    void gerarSemKitsExplicaOQueFalta() {
        assertThatThrownBy(() -> useCases.gerarDoPlanejamento(obra.getId(), null))
                .isInstanceOf(InvarianteVioladaException.class).hasMessageContaining("ainda não tem kits");
    }

    private ItemOrcamentoObra guardar(ItemOrcamentoObra item) {
        if (item.getId() == null) {
            ReflectionTestUtils.setField(item, "id", UUID.randomUUID());
            itens.add(item);
        }
        return item;
    }

    private static ItemOrcamentoObra.Dados servico(String codigo, String quantidade, String unitario) {
        return new ItemOrcamentoObra.Dados(TipoItemKit.SERVICO, OperacaoItemKit.INSTALAR, codigo, null, "UN",
                new BigDecimal(quantidade), new BigDecimal(unitario), null, null, null);
    }

    private static ItemOrcamentoObra.Dados material(String codigo, String quantidade) {
        return new ItemOrcamentoObra.Dados(TipoItemKit.MATERIAL, OperacaoItemKit.INSTALAR, codigo, null, "UN",
                new BigDecimal(quantidade), null, null, null, null);
    }
}
