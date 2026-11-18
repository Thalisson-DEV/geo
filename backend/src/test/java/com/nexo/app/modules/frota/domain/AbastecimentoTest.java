package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AbastecimentoTest {

    /** 15/10/2026 às 15h em Brasília. */
    private static final OffsetDateTime AGORA = OffsetDateTime.of(2026, 10, 15, 15, 0, 0, 0, ZoneOffset.ofHours(-3));

    private final ProdutoAbastecimento s10 = produto("Diesel S10", CategoriaProdutoAbastecimento.COMBUSTIVEL, Combustivel.DIESEL_S10);
    private final ProdutoAbastecimento s500 = produto("Diesel S500", CategoriaProdutoAbastecimento.COMBUSTIVEL, Combustivel.DIESEL_S500);
    private final ProdutoAbastecimento arla = produto("ARLA 32", CategoriaProdutoAbastecimento.ARLA, null);
    private final PostoAbastecimento posto = new PostoAbastecimento(new PostoAbastecimento.Dados("Posto Central", null, null, null, null, null));

    @Test
    void equipePedeSoOsProdutosEODestino() {
        var a = solicitar();
        assertThat(a.getSituacao()).isEqualTo(SituacaoAbastecimento.AGUARDANDO_APROVACAO);
        assertThat(a.getDestino()).isEqualTo("Juazeiro → Sobradinho");
        assertThat(a.getOrigem()).isEqualTo(OrigemAbastecimento.APP);
        assertThat(a.getItens()).extracting(i -> i.getProdutoPedido().getNome()).containsExactly("Diesel S10", "ARLA 32");
        assertThat(a.getItens()).allSatisfy(i -> assertThat(i.getQuantidadePedida()).isNull());
        assertThat(a.getFotos()).singleElement().extracting(FotoAbastecimento::getTipo).isEqualTo(TipoFotoAbastecimento.PAINEL_ANTES);
    }

    @Test
    void recusaSolicitacaoSemItensComRepetidoDoisCombustiveisOuSemDestino() {
        assertThatThrownBy(() -> solicitar(List.of(), "Sobradinho")).hasMessageContaining("ao menos um item");
        assertThatThrownBy(() -> solicitar(List.of(pedido(arla), pedido(arla)), "Sobradinho")).hasMessageContaining("mais de uma vez");
        assertThatThrownBy(() -> solicitar(List.of(pedido(s10), pedido(s500)), "Sobradinho")).hasMessageContaining("um combustível");
        assertThatThrownBy(() -> solicitar(List.of(pedido(s10)), " ")).hasMessageContaining("destino");
    }

    @Test
    void aprovadorDefineAQuantidadeDeCadaItem() {
        var a = solicitar();
        var diesel = a.getItens().get(0);
        var arlaItem = a.getItens().get(1);
        assertThatThrownBy(() -> a.aprovar(UUID.randomUUID(), Map.of(diesel.getId(), new BigDecimal("80")), AGORA))
                .hasMessageContaining("ARLA 32");
        assertThatThrownBy(() -> a.aprovar(UUID.randomUUID(), Map.of(diesel.getId(), BigDecimal.ZERO, arlaItem.getId(), BigDecimal.ZERO),
                AGORA)).hasMessageContaining("ao menos um item");

        a.aprovar(UUID.randomUUID(), Map.of(diesel.getId(), new BigDecimal("80"), arlaItem.getId(), BigDecimal.ZERO), AGORA);
        assertThat(a.getSituacao()).isEqualTo(SituacaoAbastecimento.APROVADA);
        assertThat(diesel.getQuantidadeAprovada()).isEqualByComparingTo("80");
        assertThat(arlaItem.isRetirado()).as("zero tira o item").isTrue();
    }

    @Test
    void aprovadaVenceNaMeiaNoiteDeBrasilia() {
        var a = aprovado();
        assertThat(a.getVenceEm()).isEqualTo(OffsetDateTime.of(2026, 10, 16, 0, 0, 0, 0, ZoneOffset.ofHours(-3)));
        assertThat(a.vencer(AGORA.plusHours(8))).as("23h ainda vale").isFalse();
        assertThat(a.vencer(AGORA.plusHours(9))).isTrue();
        assertThat(a.getSituacao()).isEqualTo(SituacaoAbastecimento.VENCIDA);
    }

    @Test
    void naoLiberaAprovacaoVencida() {
        var a = aprovado();
        assertThatThrownBy(() -> a.liberar(UUID.randomUUID(), null, null, AGORA.plusDays(1)))
                .isInstanceOf(InvarianteVioladaException.class).hasMessageContaining("venceu");
    }

    @Test
    void liberaAjustandoSemPerderOAprovado() {
        var a = aprovado();
        var diesel = a.getItens().getFirst();
        var arlaItem = a.getItens().get(1);
        a.liberar(UUID.randomUUID(), null, Map.of(diesel.getId(), new BigDecimal("60")), AGORA.plusHours(1));
        assertThat(a.getSituacao()).isEqualTo(SituacaoAbastecimento.LIBERADA);
        assertThat(diesel.getQuantidadeAprovada()).isEqualByComparingTo("80");
        assertThat(diesel.getQuantidadeLiberada()).isEqualByComparingTo("60");
        assertThat(diesel.quantidadeAutorizada()).isEqualByComparingTo("60");
        assertThat(arlaItem.getQuantidadeLiberada()).as("sem ajuste, vale o aprovado").isEqualByComparingTo("10");
    }

    @Test
    void equipeCancelaAntesDaLiberacaoEDepoisSoQuemLibera() {
        var antes = solicitar();
        antes.cancelar(UUID.randomUUID(), null, false, AGORA);
        assertThat(antes.getSituacao()).isEqualTo(SituacaoAbastecimento.CANCELADA);

        var liberado = liberado();
        assertThatThrownBy(() -> liberado.cancelar(UUID.randomUUID(), "Não precisa mais", false, AGORA))
                .hasMessageContaining("Peça o cancelamento ao administrativo");
        assertThatThrownBy(() -> liberado.cancelar(UUID.randomUUID(), " ", true, AGORA)).hasMessageContaining("motivo");
        liberado.cancelar(UUID.randomUUID(), "Veículo quebrou antes do posto", true, AGORA);
        assertThat(liberado.getSituacao()).isEqualTo(SituacaoAbastecimento.CANCELADA);
    }

    @Test
    void realizadoCalculaOValorPeloPrecoDoPosto() {
        var a = liberado();
        var diesel = a.getItens().get(0);
        var arlaItem = a.getItens().get(1);
        a.realizar(new Abastecimento.Realizado(new BigDecimal("45200"), List.of(
                new Abastecimento.ItemRealizado(diesel.getId(), null, new BigDecimal("27.5"), new BigDecimal("999"), new BigDecimal("6.19"), true),
                new Abastecimento.ItemRealizado(arlaItem.getId(), null, BigDecimal.ZERO, null, new BigDecimal("4.5"), null)),
                UUID.randomUUID(), UUID.randomUUID(), AGORA.plusHours(2)));

        assertThat(diesel.getValorTotal()).as("27,5 l × R$ 6,190, ignorando o digitado").isEqualByComparingTo("170.23");
        assertThat(diesel.getValorUnitario()).isEqualByComparingTo("6.190");
        assertThat(arlaItem.getValorTotal()).isEqualByComparingTo("0");
    }

    @Test
    void realizadoComCombustivelTrocadoNoPostoSemPrecoCadastrado() {
        var a = liberado();
        var diesel = a.getItens().get(0);
        var arlaItem = a.getItens().get(1);
        a.realizar(new Abastecimento.Realizado(new BigDecimal("45200"), List.of(
                new Abastecimento.ItemRealizado(diesel.getId(), s500, new BigDecimal("58.4"), new BigDecimal("352.10"), null, true),
                new Abastecimento.ItemRealizado(arlaItem.getId(), null, BigDecimal.ZERO, BigDecimal.ZERO, null, null)),
                UUID.randomUUID(), UUID.randomUUID(), AGORA.plusHours(2)));

        assertThat(a.getSituacao()).isEqualTo(SituacaoAbastecimento.REALIZADA);
        assertThat(diesel.getProduto().getNome()).isEqualTo("Diesel S500");
        assertThat(diesel.getValorUnitario()).isEqualByComparingTo("6.029");
        assertThat(diesel.getTanqueCheio()).isTrue();
        assertThat(arlaItem.getValorUnitario()).as("não entregue").isNull();
        assertThat(a.valorTotal()).isEqualByComparingTo("352.10");
        assertThat(a.getFotos()).extracting(FotoAbastecimento::getTipo)
                .containsExactlyInAnyOrder(TipoFotoAbastecimento.PAINEL_ANTES, TipoFotoAbastecimento.PAINEL_DEPOIS, TipoFotoAbastecimento.CUPOM);
    }

    @Test
    void realizadoExigeTodosOsItensFotosMesmaCategoriaEValorSemPreco() {
        var a = liberado();
        var diesel = a.getItens().get(0);
        var arlaItem = a.getItens().get(1);
        var dieselOk = new Abastecimento.ItemRealizado(diesel.getId(), null, new BigDecimal("50"), new BigDecimal("300"), null, true);
        var arlaOk = new Abastecimento.ItemRealizado(arlaItem.getId(), null, new BigDecimal("10"), new BigDecimal("40"), null, null);

        assertThatThrownBy(() -> a.realizar(realizado(List.of(dieselOk), UUID.randomUUID())))
                .hasMessageContaining("ARLA 32");
        assertThatThrownBy(() -> a.realizar(realizado(List.of(dieselOk, arlaOk), null)))
                .hasMessageContaining("cupom");
        assertThatThrownBy(() -> a.realizar(realizado(List.of(
                new Abastecimento.ItemRealizado(diesel.getId(), arla, new BigDecimal("50"), new BigDecimal("300"), null, null), arlaOk),
                UUID.randomUUID())))
                .hasMessageContaining("outro produto da categoria combustível");
        assertThatThrownBy(() -> a.realizar(realizado(List.of(
                new Abastecimento.ItemRealizado(diesel.getId(), null, new BigDecimal("50"), new BigDecimal("300"), null, null), arlaOk),
                UUID.randomUUID())))
                .hasMessageContaining("tanque");
        assertThatThrownBy(() -> a.realizar(realizado(List.of(
                new Abastecimento.ItemRealizado(diesel.getId(), null, new BigDecimal("50"), null, null, true), arlaOk), UUID.randomUUID())))
                .hasMessageContaining("não tem preço");
    }

    @Test
    void itemRetiradoNaAprovacaoNaoPrecisaNoRealizado() {
        var a = solicitar();
        var diesel = a.getItens().get(0);
        var arlaItem = a.getItens().get(1);
        a.aprovar(UUID.randomUUID(), Map.of(diesel.getId(), new BigDecimal("40"), arlaItem.getId(), BigDecimal.ZERO), AGORA);
        a.liberar(UUID.randomUUID(), null, null, AGORA.plusHours(1));
        a.realizar(realizado(List.of(new Abastecimento.ItemRealizado(diesel.getId(), null, new BigDecimal("40"), null,
                new BigDecimal("6"), false)), UUID.randomUUID()));
        assertThat(arlaItem.getQuantidade()).isEqualByComparingTo("0");
        assertThat(a.valorTotal()).isEqualByComparingTo("240");
    }

    @Test
    void avulsoNasceAprovadoSemFotoEComKmOpcional() {
        var aprovador = UUID.randomUUID();
        var a = Abastecimento.avulso(new Abastecimento.Avulso(UUID.randomUUID(), null, UUID.randomUUID(), aprovador, posto, null,
                "Obra em Casa Nova", null, List.of(new Abastecimento.ItemAvulso(s10, new BigDecimal("70"))), AGORA));
        assertThat(a.isAvulso()).isTrue();
        assertThat(a.getSituacao()).isEqualTo(SituacaoAbastecimento.APROVADA);
        assertThat(a.getIdUsuarioAprovacao()).isEqualTo(aprovador);
        assertThat(a.getIdUsuarioSolicitante()).isEqualTo(aprovador);
        assertThat(a.getFotos()).isEmpty();
        assertThat(a.getMedicaoSolicitacao()).isNull();
        assertThat(a.getItens().getFirst().getQuantidadeAprovada()).isEqualByComparingTo("70");
        assertThat(a.getVenceEm()).isEqualTo(OffsetDateTime.of(2026, 10, 16, 0, 0, 0, 0, ZoneOffset.ofHours(-3)));
    }

    @Test
    void alertasDaEtapaSaoSubstituidos() {
        var a = solicitar();
        a.registrarAlertas(EtapaAlertaAbastecimento.SOLICITACAO,
                List.of(new AnaliseAbastecimento.Alerta(TipoAlertaAbastecimento.MEDICAO_MENOR, "x")));
        a.registrarAlertas(EtapaAlertaAbastecimento.SOLICITACAO,
                List.of(new AnaliseAbastecimento.Alerta(TipoAlertaAbastecimento.FOTO_REPETIDA, "y")));
        assertThat(a.getAlertas()).singleElement().extracting(AlertaAbastecimento::getTipo).isEqualTo(TipoAlertaAbastecimento.FOTO_REPETIDA);
    }

    private Abastecimento.Realizado realizado(List<Abastecimento.ItemRealizado> itens, UUID idCupom) {
        return new Abastecimento.Realizado(new BigDecimal("45200"), itens, UUID.randomUUID(), idCupom, AGORA.plusHours(2));
    }

    private Abastecimento aprovado() {
        var a = solicitar();
        a.aprovar(UUID.randomUUID(), Map.of(a.getItens().get(0).getId(), new BigDecimal("80"),
                a.getItens().get(1).getId(), new BigDecimal("10")), AGORA);
        return a;
    }

    private Abastecimento liberado() {
        var a = aprovado();
        a.liberar(UUID.randomUUID(), null, null, AGORA.plusHours(1));
        return a;
    }

    private Abastecimento solicitar() {
        return solicitar(List.of(pedido(s10), pedido(arla)), "Juazeiro → Sobradinho");
    }

    private Abastecimento solicitar(List<Abastecimento.ItemPedido> itens, String destino) {
        var a = Abastecimento.solicitar(new Abastecimento.Solicitacao(UUID.randomUUID(), UUID.randomUUID(), null, UUID.randomUUID(),
                UUID.randomUUID(), null, posto, new BigDecimal("45120"), destino, null, itens, UUID.randomUUID(), AGORA));
        a.getItens().forEach(i -> ReflectionTestUtils.setField(i, "id", UUID.randomUUID()));
        return a;
    }

    private static Abastecimento.ItemPedido pedido(ProdutoAbastecimento produto) {
        return new Abastecimento.ItemPedido(produto);
    }

    private static ProdutoAbastecimento produto(String nome, CategoriaProdutoAbastecimento categoria, Combustivel combustivel) {
        var p = new ProdutoAbastecimento(new ProdutoAbastecimento.Dados(nome, categoria, UnidadeProdutoAbastecimento.L, combustivel));
        ReflectionTestUtils.setField(p, "id", UUID.randomUUID());
        return p;
    }
}
