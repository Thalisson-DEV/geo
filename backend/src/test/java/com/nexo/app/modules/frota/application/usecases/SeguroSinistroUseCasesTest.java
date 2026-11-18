package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.financeiro.domain.Fornecedor;
import com.nexo.app.modules.financeiro.infrastructure.persistence.FornecedorRepository;
import com.nexo.app.modules.frota.application.dto.AbrirOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.AbrirReparoSinistroRequest;
import com.nexo.app.modules.frota.application.dto.AcionarSeguradoraRequest;
import com.nexo.app.modules.frota.application.dto.ApoliceFilter;
import com.nexo.app.modules.frota.application.dto.ApoliceRequest;
import com.nexo.app.modules.frota.application.dto.CoberturaApoliceRequest;
import com.nexo.app.modules.frota.application.dto.CondutorRequest;
import com.nexo.app.modules.frota.application.dto.EditarOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.GerarParcelasRequest;
import com.nexo.app.modules.frota.application.dto.ItemManutencaoRequest;
import com.nexo.app.modules.frota.application.dto.SeguradoraFrotaRequest;
import com.nexo.app.modules.frota.application.dto.SinistroFilter;
import com.nexo.app.modules.frota.application.dto.SinistroRequest;
import com.nexo.app.modules.frota.application.dto.VeiculoFrotaRequest;
import com.nexo.app.modules.frota.application.dto.VincularCondutorRequest;
import com.nexo.app.modules.frota.domain.CategoriaCnh;
import com.nexo.app.modules.frota.domain.Combustivel;
import com.nexo.app.modules.frota.domain.Criticidade;
import com.nexo.app.modules.frota.domain.MotivoEncerramentoCobertura;
import com.nexo.app.modules.frota.domain.NaturezaServico;
import com.nexo.app.modules.frota.domain.OrigemOrdemServico;
import com.nexo.app.modules.frota.domain.PapelSeguradora;
import com.nexo.app.modules.frota.domain.RegimeVeiculo;
import com.nexo.app.modules.frota.domain.SituacaoOperacional;
import com.nexo.app.modules.frota.domain.SituacaoSinistro;
import com.nexo.app.modules.frota.domain.SituacaoVencimento;
import com.nexo.app.modules.frota.domain.TipoManutencao;
import com.nexo.app.modules.frota.domain.TipoSinistro;
import com.nexo.app.modules.rh.domain.BaseOperacional;
import com.nexo.app.modules.rh.domain.CentroFaturamento;
import com.nexo.app.modules.rh.domain.Colaborador;
import com.nexo.app.modules.rh.domain.Funcao;
import com.nexo.app.modules.rh.domain.ProcessoNegocio;
import com.nexo.app.modules.rh.infrastructure.persistence.BaseOperacionalRepository;
import com.nexo.app.modules.rh.infrastructure.persistence.CentroFaturamentoRepository;
import com.nexo.app.modules.rh.infrastructure.persistence.ColaboradorRepository;
import com.nexo.app.modules.rh.infrastructure.persistence.FuncaoRepository;
import com.nexo.app.modules.rh.infrastructure.persistence.ProcessoNegocioRepository;
import com.nexo.app.shared.domain.events.FrotaSinistroRegistradoEvent;
import com.nexo.app.shared.domain.events.SolicitacaoFinanceiraCriadaEvent;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;
import org.springframework.test.context.transaction.BeforeTransaction;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Seguros e sinistros: apólice com veículos cobertos por período e parcelas pagas pelo
 * financeiro; sinistro com o condutor do momento, seguradora acionada e OS de reparo.
 */
@SpringBootTest
@Transactional
@RecordApplicationEvents
class SeguroSinistroUseCasesTest {

