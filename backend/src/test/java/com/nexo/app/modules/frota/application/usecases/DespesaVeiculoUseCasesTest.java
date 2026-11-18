package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.application.dto.DespesaVeiculoFilter;
import com.nexo.app.modules.frota.application.dto.DespesaVeiculoRequest;
import com.nexo.app.modules.frota.application.dto.TipoDespesaRequest;
import com.nexo.app.modules.frota.application.dto.TipoDespesaResponse;
import com.nexo.app.modules.frota.application.dto.VeiculoFrotaRequest;
import com.nexo.app.modules.frota.domain.Combustivel;
import com.nexo.app.modules.frota.domain.FormaPagamentoDespesa;
import com.nexo.app.modules.frota.domain.RegimeVeiculo;
import com.nexo.app.modules.frota.domain.SituacaoOperacional;
import com.nexo.app.modules.frota.domain.TipoDocumentoFiscal;
import com.nexo.app.modules.frota.infrastructure.persistence.DespesaVeiculoRepository;
import com.nexo.app.modules.rh.domain.BaseOperacional;
import com.nexo.app.modules.rh.domain.CentroFaturamento;
import com.nexo.app.modules.rh.infrastructure.persistence.BaseOperacionalRepository;
import com.nexo.app.modules.rh.infrastructure.persistence.CentroFaturamentoRepository;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.infrastructure.storage.ObjectStorageService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Despesas por veículo: lançamento com a base do veículo, totais por tipo, travas do pagamento e anexos. */
@SpringBootTest
@Transactional
class DespesaVeiculoUseCasesTest {

    @Autowired
    private DespesaVeiculoUseCases useCases;
    @Autowired
    private TipoDespesaUseCases tipos;
    @Autowired
    private PagamentoDespesaUseCases pagamentos;
    @Autowired
    private ImportarDespesasUseCase importacao;
    @Autowired
    private DespesaVeiculoRepository repository;
    @Autowired
    private VeiculoFrotaUseCases veiculos;
    @Autowired
    private BaseOperacionalRepository baseRepository;
    @Autowired
    private CentroFaturamentoRepository centroRepository;
    @Autowired
    private EntityManager entityManager;
    @MockitoBean
    private ObjectStorageService objectStorage;

    private BaseOperacional base;
    private UUID idVeiculo;
    private TipoDespesaResponse lavagem;
    private TipoDespesaResponse pedagio;

    @BeforeEach
    void setUp() {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(UUID.randomUUID().toString(), null, List.of()));
        entityManager.createNativeQuery("""
                INSERT INTO frota_parametros (id, faixas_alerta_dias, limite_km_dia, limite_horas_dia, janela_repeticao_dias, limite_salto_km, versao, data_criacao, ativo)
                VALUES ('00000000-0000-0000-0000-00000000f001', '30,15,7,0', 1500, 16, 90, 2000, 0, CURRENT_TIMESTAMP, TRUE)
                """).executeUpdate();
        var centro = centroRepository.save(new CentroFaturamento("REGIONAL DESPESA"));
        base = baseRepository.save(new BaseOperacional("BASE DESPESA", "BA", "Rua B, 2", centro));
        idVeiculo = veiculos.criar(new VeiculoFrotaRequest("DSP1A23", "STRADA", "FIAT", base.getId(), null, 2024, 2025,
                null, null, null, Combustivel.FLEX, new BigDecimal("55"), new BigDecimal("11"),
                SituacaoOperacional.ATIVO, RegimeVeiculo.PROPRIO, null, null, null, null, null, null, null)).idVeiculo();
        lavagem = tipos.criar(new TipoDespesaRequest("Lavagem teste", List.of("Completa", "A seco")));
        pedagio = tipos.criar(new TipoDespesaRequest("Pedágio teste", List.of()));
        entityManager.flush();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void lavagemEntraNaFichaComABaseDoVeiculoENoTotalDoTipo() {
        var completa = lavagem.subtipos().get(0).id();
        var despesa = useCases.criar(pedido(lavagem.id(), completa, "80.00", LocalDate.now().minusDays(3), FormaPagamentoDespesa.A_PAGAR));
        useCases.criar(pedido(pedagio.id(), null, "12.40", LocalDate.now().minusDays(1), FormaPagamentoDespesa.CARTAO));
        useCases.criar(pedido(pedagio.id(), null, "12.40", LocalDate.now(), FormaPagamentoDespesa.CARTAO));

        assertThat(despesa.placa()).isEqualTo("DSP1A23");
        assertThat(despesa.idBaseOperacional()).as("base do veículo").isEqualTo(base.getId());
        assertThat(despesa.subtipo()).isEqualTo("Completa");
        assertThat(despesa.podePedirPagamento()).isTrue();

        var ficha = new DespesaVeiculoFilter(idVeiculo, null, null, null, LocalDate.now().minusDays(30), LocalDate.now(), null, null, null);
        var resumo = useCases.resumo(ficha);
        assertThat(resumo.quantidade()).isEqualTo(3);
        assertThat(resumo.total()).isEqualByComparingTo("104.80");
        assertThat(resumo.porTipo()).extracting(t -> t.tipo(), t -> t.quantidade())
                .containsExactly(org.assertj.core.groups.Tuple.tuple("Lavagem teste", 1L), org.assertj.core.groups.Tuple.tuple("Pedágio teste", 2L));
        assertThat(resumo.aPagarSemSolicitacao()).as("só a lavagem vai ao financeiro").isEqualTo(1);
        assertThat(resumo.valorAPagarSemSolicitacao()).isEqualByComparingTo("80.00");

        var pedagios = useCases.listar(new DespesaVeiculoFilter(idVeiculo, null, null, List.of(pedagio.id()), null, null, null, null, null),
                PageRequest.of(0, 10));
        assertThat(pedagios.getContent()).hasSize(2).allSatisfy(d -> assertThat(d.formaPagamentoRotulo()).isEqualTo("Cartão corporativo"));
    }

