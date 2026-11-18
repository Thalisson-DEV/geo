package com.nexo.app.modules.estoque.domain;

import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SuppressWarnings("deprecation")
class MaterialEquivalenciaTest {

    private static Material material(String unidade) {
        return new Material("MAT-1", "Material de teste", unidade, "MATR", null, null, false, UUID.randomUUID());
    }

    @Test
    void caboRecebidoEmQuiloViraMetro() {
        Material cabo = material("MT");
        cabo.definirEquivalencias(List.of(new Material.Equivalencia("kg", new BigDecimal("1"), new BigDecimal("4.2"))));

        QuantidadeConvertida q = cabo.converterParaBase(new BigDecimal("30"), "KG");

        assertThat(q.base()).isEqualByComparingTo("126");
        assertThat(q.informada()).isEqualByComparingTo("30");
        assertThat(q.unidadeInformada()).isEqualTo("KG");
        assertThat(q.convertida()).isTrue();
    }

    @Test
    void fitaUsadaEmMetrosBaixaFracaoDoRoloEFechaUmaUnidade() {
        Material fita = material("UN");
        fita.definirEquivalencias(List.of(new Material.Equivalencia("M", new BigDecimal("20"), BigDecimal.ONE)));

        BigDecimal total = BigDecimal.ZERO;
        for (String metros : List.of("2.5", "7.5", "4", "6")) {
            total = total.add(fita.converterParaBase(new BigDecimal(metros), "m").base());
        }

        assertThat(fita.converterParaBase(new BigDecimal("2.5"), "M").base()).isEqualByComparingTo("0.125");
        assertThat(total).isEqualByComparingTo("1");
    }

    @Test
    void unidadeDoMaterialOuVaziaPassaDireto() {
        Material cabo = material("MT");
        assertThat(cabo.converterParaBase(new BigDecimal("5"), null).convertida()).isFalse();
        assertThat(cabo.converterParaBase(new BigDecimal("5"), "mt").base()).isEqualByComparingTo("5");
    }

    @Test
    void unidadeSemEquivalenciaERecusada() {
        Material cabo = material("MT");
        assertThatThrownBy(() -> cabo.converterParaBase(BigDecimal.ONE, "KG"))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("KG");
    }

    @Test
    void equivalenciaNaoRepeteNemUsaAPropriaUnidade() {
        Material cabo = material("MT");
        assertThatThrownBy(() -> cabo.definirEquivalencias(List.of(
                new Material.Equivalencia("MT", BigDecimal.ONE, BigDecimal.ONE))))
                .isInstanceOf(InvarianteVioladaException.class);
        assertThatThrownBy(() -> cabo.definirEquivalencias(List.of(
                new Material.Equivalencia("KG", BigDecimal.ONE, BigDecimal.TEN),
                new Material.Equivalencia("kg", BigDecimal.ONE, BigDecimal.TEN))))
                .isInstanceOf(InvarianteVioladaException.class);
    }

    @Test
    void trocarEquivalenciasDesativaAQueSaiu() {
        Material cabo = material("MT");
        cabo.definirEquivalencias(List.of(
                new Material.Equivalencia("KG", BigDecimal.ONE, new BigDecimal("4.2")),
                new Material.Equivalencia("RL", BigDecimal.ONE, new BigDecimal("100"))));
        cabo.definirEquivalencias(List.of(new Material.Equivalencia("KG", BigDecimal.ONE, new BigDecimal("4"))));

        assertThat(cabo.getEquivalencias()).extracting(UnidadeEquivalenteMaterial::getUnidade).containsExactly("KG");
        assertThat(cabo.converterParaBase(BigDecimal.TEN, "KG").base()).isEqualByComparingTo("40");
    }
}