    @Autowired
    private ApoliceUseCases apolices;
    @Autowired
    private PagamentoApoliceUseCases pagamentos;
    @Autowired
    private SeguradoraFrotaUseCases seguradoras;
    @Autowired
    private SinistroUseCases sinistros;
    @Autowired
    private OrdemServicoUseCases ordens;
    @Autowired
    private ItemManutencaoUseCases itens;
    @Autowired
    private VeiculoFrotaUseCases veiculos;
    @Autowired
    private CondutorUseCases condutores;
    @Autowired
    private VinculoCondutorUseCases vinculos;
    @Autowired
    private FornecedorRepository fornecedores;
    @Autowired
    private BaseOperacionalRepository baseRepository;
    @Autowired
    private CentroFaturamentoRepository centroRepository;
    @Autowired
    private ColaboradorRepository colaboradorRepository;
    @Autowired
    private ProcessoNegocioRepository processoRepository;
    @Autowired
    private FuncaoRepository funcaoRepository;
    @Autowired
    private EntityManager entityManager;
    @Autowired
    private ApplicationEvents eventos;
    @Autowired
    private JdbcTemplate jdbc;

    private BaseOperacional base;
    private UUID idVeiculo;
    private UUID idSeguradora;
    private final LocalDate hoje = LocalDate.now(DespesaVeiculoUseCases.FUSO);

    /** No Postgres os números da OS e do sinistro vêm de sequências da migração; o H2 do teste cria as tabelas pelo JPA. */
    @BeforeTransaction
    void numerar() {
        jdbc.execute("CREATE SEQUENCE IF NOT EXISTS frota_os_numero_teste START WITH 1000");
        jdbc.execute("ALTER TABLE frota_ordens_servico ALTER COLUMN numero SET DEFAULT NEXT VALUE FOR frota_os_numero_teste");
        jdbc.execute("CREATE SEQUENCE IF NOT EXISTS frota_sinistro_numero_teste START WITH 1");
        jdbc.execute("ALTER TABLE frota_sinistros ALTER COLUMN numero SET DEFAULT NEXT VALUE FOR frota_sinistro_numero_teste");
        jdbc.execute("ALTER TABLE event_publication ALTER COLUMN serialized_event SET DATA TYPE CLOB");
    }

