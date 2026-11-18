package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OrdemServicoTest {

    private final OffsetDateTime agora = OffsetDateTime.now().minusMinutes(1);
    private final FichaVeiculo ficha = FichaVeiculo.provisionar(UUID.randomUUID(), "ABC1D23", UUID.randomUUID());
    private final ItemManutencao pastilha = item("PASTILHA", NaturezaServico.SUSPENSAO_FREIOS);
    private final ItemManutencao bateria = item("BATERIA", NaturezaServico.BATERIA);

    private static ItemManutencao item(String nome, NaturezaServico natureza) {
        var item = new ItemManutencao(nome, natureza, null, null);
        ReflectionTestUtils.setField(item, "id", UUID.randomUUID());
        return item;
    }

    private OrdemServico abrir(Criticidade criticidade, Boolean parado) {
        return OrdemServico.abrir(ficha, new OrdemServico.Abertura(TipoManutencao.CORRETIVA, OrigemOrdemServico.VERBAL,
                criticidade, null, "Freio rangendo", null, agora.minusHours(5), 12_000L, null, null, null, parado),
                List.of(pastilha), UUID.randomUUID());
    }

    private static OrdemServico.Encerramento encerramento(OffsetDateTime inicio, OffsetDateTime fim) {
        return new OrdemServico.Encerramento(inicio, fim, "Troca das pastilhas", "2 pastilhas",
                new BigDecimal("350.00"), 12_050L, TipoOficina.INTERNA, null, "Oficina da base", CausaManutencao.DESGASTE_NATURAL);
    }

    @Test
    void urgenteSugereVeiculoParadoDesdeAAbertura() {
        var os = abrir(Criticidade.URGENTE, null);

        assertThat(os.getSituacao()).isEqualTo(SituacaoOrdemServico.PENDENTE);
        assertThat(os.isVeiculoParado()).isTrue();
        assertThat(os.getParadoDesde()).isEqualTo(os.getAbertaEm());
        assertThat(os.isParadaEmCurso()).isTrue();
        assertThat(os.getPlaca()).isEqualTo("ABC1D23");
        assertThat(os.getIdBaseOperacional()).isEqualTo(ficha.getIdBaseOperacional());
    }

    @Test
    void osGuardaAUnidadeDoVeiculoNaAbertura() {
        assertThat(abrir(Criticidade.MEDIA, null).getUnidadeMedicao()).isEqualTo(UnidadeMedicao.KM);

        ficha.definirUnidadeMedicao(UnidadeMedicao.HORAS, false);
        var os = abrir(Criticidade.MEDIA, null);
        ficha.trocarPainel(UnidadeMedicao.KM);

        assertThat(os.getUnidadeMedicao()).isEqualTo(UnidadeMedicao.HORAS);
        assertThatThrownBy(() -> os.concluir(new OrdemServico.Encerramento(agora.minusHours(2), agora, "x", null,
                null, -1L, TipoOficina.INTERNA, null, "Oficina", CausaManutencao.AVARIA)))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessage("Horímetro não pode ser negativo.");
    }

    @Test
    void quemAbrePodeRecusarASugestaoDeParada() {
        assertThat(abrir(Criticidade.URGENTE, false).isVeiculoParado()).isFalse();
        assertThat(abrir(Criticidade.BAIXA, true).isVeiculoParado()).isTrue();
        assertThat(abrir(Criticidade.ALTA, null).isVeiculoParado()).isFalse();
    }

    @Test
    void veiculoBaixadoNaoRecebeOs() {
        var dados = new DadosFichaVeiculo(null, null, null, null, null, null, null, null, null,
                SituacaoOperacional.BAIXADO, RegimeVeiculo.PROPRIO, null, null, null, null, null, null, null);
        ficha.atualizar(dados);

        assertThatThrownBy(() -> abrir(Criticidade.MEDIA, null)).isInstanceOf(InvarianteVioladaException.class);
    }

    @Test
    void exigeAoMenosUmItem() {
        assertThatThrownBy(() -> OrdemServico.abrir(ficha, new OrdemServico.Abertura(TipoManutencao.CORRETIVA,
                OrigemOrdemServico.MANUAL, Criticidade.MEDIA, null, "x", null, agora, null, null, null, null, null),
                List.of(), null)).isInstanceOf(InvarianteVioladaException.class);
    }

    @Test
    void cicloCompletoComDatasReaisELiberacaoDaParada() {
        var os = abrir(Criticidade.URGENTE, null);

        os.agendar(agora.minusHours(4), "Oficina da base");
        assertThat(os.getSituacao()).isEqualTo(SituacaoOrdemServico.AGENDADA);
        os.iniciar(agora.minusHours(3), agora.plusHours(2));
        assertThat(os.getSituacao()).isEqualTo(SituacaoOrdemServico.EM_ANDAMENTO);
        os.concluir(encerramento(null, agora.minusHours(1)));

        assertThat(os.getSituacao()).isEqualTo(SituacaoOrdemServico.CONCLUIDA);
        assertThat(os.getInicioReal()).isEqualTo(agora.minusHours(3));
        assertThat(os.getLiberadoEm()).isEqualTo(agora.minusHours(1));
        assertThat(os.isParadaEmCurso()).isFalse();
        assertThat(os.getOficinaNome()).isEqualTo("Oficina da base");
    }

    @Test
    void lancamentoRetroativoConcluiDiretoDePendente() {
        var os = abrir(Criticidade.MEDIA, null);

        os.concluir(encerramento(agora.minusHours(4), agora.minusHours(2)));

        assertThat(os.getSituacao()).isEqualTo(SituacaoOrdemServico.CONCLUIDA);
    }

    @Test
    void conclusaoExigeInicioEFimCoerentes() {
        var semInicio = abrir(Criticidade.MEDIA, null);
        assertThatThrownBy(() -> semInicio.concluir(encerramento(null, agora)))
                .isInstanceOf(InvarianteVioladaException.class);

        var invertido = abrir(Criticidade.MEDIA, null);
        assertThatThrownBy(() -> invertido.concluir(encerramento(agora, agora.minusHours(1))))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("anterior ao início");
    }

    @Test
    void oficinaExternaPrecisaDeFornecedorOuNome() {
        var os = abrir(Criticidade.MEDIA, null);
        var semOficina = new OrdemServico.Encerramento(agora.minusHours(2), agora.minusHours(1), "Serviço", null,
                null, null, TipoOficina.EXTERNA, null, null, CausaManutencao.AVARIA);

        assertThatThrownBy(() -> os.concluir(semOficina)).isInstanceOf(InvarianteVioladaException.class);
    }

    @Test
    void osEncerradaNaoMudaMais() {
        var os = abrir(Criticidade.MEDIA, null);
        os.cancelar("Aberta em duplicidade", agora);

        assertThat(os.getSituacao()).isEqualTo(SituacaoOrdemServico.CANCELADA);
        assertThatThrownBy(() -> os.agendar(agora, null)).isInstanceOf(InvarianteVioladaException.class);
        assertThatThrownBy(() -> os.concluir(encerramento(agora.minusHours(1), agora)))
                .isInstanceOf(InvarianteVioladaException.class);
        assertThat(os.aceitaOrcamento()).isFalse();
    }

    @Test
    void cancelarLiberaOVeiculoParado() {
        var os = abrir(Criticidade.URGENTE, null);

        os.cancelar("Problema resolvido pelo condutor", agora);

        assertThat(os.getLiberadoEm()).isEqualTo(agora);
        assertThat(os.isParadaEmCurso()).isFalse();
    }

    @Test
    void liberarEMarcarDeNovoReabreOMesmoPeriodo() {
        var os = abrir(Criticidade.URGENTE, null);
        var inicioParada = os.getParadoDesde();

        os.liberarVeiculo(agora.minusHours(2));
        assertThat(os.isParadaEmCurso()).isFalse();
        os.marcarVeiculoParado(agora);

        assertThat(os.isParadaEmCurso()).isTrue();
        assertThat(os.getParadoDesde()).isEqualTo(inicioParada);
        assertThat(os.getLiberadoEm()).isNull();
    }

    @Test
    void liberacaoNaoPodeSerAntesDaParada() {
        var os = abrir(Criticidade.URGENTE, null);

        assertThatThrownBy(() -> os.liberarVeiculo(os.getParadoDesde().minusHours(1)))
                .isInstanceOf(InvarianteVioladaException.class);
    }

    @Test
    void edicaoPreservaItensQueContinuamEDescartaOsRemovidos() {
        var os = abrir(Criticidade.MEDIA, null);
        var itemOriginal = os.getItens().get(0);

        os.editar(new OrdemServico.Edicao(TipoManutencao.CORRETIVA, OrigemOrdemServico.VERBAL, Criticidade.ALTA,
                null, "Freio e bateria", null, null, null, null), List.of(pastilha, bateria, pastilha));

        assertThat(os.getItens()).hasSize(2);
        assertThat(os.getItens().get(0)).isSameAs(itemOriginal);
        assertThat(os.itensManutencao()).containsExactly(pastilha, bateria);
        assertThat(os.getCriticidade()).isEqualTo(Criticidade.ALTA);
    }

    @Test
    void itemDesativadoNaoEntraEmOsNova() {
        bateria.desativar();

        assertThatThrownBy(() -> OrdemServico.abrir(ficha, new OrdemServico.Abertura(TipoManutencao.CORRETIVA,
                OrigemOrdemServico.MANUAL, Criticidade.MEDIA, null, "x", null, agora, null, null, null, null, null),
                List.of(bateria), null)).isInstanceOf(InvarianteVioladaException.class);
    }

    @Test
    void prazoEstouradoAvisaUmaVezPorPrevisao() {
        var os = abrir(Criticidade.MEDIA, null);
        os.iniciar(agora.minusHours(4), agora.minusHours(1));

        assertThat(os.isAtrasada(agora)).isTrue();
        assertThat(os.precisaAvisarPrazo(agora)).isTrue();
        os.registrarAvisoPrazo();
        assertThat(os.precisaAvisarPrazo(agora)).isFalse();

        os.alterarPrevisao(agora.minusMinutes(30));
        assertThat(os.precisaAvisarPrazo(agora)).isTrue();
    }

    @Test
    void referenciaExternaSoPodeSerRegistradaUmaVez() {
        var os = abrir(Criticidade.MEDIA, null);
        os.registrarReferenciaExterna(ReferenciaExterna.de("exp", "OS-123"));

        assertThat(os.getReferenciaExterna().getSistemaOrigem()).isEqualTo("EXP");
        assertThatThrownBy(() -> os.registrarReferenciaExterna(ReferenciaExterna.de("EXP", "OS-124")))
                .isInstanceOf(InvarianteVioladaException.class);
    }

    @Test
    void aprovacaoPendenteDominaASituacaoDoOrcamento() {
        assertThat(SituacaoAprovacaoOrcamento.de(List.of())).isEqualTo(SituacaoAprovacaoOrcamento.SEM_ORCAMENTO);
        assertThat(SituacaoAprovacaoOrcamento.de(List.of("APROVADO", "SOLICITADO")))
                .isEqualTo(SituacaoAprovacaoOrcamento.AGUARDANDO_APROVACAO);
        assertThat(SituacaoAprovacaoOrcamento.de(List.of("APROVADO", "RASCUNHO")))
                .isEqualTo(SituacaoAprovacaoOrcamento.EM_ORCAMENTO);
        assertThat(SituacaoAprovacaoOrcamento.de(List.of("APROVADO", "REJEITADO")))
                .isEqualTo(SituacaoAprovacaoOrcamento.APROVADO);
        assertThat(SituacaoAprovacaoOrcamento.de(List.of("REJEITADO", "CANCELADO")))
                .isEqualTo(SituacaoAprovacaoOrcamento.REPROVADO);
        assertThat(SituacaoAprovacaoOrcamento.de(List.of("CANCELADO")))
                .isEqualTo(SituacaoAprovacaoOrcamento.SEM_ORCAMENTO);
    }

    @Test
    void fichaEntraESaiDaManutencaoSemPassarPorCimaDeOutraSituacao() {
        ficha.entrarEmManutencao();
        assertThat(ficha.getSituacao()).isEqualTo(SituacaoOperacional.EM_MANUTENCAO);
        ficha.sairDaManutencao();
        assertThat(ficha.getSituacao()).isEqualTo(SituacaoOperacional.ATIVO);

        var reserva = FichaVeiculo.provisionar(UUID.randomUUID(), "XYZ9A88", null);
        reserva.atualizar(new DadosFichaVeiculo(null, null, null, null, null, null, null, null, null,
                SituacaoOperacional.RESERVA, RegimeVeiculo.PROPRIO, null, null, null, null, null, null, null));
        reserva.entrarEmManutencao();
        assertThat(reserva.getSituacao()).isEqualTo(SituacaoOperacional.RESERVA);
    }

    // ── Baixa pendente, volta para em andamento e parada automática (pedidos de 10/11/2026) ──

    @Test
    void iniciarOServicoContaOVeiculoComoParado() {
        var os = abrir(Criticidade.BAIXA, null);
        assertThat(os.isVeiculoParado()).isFalse();

        os.iniciar(agora.minusHours(3), null);

        assertThat(os.isParadaEmCurso()).isTrue();
        assertThat(os.getParadoDesde()).isEqualTo(agora.minusHours(3));
    }

    @Test
    void pecaSemValorDeixaValoresPendentesEAOsFinalizaSozinhaQuandoOValorEntra() {
        var os = abrir(Criticidade.MEDIA, null);
        os.iniciar(agora.minusHours(3), null);
        var filtro = os.lancarPeca(new OrdemServico.DadosPeca("Filtro de óleo", null, OrigemPeca.COMPRA, BigDecimal.ONE, "UN", BigDecimal.ZERO));

        os.concluir(new OrdemServico.Encerramento(null, agora.minusHours(1), "Troca do filtro", null, null, null,
                TipoOficina.EXTERNA, null, "Auto Center", CausaManutencao.DESGASTE_NATURAL));

        assertThat(os.getSituacao()).isEqualTo(SituacaoOrdemServico.CONCLUIDA);
        assertThat(os.isBaixaPendente()).isTrue();
        assertThat(os.pendencias()).containsExactly("Peça: Filtro de óleo");
        assertThat(os.finalizarSeCompleta(UUID.randomUUID())).isFalse();

        os.alterarPeca(filtro.getId() == null ? idDe(filtro) : filtro.getId(),
                new OrdemServico.DadosPeca("Filtro de óleo", null, OrigemPeca.COMPRA, BigDecimal.ONE, "UN", new BigDecimal("80")));
        os.atualizarValorPelaExecucao();

        assertThat(os.finalizarSeCompleta(UUID.randomUUID())).isTrue();
        assertThat(os.isBaixaPendente()).isFalse();
        assertThat(os.getFinalizadaEm()).isNotNull();
        assertThat(os.getValorTotal()).isEqualByComparingTo("80");
        assertThatThrownBy(() -> os.lancarPeca(new OrdemServico.DadosPeca("Óleo", null, OrigemPeca.COMPRA, BigDecimal.ONE,
                "L", BigDecimal.TEN)))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("já está finalizada");
    }

    @Test
    void lancamentoSemCustoNaoDeixaPendencia() {
        var os = abrir(Criticidade.MEDIA, null);
        var lampada = os.lancarPeca(new OrdemServico.DadosPeca("Lâmpada H4", null, OrigemPeca.COMPRA, BigDecimal.ONE, "UN", BigDecimal.ZERO));
        os.definirSemCusto(lampada, true);

        os.concluir(encerramento(agora.minusHours(3), agora.minusHours(1)));

        assertThat(os.pendencias()).isEmpty();
        assertThat(os.isBaixaPendente()).isFalse();
    }

    @Test
    void semCustoNaoValeParaLancamentoComValor() {
        var os = abrir(Criticidade.MEDIA, null);
        var peca = os.lancarPeca(new OrdemServico.DadosPeca("Lâmpada H4", null, OrigemPeca.COMPRA, BigDecimal.ONE, "UN", BigDecimal.TEN));

        os.definirSemCusto(peca, true);

        assertThat(peca.isSemCusto()).isFalse();
    }

    @Test
    void servicoSemValorNaOficinaExternaFicaPendente() {
        var os = abrir(Criticidade.MEDIA, null);
        os.lancarServico(new OrdemServico.DadosServico("Troca da lâmpada", null, null, null, BigDecimal.ONE, BigDecimal.ZERO));

        os.concluir(new OrdemServico.Encerramento(agora.minusHours(3), agora.minusHours(1), "Troca da lâmpada", null, null,
                null, TipoOficina.EXTERNA, null, "Auto Elétrica", CausaManutencao.DESGASTE_NATURAL));

        assertThat(os.pendencias()).containsExactly("Serviço: Troca da lâmpada");
    }

    @Test
    void semLancamentosEValorEmBrancoFicaPendenteAteCompletar() {
        var os = abrir(Criticidade.MEDIA, null);
        os.concluir(new OrdemServico.Encerramento(agora.minusHours(3), agora.minusHours(1), "Troca da lâmpada", null, null,
                null, TipoOficina.INTERNA, null, "Oficina da base", CausaManutencao.DESGASTE_NATURAL));

        assertThat(os.pendencias()).containsExactly("Valor da OS");

        boolean finalizada = os.completarConclusao(new OrdemServico.Baixa("Troca da lâmpada", null, new BigDecimal("25"),
                TipoOficina.INTERNA, null, "Oficina da base", CausaManutencao.DESGASTE_NATURAL), UUID.randomUUID());

        assertThat(finalizada).isTrue();
        assertThat(os.getValorTotal()).isEqualByComparingTo("25");
    }

    @Test
    void concluidaSoComAsDatasAntesDaRegraPedeCausaEServico() {
        var os = abrir(Criticidade.MEDIA, null);
        os.concluir(new OrdemServico.Encerramento(agora.minusHours(3), agora.minusHours(1), null, null));

        assertThat(os.pendencias()).containsExactly("Causa e serviço realizado", "Valor da OS");
        assertThatThrownBy(() -> os.completarConclusao(new OrdemServico.Baixa("Feito", null, null, TipoOficina.INTERNA, null,
                "Oficina", null), null))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessage("Informe a causa da manutenção.");
    }

    private static UUID idDe(Object entidade) {
        UUID id = UUID.randomUUID();
        ReflectionTestUtils.setField(entidade, "id", id);
        return id;
    }

    @Test
    void conclusaoDiretaContaOTempoDeOficinaComoParado() {
        var os = abrir(Criticidade.BAIXA, null);

        os.concluir(encerramento(agora.minusHours(4), agora.minusHours(1)));

        assertThat(os.isVeiculoParado()).isTrue();
        assertThat(os.getParadoDesde()).isEqualTo(agora.minusHours(4));
        assertThat(os.getLiberadoEm()).isEqualTo(agora.minusHours(1));
        assertThat(os.isBaixaPendente()).isFalse();
    }

    @Test
    void osConcluidaVoltaParaEmAndamentoEOVeiculoParaDeNovo() {
        var os = abrir(Criticidade.MEDIA, null);
        os.iniciar(agora.minusHours(3), null);
        os.concluir(encerramento(null, agora.minusHours(1)));

        os.reabrir();

        assertThat(os.getSituacao()).isEqualTo(SituacaoOrdemServico.EM_ANDAMENTO);
        assertThat(os.getFimReal()).isNull();
        assertThat(os.getFinalizadaEm()).isNull();
        assertThat(os.isParadaEmCurso()).isTrue();
        assertThat(os.getParadoDesde()).isEqualTo(agora.minusHours(3));
        assertThatThrownBy(os::reabrir).isInstanceOf(InvarianteVioladaException.class);
    }

    @Test
    void osDoPlanoNasceComPecasEMaoDeObraComValorZero() {
        var oleo = item("ÓLEO DO MOTOR", NaturezaServico.SUSPENSAO_FREIOS);
        oleo.definirTipo(TipoItemManutencao.PECA);
        var os = abrir(Criticidade.MEDIA, null);

        os.preLancarItens(List.of(oleo, pastilha));
        os.preLancarItens(List.of(oleo));

        assertThat(os.getPecas()).singleElement().satisfies(p -> {
            assertThat(p.getDescricao()).isEqualTo("ÓLEO DO MOTOR");
            assertThat(p.getIdItemManutencao()).isEqualTo(oleo.getId());
            assertThat(p.getSubtotal()).isEqualByComparingTo("0");
        });
        assertThat(os.getServicos()).singleElement().satisfies(sv -> {
            assertThat(sv.getItem()).isEqualTo(pastilha);
            assertThat(sv.getSubtotal()).isEqualByComparingTo("0");
        });
    }

    @Test
    void planoComPlacasValeSoParaElas() {
        UUID placa = UUID.randomUUID();
        UUID tipo = UUID.randomUUID();
        var plano = new PlanoPreventivo(new PlanoPreventivo.Dados("Revisão", null, java.util.Set.of(tipo), java.util.Set.of(),
                10_000L, null, null, null, null, null, Criticidade.MEDIA, false, List.of(pastilha), List.of(),
                java.util.Set.of(placa)));

        assertThat(plano.aplicaA(placa, null, java.util.Set.of())).isTrue();
        assertThat(plano.aplicaA(UUID.randomUUID(), tipo, java.util.Set.of())).isFalse();
        assertThat(plano.getIdsTiposVeiculo()).isEmpty();
    }
}
