package com.nexo.app.modules.estoque.application.usecases;

import com.nexo.app.modules.estoque.application.dto.FechamentoObraRequests;
import com.nexo.app.modules.estoque.application.dto.FechamentoObraResponses;
import com.nexo.app.modules.estoque.application.dto.SolicitacaoFilter;
import com.nexo.app.modules.estoque.application.services.GravadorEventoSolicitacaoService;
import com.nexo.app.modules.estoque.domain.CondicaoMaterial;
import com.nexo.app.modules.estoque.domain.EfeitoEstoque;
import com.nexo.app.modules.estoque.domain.Estoque;
import com.nexo.app.modules.estoque.domain.Material;
import com.nexo.app.modules.estoque.domain.MovimentacaoEstoque;
import com.nexo.app.modules.estoque.domain.Saldo;
import com.nexo.app.modules.estoque.domain.SituacaoFechamentoObra;
import com.nexo.app.modules.estoque.domain.SituacaoFechamentoSolicitacao;
import com.nexo.app.modules.estoque.domain.TipoEstoque;
import com.nexo.app.modules.estoque.domain.TipoOperacaoSolicitacao;
import com.nexo.app.modules.estoque.infrastructure.persistence.EstoqueRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.MaterialRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.MovimentacaoEstoqueRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.OperacaoSolicitacaoMaterialRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.SaldoRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.SolicitacaoMaterialRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.SolicitacaoSpecification;
import com.nexo.app.modules.estoque.infrastructure.persistence.TipoEstoqueRepository;
import com.nexo.app.modules.obras.ObraApi;
import com.nexo.app.modules.obras.ObraApi.ObraPublica;
import com.nexo.app.modules.obras.ObraApi.TipoObraPublico;
import com.nexo.app.shared.domain.exception.ConflitoVersaoException;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.PreenchimentoInvalidoException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/** Encerramento de obra de ponta a ponta no banco: criação, movimentação, efeito, estorno e saldos. */
@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:fechamento-obra;DB_CLOSE_DELAY=-1")
@WithMockUser(authorities = {"obras:fechamento:read", "obras:fechamento:create", "obras:fechamento:movimentar"})
class FechamentoObraIntegracaoTest {

    @Autowired private FechamentoObraUseCases fechamento;
    @Autowired private MovimentacaoFechamentoUseCases movimentacoes;
    @Autowired private TipoEstoqueRepository tipoEstoqueRepository;
    @Autowired private EstoqueRepository estoqueRepository;
    @Autowired private MaterialRepository materialRepository;
    @Autowired private SaldoRepository saldoRepository;
    @Autowired private SolicitacaoMaterialRepository solicitacaoRepository;
    @Autowired private OperacaoSolicitacaoMaterialRepository operacaoRepository;
    @Autowired private MovimentacaoEstoqueRepository movimentacaoRepository;

    @Autowired private com.nexo.app.modules.estoque.infrastructure.web.FechamentoObraController controller;

    @MockitoBean private ObraApi obraApi;
    @MockitoBean private GravadorEventoSolicitacaoService gravadorEvento;
    @MockitoBean private EstoqueObraProvisioningService estoqueObraProvisioningService;

    private final UUID idUsuario = UUID.randomUUID();
    private ObraPublica obra;
    private Estoque estoqueObra;
    private Estoque almoxarifado;
    private Material cabo;
    private Material poste;

    @BeforeEach
    void preparar() {
        TipoEstoque tipoObra = tipoEstoqueRepository.findByNomeIgnoreCase("OBRA")
                .orElseGet(() -> tipoEstoqueRepository.saveAndFlush(new TipoEstoque("OBRA")));
        TipoEstoque tipoFisico = tipoEstoqueRepository.findByNomeIgnoreCase("FISICO")
                .orElseGet(() -> tipoEstoqueRepository.saveAndFlush(new TipoEstoque("FISICO")));
        obra = new ObraPublica(UUID.randomUUID(), "283712", "Obra teste", TipoObraPublico.OBRA, true,
                UUID.randomUUID(), "Processo", true, UUID.randomUUID(), Set.of(), null, List.of());
        Estoque novaObra = new Estoque("OBRA " + obra.id().toString().substring(0, 8), tipoObra);
        novaObra.vincularObra(obra.id());
        estoqueObra = estoqueRepository.saveAndFlush(novaObra);
        almoxarifado = estoqueRepository.saveAndFlush(
                new Estoque("ALMOX " + UUID.randomUUID().toString().substring(0, 8), tipoFisico));
        cabo = material("CABO");
        poste = material("POSTE");
        when(obraApi.buscarPorId(obra.id())).thenReturn(Optional.of(obra));
        when(estoqueObraProvisioningService.resolverOuProvisionar(any())).thenReturn(estoqueObra);
        saldo(almoxarifado, cabo, "4");
    }