    @BeforeEach
    void setUp() {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(UUID.randomUUID().toString(), null, List.of()));
        entityManager.createNativeQuery("""
                INSERT INTO frota_parametros (id, faixas_alerta_dias, limite_km_dia, limite_horas_dia, janela_repeticao_dias, limite_salto_km, versao, data_criacao, ativo)
                VALUES ('00000000-0000-0000-0000-00000000f001', '30,15,7,0', 1500, 16, 90, 2000, 0, CURRENT_TIMESTAMP, TRUE)
                """).executeUpdate();
        var centro = centroRepository.save(new CentroFaturamento("REGIONAL SEGURO"));
        base = baseRepository.save(new BaseOperacional("BASE SEGURO", "BA", "Rua S, 3", centro));
        idVeiculo = veiculos.criar(new VeiculoFrotaRequest("SEG1A23", "HILUX", "TOYOTA", base.getId(), null, 2024, 2025,
                null, null, null, Combustivel.DIESEL_S10, new BigDecimal("80"), new BigDecimal("9"),
                SituacaoOperacional.ATIVO, RegimeVeiculo.PROPRIO, null, null, null, null, null, null, null)).idVeiculo();
        idSeguradora = fornecedores.save(new Fornecedor("SEGURADORA TESTE", null, null, null, null)).getId();
        entityManager.flush();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void apoliceCobreOVeiculoNaVigenciaEPagaAsParcelasPeloFinanceiro() {
        var apolice = apolices.criar(apolice("123/2026", hoje.minusMonths(1), hoje.plusDays(20), List.of(idVeiculo)));

        assertThat(apolice.seguradora()).isEqualTo("SEGURADORA TESTE");
        assertThat(apolice.veiculos()).singleElement().satisfies(c -> {
            assertThat(c.placa()).isEqualTo("SEG1A23");
            assertThat(c.inicio()).isEqualTo(apolice.vigenciaInicio());
            assertThat(c.cobertoHoje()).isTrue();
        });
        assertThat(apolice.situacao()).as("dentro da faixa de 30 dias").isEqualTo(SituacaoVencimento.A_VENCER);
        assertThat(apolices.listar(new ApoliceFilter(null, null, idVeiculo, null, SituacaoVencimento.A_VENCER), PageRequest.of(0, 10))
                .getContent()).hasSize(1);
        assertThat(apolices.listar(new ApoliceFilter(null, null, idVeiculo, null, SituacaoVencimento.VENCIDO), PageRequest.of(0, 10))
                .getContent()).isEmpty();

        // 1.000,00 em 3: a diferença dos centavos fica na primeira.
        var parcelada = apolices.gerarParcelas(apolice.id(), new GerarParcelasRequest(3, hoje.plusDays(5), null));
        assertThat(parcelada.parcelas()).extracting(p -> p.valor().toPlainString()).containsExactly("333.34", "333.33", "333.33");
        assertThat(parcelada.totalParcelas()).isEqualByComparingTo("1000.00");
        assertThat(parcelada.parcelas().get(1).vencimento()).isEqualTo(hoje.plusDays(5).plusMonths(1));

        var segunda = parcelada.parcelas().get(1);
        var preenchimento = pagamentos.preenchimentoFinanceiro(segunda.id());
        assertThat(preenchimento.origemTipo()).isEqualTo("FROTA_SEGURO");
        assertThat(preenchimento.valores()).containsEntry("fornecedorId", idSeguradora).containsEntry("vencimento", segunda.vencimento());
        assertThat((String) preenchimento.valores().get("descricao")).startsWith("Parcela 2/3 da Apólice 123/2026");

        var idSolicitacao = UUID.randomUUID();
        pagamentos.vincular(new SolicitacaoFinanceiraCriadaEvent(idSolicitacao, "PAGAMENTO", "FROTA_SEGURO", segunda.id()));
        pagamentos.registrarDecisao(idSolicitacao, 88L, true, null);
        var depois = apolices.buscarPorId(apolice.id());
        assertThat(depois.parcelas().get(1).situacaoPagamentoRotulo()).isEqualTo("Pagamento aprovado");
        assertThat(depois.parcelas().get(1).numeroSolicitacaoFinanceira()).isEqualTo(88L);

        assertThatThrownBy(() -> apolices.gerarParcelas(apolice.id(), new GerarParcelasRequest(2, hoje, null)))
                .hasMessageContaining("parcela enviada ao financeiro");
        assertThatThrownBy(() -> apolices.excluir(apolice.id())).hasMessageContaining("não pode ser excluída");
    }

    @Test
    void coberturaFicaNaVigenciaESemSobrepor() {
        var apolice = apolices.criar(apolice("200", hoje.minusMonths(2), hoje.plusMonths(10), List.of()));

        assertThatThrownBy(() -> apolices.incluirVeiculo(apolice.id(), new CoberturaApoliceRequest(idVeiculo, hoje.minusYears(1), null)))
                .isInstanceOf(InvarianteVioladaException.class).hasMessageContaining("vigência da apólice");
        var coberta = apolices.incluirVeiculo(apolice.id(), new CoberturaApoliceRequest(idVeiculo, hoje.minusMonths(1), hoje));
        assertThatThrownBy(() -> apolices.incluirVeiculo(apolice.id(), new CoberturaApoliceRequest(idVeiculo, hoje.minusDays(3), null)))
                .hasMessageContaining("já está coberto");
        // Depois do fim do primeiro período, o veículo volta a poder entrar.
        var reincluida = apolices.incluirVeiculo(apolice.id(), new CoberturaApoliceRequest(idVeiculo, hoje.plusDays(1), null));
        assertThat(reincluida.veiculos()).hasSize(2);
        assertThat(coberta.veiculosHoje()).isEqualTo(1);

        assertThatThrownBy(() -> apolices.criar(apolice("200", hoje, hoje.plusYears(1), List.of())))
                .hasMessageContaining("Já existe a apólice 200");
    }

