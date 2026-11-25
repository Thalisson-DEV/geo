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

class ExecucaoOrdemServicoTest {

    private final OffsetDateTime agora = OffsetDateTime.now().minusMinutes(1);
    private final FichaVeiculo ficha = FichaVeiculo.provisionar(UUID.randomUUID(), "ABC1D23", UUID.randomUUID());
    private final ItemManutencao pastilha = item();
    private final UUID joao = UUID.randomUUID();

    private static ItemManutencao item() {
        var item = new ItemManutencao("PASTILHA", "SUSPENSAO_FREIOS", null, null);
        ReflectionTestUtils.setField(item, "id", UUID.randomUUID());
        return item;
    }

    private OrdemServico abrir(TipoOficina oficina) {
        return OrdemServico.abrir(ficha, new OrdemServico.Abertura(TipoManutencao.CORRETIVA, OrigemOrdemServico.VERBAL,
                Criticidade.MEDIA, null, "Freio rangendo", null, agora.minusHours(5), null, oficina, null,
                oficina == TipoOficina.EXTERNA ? "Oficina do Zé" : null, false), List.of(pastilha), UUID.randomUUID());
    }

    private static OrdemServico.DadosServico servico(UUID mecanico, String nome) {
        return new OrdemServico.DadosServico("Troca de pastilhas", null, mecanico, nome,
                new BigDecimal("1.5"), new BigDecimal("80"));
    }

    private static OrdemServico.DadosPeca oleo(String quantidade) {
        return new OrdemServico.DadosPeca("Óleo 15W40", null, OrigemPeca.ESTOQUE, new BigDecimal(quantidade), "l",
                new BigDecimal("32.50"));
    }

    private static <T extends com.nexo.app.shared.domain.BaseEntity> T comId(T entidade) {
        ReflectionTestUtils.setField(entidade, "id", UUID.randomUUID());
        return entidade;
    }

    @Test
    void servicoNaOficinaInternaComColaboradorCalculaOSubtotal() {
        var os = abrir(TipoOficina.INTERNA);

        var lancado = os.lancarServico(servico(joao, null));

        assertThat(lancado.getSubtotal()).isEqualByComparingTo("120.00");
        assertThat(lancado.getIdMecanico()).isEqualTo(joao);
        assertThat(os.getServicos()).hasSize(1);
    }

    @Test
    void oficinaInternaExigeColaboradorEExternaSoAceitaNome() {
        var interna = abrir(TipoOficina.INTERNA);
        assertThatThrownBy(() -> interna.lancarServico(servico(null, "João da oficina")))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("escolha o mecânico entre os colaboradores");

        var externa = abrir(TipoOficina.EXTERNA);
        assertThatThrownBy(() -> externa.lancarServico(servico(joao, null)))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("pelo nome");
        assertThat(externa.lancarServico(servico(null, "  Zé  ")).getMecanicoNome()).isEqualTo("Zé");
        assertThat(externa.lancarServico(servico(null, null)).getMecanicoNome()).isNull();
    }

    @Test
    void pecaDeEstoqueCalculaOSubtotalEPadronizaAUnidade() {
        var os = abrir(TipoOficina.INTERNA);

        var peca = os.lancarPeca(oleo("4"));

        assertThat(peca.getSubtotal()).isEqualByComparingTo("130.00");
        assertThat(peca.getUnidade()).isEqualTo("L");
        assertThat(peca.getOrigem()).isEqualTo(OrigemPeca.ESTOQUE);
    }

    @Test
    void quantidadeZeroOuComMaisDeTresCasasERecusada() {
        var os = abrir(TipoOficina.INTERNA);

        assertThatThrownBy(() -> os.lancarPeca(oleo("0"))).hasMessageContaining("maior que zero");
        assertThatThrownBy(() -> os.lancarPeca(oleo("1.2345"))).hasMessageContaining("3 casas");
    }

    @Test
    void subtotalArredondaEmCentavos() {
        var os = abrir(TipoOficina.INTERNA);

        var peca = os.lancarPeca(new OrdemServico.DadosPeca("Diesel", null, OrigemPeca.COMPRA, new BigDecimal("10.555"),
                "L", new BigDecimal("5.8790")));

        assertThat(peca.getSubtotal()).isEqualByComparingTo("62.05");
    }