    @Test
    void pagamentoPeloFinanceiroPreenchidoEAcompanhado() {
        var despesa = useCases.criar(new DespesaVeiculoRequest(idVeiculo, LocalDate.of(2026, 10, 10), lavagem.id(),
                lavagem.subtipos().get(0).id(), "Depois da obra", new BigDecimal("80.00"), null, null, null, "Lava Rápido Teste",
                TipoDocumentoFiscal.NFSE, "123", null, FormaPagamentoDespesa.A_PAGAR));
        var preenchimento = pagamentos.preenchimentoFinanceiro(despesa.id());
        assertThat(preenchimento.origemTipo()).isEqualTo("FROTA_DESPESA");
        assertThat(preenchimento.valores()).containsEntry("veiculoId", idVeiculo).containsEntry("baseId", base.getId())
                .containsEntry("fornecedorNome", "Lava Rápido Teste").containsEntry("temNf", true).containsEntry("numeroNf", "123");
        assertThat((String) preenchimento.valores().get("descricao")).contains("Lavagem teste completa do DSP1A23 em 10/10/2026", "NFS-e 123");

        var idSolicitacao = UUID.randomUUID();
        pagamentos.vincular(new com.nexo.app.shared.domain.events.SolicitacaoFinanceiraCriadaEvent(idSolicitacao, "PAGAMENTO",
                "FROTA_DESPESA", despesa.id()));
        assertThat(useCases.buscarPorId(despesa.id()).situacaoPagamentoRotulo()).isEqualTo("Pagamento solicitado");
        assertThatThrownBy(() -> pagamentos.preenchimentoFinanceiro(despesa.id())).hasMessageContaining("já tem pagamento solicitado");

        pagamentos.registrarDecisao(idSolicitacao, 321L, true, null);
        var aprovada = useCases.buscarPorId(despesa.id());
        assertThat(aprovada.situacaoPagamentoRotulo()).isEqualTo("Pagamento aprovado");
        assertThat(aprovada.numeroSolicitacaoFinanceira()).isEqualTo(321L);

        var cartao = useCases.criar(pedido(pedagio.id(), null, "9.90", LocalDate.now(), FormaPagamentoDespesa.CARTAO));
        assertThatThrownBy(() -> pagamentos.preenchimentoFinanceiro(cartao.id())).hasMessageContaining("cartão corporativo e não vai ao financeiro");
    }