    @Test
    void renovacaoComOsMesmosVeiculosEncerraOAvisoEAFuturaComecaDepois() {
        var atual = apolices.criar(apolice("500", hoje.minusMonths(11), hoje.plusDays(15), List.of(idVeiculo)));
        assertThat(atual.situacaoRotulo()).isEqualTo("A vencer");
        assertThat(atual.renovadaPor()).isNull();
        assertThat(apolices.coberturaVeiculos()).singleElement().satisfies(c -> {
            assertThat(c.cobertoHoje()).isTrue();
            assertThat(c.perdeCoberturaEm()).as("dentro da faixa de aviso").isEqualTo(hoje.plusDays(16));
        });

        var renovacao = apolices.criar(apolice("501", hoje.plusDays(16), hoje.plusDays(16).plusYears(1).minusDays(1), List.of(idVeiculo)));
        assertThat(renovacao.diasParaComecar()).isEqualTo(16);
        assertThat(renovacao.situacaoRotulo()).startsWith("Começa em ");
        assertThat(renovacao.veiculosHoje()).isZero();

        var renovada = apolices.buscarPorId(atual.id());
        assertThat(renovada.situacaoRotulo()).isEqualTo("Renovada");
        assertThat(renovada.renovadaPor().numero()).isEqualTo("501");
        assertThat(apolices.coberturaVeiculos()).singleElement().satisfies(c -> {
            assertThat(c.cobertoAte()).as("soma a renovação").isEqualTo(renovacao.vigenciaFim());
            assertThat(c.perdeCoberturaEm()).isNull();
        });
    }

    @Test
    void encerrarCoberturaPedeOMotivoEVeiculoSemSeguroAparece() {
        var apolice = apolices.criar(apolice("600", hoje.minusMonths(2), hoje.plusMonths(10), List.of(idVeiculo)));
        var cobertura = apolice.veiculos().get(0);
        assertThatThrownBy(() -> apolices.encerrarCobertura(apolice.id(), cobertura.id(), hoje.minusDays(1), null, null))
                .hasMessageContaining("por que o veículo saiu");
        assertThatThrownBy(() -> apolices.encerrarCobertura(apolice.id(), cobertura.id(), hoje.minusDays(1), MotivoEncerramentoCobertura.OUTRO, " "))
                .hasMessageContaining("Descreva o motivo");

        var encerrada = apolices.encerrarCobertura(apolice.id(), cobertura.id(), hoje.minusDays(1), MotivoEncerramentoCobertura.VENDA, null);
        assertThat(encerrada.veiculos().get(0).motivoEncerramentoRotulo()).isEqualTo("Venda do veículo");
        assertThat(apolices.coberturaVeiculos()).singleElement().satisfies(c -> {
            assertThat(c.cobertoHoje()).isFalse();
            assertThat(c.ultimaCoberturaAte()).isEqualTo(hoje.minusDays(1));
        });
    }

    @Test
    void apoliceCadastraASeguradoraEOCadastroNaoRepeteOFornecedor() {
        apolices.criar(apolice("700", hoje.minusMonths(1), hoje.plusMonths(11), List.of(idVeiculo)));

        var lista = seguradoras.listar();
        assertThat(lista).singleElement().satisfies(s -> {
            assertThat(s.idFornecedor()).isEqualTo(idSeguradora);
            assertThat(s.papel()).isEqualTo(PapelSeguradora.SEGURADORA);
            assertThat(s.nome()).isEqualTo("SEGURADORA TESTE");
            assertThat(s.apolicesVigentes()).isEqualTo(1);
        });
        assertThatThrownBy(() -> seguradoras.criar(new SeguradoraFrotaRequest(idSeguradora, PapelSeguradora.SEGURADORA, null, null)))
                .hasMessageContaining("já está cadastrado como seguradora");

        var corretora = seguradoras.criar(new SeguradoraFrotaRequest(idSeguradora, PapelSeguradora.CORRETORA, "(71) 3333-4444", null));
        assertThat(corretora.telefoneAssistencia()).isEqualTo("7133334444");
        assertThat(corretora.apolicesVigentes()).isZero();
        assertThatThrownBy(() -> seguradoras.criar(new SeguradoraFrotaRequest(idSeguradora, PapelSeguradora.CORRETORA, "123", null)))
                .isInstanceOf(InvarianteVioladaException.class);
    }

