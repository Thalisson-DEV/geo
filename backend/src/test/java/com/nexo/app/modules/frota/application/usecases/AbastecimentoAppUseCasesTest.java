package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.FrotaOdometroApi;
import com.nexo.app.modules.frota.application.dto.CondutorRequest;
import com.nexo.app.modules.frota.application.dto.ModeloChecklistRequest;
import com.nexo.app.modules.frota.application.dto.ModeloChecklistResponse;
import com.nexo.app.modules.frota.application.dto.PostoAbastecimentoRequest;
import com.nexo.app.modules.frota.application.dto.ProdutoAbastecimentoRequest;
import com.nexo.app.modules.frota.application.dto.RealizarAbastecimentoRequest;
import com.nexo.app.modules.frota.application.dto.RegistrarChecklistRequest;
import com.nexo.app.modules.frota.application.dto.SolicitarAbastecimentoRequest;
import com.nexo.app.modules.frota.application.dto.VeiculoFrotaRequest;
import com.nexo.app.modules.frota.domain.CategoriaCnh;
import com.nexo.app.modules.frota.domain.CategoriaProdutoAbastecimento;
import com.nexo.app.modules.frota.domain.Combustivel;
import com.nexo.app.modules.frota.domain.RegimeVeiculo;
import com.nexo.app.modules.frota.domain.SituacaoAbastecimento;
import com.nexo.app.modules.frota.domain.SituacaoOperacional;
import com.nexo.app.modules.frota.domain.TipoAlertaAbastecimento;
import com.nexo.app.modules.frota.domain.TipoModeloChecklist;
import com.nexo.app.modules.frota.domain.TipoRespostaChecklist;
import com.nexo.app.modules.frota.domain.UnidadeProdutoAbastecimento;
import com.nexo.app.modules.frota.infrastructure.persistence.AbastecimentoRepository;
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
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.infrastructure.storage.ObjectStorageService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import com.nexo.app.modules.iam.ContextoAudienciaUsuario;
import com.nexo.app.modules.iam.UsuarioApi;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Caminho real do abastecimento pelo app: regras do pedido, reenvio, cancelamento, realizado e alertas. */
@SpringBootTest
@Transactional
class AbastecimentoAppUseCasesTest {

    @Autowired
    private AbastecimentoAppUseCases useCases;
    @Autowired
    private AbastecimentoRepository repository;
    @Autowired
    private AbastecimentoUseCases web;
    @Autowired
    private AprovacaoAbastecimentoAppUseCases aprovacoesApp;
    @Autowired
    private FaturaPostoUseCases faturas;
    @Autowired
    private com.nexo.app.modules.frota.infrastructure.persistence.CarteiraAprovacaoRepository carteiraRepository;
    @Autowired
    private ChecklistAppUseCases checklists;
    @Autowired
    private ModeloChecklistUseCases modelos;
    @Autowired
    private VeiculoFrotaUseCases veiculos;
    @Autowired
    private CondutorUseCases condutores;
    @Autowired
    private PostoAbastecimentoUseCases postos;
    @Autowired
    private ProdutoAbastecimentoUseCases produtos;
    @Autowired
    private FrotaOdometroApi odometro;
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
    @MockitoBean
    private ObjectStorageService objectStorage;
    @MockitoSpyBean
    private UsuarioApi usuarioApi;

    private BaseOperacional base;
    private UUID idVeiculo;
    private UUID ana;
    private UUID idPosto;
    private UUID diesel;
    private UUID arla;
    private ModeloChecklistResponse modelo;