    @Test
    void reimportarAMesmaPlanilhaNaoDuplica() {
        String csv = ImportarDespesasUseCase.CABECALHO + "\n"
                + "DSP-1A23;10/10/2026;Lavagem teste;Completa;80,00;Depois da obra;Lava Rápido Teste;Recibo;55;A pagar;EXP;LAV-1\n"
                + "dsp1a23;11/10/2026;Pedágio teste;;12,40;;;;;Cartão;EXP;PED-1\n"
                + "ZZZ9Z99;11/10/2026;Pedágio teste;;12,40;;;;;Cartão;EXP;PED-2\n";
        var arquivo = new MockMultipartFile("arquivo", "despesas.csv", "text/csv", csv.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        var previa = importacao.validar(arquivo);
        assertThat(previa.totalFalha()).isEqualTo(1);
        assertThat(previa.registros().get(2).mensagemErro()).contains("ZZZ9Z99 não encontrada");
        assertThat(previa.registros().get(0).acao()).isEqualTo("Nova");

        var semErro = previa.registros().subList(0, 2);
        assertThat(importacao.confirmar(semErro).registros()).allSatisfy(l -> assertThat(l.status()).isEqualTo("PROCESSADO"));
        var filtro = new DespesaVeiculoFilter(idVeiculo, null, null, null, null, null, null, null, null);
        assertThat(useCases.resumo(filtro).quantidade()).isEqualTo(2);

        var segunda = importacao.validar(arquivo).registros().subList(0, 2);
        assertThat(segunda).allSatisfy(l -> assertThat(l.acao()).isEqualTo("Atualiza a despesa já importada"));
        importacao.confirmar(segunda);
        assertThat(useCases.resumo(filtro).quantidade()).as("reimportação não duplica").isEqualTo(2);
        assertThat(useCases.resumo(filtro).total()).isEqualByComparingTo("92.40");
    }

    @Test
    void regrasDoLancamento() {
        assertThatThrownBy(() -> useCases.criar(pedido(lavagem.id(), null, "50", LocalDate.now().plusDays(1), null)))
                .isInstanceOf(InvarianteVioladaException.class).hasMessageContaining("futuro");
        assertThatThrownBy(() -> useCases.criar(pedido(pedagio.id(), lavagem.subtipos().get(1).id(), "50", LocalDate.now(), null)))
                .hasMessageContaining("não é de pedágio teste");
        var semNumero = new DespesaVeiculoRequest(idVeiculo, LocalDate.now(), pedagio.id(), null, null, new BigDecimal("9"),
                null, null, null, null, TipoDocumentoFiscal.RECIBO, null, null, null);
        assertThatThrownBy(() -> useCases.criar(semNumero)).hasMessageContaining("tipo e o número do documento");
    }

    @Test
    void pagamentoPedidoTravaValorEImpedeExcluir() {
        var despesa = useCases.criar(pedido(lavagem.id(), null, "80.00", LocalDate.now(), FormaPagamentoDespesa.A_PAGAR));
        var entidade = repository.findById(despesa.id()).orElseThrow();
        entidade.vincularSolicitacao(UUID.randomUUID());
        repository.saveAndFlush(entidade);

        assertThatThrownBy(() -> useCases.atualizar(despesa.id(), pedido(lavagem.id(), null, "95.00", LocalDate.now(), FormaPagamentoDespesa.A_PAGAR)))
                .hasMessageContaining("valor, fornecedor, documento e forma de pagamento não mudam");
        // A descrição ainda pode ser corrigida.
        var comDescricao = new DespesaVeiculoRequest(idVeiculo, LocalDate.now(), lavagem.id(), null, "Lavagem depois da obra",
                new BigDecimal("80.00"), null, null, null, "Posto Lava Rápido Teste", null, null, null, FormaPagamentoDespesa.A_PAGAR);
        assertThat(useCases.atualizar(despesa.id(), comDescricao).descricao()).isEqualTo("Lavagem depois da obra");
        assertThatThrownBy(() -> useCases.excluir(despesa.id())).hasMessageContaining("não pode ser excluída");

        entidade = repository.findById(despesa.id()).orElseThrow();
        entidade.registrarDecisao(77L, false, "Sem nota fiscal");
        repository.saveAndFlush(entidade);
        var reprovada = useCases.buscarPorId(despesa.id());
        assertThat(reprovada.situacaoPagamentoRotulo()).isEqualTo("Pagamento reprovado");
        assertThat(reprovada.podePedirPagamento()).as("reprovado pode pedir de novo").isTrue();
        useCases.excluir(despesa.id());
        assertThat(useCases.resumo(new DespesaVeiculoFilter(idVeiculo, null, null, null, null, null, null, null, null)).quantidade()).isZero();
    }

    @Test
    void anexoSobeParaOArmazenamentoEPodeSerRemovido() {
        var despesa = useCases.criar(pedido(pedagio.id(), null, "12.40", LocalDate.now(), FormaPagamentoDespesa.REEMBOLSO));
        var comAnexo = useCases.anexar(despesa.id(), new MockMultipartFile("arquivo", "recibo.pdf", "application/pdf", "pdf".getBytes()));
        assertThat(comAnexo.anexos()).singleElement().satisfies(a -> assertThat(a.nome()).isEqualTo("recibo.pdf"));
        assertThatThrownBy(() -> useCases.anexar(despesa.id(), new MockMultipartFile("arquivo", "planilha.xlsx",
                "application/vnd.ms-excel", "x".getBytes()))).hasMessageContaining("Tipo de arquivo não suportado");
        assertThat(useCases.removerAnexo(despesa.id(), comAnexo.anexos().get(0).id()).anexos()).isEmpty();
    }

    @Test
    void subtiposDoTipoSaoEditaveisSemPerderOsQueContinuam() {
        var completa = lavagem.subtipos().get(0);
        var atualizado = tipos.atualizar(lavagem.id(), new TipoDespesaRequest("Lavagem teste", List.of("Completa", "Interna")));
        assertThat(atualizado.subtipos()).extracting(TipoDespesaResponse.Subtipo::nome).containsExactly("Completa", "Interna");
        assertThat(atualizado.subtipos().get(0).id()).as("mesmo subtipo").isEqualTo(completa.id());
        assertThatThrownBy(() -> tipos.criar(new TipoDespesaRequest("pedágio TESTE", List.of()))).hasMessageContaining("Já existe");
    }

    private DespesaVeiculoRequest pedido(UUID idTipo, UUID idSubtipo, String valor, LocalDate data, FormaPagamentoDespesa forma) {
        return new DespesaVeiculoRequest(idVeiculo, data, idTipo, idSubtipo, null, new BigDecimal(valor), null, null, null,
                "Posto Lava Rápido Teste", null, null, null, forma);
    }
}