    @Test
    void sinistroPegaOCondutorDoMomentoEAOsDeReparoSegueOCiclo() {
        var ana = colaboradorComCnh("ANA", "52998224725", "12345678901");
        var inicio = OffsetDateTime.now().minusDays(2);
        vinculos.vincular(idVeiculo, new VincularCondutorRequest(ana, inicio, null));
        var apolice = apolices.criar(apolice("300", hoje.minusMonths(3), hoje.plusMonths(9), List.of(idVeiculo)));

        var ocorrido = OffsetDateTime.now().minusHours(3);
        var sinistro = sinistros.registrar(new SinistroRequest(idVeiculo, ocorrido, "BR-324, km 10", TipoSinistro.COLISAO_SEM_VITIMA,
                null, null, "Traseira batida no semáforo.", "Carro particular PLA1C23", "BO-555"));

        assertThat(sinistro.idCondutor()).as("quem dirigia no instante").isEqualTo(ana);
        assertThat(sinistro.condutor()).isEqualTo("ANA TESTE");
        assertThat(sinistro.situacao()).isEqualTo(SituacaoSinistro.RASCUNHO);
        assertThat(sinistro.baseOperacional()).isEqualTo("BASE SEGURO");
        assertThat(eventos.stream(FrotaSinistroRegistradoEvent.class)).singleElement().satisfies(e -> {
            assertThat(e.placa()).isEqualTo("SEG1A23");
            assertThat(e.tipo()).isEqualTo("Colisão sem vítima");
            assertThat(e.condutor()).isEqualTo("ANA TESTE");
        });

        var item = itens.criar(new ItemManutencaoRequest("FUNILARIA SINISTRO", NaturezaServico.SUSPENSAO_FREIOS, null, null)).id();
        var comOs = sinistros.abrirOrdemServico(sinistro.id(), new AbrirReparoSinistroRequest(TipoManutencao.CORRETIVA,
                Criticidade.ALTA, null, null, List.of(item), null, null, null, null, null, null, true));
        assertThat(comOs.situacao()).isEqualTo(SituacaoSinistro.EM_OFICINA);
        assertThat(comOs.reparo().aberta()).isTrue();
        assertThat(comOs.reparo().veiculoParado()).isTrue();
        var os = ordens.detalhar(comOs.reparo().idOrdemServico());
        assertThat(os.ordem().origem()).isEqualTo(OrigemOrdemServico.SINISTRO);
        assertThat(os.ordem().idVeiculo()).isEqualTo(idVeiculo);
        assertThat(os.ordem().idCondutor()).isEqualTo(ana);
        assertThat(os.ordem().descricao()).startsWith("Sinistro " + sinistro.numero() + " (colisão sem vítima)");
        assertThat(os.sinistro().numero()).isEqualTo(sinistro.numero());
        assertThatThrownBy(() -> sinistros.abrirOrdemServico(sinistro.id(), new AbrirReparoSinistroRequest(TipoManutencao.CORRETIVA,
                Criticidade.ALTA, null, "De novo", List.of(item), null, null, null, null, null, null, null)))
                .hasMessageContaining("já tem OS de reparo");

        var acionado = sinistros.acionarSeguradora(sinistro.id(), new AcionarSeguradoraRequest(apolice.id(), "SIN-9", null));
        assertThat(acionado.situacao()).isEqualTo(SituacaoSinistro.SEGURADORA_ACIONADA);
        assertThat(acionado.seguradora().seguradora()).isEqualTo("SEGURADORA TESTE");
        assertThat(acionado.podeFinalizar()).isFalse();
        assertThatThrownBy(() -> sinistros.finalizar(sinistro.id(), new BigDecimal("1500")))
                .hasMessageContaining("Conclua ou cancele a OS de reparo");

        ordens.cancelar(os.ordem().id(), "Reparo feito pela seguradora");
        var finalizado = sinistros.finalizar(sinistro.id(), new BigDecimal("1500"));
        assertThat(finalizado.situacao()).isEqualTo(SituacaoSinistro.FINALIZADO);
        assertThat(finalizado.franquiaPaga()).isEqualByComparingTo("1500");

        var resumo = sinistros.resumo(new SinistroFilter(idVeiculo, null, null, null, null, null, null, null, null));
        assertThat(resumo.quantidade()).isEqualTo(1);
        assertThat(resumo.porCondutor()).singleElement().satisfies(l -> assertThat(l.rotulo()).isEqualTo("ANA TESTE"));
        assertThat(resumo.franquiasPagas()).isEqualByComparingTo("1500");
    }