    @Test
    void criaTresTiposParaAMesmaObraEMantemForaDasListasTecnicas() {
        List<UUID> ids = fechamento.criar(new FechamentoObraRequests.Criar(
                obra.id(), almoxarifado.getId(), null, null, null, List.of(
                        solicitacao("921", "4500123456", cabo, "10"),
                        solicitacao("221", null, cabo, "5"),
                        solicitacao("222", null, poste, "2"))), idUsuario, null).ids();

        assertThat(ids).hasSize(3);
        assertThat(fechamento.detalhe(ids.get(0)).situacao())
                .isEqualTo(SituacaoFechamentoSolicitacao.AGUARDANDO_MOVIMENTACAO);
        assertThat(fechamento.detalhe(ids.get(1)).situacao())
                .isEqualTo(SituacaoFechamentoSolicitacao.AGUARDANDO_RESERVA);
        assertThat(fechamento.situacaoObra(obra.id()).situacao()).isEqualTo(SituacaoFechamentoObra.PENDENTE);

        SolicitacaoFilter semContexto = new SolicitacaoFilter(null, null, null, null, null, null, null, null,
                null, null, obra.id(), null, null, null, null, null, null, null, null, null, null, null, null,
                null, null);
        assertThat(solicitacaoRepository.findAll(SolicitacaoSpecification.filterBy(semContexto))).isEmpty();

        var minhas = fechamento.listar(new com.nexo.app.modules.estoque.application.dto.FechamentoObraFilter(
                idUsuario, obra.id(), null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null), PageRequest.of(0, 20));
        assertThat(minhas.getContent()).hasSize(3);
    }

    @Test
    void ordenaPorCampoCalculadoEPaginaORecorteInteiro() {
        UUID umItem = criar("221", null, cabo, "5");
        UUID doisItens = fechamento.criar(new FechamentoObraRequests.Criar(
                obra.id(), almoxarifado.getId(), null, null, null, List.of(new FechamentoObraRequests.Criar.Solicitacao(
                        "921", null, null, List.of(
                                new FechamentoObraRequests.Criar.Item(cabo.getId(), new BigDecimal("1")),
                                new FechamentoObraRequests.Criar.Item(poste.getId(), new BigDecimal("1")))))),
                idUsuario, null).ids().get(0);
        var filtro = new com.nexo.app.modules.estoque.application.dto.FechamentoObraFilter(
                null, obra.id(), null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null);

        var primeira = fechamento.listar(filtro, PageRequest.of(0, 1, Sort.by(Sort.Order.desc("itens"))));
        var segunda = fechamento.listar(filtro, PageRequest.of(1, 1, Sort.by(Sort.Order.desc("itens"))));

        assertThat(primeira.getContent()).extracting(FechamentoObraResponses.Resumo::id).containsExactly(doisItens);
        assertThat(segunda.getContent()).extracting(FechamentoObraResponses.Resumo::id).containsExactly(umItem);
        assertThat(primeira.getPage().getTotalElements()).isEqualTo(2);
    }

    @Test
    void reservaAusenteNaoSomeAoOrdenarPorReserva() {
        criar("221", null, cabo, "5");
        criar("921", "4500123456", cabo, "5");
        var filtro = new com.nexo.app.modules.estoque.application.dto.FechamentoObraFilter(
                null, obra.id(), null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null);

        var crescente = fechamento.listar(filtro, PageRequest.of(0, 20, Sort.by(Sort.Order.asc("reserva.numero").nullsLast())));
        var decrescente = fechamento.listar(filtro, PageRequest.of(0, 20, Sort.by(Sort.Order.desc("reserva.numero").nullsLast())));

        assertThat(crescente.getContent()).hasSize(2);
        assertThat(crescente.getContent().get(0).numeroReserva()).isEqualTo("4500123456");
        assertThat(decrescente.getContent().get(0).numeroReserva()).isEqualTo("4500123456");
    }

