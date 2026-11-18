package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.estoque.EstoqueFrotaApi;
import com.nexo.app.modules.estoque.application.dto.EstoqueFilter;
import com.nexo.app.modules.estoque.application.dto.MaterialFilter;
import com.nexo.app.modules.estoque.domain.CondicaoMaterial;
import com.nexo.app.modules.estoque.domain.Estoque;
import com.nexo.app.modules.estoque.domain.Material;
import com.nexo.app.modules.estoque.domain.MovimentacaoEstoque;
import com.nexo.app.modules.estoque.domain.TipoEstoque;
import com.nexo.app.modules.estoque.infrastructure.persistence.EstoqueRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.EstoqueSpecification;
import com.nexo.app.modules.estoque.infrastructure.persistence.MaterialRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.MaterialSpecification;
import com.nexo.app.modules.estoque.infrastructure.persistence.TipoEstoqueRepository;
import com.nexo.app.modules.frota.application.dto.AbrirOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.AjusteEstoqueFrotaRequest;
import com.nexo.app.modules.frota.application.dto.AlmoxarifadoFrotaRequest;
import com.nexo.app.modules.frota.application.dto.DiagramaPneusRequest;
import com.nexo.app.modules.frota.application.dto.EntradaEstoqueFrotaRequest;
import com.nexo.app.modules.frota.application.dto.InspecaoPneuRequest;
import com.nexo.app.modules.frota.application.dto.ItemEntradaEstoqueFrotaRequest;
import com.nexo.app.modules.frota.application.dto.ItemManutencaoRequest;
import com.nexo.app.modules.frota.application.dto.ItemSaidaEstoqueFrotaRequest;
import com.nexo.app.modules.frota.application.dto.MovimentacaoPneusRequest;
import com.nexo.app.modules.frota.application.dto.MovimentacaoPneusRequest.Destino;
import com.nexo.app.modules.frota.application.dto.MovimentacaoPneusRequest.TipoDestino;
import com.nexo.app.modules.frota.application.dto.PecaFrotaRequest;
import com.nexo.app.modules.frota.application.dto.PecaOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.PneuRequest;
import com.nexo.app.modules.frota.application.dto.RetornoPneuRequest;
import com.nexo.app.modules.frota.application.dto.TransferenciaEstoqueFrotaRequest;
import com.nexo.app.modules.frota.application.dto.VeiculoFrotaRequest;
import com.nexo.app.modules.frota.domain.Combustivel;
import com.nexo.app.modules.frota.domain.Criticidade;
import com.nexo.app.modules.frota.domain.NaturezaServico;
import com.nexo.app.modules.frota.domain.OrigemOrdemServico;
import com.nexo.app.modules.frota.domain.OrigemPeca;
import com.nexo.app.modules.frota.domain.RegimeVeiculo;
import com.nexo.app.modules.frota.domain.SituacaoOperacional;
import com.nexo.app.modules.frota.domain.SituacaoPneu;
import com.nexo.app.modules.frota.domain.TipoEventoPneu;
import com.nexo.app.modules.frota.domain.TipoManutencao;
import com.nexo.app.modules.rh.domain.BaseOperacional;
import com.nexo.app.modules.rh.domain.CentroFaturamento;
import com.nexo.app.modules.rh.domain.ProcessoNegocio;
import com.nexo.app.modules.rh.infrastructure.persistence.BaseOperacionalRepository;
import com.nexo.app.modules.rh.infrastructure.persistence.CentroFaturamentoRepository;
import com.nexo.app.modules.rh.infrastructure.persistence.ProcessoNegocioRepository;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.transaction.BeforeTransaction;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Fase 4: estoque da oficina como tipo FROTA do estoque (isolado do operacional, com custo
 * médio e baixa pela OS) e o ciclo do pneu (diagrama, montagem, rodízio, reforma e inspeção).
 */
@SpringBootTest
@Transactional
class PneusEstoqueOficinaUseCasesTest {