    @Test
    void osDeSinistroSoNascePeloSinistroEApoliceSoValeSeCobria() {
        var item = itens.criar(new ItemManutencaoRequest("FUNILARIA AVULSA", NaturezaServico.SUSPENSAO_FREIOS, null, null)).id();
        assertThatThrownBy(() -> ordens.abrir(new AbrirOrdemServicoRequest(idVeiculo, TipoManutencao.CORRETIVA, OrigemOrdemServico.SINISTRO,
                Criticidade.MEDIA, null, "Batida", List.of(item), null, null, null, null, null, null, null)))
                .hasMessageContaining("aberta pelo próprio sinistro");
        var manual = ordens.abrir(new AbrirOrdemServicoRequest(idVeiculo, TipoManutencao.CORRETIVA, OrigemOrdemServico.VERBAL,
                Criticidade.MEDIA, null, "Barulho", List.of(item), null, null, null, null, null, null, false));
        assertThatThrownBy(() -> ordens.editar(manual.ordem().id(), new EditarOrdemServicoRequest(TipoManutencao.CORRETIVA,
                OrigemOrdemServico.SINISTRO, Criticidade.MEDIA, null, "Barulho", List.of(item), null, null, null, null)))
                .hasMessageContaining("aberta pelo próprio sinistro");

        // A apólice começou depois do sinistro: não pode ser acionada.
        var apolice = apolices.criar(apolice("400", hoje, hoje.plusYears(1), List.of(idVeiculo)));
        var sinistro = sinistros.registrar(new SinistroRequest(idVeiculo, OffsetDateTime.now().minusDays(10), null, TipoSinistro.FURTO,
                null, null, "Estepe furtado no pátio.", null, null));
        assertThat(sinistro.idCondutor()).as("ninguém vinculado").isNull();
        assertThatThrownBy(() -> sinistros.acionarSeguradora(sinistro.id(), new AcionarSeguradoraRequest(apolice.id(), null, null)))
                .hasMessageContaining("não cobria o SEG1A23");

        var cancelado = sinistros.cancelar(sinistro.id(), "Estepe encontrado no almoxarifado");
        assertThat(cancelado.situacao()).isEqualTo(SituacaoSinistro.CANCELADO);
        assertThatThrownBy(() -> sinistros.cancelar(sinistro.id(), "De novo")).hasMessageContaining("está cancelado");
    }

    private ApoliceRequest apolice(String numero, LocalDate inicio, LocalDate fim, List<UUID> idsVeiculo) {
        return new ApoliceRequest(numero, idSeguradora, null, "EMPRESA", base.getId(), null, inicio, fim,
                new BigDecimal("1000.00"), new BigDecimal("2500.00"), null, idsVeiculo);
    }

    private UUID colaboradorComCnh(String nome, String cpf, String cnh) {
        var processo = processoRepository.save(new ProcessoNegocio("PROCESSO " + nome));
        var funcao = funcaoRepository.save(new Funcao("MOTORISTA " + nome, null));
        var colaborador = colaboradorRepository.save(new Colaborador(nome, "TESTE", nome + " TESTE", cpf,
                processo, base, funcao, LocalDate.of(2020, 1, 1)));
        condutores.registrarCnh(colaborador.getId(),
                new CondutorRequest(cnh, CategoriaCnh.D, LocalDate.now().plusYears(2), null, null));
        return colaborador.getId();
    }
}
