package com.nexo.app.modules.execucao.infrastructure.persistence;

import com.nexo.app.modules.execucao.application.dto.MetaFisicaFilter;
import com.nexo.app.modules.execucao.domain.MetaFisica;
import com.nexo.app.modules.execucao.domain.MetaFisicaItem;
import com.nexo.app.shared.infrastructure.persistence.SpecificationUtils;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Subquery;
import org.springframework.data.jpa.domain.Specification;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

/** Filtros dinâmicos das metas físicas. */
public final class MetaFisicaSpecification {

    private MetaFisicaSpecification() {
    }

    /**
     * @param idsBasesDaBusca bases cujo nome casa com a busca rápida; vazio quando nenhuma casa
     */
    public static Specification<MetaFisica> filterBy(MetaFisicaFilter filter, Collection<UUID> idsBasesDaBusca) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (filter == null) {
                return cb.conjunction();
            }
            if (filter.idBaseOperacional() != null) {
                predicates.add(cb.equal(root.get("idBaseOperacional"), filter.idBaseOperacional()));
            }
            if (filter.competencia() != null) {
                predicates.add(cb.equal(root.get("competencia"), filter.competencia().atDay(1)));
            }
            if (filter.ano() != null) {
                predicates.add(cb.between(root.get("competencia"),
                        LocalDate.of(filter.ano(), 1, 1), LocalDate.of(filter.ano(), 12, 1)));
            }
            if (filter.idTipoServico() != null) {
                Subquery<UUID> sub = query.subquery(UUID.class);
                Root<MetaFisicaItem> item = sub.from(MetaFisicaItem.class);
                sub.select(item.get("meta").get("id"))
                        .where(cb.equal(item.get("idTipoServico"), filter.idTipoServico()));
                predicates.add(root.get("id").in(sub));
            }
            if (filter.ativo() != null) {
                predicates.add(cb.equal(root.get("ativo"), filter.ativo()));
            }
            if (filter.buscaGlobal() != null && !filter.buscaGlobal().isBlank()) {
                List<Expression<String>> campos = List.of(root.get("descricao"));
                Predicate porDescricao = SpecificationUtils.predicadoBuscaRapida(filter.buscaGlobal(), cb, campos);
                predicates.add(idsBasesDaBusca == null || idsBasesDaBusca.isEmpty()
                        ? porDescricao
                        : cb.or(porDescricao, root.get("idBaseOperacional").in(idsBasesDaBusca)));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }
}