    @Autowired
    private EstoqueOficinaFrotaUseCases oficina;
    @Autowired
    private EstoqueFrotaApi estoqueFrota;
    @Autowired
    private PneuUseCases pneus;
    @Autowired
    private MovimentacaoPneuUseCases montagem;
    @Autowired
    private InspecaoPneuUseCases inspecoes;
    @Autowired
    private OrdemServicoUseCases ordens;
    @Autowired
    private ExecucaoOrdemServicoUseCases execucao;
    @Autowired
    private ItemManutencaoUseCases itens;
    @Autowired
    private VeiculoFrotaUseCases veiculos;
    @Autowired
    private TipoEstoqueRepository tipos;
    @Autowired
    private EstoqueRepository estoques;
    @Autowired
    private MaterialRepository materiais;
    @Autowired
    private BaseOperacionalRepository baseRepository;
    @Autowired
    private CentroFaturamentoRepository centroRepository;
    @Autowired
    private ProcessoNegocioRepository processoRepository;
    @Autowired
    private EntityManager entityManager;
    @Autowired
    private JdbcTemplate jdbc;

    private BaseOperacional base;
    private UUID idVeiculo;
    private UUID almoxarifado;

    /** No Postgres os números vêm de sequências da migração; o H2 do teste cria as tabelas pelo JPA. */
    @BeforeTransaction
    void numerar() {
        jdbc.execute("CREATE SEQUENCE IF NOT EXISTS frota_os_numero_teste START WITH 1000");
        jdbc.execute("ALTER TABLE frota_ordens_servico ALTER COLUMN numero SET DEFAULT NEXT VALUE FOR frota_os_numero_teste");
        jdbc.execute("CREATE SEQUENCE IF NOT EXISTS frota_pneu_numero_teste START WITH 1");
        jdbc.execute("ALTER TABLE frota_pneus ALTER COLUMN numero SET DEFAULT NEXT VALUE FOR frota_pneu_numero_teste");
        jdbc.execute("ALTER TABLE event_publication ALTER COLUMN serialized_event SET DATA TYPE CLOB");
    }

    @BeforeEach
    void setUp() {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(UUID.randomUUID().toString(), null, List.of()));
        entityManager.createNativeQuery("""
                INSERT INTO frota_parametros (id, faixas_alerta_dias, limite_km_dia, limite_horas_dia, janela_repeticao_dias, limite_salto_km, sulco_minimo_mm, versao, data_criacao, ativo)
                VALUES ('00000000-0000-0000-0000-00000000f001', '30,15,7,0', 1500, 16, 90, 2000, 3.0, 0, CURRENT_TIMESTAMP, TRUE)
                """).executeUpdate();
        tipos.save(new TipoEstoque(Estoque.TIPO_FROTA));
        var centro = centroRepository.save(new CentroFaturamento("REGIONAL PNEU"));
        base = baseRepository.save(new BaseOperacional("BASE PNEU", "BA", "Rua P, 4", centro));
        idVeiculo = veiculos.criar(new VeiculoFrotaRequest("PNE1U23", "ACCELO", "MERCEDES", base.getId(), null, 2022, 2022,
                null, null, null, Combustivel.DIESEL_S10, new BigDecimal("150"), new BigDecimal("6"),
                SituacaoOperacional.ATIVO, RegimeVeiculo.PROPRIO, null, null, null, null, null, null, null)).idVeiculo();
        almoxarifado = oficina.criarAlmoxarifado(new AlmoxarifadoFrotaRequest("Oficina Base Pneu", base.getId())).id();
        entityManager.flush();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void estoqueDaFrotaNaoSeMisturaComOOperacional() {
        var fisico = estoques.save(new Estoque("ALMOX FISICO", tipos.save(new TipoEstoque("FISICO"))));
        var processo = processoRepository.save(new ProcessoNegocio("PROCESSO PNEU"));
        var cabo = materiais.save(new Material("CABO-10", "CABO 10MM", "M", null, null, null, false, processo.getId()));
        var filtro = oficina.criarPeca(new PecaFrotaRequest("FO-001", "Filtro de óleo", "un", "Filtros"));
        entityManager.flush();

        // As telas operacionais não enxergam o almoxarifado nem a peça da frota.
        assertThat(estoques.findAll(EstoqueSpecification.filterBy(new EstoqueFilter(null, null, null, null, null))))
                .extracting(Estoque::getId).contains(fisico.getId()).doesNotContain(almoxarifado);
        assertThat(materiais.findAll(MaterialSpecification.filterBy(new MaterialFilter(null, null, null, null, null, null, null, null))))
                .extracting(Material::getId).contains(cabo.getId()).doesNotContain(filtro.id());

        // E a frota não enxerga o catálogo operacional.
        assertThat(oficina.pecas(null, null, null, PageRequest.of(0, 50)).getContent()).extracting(EstoqueFrotaApi.Peca::id)
                .containsExactly(filtro.id());

        // Nenhuma movimentação cruza os dois lados.
        var pecaFrota = materiais.findById(filtro.id()).orElseThrow();
        var almox = estoques.findById(almoxarifado).orElseThrow();
        assertThatThrownBy(() -> new MovimentacaoEstoque(null, fisico, pecaFrota, BigDecimal.ONE,
                MovimentacaoEstoque.TipoMovimentacao.ENTRADA_AVULSA, CondicaoMaterial.NOVO, UUID.randomUUID(), null, null))
                .isInstanceOf(InvarianteVioladaException.class).hasMessageContaining("só movimenta nos almoxarifados da oficina");
        assertThatThrownBy(() -> new MovimentacaoEstoque(null, almox, cabo, BigDecimal.ONE,
                MovimentacaoEstoque.TipoMovimentacao.ENTRADA_AVULSA, CondicaoMaterial.NOVO, UUID.randomUUID(), null, null))
                .isInstanceOf(InvarianteVioladaException.class).hasMessageContaining("só movimenta peças da oficina");
        assertThatThrownBy(() -> oficina.entrada(entrada(almoxarifado, cabo.getId(), "1", "10")))
                .hasMessageContaining("Peça da frota não encontrada");
        assertThatThrownBy(() -> oficina.entrada(entrada(fisico.getId(), filtro.id(), "1", "10")))
                .hasMessageContaining("Almoxarifado da frota não encontrado");
    }