    @Test
    void alterarEExcluirPeloId() {
        var os = abrir(TipoOficina.INTERNA);
        var servico = comId(os.lancarServico(servico(joao, null)));
        var peca = comId(os.lancarPeca(oleo("4")));

        os.alterarServico(servico.getId(), new OrdemServico.DadosServico("Regulagem", null, joao, null,
                BigDecimal.ONE, new BigDecimal("50")));
        os.excluirPeca(peca.getId());

        assertThat(servico.getDescricao()).isEqualTo("Regulagem");
        assertThat(servico.getSubtotal()).isEqualByComparingTo("50.00");
        assertThat(os.getPecas()).isEmpty();
        assertThatThrownBy(() -> os.excluirPeca(UUID.randomUUID())).hasMessageContaining("não encontrada");
    }

    @Test
    void mesmoMecanicoParaTodos() {
        var os = abrir(TipoOficina.INTERNA);
        os.lancarServico(servico(joao, null));
        os.lancarServico(servico(joao, null));
        UUID ana = UUID.randomUUID();

        os.definirMecanicoParaTodos(ana, null);

        assertThat(os.getServicos()).allMatch(s -> ana.equals(s.getIdMecanico()));
    }

    private OrdemServico.Encerramento encerramento(BigDecimal valorDigitado, String causa) {
        return new OrdemServico.Encerramento(agora.minusHours(2), agora, "Feito", null, valorDigitado, null,
                TipoOficina.INTERNA, null, null, causa);
    }

    @Test
    void totalComDescontoEAcrescimo() {
        var os = abrir(TipoOficina.INTERNA);
        os.lancarServico(servico(joao, null));
        os.lancarPeca(oleo("4"));

        os.definirAjustes(new BigDecimal("20"), new BigDecimal("5.50"));

        var totais = os.totais();
        assertThat(totais.servicos()).isEqualByComparingTo("120.00");
        assertThat(totais.pecas()).isEqualByComparingTo("130.00");
        assertThat(totais.total()).isEqualByComparingTo("235.50");
    }

    @Test
    void descontoNaoPassaDaSomaNemPermiteExcluirOQueOSustenta() {
        var os = abrir(TipoOficina.INTERNA);
        var servico = comId(os.lancarServico(servico(joao, null)));
        os.lancarPeca(oleo("4"));

        assertThatThrownBy(() -> os.definirAjustes(new BigDecimal("251"), null)).hasMessageContaining("não pode ser maior");
        os.definirAjustes(new BigDecimal("200"), null);
        assertThatThrownBy(() -> os.excluirServico(servico.getId())).hasMessageContaining("Reduza o desconto");
    }

    @Test
    void ajusteSemLancamentosERecusado() {
        var os = abrir(TipoOficina.INTERNA);

        assertThatThrownBy(() -> os.definirAjustes(BigDecimal.TEN, null)).hasMessageContaining("Lance serviços ou peças");
    }

    @Test
    void conclusaoExigeCausaEUsaOValorCalculado() {
        var os = abrir(TipoOficina.INTERNA);
        os.lancarServico(servico(joao, null));
        os.lancarPeca(oleo("4"));

        assertThatThrownBy(() -> os.concluir(encerramento(new BigDecimal("300"), null)))
                .hasMessage("Informe a causa da manutenção.");
        os.concluir(encerramento(new BigDecimal("300"), "DESGASTE_NATURAL"));

        assertThat(os.getValorTotal()).isEqualByComparingTo("250.00");
        assertThat(os.getCausa()).isEqualTo("DESGASTE_NATURAL");
    }