    @Test
    void rejeitaMaterialRepetidoETipoAusente() {
        assertThatThrownBy(() -> fechamento.criar(new FechamentoObraRequests.Criar(
                obra.id(), almoxarifado.getId(), null, null, null, List.of(
                        new FechamentoObraRequests.Criar.Solicitacao("221", null, null, List.of(
                                new FechamentoObraRequests.Criar.Item(cabo.getId(), BigDecimal.ONE),
                                new FechamentoObraRequests.Criar.Item(cabo.getId(), BigDecimal.TEN))),
                        new FechamentoObraRequests.Criar.Solicitacao(" ", null, null, List.of(
                                new FechamentoObraRequests.Criar.Item(poste.getId(), BigDecimal.ONE))))),
                idUsuario, null))
                .isInstanceOfSatisfying(PreenchimentoInvalidoException.class, ex -> assertThat(ex.getErros())
                        .containsKeys("solicitacoes[0].itens[1].idMaterial", "solicitacoes[1].tipo"));
    }

    @Test
    void semReservaNaoMovimenta() {
        UUID id = criar("221", null, cabo, "10");

        assertThatThrownBy(() -> movimentar(id, "1"))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("reserva");
    }

    @Test
    void adicaoFisicaSemSaldoNoAlmoxarifadoDeixaNegativoSemBarrar() {
        UUID id = criar("221", "4500123456", cabo, "10");

        var previa = movimentacoes.previaMovimentacao(id, new FechamentoObraRequests.Movimentar(
                null, List.of(new FechamentoObraRequests.Movimentar.Item(
                        itemId(id), new BigDecimal("6")))));
        assertThat(previa.deixaSaldoNegativo()).isTrue();

        movimentar(id, "6");
        assertThat(saldoDe(almoxarifado, cabo)).isEqualByComparingTo("-2");
        assertThat(saldoDe(estoqueObra, cabo)).isEqualByComparingTo("6");
        assertThat(fechamento.detalhe(id).situacao()).isEqualTo(SituacaoFechamentoSolicitacao.MOVIMENTADA_PARCIALMENTE);
        assertThat(fechamento.situacaoObra(obra.id()).situacao()).isEqualTo(SituacaoFechamentoObra.PARCIAL);

        movimentar(id, "4");
        FechamentoObraResponses.Detalhe detalhe = fechamento.detalhe(id);
        assertThat(detalhe.situacao()).isEqualTo(SituacaoFechamentoSolicitacao.MOVIMENTADA);
        assertThat(detalhe.movimentacoes()).hasSize(2);
        assertThat(detalhe.acoes().editar()).isFalse();
        assertThat(fechamento.situacaoObra(obra.id()).situacao()).isEqualTo(SituacaoFechamentoObra.FINALIZADO);
        assertThat(saldoDe(estoqueObra, cabo)).isEqualByComparingTo("10");
        List<MovimentacaoEstoque> registros = movimentacaoRepository.findAll().stream()
                .filter(m -> m.getSolicitacao() != null && id.equals(m.getSolicitacao().getId())).toList();
        assertThat(registros).hasSize(2).allSatisfy(m -> {
            assertThat(m.getEstoqueOrigem().getId()).isEqualTo(almoxarifado.getId());
            assertThat(m.getEstoqueDestino().getId()).isEqualTo(estoqueObra.getId());
        });
    }

    @Test
    void devolucaoFisicaSemSaldoNaObraDeixaObraNegativa() {
        UUID id = criar("222", "4500123456", cabo, "3");

        movimentar(id, "3");

        assertThat(saldoDe(estoqueObra, cabo)).isEqualByComparingTo("-3");
        assertThat(saldoDe(almoxarifado, cabo)).isEqualByComparingTo("7");
    }

    @Test
    void movimentacaoESempreFisica() {
        UUID id = criar("221", "4500123456", cabo, "6");
        movimentar(id, "6");
        assertThat(saldoDe(almoxarifado, cabo)).isEqualByComparingTo("-2");
        assertThat(saldoDe(estoqueObra, cabo)).isEqualByComparingTo("6");
        FechamentoObraResponses.Detalhe detalhe = fechamento.detalhe(id);
        assertThat(detalhe.situacao()).isEqualTo(SituacaoFechamentoSolicitacao.MOVIMENTADA);
        assertThat(detalhe.movimentacoes().getFirst().efeitoEstoque()).isEqualTo(EfeitoEstoque.FISICO);
    }