    @Test
    void custoMedioPonderadoAcompanhaEntradasSaidasTransferenciasEAjuste() {
        var oleo = oficina.criarPeca(new PecaFrotaRequest("OL-15W40", "Óleo 15W40", "L", "Lubrificantes")).id();
        var outro = oficina.criarAlmoxarifado(new AlmoxarifadoFrotaRequest("Oficina Reserva", null)).id();

        oficina.entrada(entrada(almoxarifado, oleo, "10", "10.00"));
        oficina.entrada(entrada(almoxarifado, oleo, "10", "20.00"));
        assertThat(saldo(almoxarifado, oleo).custoMedio()).isEqualByComparingTo("15");
        assertThat(saldo(almoxarifado, oleo).valorTotal()).isEqualByComparingTo("300.00");

        oficina.transferencia(new TransferenciaEstoqueFrotaRequest(almoxarifado, outro, null,
                List.of(new ItemSaidaEstoqueFrotaRequest(oleo, new BigDecimal("4")))));
        assertThat(saldo(outro, oleo).quantidade()).isEqualByComparingTo("4");
        assertThat(saldo(outro, oleo).custoMedio()).as("a transferência leva o custo").isEqualByComparingTo("15");

        oficina.definirParametros(almoxarifado, oleo, new com.nexo.app.modules.frota.application.dto.ParametrosPecaFrotaRequest(
                new BigDecimal("20"), "Prateleira A2"));
        assertThat(saldo(almoxarifado, oleo).abaixoMinimo()).isTrue();
        assertThat(saldo(almoxarifado, oleo).localizacao()).isEqualTo("Prateleira A2");

        var ajuste = oficina.ajuste(new AjusteEstoqueFrotaRequest(almoxarifado, oleo, new BigDecimal("15"), "Contagem de outubro"));
        assertThat(ajuste.tipo()).isEqualTo("AJUSTE");
        assertThat(ajuste.quantidade()).isEqualByComparingTo("1");
        assertThat(saldo(almoxarifado, oleo).quantidade()).isEqualByComparingTo("15");

        assertThatThrownBy(() -> oficina.transferencia(new TransferenciaEstoqueFrotaRequest(outro, almoxarifado, null,
                List.of(new ItemSaidaEstoqueFrotaRequest(oleo, new BigDecimal("5"))))))
                .hasMessageContaining("Saldo insuficiente");
        var resumo = oficina.resumo(almoxarifado);
        assertThat(resumo.abaixoMinimo()).isEqualTo(1);
        assertThat(resumo.entradas()).isEqualByComparingTo("300.00");
    }

