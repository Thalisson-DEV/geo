package com.nexo.app.modules.estoque.domain;

import com.nexo.app.modules.obras.ObraApi.ObraPublica;
import com.nexo.app.modules.obras.ObraApi.TipoObraPublico;
import com.nexo.app.shared.domain.HorasUteis;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SolicitacaoMaterialFechamentoTest {

    private final Estoque almoxarifado = comId(new Estoque("ALMOX", new TipoEstoque("FISICO")));
    private final Estoque estoqueObra = comId(new Estoque("OBRA 283712", new TipoEstoque("OBRA")));
    private final ObraPublica obra = new ObraPublica(
            UUID.randomUUID(), "283712", "Obra teste", TipoObraPublico.CORRETIVA, true,
            UUID.randomUUID(), "Processo", true, UUID.randomUUID(), Set.of(), null, List.of());

    @Test
    void nasceAguardandoReservaComPrazoDe48HorasUteis() {
        SolicitacaoMaterial solicitacao = criar(TipoSolicitacaoTecnica.ADICAO_CONCRETO);

        assertThat(solicitacao.isFechamento()).isTrue();
        assertThat(solicitacao.getSituacaoFechamento()).isEqualTo(SituacaoFechamentoSolicitacao.AGUARDANDO_RESERVA);
        assertThat(solicitacao.getPrazoReservaAte())
                .isEqualTo(HorasUteis.somar(solicitacao.getDataSolicitacao(), 48));
        assertThat(solicitacao.getPrazoVigenteAte()).isEqualTo(solicitacao.getPrazoReservaAte());
        assertThat(solicitacao.getDataPrevistaRetirada()).isNull();
        assertThat(solicitacao.getStatusSeparacao()).isNull();
        assertThat(solicitacao.getEstoqueOrigem()).isSameAs(almoxarifado);
        assertThat(solicitacao.getEstoqueDestino()).isSameAs(estoqueObra);
    }

    @Test
    void devolucaoTiraDaObraEPoeNoAlmoxarifado() {
        SolicitacaoMaterial solicitacao = criar(TipoSolicitacaoTecnica.DEVOLUCAO_COMUM);

        assertThat(solicitacao.getEstoqueOrigem()).isSameAs(estoqueObra);
        assertThat(solicitacao.getEstoqueDestino()).isSameAs(almoxarifado);
    }

    @Test
    void rejeitaMaterialRepetido() {
        SolicitacaoMaterial solicitacao = criar(TipoSolicitacaoTecnica.ADICAO_COMUM);
        Material cabo = material("CABO-35");
        solicitacao.adicionarItemFechamento(cabo, BigDecimal.TEN);

        assertThatThrownBy(() -> solicitacao.adicionarItemFechamento(cabo, BigDecimal.ONE))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("CABO-35");
    }

    @Test
    void reservaAbreOPrazoDeMovimentacaoSoNoPrimeiroRegistro() {
        SolicitacaoMaterial solicitacao = criarComItem(TipoSolicitacaoTecnica.ADICAO_COMUM, BigDecimal.TEN);
        OffsetDateTime registro = OffsetDateTime.now();
        reservar(solicitacao);
        solicitacao.reservaRegistradaNoFechamento(registro);

        assertThat(solicitacao.getSituacaoFechamento()).isEqualTo(SituacaoFechamentoSolicitacao.AGUARDANDO_MOVIMENTACAO);
        assertThat(solicitacao.getPrazoMovimentacaoAte()).isEqualTo(HorasUteis.somar(registro, 48));
        assertThat(solicitacao.getPrazoVigenteAte()).isEqualTo(solicitacao.getPrazoMovimentacaoAte());
        assertThat(solicitacao.situacaoPrazoReserva(registro)).isIn(
                SituacaoPrazoFechamento.CUMPRIDO, SituacaoPrazoFechamento.CUMPRIDO_COM_ATRASO);

        solicitacao.reservaRegistradaNoFechamento(registro.plusDays(3));
        assertThat(solicitacao.getPrazoMovimentacaoAte()).isEqualTo(HorasUteis.somar(registro, 48));
    }

    @Test
    void movimentacaoParcialDepoisTotalEEstornoReabre() {
        SolicitacaoMaterial solicitacao = pronta(TipoSolicitacaoTecnica.ADICAO_COMUM, BigDecimal.TEN);
        ItemSolicitacao item = solicitacao.getItens().getFirst();

        item.registrarEntregaTecnica(new BigDecimal("6"));
        solicitacao.aplicarMovimentacaoFechamento(OffsetDateTime.now());
        assertThat(solicitacao.getSituacaoFechamento()).isEqualTo(SituacaoFechamentoSolicitacao.MOVIMENTADA_PARCIALMENTE);
        assertThat(solicitacao.getStatus()).isEqualTo(SolicitacaoMaterial.StatusSolicitacao.APROVADO);

        item.registrarEntregaTecnica(new BigDecimal("4"));
        solicitacao.aplicarMovimentacaoFechamento(OffsetDateTime.now());
        assertThat(solicitacao.getSituacaoFechamento()).isEqualTo(SituacaoFechamentoSolicitacao.MOVIMENTADA);
        assertThat(solicitacao.getStatus()).isEqualTo(SolicitacaoMaterial.StatusSolicitacao.ENTREGUE);
        assertThat(solicitacao.getMovimentacaoConcluidaEm()).isNotNull();
        assertThat(solicitacao.getPrazoVigenteAte()).isNull();
        assertThatThrownBy(() -> solicitacao.alterarQuantidadeItemFechamento(item.getId(), new BigDecimal("12")))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("estorne");

        item.registrarEstornoEntregaTecnica(new BigDecimal("4"));
        solicitacao.aplicarMovimentacaoFechamento(OffsetDateTime.now());
        assertThat(solicitacao.getSituacaoFechamento()).isEqualTo(SituacaoFechamentoSolicitacao.MOVIMENTADA_PARCIALMENTE);
        assertThat(solicitacao.getMovimentacaoConcluidaEm()).isNull();
    }

    @Test
    void naoReduzAbaixoDoMovimentadoNemRemoveItemMovimentado() {
        SolicitacaoMaterial solicitacao = pronta(TipoSolicitacaoTecnica.DEVOLUCAO_COMUM, BigDecimal.TEN);
        ItemSolicitacao item = solicitacao.getItens().getFirst();
        ItemSolicitacao outro = comId(solicitacao.adicionarItemFechamento(material("CABO-50"), BigDecimal.ONE));
        item.registrarDevolucaoTecnica(new BigDecimal("6"));
        solicitacao.aplicarMovimentacaoFechamento(OffsetDateTime.now());

        assertThatThrownBy(() -> solicitacao.alterarQuantidadeItemFechamento(item.getId(), new BigDecimal("5")))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("mínima é 6");
        assertThatThrownBy(() -> solicitacao.removerItemFechamento(item.getId()))
                .isInstanceOf(InvarianteVioladaException.class);

        solicitacao.alterarQuantidadeItemFechamento(item.getId(), new BigDecimal("6"));
        solicitacao.removerItemFechamento(outro.getId());
        assertThat(solicitacao.getSituacaoFechamento()).isEqualTo(SituacaoFechamentoSolicitacao.MOVIMENTADA);
    }

    @Test
    void incluirMaterialNumaParcialContinuaParcial() {
        SolicitacaoMaterial solicitacao = pronta(TipoSolicitacaoTecnica.ADICAO_COMUM, BigDecimal.TEN);
        solicitacao.getItens().getFirst().registrarEntregaTecnica(new BigDecimal("2"));
        solicitacao.aplicarMovimentacaoFechamento(OffsetDateTime.now());

        solicitacao.adicionarItemFechamento(material("POSTE"), BigDecimal.ONE);

        assertThat(solicitacao.getSituacaoFechamento()).isEqualTo(SituacaoFechamentoSolicitacao.MOVIMENTADA_PARCIALMENTE);
    }

    @Test
    void reservaTravaComMovimentacaoLiquidaESoltaDepoisDoEstorno() {
        SolicitacaoMaterial solicitacao = pronta(TipoSolicitacaoTecnica.ADICAO_COMUM, BigDecimal.TEN);
        ItemSolicitacao item = solicitacao.getItens().getFirst();
        assertThat(solicitacao.reservaBloqueadaParaAlteracao()).isFalse();

        item.registrarEntregaTecnica(new BigDecimal("3"));
        assertThat(solicitacao.reservaBloqueadaParaAlteracao()).isTrue();
        assertThatThrownBy(() -> solicitacao.getReserva().atualizar(
                BigInteger.TWO, LocalDate.now(), null, null, null, UUID.randomUUID()))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("Estorne");

        item.registrarEstornoEntregaTecnica(new BigDecimal("3"));
        assertThat(solicitacao.reservaBloqueadaParaAlteracao()).isFalse();
    }

    @Test
    void cancelaSoSemMovimentacaoLiquida() {
        SolicitacaoMaterial solicitacao = pronta(TipoSolicitacaoTecnica.ADICAO_COMUM, BigDecimal.TEN);
        ItemSolicitacao item = solicitacao.getItens().getFirst();
        item.registrarEntregaTecnica(BigDecimal.ONE);

        assertThatThrownBy(() -> solicitacao.cancelarFechamento(solicitacao.getIdRequisitante(), "Obra já regularizada"))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("Estorne");

        item.registrarEstornoEntregaTecnica(BigDecimal.ONE);
        assertThatThrownBy(() -> solicitacao.cancelarFechamento(UUID.randomUUID(), "Obra já regularizada"))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("Só quem abriu");
        assertThatThrownBy(() -> solicitacao.cancelarFechamento(solicitacao.getIdRequisitante(), " "))
                .isInstanceOf(InvarianteVioladaException.class);
        solicitacao.cancelarFechamento(solicitacao.getIdRequisitante(), "Obra já regularizada");

        assertThat(solicitacao.getSituacaoFechamento()).isEqualTo(SituacaoFechamentoSolicitacao.CANCELADA);
        assertThat(solicitacao.getPrazoVigenteAte()).isNull();
        assertThat(solicitacao.situacaoPrazoVigente(OffsetDateTime.now())).isNull();
        assertThatThrownBy(() -> solicitacao.exigirMovimentavelNoFechamento())
                .isInstanceOf(InvarianteVioladaException.class);
    }

    @Test
    void semReservaNaoMovimenta() {
        SolicitacaoMaterial solicitacao = criarComItem(TipoSolicitacaoTecnica.ADICAO_COMUM, BigDecimal.TEN);

        assertThatThrownBy(solicitacao::exigirMovimentavelNoFechamento)
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("reserva");
    }

    @Test
    void pendenciaGeralEEspecificaSaoIndependentes() {
        SolicitacaoMaterial solicitacao = pronta(TipoSolicitacaoTecnica.ADICAO_COMUM, BigDecimal.TEN);
        MotivoPendencia motivo = new MotivoPendencia("Aguardando medição", "Aguardando medição");

        solicitacao.registrarPendenciaGeralFechamento(motivo, null);
        assertThat(solicitacao.possuiPendenciaFechamento()).isTrue();
        assertThat(solicitacao.getItens().getFirst().possuiPendencia()).isFalse();

        solicitacao.removerPendenciaGeralFechamento();
        assertThat(solicitacao.possuiPendenciaFechamento()).isFalse();

        solicitacao.registrarPendenciaItemFechamento(solicitacao.getItens().getFirst().getId(), motivo, "Cabo sem medição");
        assertThat(solicitacao.possuiPendenciaFechamento()).isTrue();
        assertThat(solicitacao.getMotivoPendenciaGeral()).isNull();
    }

    @Test
    void prazoVenceEmBreveEAtrasa() {
        OffsetDateTime limite = HorasUteis.somar(OffsetDateTime.now(), 5);
        assertThat(SituacaoPrazoFechamento.emCurso(limite, OffsetDateTime.now()))
                .isEqualTo(SituacaoPrazoFechamento.VENCE_EM_BREVE);
        assertThat(SituacaoPrazoFechamento.emCurso(HorasUteis.somar(OffsetDateTime.now(), 30), OffsetDateTime.now()))
                .isEqualTo(SituacaoPrazoFechamento.NO_PRAZO);
        assertThat(SituacaoPrazoFechamento.emCurso(OffsetDateTime.now().minusMinutes(1), OffsetDateTime.now()))
                .isEqualTo(SituacaoPrazoFechamento.ATRASADO);
        assertThat(SituacaoPrazoFechamento.cumprido(limite, limite.plusMinutes(1)))
                .isEqualTo(SituacaoPrazoFechamento.CUMPRIDO_COM_ATRASO);
    }

    @Test
    void situacaoDoFechamentoDaObra() {
        assertThat(SituacaoFechamentoObra.de(List.of(
                SituacaoFechamentoSolicitacao.MOVIMENTADA,
                SituacaoFechamentoSolicitacao.AGUARDANDO_RESERVA,
                SituacaoFechamentoSolicitacao.AGUARDANDO_MOVIMENTACAO), false))
                .isEqualTo(SituacaoFechamentoObra.PARCIAL);
        assertThat(SituacaoFechamentoObra.de(List.of(
                SituacaoFechamentoSolicitacao.MOVIMENTADA, SituacaoFechamentoSolicitacao.CANCELADA), false))
                .isEqualTo(SituacaoFechamentoObra.FINALIZADO);
        assertThat(SituacaoFechamentoObra.de(List.of(SituacaoFechamentoSolicitacao.CANCELADA), false))
                .isEqualTo(SituacaoFechamentoObra.SEM_SOLICITACOES);
        assertThat(SituacaoFechamentoObra.de(List.of(SituacaoFechamentoSolicitacao.AGUARDANDO_RESERVA), false))
                .isEqualTo(SituacaoFechamentoObra.PENDENTE);
    }

    @Test
    void tecnicaNaoAceitaMovimentacaoDeFechamento() {
        SolicitacaoMaterial tecnica = SolicitacaoMaterial.criarTecnica(
                obra, new com.nexo.app.modules.obras.ObraApi.OcorrenciaPublica(UUID.randomUUID(), obra.id(), "OC-1"),
                TipoSolicitacaoTecnica.ADICAO_COMUM, estoqueObra, almoxarifado, null, null, null, UUID.randomUUID());

        assertThatThrownBy(() -> OperacaoSolicitacaoMaterial.criarFechamento(
                tecnica, TipoOperacaoSolicitacao.MOVIMENTACAO, EfeitoEstoque.FISICO, UUID.randomUUID(), null, null))
                .isInstanceOf(InvarianteVioladaException.class);
    }

    private SolicitacaoMaterial criar(TipoSolicitacaoTecnica tipo) {
        return SolicitacaoMaterial.criarFechamento(
                obra, tipo, estoqueObra, almoxarifado, null, null, null, UUID.randomUUID());
    }

    private SolicitacaoMaterial criarComItem(TipoSolicitacaoTecnica tipo, BigDecimal quantidade) {
        SolicitacaoMaterial solicitacao = criar(tipo);
        comId(solicitacao.adicionarItemFechamento(material("CABO-35"), quantidade));
        return solicitacao;
    }

    private SolicitacaoMaterial pronta(TipoSolicitacaoTecnica tipo, BigDecimal quantidade) {
        SolicitacaoMaterial solicitacao = criarComItem(tipo, quantidade);
        reservar(solicitacao);
        solicitacao.reservaRegistradaNoFechamento(OffsetDateTime.now());
        return solicitacao;
    }

    private static void reservar(SolicitacaoMaterial solicitacao) {
        new ReservaSolicitacaoTecnica(solicitacao, new BigInteger("4500123456"), LocalDate.now(),
                null, null, null, UUID.randomUUID());
    }

    private static Material material(String codigo) {
        return comId(new Material(codigo, "Material " + codigo, "UN", "MATR", null, null, false, UUID.randomUUID()));
    }

    private static <T> T comId(T entidade) {
        ReflectionTestUtils.setField(entidade, "id", UUID.randomUUID());
        return entidade;
    }
}