    @Test
    void estornoParcialDeFisicaDesfazNaMesmaProporcaoEReabre() {
        UUID id = criar("221", "4500123456", cabo, "6");
        movimentar(id, "6");
        FechamentoObraResponses.Detalhe detalhe = fechamento.detalhe(id);
        FechamentoObraResponses.Movimentacao movimentacao = detalhe.movimentacoes().getFirst();

        assertThatThrownBy(() -> movimentacoes.estornar(id, movimentacao.id(), new FechamentoObraRequests.Estornar(
                detalhe.versao(), "Lançado em dobro", List.of(new FechamentoObraRequests.Estornar.Item(
                        movimentacao.itens().getFirst().id(), new BigDecimal("7")))), idUsuario, null))
                .isInstanceOf(PreenchimentoInvalidoException.class);

        movimentacoes.estornar(id, movimentacao.id(), new FechamentoObraRequests.Estornar(
                detalhe.versao(), "Lançado em dobro", List.of(new FechamentoObraRequests.Estornar.Item(
                        movimentacao.itens().getFirst().id(), new BigDecimal("2")))), idUsuario, null);

        FechamentoObraResponses.Detalhe depois = fechamento.detalhe(id);
        assertThat(depois.situacao()).isEqualTo(SituacaoFechamentoSolicitacao.MOVIMENTADA_PARCIALMENTE);
        assertThat(depois.itens().getFirst().quantidadePendente()).isEqualByComparingTo("2");
        assertThat(saldoDe(estoqueObra, cabo)).isEqualByComparingTo("4");
        assertThat(saldoDe(almoxarifado, cabo)).isEqualByComparingTo("0");
        assertThat(depois.movimentacoes()).extracting(FechamentoObraResponses.Movimentacao::tipo)
                .contains(TipoOperacaoSolicitacao.ESTORNO);

    }

    @Test
    void quantidadeVersaoEIdempotencia() {
        UUID id = criar("221", "4500123456", cabo, "10");
        UUID item = itemId(id);
        Long versao = fechamento.detalhe(id).versao();

        assertThatThrownBy(() -> movimentacoes.movimentar(id, new FechamentoObraRequests.Movimentar(
                versao, List.of(new FechamentoObraRequests.Movimentar.Item(item, new BigDecimal("11")))),
                idUsuario, null))
                .isInstanceOf(PreenchimentoInvalidoException.class);

        var comando = new FechamentoObraRequests.Movimentar(
                versao, List.of(new FechamentoObraRequests.Movimentar.Item(item, BigDecimal.ONE)));
        UUID primeira = movimentacoes.movimentar(id, comando, idUsuario, "duplo-clique-" + id).idOperacao();
        UUID segunda = movimentacoes.movimentar(id, comando, idUsuario, "duplo-clique-" + id).idOperacao();
        assertThat(segunda).isEqualTo(primeira);
        assertThat(operacaoRepository.findAllBySolicitacaoIdOrderByRealizadaEmAscIdAsc(id)).hasSize(1);

        assertThatThrownBy(() -> movimentacoes.movimentar(id, comando, idUsuario, null))
                .isInstanceOf(ConflitoVersaoException.class);
    }