    @Test
    void pecaDoEstoqueNaOsDaBaixaPeloCustoMedioEVoltaAoSairDaOs() {
        var pastilha = oficina.criarPeca(new PecaFrotaRequest("PD-10", "Pastilha dianteira", "JG", "Freios")).id();
        oficina.entrada(entrada(almoxarifado, pastilha, "3", "120.00"));
        var item = itens.criar(new ItemManutencaoRequest("FREIO PNEU", NaturezaServico.SUSPENSAO_FREIOS, null, null)).id();
        var os = ordens.abrir(new AbrirOrdemServicoRequest(idVeiculo, TipoManutencao.CORRETIVA, OrigemOrdemServico.VERBAL,
                Criticidade.MEDIA, null, "Troca de pastilha", List.of(item), null, null, null, null, null, null, false)).ordem().id();

        var detalhe = execucao.lancarPeca(os, new PecaOrdemServicoRequest("ignorado", null, OrigemPeca.ESTOQUE, new BigDecimal("2"),
                "UN", null, pastilha, almoxarifado));
        assertThat(detalhe.pecas()).singleElement().satisfies(p -> {
            assertThat(p.descricao()).isEqualTo("Pastilha dianteira");
            assertThat(p.valorUnitario()).isEqualByComparingTo("120");
            assertThat(p.subtotal()).isEqualByComparingTo("240.00");
            assertThat(p.baixadaNoEstoque()).isTrue();
            assertThat(p.estoque()).isEqualTo("OFICINA BASE PNEU");
        });
        assertThat(saldo(almoxarifado, pastilha).quantidade()).isEqualByComparingTo("1");

        assertThatThrownBy(() -> execucao.lancarPeca(os, new PecaOrdemServicoRequest("x", null, OrigemPeca.ESTOQUE, new BigDecimal("2"),
                "UN", null, pastilha, almoxarifado))).hasMessageContaining("Saldo insuficiente");

        var idPeca = detalhe.pecas().get(0).id();
        execucao.excluirPeca(os, idPeca);
        assertThat(saldo(almoxarifado, pastilha).quantidade()).isEqualByComparingTo("3");
        assertThat(oficina.movimentos(new com.nexo.app.modules.frota.application.dto.MovimentoEstoqueFrotaFilter(almoxarifado, pastilha,
                null, null, List.of("SAIDA"), null, null, null), PageRequest.of(0, 10)).getContent())
                .singleElement().satisfies(m -> {
                    assertThat(m.estornado()).isTrue();
                    assertThat(m.placa()).isEqualTo("PNE1U23");
                    assertThat(m.idOrdemServico()).isEqualTo(os);
                });
    }