    @BeforeEach
    void setUp() {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(UUID.randomUUID().toString(), null, List.of()));
        // No H2 a tabela de eventos nasce do ddl-auto com 255 caracteres; em produção é TEXT (V7).
        entityManager.createNativeQuery("ALTER TABLE event_publication ALTER COLUMN serialized_event SET DATA TYPE CLOB").executeUpdate();
        entityManager.createNativeQuery("""
                INSERT INTO frota_parametros (id, faixas_alerta_dias, limite_km_dia, limite_horas_dia, janela_repeticao_dias, limite_salto_km, versao, data_criacao, ativo)
                VALUES ('00000000-0000-0000-0000-00000000f001', '30,15,7,0', 1500, 16, 90, 2000, 0, CURRENT_TIMESTAMP, TRUE)
                """).executeUpdate();
        var centro = centroRepository.save(new CentroFaturamento("REGIONAL TESTE"));
        base = baseRepository.save(new BaseOperacional("BASE ABASTECIMENTO", "BA", "Rua A, 1", centro));
        idVeiculo = veiculos.criar(new VeiculoFrotaRequest("ABS1A23", "HILUX", "TOYOTA", base.getId(), null, 2024, 2025,
                null, null, null, Combustivel.DIESEL_S10, new BigDecimal("80"), new BigDecimal("9"),
                SituacaoOperacional.ATIVO, RegimeVeiculo.PROPRIO, null, null, null, null, null, null, null)).idVeiculo();
        modelo = modelos.criar(new ModeloChecklistRequest("Geral abastecimento", TipoModeloChecklist.PRINCIPAL, null, false, Set.of(), Set.of(),
                List.of(new ModeloChecklistRequest.Pergunta(null, null, "Faróis", TipoRespostaChecklist.OK_NOK, false, null, null, List.of())),
                List.of()));
        idPosto = postos.criar(new PostoAbastecimentoRequest("Posto Teste", null, base.getId(), "74999990000", null, null)).id();
        diesel = produtos.criar(new ProdutoAbastecimentoRequest("Diesel S10 teste", CategoriaProdutoAbastecimento.COMBUSTIVEL,
                UnidadeProdutoAbastecimento.L, Combustivel.DIESEL_S10)).id();
        arla = produtos.criar(new ProdutoAbastecimentoRequest("ARLA teste", CategoriaProdutoAbastecimento.ARLA,
                UnidadeProdutoAbastecimento.L, null)).id();
        ana = colaboradorComCnh();
        entityManager.flush();
        entityManager.createNativeQuery("UPDATE frota_checklist_perguntas SET data_criacao = data_criacao - INTERVAL '1' DAY").executeUpdate();
        entityManager.clear();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void pedidoExigeChecklistDoDiaEUmPorVez() {
        assertThatThrownBy(() -> useCases.solicitar(pedido(UUID.randomUUID(), UUID.randomUUID())))
                .isInstanceOf(InvarianteVioladaException.class).hasMessageContaining("ainda não tem checklist hoje");

        fazerChecklist();
        var idAparelho = UUID.randomUUID();
        var foto = UUID.randomUUID();
        var pedido = useCases.solicitar(pedido(idAparelho, foto));
        assertThat(pedido.situacao()).isEqualTo(SituacaoAbastecimento.AGUARDANDO_APROVACAO);
        assertThat(pedido.itens()).extracting(i -> i.produtoPedido()).containsExactly("Diesel S10 teste", "ARLA teste");
        assertThat(pedido.fotosPendentes()).containsExactly(foto);
        assertThat(pedido.podeCancelar()).isTrue();
        assertThat(pedido.fotos()).singleElement().satisfies(f -> {
            assertThat(f.idFoto()).isEqualTo(foto);
            assertThat(f.tipoRotulo()).isEqualTo("Painel antes");
            assertThat(f.recebida()).isFalse();
        });
        assertThatThrownBy(() -> useCases.baixarFoto(idAparelho, foto)).hasMessageContaining("ainda não chegou");
        // Outra pessoa, de outra equipe e sem a permissão de liberar, não vê a foto.
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(UUID.randomUUID().toString(), null, List.of()));
        assertThatThrownBy(() -> useCases.baixarFoto(idAparelho, foto)).hasMessageContaining("Abastecimento não encontrado");

