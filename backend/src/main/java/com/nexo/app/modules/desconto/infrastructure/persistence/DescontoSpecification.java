package com.nexo.app.modules.desconto.infrastructure.persistence;

import com.nexo.app.modules.desconto.application.dto.DescontoFilter;
import com.nexo.app.modules.desconto.domain.Desconto;
import com.nexo.app.modules.desconto.domain.StatusDesconto;
import com.nexo.app.shared.application.SelecaoMultipla;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Order;
import jakarta.persistence.criteria.Predicate;
import org.hibernate.query.criteria.JpaExpression;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public class DescontoSpecification {

    public static Specification<Desconto> comFiltros(DescontoFilter filtro) {
        return comFiltros(filtro, BuscaGlobal.nenhuma());
    }

    /**
     * @param busca o que a busca rápida já resolveu fora deste módulo: os colaboradores cujo
     *              nome casa com o termo (o nome está cifrado no RH) e os status cujo rótulo casa.
     */
    public static Specification<Desconto> comFiltros(DescontoFilter filtro, BuscaGlobal busca) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();

            // Soft delete default
            predicates.add(cb.isTrue(root.get("ativo")));

            if (filtro != null) {
                if (filtro.colaboradorId() != null) {
                    predicates.add(cb.equal(root.get("colaboradorId"), filtro.colaboradorId()));
                }

                if (filtro.motivoId() != null) {
                    predicates.add(cb.equal(root.get("motivo").get("id"), filtro.motivoId()));
                }

                if (!SelecaoMultipla.vazia(filtro.status())) {
                    predicates.add(root.get("status").in(filtro.status()));
                }

                if (filtro.usuarioSolicitanteId() != null) {
                    predicates.add(cb.equal(root.get("usuarioSolicitanteId"), filtro.usuarioSolicitanteId()));
                }

                if (filtro.dataCriacaoInicio() != null) {
                    predicates.add(cb.greaterThanOrEqualTo(root.get("dataCriacao"), filtro.dataCriacaoInicio()));
                }

                if (filtro.dataCriacaoFim() != null) {
                    predicates.add(cb.lessThanOrEqualTo(root.get("dataCriacao"), filtro.dataCriacaoFim()));
                }

                if (filtro.dataOcorrenciaInicio() != null) {
                    predicates.add(cb.greaterThanOrEqualTo(root.get("dataOcorrencia"), filtro.dataOcorrenciaInicio()));
                }

                if (filtro.dataOcorrenciaFim() != null) {
                    predicates.add(cb.lessThanOrEqualTo(root.get("dataOcorrencia"), filtro.dataOcorrenciaFim()));
                }

                if (filtro.buscaGlobal() != null && !filtro.buscaGlobal().isBlank()) {
                    String termo = "%" + filtro.buscaGlobal().trim().toLowerCase() + "%";
                    List<Predicate> alguma = new ArrayList<>();
                    alguma.add(cb.like(cb.lower(root.get("observacoes")), termo));
                    alguma.add(cb.like(cb.lower(root.join("motivo", JoinType.LEFT).get("descricao")), termo));
                    // A tela mostra o início do código (#d1234567): quem copia de lá encontra o desconto.
                    // `as(String)` não converte no SQL: o Postgres recebia lower(uuid) e recusava a consulta.
                    // O cast é explícito e o texto do UUID já sai em minúsculas.
                    Expression<String> codigo = ((JpaExpression<?>) root.get("id")).cast(String.class);
                    alguma.add(cb.like(codigo, termo.replace("#", "")));
                    if (!busca.colaboradores().isEmpty()) {
                        alguma.add(root.get("colaboradorId").in(busca.colaboradores()));
                    }
                    if (!busca.status().isEmpty()) {
                        alguma.add(root.get("status").in(busca.status()));
                    }
                    predicates.add(cb.or(alguma.toArray(new Predicate[0])));
                }
            }

            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    /**
     * Ordena pelo nome do colaborador. O nome mora (cifrado) no RH, então quem chama
     * resolve a posição alfabética de cada colaborador e ela vira um {@code CASE} aqui.
     * Colaboradores sem posição conhecida vão para o fim. O desempate é a ordem pedida
     * nas demais colunas, ou o mais recente primeiro.
     */
    public static Specification<Desconto> ordenadoPorColaborador(Map<UUID, Integer> posicoes,
                                                                Sort.Direction direcao,
                                                                Sort demais) {
        return (root, query, cb) -> {
            boolean contagem = query == null || query.getResultType() == Long.class || query.getResultType() == long.class;
            if (!contagem) {
                List<Order> ordens = new ArrayList<>();
                Expression<Integer> posicao = posicao(cb, root.get("colaboradorId"), posicoes);
                ordens.add(direcao.isAscending() ? cb.asc(posicao) : cb.desc(posicao));
                demais.forEach(o -> ordens.add(o.isAscending() ? cb.asc(root.get(o.getProperty())) : cb.desc(root.get(o.getProperty()))));
                if (demais.isUnsorted()) {
                    ordens.add(cb.desc(root.get("dataCriacao")));
                }
                query.orderBy(ordens);
            }
            return null;
        };
    }

    private static Expression<Integer> posicao(CriteriaBuilder cb, Expression<UUID> colaborador, Map<UUID, Integer> posicoes) {
        if (posicoes.isEmpty()) {
            return cb.literal(Integer.MAX_VALUE);
        }
        CriteriaBuilder.SimpleCase<UUID, Integer> caso = cb.selectCase(colaborador);
        posicoes.forEach((id, pos) -> caso.when(id, pos));
        return caso.otherwise(Integer.MAX_VALUE);
    }

    /** Resultado da busca rápida resolvido fora da consulta. */
    public record BuscaGlobal(Collection<UUID> colaboradores, Collection<StatusDesconto> status) {
        public static BuscaGlobal nenhuma() {
            return new BuscaGlobal(List.of(), List.of());
        }
    }
}