    @Test
    void cicloDoPneuComDiagramaRodizioReformaEInspecao() {
        var a = pneus.cadastrar(pneu("A1", "800")).id();
        var b = pneus.cadastrar(pneu("B2", "800")).id();
        assertThatThrownBy(() -> pneus.cadastrar(pneu("a1", "800"))).hasMessageContaining("marca de fogo A1");

        assertThatThrownBy(() -> montagem.movimentar(mov(1000L, new Destino(a, TipoDestino.POSICAO, "1E", null, null, null))))
                .hasMessageContaining("Defina o diagrama");
        var veiculo = montagem.definirDiagrama(idVeiculo, new DiagramaPneusRequest("S,D", 1));
        assertThat(veiculo.posicoes()).extracting(p -> p.codigo()).containsExactly("1E", "1D", "2EE", "2EI", "2DI", "2DE", "S1");

        montagem.movimentar(mov(1000L, new Destino(a, TipoDestino.POSICAO, "1E", null, null, null),
                new Destino(b, TipoDestino.POSICAO, "1D", null, null, null)));
        assertThatThrownBy(() -> montagem.definirDiagrama(idVeiculo, new DiagramaPneusRequest("D", 0)))
                .hasMessageContaining("Desmonte o pneu antes");

        // Rodízio: troca as duas posições de uma vez, somando o km rodado.
        veiculo = montagem.movimentar(mov(3000L, new Destino(a, TipoDestino.POSICAO, "1D", null, null, null),
                new Destino(b, TipoDestino.POSICAO, "1E", null, null, null)));
        assertThat(veiculo.posicoes().get(0).pneu().marcaFogo()).isEqualTo("B2");
        assertThat(veiculo.posicoes().get(1).pneu().marcaFogo()).isEqualTo("A1");
        assertThat(pneus.buscar(a).kmVida()).isEqualTo(2000);
        assertThat(pneus.historico(a)).extracting(e -> e.tipo()).contains(TipoEventoPneu.RODIZIO, TipoEventoPneu.MONTAGEM);

        // Posição ocupada por pneu que fica: recusa.
        var c = pneus.cadastrar(pneu("C3", "900")).id();
        assertThatThrownBy(() -> montagem.movimentar(mov(3000L, new Destino(c, TipoDestino.POSICAO, "1E", null, null, null))))
                .hasMessageContaining("já tem o pneu B2");

        // Inspeção: sulco no mínimo vira alerta.
        inspecoes.registrar(new InspecaoPneuRequest(idVeiculo, null, 3000, null, null, List.of(
                new InspecaoPneuRequest.Item(a, 80, new BigDecimal("2.5"), null),
                new InspecaoPneuRequest.Item(b, 110, new BigDecimal("9.0"), null))));
        assertThat(pneus.buscar(a).alertas()).contains("SULCO_BAIXO", "PRESSAO_FORA");
        assertThat(pneus.buscar(b).alertas()).isEmpty();

        // Sai para reforma e volta numa vida nova.
        montagem.movimentar(mov(5000L, new Destino(a, TipoDestino.REFORMA, null, null, null, null),
                new Destino(c, TipoDestino.POSICAO, "1D", null, null, null)));
        assertThat(pneus.buscar(a).situacao()).isEqualTo(SituacaoPneu.EM_REFORMA);
        assertThat(pneus.buscar(a).kmVida()).isEqualTo(4000);
        assertThatThrownBy(() -> pneus.retornar(a, new RetornoPneuRequest(almoxarifado, new BigDecimal("450"), null, "NF 9", null, null, null)))
                .hasMessageContaining("sulco do pneu reformado");
        var reformado = pneus.retornar(a, new RetornoPneuRequest(almoxarifado, new BigDecimal("450"), null, "NF 9", new BigDecimal("14"), null, null));
        assertThat(reformado.vida()).isEqualTo(1);
        assertThat(reformado.kmVida()).isZero();
        assertThat(reformado.kmTotal()).isEqualTo(4000);
        assertThat(reformado.custoTotal()).isEqualByComparingTo("1250.00");
        assertThat(reformado.custoPorKm()).isEqualByComparingTo("0.3125");
        assertThat(reformado.alertas()).isEmpty();
        assertThat(reformado.estoque()).isEqualTo("OFICINA BASE PNEU");
    }

    private EstoqueFrotaApi.SaldoPeca saldo(UUID estoque, UUID material) {
        return oficina.saldos(estoque).stream().filter(s -> s.idMaterial().equals(material)).findFirst().orElseThrow();
    }

    private static EntradaEstoqueFrotaRequest entrada(UUID estoque, UUID material, String quantidade, String valor) {
        return new EntradaEstoqueFrotaRequest(estoque, EstoqueFrotaApi.Motivo.COMPRA, "NF 123", null, null, null,
                List.of(new ItemEntradaEstoqueFrotaRequest(material, new BigDecimal(quantidade), new BigDecimal(valor))));
    }

    private PneuRequest pneu(String marcaFogo, String valor) {
        return new PneuRequest(marcaFogo, null, "Goodyear", "G686", 215, 75, "17.5", true, false, "126", "M", 16, "2324",
                null, null, null, new BigDecimal(valor), new BigDecimal("12"), 100, null, null, null, null, almoxarifado);
    }

    private MovimentacaoPneusRequest mov(Long km, Destino... destinos) {
        return new MovimentacaoPneusRequest(idVeiculo, null, km, null, List.of(destinos));
    }
}
