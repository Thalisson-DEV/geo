package com.nexo.app.modules.obras.domain;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** Execução avulsa: a programação nasce vazia, recebe só o que foi apontado e congela o valor como as demais. */
class ExecucaoAvulsaTest {

    private static final UUID OBRA = UUID.randomUUID();
    private static final UUID EQUIPE = UUID.randomUUID();
    private static final UUID PONTO = UUID.randomUUID();
    private static final LocalDate DIA = LocalDate.of(2026, 11, 21);

    private final KitAplicado kit = KitAplicado.noPonto(OBRA, PONTO,
            new KitConstrutivo(UUID.randomUUID(), "LMI-0168", "POSTE", "POSTE", Set.of()), null, BigDecimal.ONE, List.of(
                    new KitAplicado.ModeloItem(TipoItemKit.SERVICO, UUID.randomUUID(), "S1", "Instalar poste", OperacaoItemKit.INSTALAR, "UN", BigDecimal.ONE),
                    new KitAplicado.ModeloItem(TipoItemKit.MATERIAL, UUID.randomUUID(), "M1", "Poste", OperacaoItemKit.INSTALAR, "UN", BigDecimal.ONE)));

    private Programacao avulsa(String motivo) {
        kit.getItens().forEach(i -> ReflectionTestUtils.setField(i, "id", UUID.randomUUID()));
        Programacao p = Programacao.avulsa(1800, OBRA, EQUIPE, DIA, motivo);
        ReflectionTestUtils.setField(p, "id", UUID.randomUUID());
        return p;
    }

    @Test
    void nasceVaziaNoDiaComOMotivoNaDescricao() {
        Programacao p = avulsa("Emergência");

        assertThat(p.isAvulsa()).isTrue();
        assertThat(p.getDescricao()).isEqualTo("Execução avulsa: Emergência");
        assertThat(p.getDataInicio()).isEqualTo(DIA);
        assertThat(p.getDataFim()).isEqualTo(DIA);
        assertThat(p.getItensAtivos()).isEmpty();
        assertThat(Programacao.avulsa(1801, OBRA, EQUIPE, DIA, null).getDescricao()).isEqualTo("Execução avulsa");
    }

    @Test
    void recebeOsItensDoPontoEApontaOPontoInteiro() {
        Programacao p = avulsa("Pedido da supervisão");
        kit.getItensAtivos().forEach(i -> p.incluirItem(i, i.getTipo() == TipoItemKit.SERVICO ? new BigDecimal("120.00") : null));

        assertThat(p.contem(kit.getItensAtivos().get(0).getId())).isTrue();
        assertThat(kit.getItensAtivos()).noneMatch(ItemPlanejado::programavel);

        List<ApontamentoExecucao> feitos = p.apontarLocalInteiro(PONTO, DIA, UUID.randomUUID());

        assertThat(feitos).hasSize(2);
        assertThat(kit.getItensAtivos()).allMatch(ItemPlanejado::concluido);
        assertThat(p.valorRealizado()).isEqualByComparingTo("120.00");
    }
}
