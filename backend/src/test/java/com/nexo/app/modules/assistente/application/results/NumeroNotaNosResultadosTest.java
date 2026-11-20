package com.nexo.app.modules.assistente.application.results;

import com.nexo.app.modules.assistente.application.rastreio.NumerosDeNota;
import com.nexo.app.shared.application.analytics.SemanticQueryContext;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.StaticListableBeanFactory;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class NumeroNotaNosResultadosTest {

    private static final UUID NOTA_A = UUID.fromString("8314693f-0000-4000-8000-000000000001");
    private static final UUID NOTA_B = UUID.fromString("8314693f-0000-4000-8000-000000000002");

    private final NumerosDeNota fonte = new NumerosDeNota() {
        @Override
        public Set<String> autoridades() {
            return Set.of("execucao:comercial:read");
        }

        @Override
        public Map<UUID, String> numeros(Collection<UUID> execucoes) {
            return Map.of(NOTA_A, "1234567890");
        }
    };

    private NumeroNotaNosResultados enriquecedor() {
        StaticListableBeanFactory beans = new StaticListableBeanFactory();
        beans.addBean("numeros", fonte);
        return new NumeroNotaNosResultados(beans.getBeanProvider(NumerosDeNota.class));
    }

    private static TabularData notas() {
        return new TabularData(List.of(
                new TabularData.Column("execucao_id", TabularData.ColumnType.TEXTO),
                new TabularData.Column("valor", TabularData.ColumnType.NUMERO)),
                List.of(List.of(NOTA_A.toString(), 99.13), List.of(NOTA_B.toString(), 40)), 2, false);
    }

    @Test
    void numeroDaNotaEntraAoLadoDoIdentificador() {
        SemanticQueryContext gestor = new SemanticQueryContext(UUID.randomUUID(), Set.of("execucao:comercial:read"));

        TabularData resultado = enriquecedor().enriquecer(notas(), gestor);

        assertThat(resultado.columns()).extracting(TabularData.Column::name).containsExactly("execucao_id", "numero_nota", "valor");
        assertThat(resultado.rows().get(0)).containsExactly(NOTA_A.toString(), "1234567890", 99.13);
        assertThat(resultado.rows().get(1).get(1)).isNull();
        assertThat(resultado.totalRows()).isEqualTo(2);
    }

    @Test
    void semPermissaoDeVerNotasOResultadoFicaComoVeio() {
        SemanticQueryContext semNotas = new SemanticQueryContext(UUID.randomUUID(), Set.of("estoque:saldo:read"));

        TabularData resultado = enriquecedor().enriquecer(notas(), semNotas);

        assertThat(resultado.columns()).extracting(TabularData.Column::name).containsExactly("execucao_id", "valor");
    }

    @Test
    void resultadoQueJaTemONumeroNaoGanhaOutraColuna() {
        TabularData comNumero = NumeroNotaNosResultados.comNumeros(notas(), 0, Map.of());
        SemanticQueryContext gestor = new SemanticQueryContext(UUID.randomUUID(), Set.of("execucao:comercial:read"));

        assertThat(enriquecedor().enriquecer(comNumero, gestor).columns()).hasSize(3);
    }
}