        assertThat(useCases.solicitar(pedido(idAparelho, foto)).id()).as("reenvio").isEqualTo(pedido.id());
        assertThatThrownBy(() -> useCases.solicitar(pedido(UUID.randomUUID(), UUID.randomUUID())))
                .hasMessageContaining("já tem um abastecimento aguardando aprovação");
    }

    @Test
    void quemPediuCancelaAntesDaLiberacaoEOVeiculoAceitaOutro() {
        fazerChecklist();
        var idAparelho = UUID.randomUUID();
        useCases.solicitar(pedido(idAparelho, UUID.randomUUID()));
        var cancelado = useCases.cancelar(idAparelho, null);
        assertThat(cancelado.situacao()).isEqualTo(SituacaoAbastecimento.CANCELADA);
        assertThat(cancelado.podeCancelar()).isFalse();
        assertThat(useCases.solicitar(pedido(UUID.randomUUID(), UUID.randomUUID())).situacao())
                .isEqualTo(SituacaoAbastecimento.AGUARDANDO_APROVACAO);
    }

    @Test
    void usuarioDeCampoCancelaAprovadoMasNaoOLiberado() {
        fazerChecklist();
        // Aprovado pelo gestor, ainda não liberado: quem pediu (sem a permissão de liberar) cancela.
        var aprovado = UUID.randomUUID();
        var pedido = useCases.solicitar(pedido(aprovado, UUID.randomUUID()));
        var a = repository.findById(pedido.id()).orElseThrow();
        a.aprovar(UUID.randomUUID(), quantidades(a), OffsetDateTime.now());
        repository.saveAndFlush(a);
        assertThat(useCases.meus()).filteredOn(p -> p.idAparelho().equals(aprovado)).singleElement()
                .satisfies(p -> assertThat(p.podeCancelar()).isTrue());
        assertThat(useCases.cancelar(aprovado, null).situacao()).isEqualTo(SituacaoAbastecimento.CANCELADA);

        // Liberado: o usuário de campo já não cancela; só o administrativo, com motivo.
        var liberado = UUID.randomUUID();
        var outro = useCases.solicitar(pedido(liberado, UUID.randomUUID()));
        aprovarELiberar(outro.id());
        assertThat(useCases.meus()).filteredOn(p -> p.idAparelho().equals(liberado)).singleElement()
                .satisfies(p -> assertThat(p.podeCancelar()).isFalse());
        assertThatThrownBy(() -> useCases.cancelar(liberado, null)).hasMessageContaining("Peça o cancelamento ao administrativo");
        comPermissaoDeLiberar();
        assertThat(useCases.cancelar(liberado, "Veículo foi para a oficina").situacao()).isEqualTo(SituacaoAbastecimento.CANCELADA);
    }

    @Test
    void realizadoGravaLeituraEAlertaVolumeAcimaDoTanque() {
        fazerChecklist();
        var idAparelho = UUID.randomUUID();
        var pedido = useCases.solicitar(pedido(idAparelho, UUID.randomUUID()));
        aprovarELiberar(pedido.id());

        var itemDiesel = pedido.itens().get(0).id();
        var itemArla = pedido.itens().get(1).id();
        var realizado = useCases.realizar(idAparelho, new RealizarAbastecimentoRequest(new BigDecimal("15120"),
                OffsetDateTime.now().minusMinutes(5), List.of(
                new RealizarAbastecimentoRequest.Item(itemDiesel, null, new BigDecimal("95"), new BigDecimal("570"), true),
                new RealizarAbastecimentoRequest.Item(itemArla, null, new BigDecimal("10"), new BigDecimal("42"), null)),
                UUID.randomUUID(), UUID.randomUUID()));
        entityManager.flush();

        assertThat(realizado.situacao()).isEqualTo(SituacaoAbastecimento.REALIZADA);
        assertThat(realizado.itens().getFirst().valorUnitario()).isEqualByComparingTo("6.000");
        assertThat(realizado.fotosPendentes()).hasSize(3);
        assertThat(odometro.kmAtual(idVeiculo)).contains(15_120L);
        assertThat(repository.findById(pedido.id()).orElseThrow().getAlertas())
                .extracting(a -> a.getTipo()).contains(TipoAlertaAbastecimento.VOLUME_ACIMA_TANQUE);
        assertThat(useCases.realizar(idAparelho, new RealizarAbastecimentoRequest(new BigDecimal("15120"),
                OffsetDateTime.now(), List.of(new RealizarAbastecimentoRequest.Item(itemDiesel, null, BigDecimal.ONE, BigDecimal.ONE, true)),
                UUID.randomUUID(), UUID.randomUUID())).id()).as("reenvio do realizado").isEqualTo(pedido.id());
    }

    @Test
    void mesmaFotoEmOutroAbastecimentoViraAlerta() {
        fazerChecklist();
        var primeiro = UUID.randomUUID();
        var fotoPrimeiro = UUID.randomUUID();
        useCases.solicitar(pedido(primeiro, fotoPrimeiro));
        var arquivo = new MockMultipartFile("arquivo", "painel.jpg", "image/jpeg", new byte[]{9, 8, 7});
        useCases.enviarFoto(primeiro, fotoPrimeiro, arquivo);
        useCases.cancelar(primeiro, null);

        var segundo = UUID.randomUUID();
        var fotoSegundo = UUID.randomUUID();
        var pedido = useCases.solicitar(pedido(segundo, fotoSegundo));
        useCases.enviarFoto(segundo, fotoSegundo, arquivo);
        entityManager.flush();

        assertThat(repository.findById(pedido.id()).orElseThrow().getAlertas())
                .extracting(a -> a.getTipo()).containsExactly(TipoAlertaAbastecimento.FOTO_REPETIDA);
    }

    @Test
    void aprovacaoSoPelaCarteiraELiberacaoGeraAvisoComAtalho() {
        fazerChecklist();
        var pedido = useCases.solicitar(pedido(UUID.randomUUID(), UUID.randomUUID()));
        comoTipo("ADMINISTRATIVO");
        assertThatThrownBy(() -> web.aprovar(pedido.id(), quantidades(pedido.id()))).hasMessageContaining("não está na sua carteira");
        assertThat(web.listar(new com.nexo.app.modules.frota.application.dto.AbastecimentoFilter("APROVAR", null, null, null, null, null,
                null, null, null, null), org.springframework.data.domain.PageRequest.of(0, 10)).getContent()).as("sem carteira, fila vazia").isEmpty();

        var carteira = new com.nexo.app.modules.frota.domain.CarteiraAprovacao(com.nexo.app.shared.infrastructure.security.SecurityUtils.getUsuarioLogadoId());
        carteira.incluirPlacas(List.of(idVeiculo));
        carteiraRepository.saveAndFlush(carteira);

        // O usuário de campo só pede: mesmo com a placa na carteira, não vê a fila nem aprova.
        comoTipo("CAMPO");
        assertThatThrownBy(() -> web.aprovar(pedido.id(), quantidades(pedido.id()))).hasMessageContaining("é do administrativo");
        assertThatThrownBy(() -> aprovacoesApp.fila()).hasMessageContaining("é do administrativo");
        assertThat(web.listar(new com.nexo.app.modules.frota.application.dto.AbastecimentoFilter("APROVAR", null, null, null, null, null,
                null, null, null, null), org.springframework.data.domain.PageRequest.of(0, 10)).getContent()).as("campo, fila vazia").isEmpty();

        comoTipo("ADMINISTRATIVO");
        assertThat(aprovacoesApp.fila()).singleElement().satisfies(l -> assertThat(l.id()).isEqualTo(pedido.id()));
        assertThat(web.listar(new com.nexo.app.modules.frota.application.dto.AbastecimentoFilter("APROVAR", null, null, null, null, null,
                null, null, null, null), org.springframework.data.domain.PageRequest.of(0, 10)).getContent()).singleElement()
                .satisfies(l -> assertThat(l.itens()).as("a equipe pede só os produtos").isEqualTo("Diesel S10 teste, ARLA teste"));
        assertThat(web.aprovar(pedido.id(), quantidades(pedido.id())).situacao()).isEqualTo(SituacaoAbastecimento.APROVADA);

        // Acompanhamento no celular: o aprovado segue na carteira, fora dos pendentes.
        var pagina = org.springframework.data.domain.PageRequest.of(0, 10);
        assertThat(aprovacoesApp.carteira(null, null, null, null, pagina).getContent()).singleElement()
                .satisfies(l -> assertThat(l.situacao()).isEqualTo(SituacaoAbastecimento.APROVADA));
        assertThat(aprovacoesApp.carteira(List.of(SituacaoAbastecimento.AGUARDANDO_APROVACAO), null, null, null, pagina).getContent()).isEmpty();
        comoTipo("CAMPO");
        assertThatThrownBy(() -> aprovacoesApp.carteira(null, null, null, null, pagina)).hasMessageContaining("é do administrativo");
        comoTipo("ADMINISTRATIVO");

        comPermissaoDeLiberar();
        var liberado = web.liberar(pedido.id(), null);
        assertThat(liberado.situacao()).isEqualTo(SituacaoAbastecimento.LIBERADA);
        assertThat(liberado.avisos()).singleElement().satisfies(aviso -> {
            assertThat(aviso.situacao()).isEqualTo("PENDENTE");
            assertThat(aviso.mensagem()).contains("placa ABS1A23", "ANA", "Diesel S10 teste 60 l");
            assertThat(aviso.linkWhatsapp()).startsWith("https://wa.me/5574999990000?text=Abastecimento%20liberado");
        });
        var aberto = web.marcarAvisoAberto(pedido.id(), liberado.avisos().getFirst().id());
        assertThat(aberto.avisos().getFirst().situacao()).isEqualTo("ENVIADO");

        assertThatThrownBy(() -> web.cancelar(pedido.id(), null)).hasMessageContaining("motivo");
        var cancelado = web.cancelar(pedido.id(), "Veículo quebrou antes do posto");
        assertThat(cancelado.situacao()).isEqualTo(SituacaoAbastecimento.CANCELADA);
        assertThat(cancelado.avisos()).extracting(a -> a.motivo()).containsExactly("LIBERACAO", "CANCELAMENTO");
    }

    @Test
    void liberadoNaoUsadoVenceNaMeiaNoiteEAvisaOPosto() {
        fazerChecklist();
        var pedido = useCases.solicitar(pedido(UUID.randomUUID(), UUID.randomUUID()));
        aprovarELiberar(pedido.id());
        comPermissaoDeLiberar();
        var amanha = OffsetDateTime.now().plusDays(1);
        assertThat(web.vencer(OffsetDateTime.now())).as("ainda é hoje").isZero();
        assertThat(web.vencer(amanha)).isEqualTo(1);
        var vencido = web.detalhar(pedido.id());
        assertThat(vencido.situacao()).isEqualTo(SituacaoAbastecimento.VENCIDA);
        assertThat(vencido.avisos()).extracting(a -> a.motivo()).containsExactly("CANCELAMENTO");
        assertThat(useCases.solicitar(pedido(UUID.randomUUID(), UUID.randomUUID())).situacao())
                .as("o veículo aceita outro pedido").isEqualTo(SituacaoAbastecimento.AGUARDANDO_APROVACAO);
    }

    @Test
    void faturaConferidaVaiAoFinanceiroComOsAbastecimentos() {
        fazerChecklist();
        var idAparelho = UUID.randomUUID();
        var pedido = useCases.solicitar(pedido(idAparelho, UUID.randomUUID()));
        aprovarELiberar(pedido.id());
        useCases.realizar(idAparelho, new RealizarAbastecimentoRequest(new BigDecimal("15120"), OffsetDateTime.now().minusMinutes(5),
                List.of(new RealizarAbastecimentoRequest.Item(pedido.itens().get(0).id(), null, new BigDecimal("60"), new BigDecimal("360"), true),
                        new RealizarAbastecimentoRequest.Item(pedido.itens().get(1).id(), null, BigDecimal.ZERO, BigDecimal.ZERO, null)),
                UUID.randomUUID(), UUID.randomUUID()));
        entityManager.flush();

        var hoje = java.time.LocalDate.now(com.nexo.app.modules.frota.domain.Abastecimento.FUSO);
        var fatura = faturas.criar(new com.nexo.app.modules.frota.application.dto.FaturaPostoRequest(idPosto, "NF 123",
                hoje.minusDays(1), hoje, new BigDecimal("410")));
        assertThatThrownBy(() -> faturas.preenchimentoFinanceiro(fatura.id())).hasMessageContaining("Confira");
        var conferencia = faturas.conferencia(fatura.id());
        assertThat(conferencia.abastecimentos()).singleElement().satisfies(c -> {
            assertThat(c.incluido()).isFalse();
            assertThat(c.valor()).isEqualByComparingTo("360");
        });

        var conferida = faturas.conferir(fatura.id(), List.of(pedido.id()));
        assertThat(conferida.quantidadeAbastecimentos()).isEqualTo(1);
        assertThat(conferida.diferenca()).as("posto cobrou R$ 50 a mais").isEqualByComparingTo("50");

        var preenchimento = faturas.preenchimentoFinanceiro(fatura.id());
        assertThat(preenchimento.origemTipo()).isEqualTo("FROTA_FATURA_POSTO");
        assertThat(preenchimento.valores()).containsEntry("valor", new BigDecimal("410.00"));
        assertThat((String) preenchimento.valores().get("descricao")).contains("Fatura NF 123", "ABS1A23", "Diesel S10 teste 60 l");

        faturas.vincular(new com.nexo.app.shared.domain.events.SolicitacaoFinanceiraCriadaEvent(UUID.randomUUID(), "PAGAMENTO",
                "FROTA_FATURA_POSTO", fatura.id()));
        assertThat(faturas.listar(idPosto, null, org.springframework.data.domain.PageRequest.of(0, 5)).getContent())
                .singleElement().extracting(f -> f.situacao())
                .isEqualTo(com.nexo.app.modules.frota.domain.FaturaPosto.Situacao.ENVIADA_AO_FINANCEIRO);
    }

    private void comoTipo(String tipo) {
        var id = com.nexo.app.shared.infrastructure.security.SecurityUtils.getUsuarioLogadoId();
        org.mockito.Mockito.doReturn(java.util.Optional.of(new ContextoAudienciaUsuario(id, null, tipo)))
                .when(usuarioApi).buscarContextoAudiencia(id);
    }

    private void comPermissaoDeLiberar() {
        var atual = SecurityContextHolder.getContext().getAuthentication();
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(atual.getPrincipal(), null,
                List.of(new org.springframework.security.core.authority.SimpleGrantedAuthority("frota:abastecimento:liberar"))));
    }

    private void aprovarELiberar(UUID id) {
        var a = repository.findById(id).orElseThrow();
        a.aprovar(UUID.randomUUID(), quantidades(a), OffsetDateTime.now());
        a.liberar(UUID.randomUUID(), null, null, OffsetDateTime.now());
        repository.saveAndFlush(a);
    }

    private void fazerChecklist() {
        var farois = modelo.perguntas().getFirst();
        checklists.registrar(new RegistrarChecklistRequest(UUID.randomUUID(), idVeiculo, modelo.id(), null, null, ana,
                OffsetDateTime.now().minusHours(1), 15_000L, null, null,
                List.of(new RegistrarChecklistRequest.Resposta(farois.id(), true, null, null, null, null)), null));
        entityManager.flush();
    }

    private SolicitarAbastecimentoRequest pedido(UUID idAparelho, UUID idFoto) {
        return new SolicitarAbastecimentoRequest(idAparelho, idVeiculo, ana, idPosto, new BigDecimal("15050"), "Juazeiro → Sobradinho",
                null, OffsetDateTime.now().minusMinutes(10), List.of(
                new SolicitarAbastecimentoRequest.Item(diesel),
                new SolicitarAbastecimentoRequest.Item(arla)), idFoto);
    }

    /** O aprovador define 60 l de combustível e 20 l do resto. */
    private static java.util.Map<UUID, BigDecimal> quantidades(com.nexo.app.modules.frota.domain.Abastecimento a) {
        return a.getItens().stream().collect(java.util.stream.Collectors.toMap(i -> i.getId(),
                i -> new BigDecimal(i.getProdutoPedido().isCombustivel() ? "60" : "20")));
    }

    private java.util.Map<UUID, BigDecimal> quantidades(UUID idAbastecimento) {
        return quantidades(repository.findById(idAbastecimento).orElseThrow());
    }

    private UUID colaboradorComCnh() {
        var processo = processoRepository.save(new ProcessoNegocio("PROCESSO ABAST"));
        var funcao = funcaoRepository.save(new Funcao("MOTORISTA ABAST", null));
        var colaborador = colaboradorRepository.save(new Colaborador("ANA", "TESTE", "ANA TESTE", "52998224725",
                processo, base, funcao, LocalDate.of(2020, 1, 1)));
        condutores.registrarCnh(colaborador.getId(), new CondutorRequest("12345678901", CategoriaCnh.D, LocalDate.now().plusYears(2), null, null));
        return colaborador.getId();
    }
}
