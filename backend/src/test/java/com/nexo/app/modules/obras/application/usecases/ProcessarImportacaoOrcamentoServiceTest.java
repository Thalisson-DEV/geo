package com.nexo.app.modules.obras.application.usecases;

import com.nexo.app.modules.contrato.AcaoResponse;
import com.nexo.app.modules.contrato.ContratoApi;
import com.nexo.app.modules.estoque.EstoqueApi;
import com.nexo.app.modules.estoque.MaterialResponse;
import com.nexo.app.modules.obras.domain.OperacaoItemKit;
import com.nexo.app.modules.obras.domain.OrigemOrcamento;
import com.nexo.app.modules.obras.domain.TipoItemKit;
import com.nexo.app.modules.obras.domain.ImportacaoObra;
import com.nexo.app.modules.obras.domain.ItemOrcamentoObra;
import com.nexo.app.modules.obras.domain.Obra;
import com.nexo.app.modules.obras.infrastructure.persistence.ImportacaoObraRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.ObraRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProcessarImportacaoOrcamentoServiceTest {

    @Mock
    private ImportacaoObraRepository importacaoRepository;
    @Mock
    private ObraRepository obraRepository;
    @Mock
    private OrcamentoObraUseCases orcamentos;
    @Mock
    private ContratoApi contratoApi;
    @Mock
    private EstoqueApi estoqueApi;
    @Mock
    private PlatformTransactionManager transacoes;

    private ProcessarImportacaoOrcamentoService service;
    private ImportacaoObra importacao;
    private Obra obra;
    private final List<List<ItemOrcamentoObra.Dados>> revisoes = new ArrayList<>();

    @BeforeEach
    void setUp() {
        service = new ProcessarImportacaoOrcamentoService(importacaoRepository, obraRepository, orcamentos,
                contratoApi, estoqueApi, new NormalizadorObraService(), transacoes);
        importacao = new ImportacaoObra(ImportacaoObra.Tipo.ORCAMENTO, null, "orcamento.csv");
        ReflectionTestUtils.setField(importacao, "id", UUID.randomUUID());
        obra = ProcessarImportacaoCarteiraServiceTest.novaObra("3000");
        ReflectionTestUtils.setField(obra, "id", UUID.randomUUID());
        when(importacaoRepository.findById(any())).thenReturn(Optional.of(importacao));
        lenient().when(transacoes.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        lenient().when(obraRepository.findByNumeroIgnoreCaseAndAtivoTrue(anyString()))
                .thenAnswer(inv -> "3000".equals(inv.getArgument(0)) ? Optional.of(obra) : Optional.empty());
        lenient().when(orcamentos.substituir(eq(obra), eq(OrigemOrcamento.IMPORTACAO), any(), anyString(), anyList()))
                .thenAnswer(inv -> {
                    revisoes.add(inv.getArgument(4));
                    return null;
                });
        lenient().when(contratoApi.buscarAcaoAtivaPorCodigo(anyString())).thenAnswer(inv -> {
            String codigo = inv.getArgument(0, String.class);
            return codigo.startsWith("ACAO") ? Optional.of(new AcaoResponse(UUID.nameUUIDFromBytes(codigo.getBytes()),
                    codigo, codigo, true, null, null)) : Optional.empty();
        });
        lenient().when(estoqueApi.buscarMaterialAtivoPorCodigo(anyString())).thenAnswer(inv -> {
            String codigo = inv.getArgument(0, String.class);
            if (!codigo.startsWith("MAT")) {
                return Optional.empty();
            }
            return Optional.of(new MaterialResponse(UUID.nameUUIDFromBytes(codigo.getBytes()), codigo, "Poste", "UN", null,
                    null, null, null, false, true));
        });
    }

    @Test
    void importaServicosEMateriaisNumaRevisaoNova() {
        String csv = "Número;Tipo;Operação;Código;Descrição;Un;Qtd;Valor Unitário;Valor Total;Valor Material Previsto\n"
                + "3000;;;ACAO-1;Instalar poste;UN;2;150,00;;60.000,00\n"
                + "3000;Serviço;Retirar;OUTRO-9;Serviço sem ação;M;10,5;;210,00;\n"
                + "3000;Material;Instalar;MAT-7;Poste;UN;1;;;\n"
                + "3000;;;ACAO-2;Sem valor;UN;1;;;\n"
                + "3000;Equipamento;;ACAO-3;Tipo errado;UN;1;10;;\n"
                + "9999;;;ACAO-1;Obra inexistente;UN;1;10;;\n";
        service.processar(UUID.randomUUID(), linhas(csv));

        assertThat(importacao.getStatus()).isEqualTo(ImportacaoObra.Status.CONCLUIDA);
        assertThat(importacao.getInseridos()).isEqualTo(3);
        assertThat(importacao.getErros()).isEqualTo(3);
        assertThat(importacao.getDetalheErros()).extracting(ImportacaoObra.ErroLinha::motivo)
                .anySatisfy(m -> assertThat(m).contains("valor unitário ou o valor total"))
                .anySatisfy(m -> assertThat(m).contains("Tipo \"Equipamento\""))
                .anySatisfy(m -> assertThat(m).contains("Obra 9999 não encontrada"));
        assertThat(revisoes).singleElement().satisfies(itens -> {
            assertThat(itens).extracting(ItemOrcamentoObra.Dados::codigo).containsExactly("ACAO-1", "OUTRO-9", "MAT-7");
            assertThat(itens.get(0).idAcao()).isNotNull();
            assertThat(itens.get(1).idAcao()).isNull();
            assertThat(itens.get(1).operacao()).isEqualTo(OperacaoItemKit.RETIRAR);
            assertThat(itens.get(2).tipo()).isEqualTo(TipoItemKit.MATERIAL);
            assertThat(itens.get(2).idMaterial()).isNotNull();
        });
        // A coluna antiga de valor de material previsto ainda prevalece.
        assertThat(obra.getValorMaterialPrevisto()).isEqualByComparingTo(new BigDecimal("60000.00"));
    }

    @Test
    void obraSemLinhaValidaNaoGanhaRevisao() {
        service.processar(UUID.randomUUID(), linhas("NUMERO;CODIGO;QUANTIDADE\n3000;ACAO-1;1\n"));

        verify(orcamentos, never()).substituir(any(), any(), any(), any(), anyList());
        assertThat(importacao.getErros()).isEqualTo(1);
    }

    private static java.util.List<LeitorPlanilhaImportacao.Linha> linhas(String csv) {
        return new LeitorPlanilhaImportacao().ler(csv.getBytes(StandardCharsets.UTF_8), "planilha.csv");
    }
}