    @Test
    void maoDeObraDaOficinaInternaPodeFicarZeradaSemDeixarPendencia() {
        var os = abrir(TipoOficina.INTERNA);
        os.lancarServico(new OrdemServico.DadosServico("Troca da lâmpada", null, UUID.randomUUID(), null,
                BigDecimal.ONE, BigDecimal.ZERO));
        os.lancarPeca(new OrdemServico.DadosPeca("Lâmpada H4", null, OrigemPeca.COMPRA, BigDecimal.ONE, "UN", BigDecimal.ZERO));

        os.concluir(encerramento(null, "DESGASTE_NATURAL"));

        assertThat(os.pendencias()).containsExactly("Peça: Lâmpada H4");
        assertThat(os.isBaixaPendente()).isTrue();
    }

    @Test
    void semLancamentosValeOValorDigitado() {
        var os = abrir(TipoOficina.INTERNA);

        os.concluir(encerramento(new BigDecimal("500"), "AVARIA"));

        assertThat(os.getValorTotal()).isEqualByComparingTo("500");
    }

    @Test
    void oficinaQueVirouInternaExigeMecanicoColaboradorNaConclusao() {
        var os = abrir(TipoOficina.EXTERNA);
        os.lancarServico(servico(null, "Zé"));

        assertThatThrownBy(() -> os.concluir(encerramento(null, "AVARIA")))
                .hasMessageContaining("todo serviço precisa de um mecânico colaborador");
    }

    private OrdemServico.Abertura aberturaSemVeiculo(Long km, UUID condutor, Boolean parado) {
        return new OrdemServico.Abertura(TipoManutencao.CORRETIVA, OrigemOrdemServico.MANUAL, Criticidade.URGENTE, null,
                "Disco travando", condutor, agora.minusHours(1), km, TipoOficina.INTERNA, null, null, parado);
    }

    @Test
    void manutencaoDeFerramentalSemVeiculo() {
        UUID base = UUID.randomUUID();

        var os = OrdemServico.abrirSemVeiculo(base, "Esmerilhadeira da oficina", aberturaSemVeiculo(null, null, null),
                List.of(pastilha), UUID.randomUUID());

        assertThat(os.isVeicular()).isFalse();
        assertThat(os.getIdVeiculo()).isNull();
        assertThat(os.getIdBaseOperacional()).isEqualTo(base);
        assertThat(os.identificacao()).isEqualTo("Esmerilhadeira da oficina");
        // Urgente não sugere parada quando não há veículo.
        assertThat(os.isVeiculoParado()).isFalse();
        assertThatThrownBy(() -> os.marcarVeiculoParado(agora)).hasMessageContaining("não marca veículo parado");
    }

    @Test
    void semVeiculoRecusaEquipamentoVazioKmCondutorEParada() {
        UUID base = UUID.randomUUID();

        assertThatThrownBy(() -> OrdemServico.abrirSemVeiculo(base, " ", aberturaSemVeiculo(null, null, null),
                List.of(pastilha), null)).hasMessageContaining("nome do equipamento");
        assertThatThrownBy(() -> OrdemServico.abrirSemVeiculo(null, "Gerador", aberturaSemVeiculo(null, null, null),
                List.of(pastilha), null)).hasMessageContaining("base");
        assertThatThrownBy(() -> OrdemServico.abrirSemVeiculo(base, "Gerador", aberturaSemVeiculo(10L, null, null),
                List.of(pastilha), null)).hasMessageContaining("não registra KM");
        assertThatThrownBy(() -> OrdemServico.abrirSemVeiculo(base, "Gerador", aberturaSemVeiculo(null, joao, null),
                List.of(pastilha), null)).hasMessageContaining("não tem condutor");
        assertThatThrownBy(() -> OrdemServico.abrirSemVeiculo(base, "Gerador", aberturaSemVeiculo(null, null, true),
                List.of(pastilha), null)).hasMessageContaining("não marca veículo parado");
    }

    @Test
    void osFinalizadaNaoAceitaLancamento() {
        var os = abrir(TipoOficina.INTERNA);
        os.concluir(new OrdemServico.Encerramento(agora.minusHours(2), agora, "Trocadas", null, new BigDecimal("100"),
                null, TipoOficina.INTERNA, null, null, "AVARIA"));

        assertThatThrownBy(() -> os.lancarPeca(oleo("1")))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("já está finalizada");
    }
}