    @Test
    void edicaoReservaECancelamentoRespeitamOMovimentado() {
        UUID id = criar("221", "4500123456", cabo, "10");
        movimentar(id, "6");
        FechamentoObraResponses.Detalhe detalhe = fechamento.detalhe(id);
        UUID item = detalhe.itens().getFirst().id();

        assertThatThrownBy(() -> fechamento.editar(id, new FechamentoObraRequests.Editar(
                detalhe.versao(), null, null, null, List.of(new FechamentoObraRequests.Editar.Item(
                        item, cabo.getId(), new BigDecimal("5")))), idUsuario))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("6");
        assertThatThrownBy(() -> fechamento.registrarReserva(id,
                new FechamentoObraRequests.RegistrarReserva(detalhe.versao(), "4500999999", null), idUsuario))
                .isInstanceOf(InvarianteVioladaException.class);
        assertThatThrownBy(() -> fechamento.cancelar(id,
                new FechamentoObraRequests.Cancelar(detalhe.versao(), "Desistência"), idUsuario))
                .isInstanceOf(InvarianteVioladaException.class);

        fechamento.editar(id, new FechamentoObraRequests.Editar(
                detalhe.versao(), null, null, "Ajuste", List.of(
                        new FechamentoObraRequests.Editar.Item(item, cabo.getId(), new BigDecimal("8")),
                        new FechamentoObraRequests.Editar.Item(null, poste.getId(), BigDecimal.ONE))), idUsuario);
        FechamentoObraResponses.Detalhe editado = fechamento.detalhe(id);
        assertThat(editado.itens()).hasSize(2);
        assertThat(editado.observacao()).isEqualTo("Ajuste");
        assertThat(editado.situacao()).isEqualTo(SituacaoFechamentoSolicitacao.MOVIMENTADA_PARCIALMENTE);

        UUID semMovimento = criar("222", null, poste, "1");
        assertThatThrownBy(() -> fechamento.cancelar(semMovimento,
                new FechamentoObraRequests.Cancelar(null, "Criada por engano"), UUID.randomUUID()))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("Só quem abriu");
        fechamento.cancelar(semMovimento, new FechamentoObraRequests.Cancelar(null, "Criada por engano"), idUsuario);
        assertThat(fechamento.detalhe(semMovimento).situacao()).isEqualTo(SituacaoFechamentoSolicitacao.CANCELADA);
    }

    @Test
    @WithMockUser(authorities = {"obras:fechamento:read", "obras:fechamento:create"})
    void tecnicoSemPermissaoDeMovimentarRecebe403ENadaEGravado() {
        UUID id = criar("221", "4500123456", cabo, "10");
        var comando = new FechamentoObraRequests.Movimentar(
                null, List.of(new FechamentoObraRequests.Movimentar.Item(itemId(id), BigDecimal.ONE)));

        assertThatThrownBy(() -> controller.movimentar(id, comando, null))
                .isInstanceOf(org.springframework.security.access.AccessDeniedException.class);
        assertThat(operacaoRepository.findAllBySolicitacaoIdOrderByRealizadaEmAscIdAsc(id)).isEmpty();
        assertThat(fechamento.detalhe(id).acoes().movimentar()).isFalse();
        assertThat(fechamento.detalhe(id).acoes().editar()).isTrue();
    }

    private UUID criar(String tipo, String reserva, Material material, String quantidade) {
        return fechamento.criar(new FechamentoObraRequests.Criar(
                obra.id(), almoxarifado.getId(), null, null, null,
                List.of(solicitacao(tipo, reserva, material, quantidade))), idUsuario, null).ids().getFirst();
    }

    private void movimentar(UUID id, String quantidade) {
        FechamentoObraResponses.Detalhe detalhe = fechamento.detalhe(id);
        movimentacoes.movimentar(id, new FechamentoObraRequests.Movimentar(
                detalhe.versao(), List.of(new FechamentoObraRequests.Movimentar.Item(
                        detalhe.itens().getFirst().id(), new BigDecimal(quantidade)))), idUsuario, null);
    }

    private UUID itemId(UUID id) {
        return fechamento.detalhe(id).itens().getFirst().id();
    }

    private static FechamentoObraRequests.Criar.Solicitacao solicitacao(
            String tipo, String reserva, Material material, String quantidade) {
        return new FechamentoObraRequests.Criar.Solicitacao(tipo, reserva, null, List.of(
                new FechamentoObraRequests.Criar.Item(material.getId(), new BigDecimal(quantidade))));
    }

    private Material material(String prefixo) {
        return materialRepository.saveAndFlush(new Material(
                prefixo + "-" + UUID.randomUUID().toString().substring(0, 8), "Material " + prefixo, "UN", "MATR",
                null, null, false, UUID.randomUUID()));
    }

    private void saldo(Estoque estoque, Material material, String quantidade) {
        Saldo saldo = new Saldo(estoque, material, CondicaoMaterial.NOVO);
        saldo.adicionarQuantidade(new BigDecimal(quantidade));
        saldoRepository.saveAndFlush(saldo);
    }

    private BigDecimal saldoDe(Estoque estoque, Material material) {
        return saldoRepository.findByEstoqueIdAndMaterialIdAndCondicao(estoque.getId(), material.getId(), CondicaoMaterial.NOVO)
                .map(Saldo::getQuantidade).orElse(BigDecimal.ZERO);
    }
}
