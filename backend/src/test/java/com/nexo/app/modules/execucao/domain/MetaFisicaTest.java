package com.nexo.app.modules.execucao.domain;

import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;

class MetaFisicaTest {

    private static final YearMonth NOVEMBRO = YearMonth.of(2026, 11);
    private final UUID corte = UUID.randomUUID();
    private final UUID enlace = UUID.randomUUID();
    private final UUID baixa = UUID.randomUUID();

    @Test
    @DisplayName("Remanso: total 626 com parcial 215/28/12 vira 528/69/29 e fecha com o total")
    void distribuiProporcionalAoParcial() {
        assertThat(DistribuicaoMetaFisica.distribuir(626, List.of(215, 28, 12))).containsExactly(528, 69, 29);
    }

    @Test
    @DisplayName("Sobra vai para os maiores restos; no empate, para o maior parcial")
    void maioresRestos() {
        assertThat(DistribuicaoMetaFisica.distribuir(10, List.of(1, 1, 1))).containsExactly(4, 3, 3);
        assertThat(DistribuicaoMetaFisica.distribuir(100, List.of(0, 5))).containsExactly(0, 100);
        assertThat(DistribuicaoMetaFisica.distribuir(7, List.of(2, 3, 2))).containsExactly(2, 3, 2);
    }

    @Test
    @DisplayName("Sem parcial ou com parcial zerado não há como repartir o total")
    void parcialInvalido() {
        assertThatThrownBy(() -> DistribuicaoMetaFisica.distribuir(626, List.of(0, 0)))
                .isInstanceOf(InvarianteVioladaException.class);
        assertThatThrownBy(() -> DistribuicaoMetaFisica.distribuir(0, List.of(1)))
                .isInstanceOf(InvarianteVioladaException.class);
    }

    @Test
    @DisplayName("Com o total da Concessionária, a meta guarda total, parcial e a quantidade calculada de cada serviço")
    void metaPeloParcial() {
        MetaFisica meta = new MetaFisica(UUID.randomUUID(), NOVEMBRO);
        meta.definir(626, LocalDate.of(2026, 11, 13), " Meta de novembro ", List.of(
                new MetaFisica.Servico(corte, null, 215),
                new MetaFisica.Servico(enlace, null, 28),
                new MetaFisica.Servico(baixa, null, 12)));

        assertThat(meta.total()).isEqualTo(626);
        assertThat(meta.getCompetencia()).isEqualTo(LocalDate.of(2026, 11, 1));
        assertThat(meta.getDescricao()).isEqualTo("Meta de novembro");
        assertThat(meta.getItens()).extracting(MetaFisicaItem::getIdTipoServico, MetaFisicaItem::getQuantidade,
                        MetaFisicaItem::getParcialConcessionária)
                .containsExactly(tuple(corte, 528, 215), tuple(enlace, 69, 28), tuple(baixa, 29, 12));
        // Novembro/2026: 2 (Finados) e 20 (Consciência Negra) caem em dia útil.
        assertThat(meta.diasUteis()).isEqualTo(19);
    }

    @Test
    @DisplayName("Editar troca as quantidades no lugar, tira o serviço que saiu e descarta o parcial na meta mensal")
    void editarMantemItens() {
        MetaFisica meta = new MetaFisica(UUID.randomUUID(), NOVEMBRO);
        meta.definir(626, LocalDate.of(2026, 11, 13), null, List.of(
                new MetaFisica.Servico(corte, null, 215),
                new MetaFisica.Servico(enlace, null, 28)));
        MetaFisicaItem itemCorte = meta.getItens().getFirst();

        meta.definir(null, LocalDate.of(2026, 11, 13), null, List.of(
                new MetaFisica.Servico(corte, 595, 999),
                new MetaFisica.Servico(baixa, 32, null)));

        assertThat(meta.getTotalMesConcessionária()).isNull();
        assertThat(meta.getParcialAte()).isNull();
        assertThat(meta.getItens()).extracting(MetaFisicaItem::getIdTipoServico, MetaFisicaItem::getQuantidade,
                        MetaFisicaItem::getParcialConcessionária)
                .containsExactly(tuple(corte, 595, null), tuple(baixa, 32, null));
        assertThat(meta.getItens().getFirst()).isSameAs(itemCorte);
    }

    @Test
    @DisplayName("Rejeita meta sem serviço, serviço repetido, meta zerada e parcial de outro mês")
    void invariantes() {
        MetaFisica meta = new MetaFisica(UUID.randomUUID(), NOVEMBRO);
        assertThatThrownBy(() -> meta.definir(null, null, null, List.of()))
                .hasMessageContaining("ao menos um tipo");
        assertThatThrownBy(() -> meta.definir(null, null, null, List.of(
                new MetaFisica.Servico(corte, 1, null), new MetaFisica.Servico(corte, 2, null))))
                .hasMessageContaining("duas vezes");
        assertThatThrownBy(() -> meta.definir(null, null, null, List.of(new MetaFisica.Servico(corte, 0, null))))
                .hasMessageContaining("ao menos uma nota");
        assertThatThrownBy(() -> meta.definir(null, null, null, List.of(new MetaFisica.Servico(corte, null, null))))
                .hasMessageContaining("meta do mês de cada serviço");
        assertThatThrownBy(() -> meta.definir(100, LocalDate.of(2026, 10, 31), null,
                List.of(new MetaFisica.Servico(corte, null, 10))))
                .hasMessageContaining("mês da meta");
    }

    @Test
    @DisplayName("Duas metas da mesma base no mesmo mês conflitam; outra base ou outro mês, não")
    void conflito() {
        UUID base = UUID.randomUUID();
        MetaFisica novembro = new MetaFisica(base, NOVEMBRO);
        assertThat(novembro.conflitaCom(new MetaFisica(base, NOVEMBRO))).isTrue();
        assertThat(novembro.conflitaCom(new MetaFisica(base, NOVEMBRO.plusMonths(1)))).isFalse();
        assertThat(novembro.conflitaCom(new MetaFisica(UUID.randomUUID(), NOVEMBRO))).isFalse();
    }
}
