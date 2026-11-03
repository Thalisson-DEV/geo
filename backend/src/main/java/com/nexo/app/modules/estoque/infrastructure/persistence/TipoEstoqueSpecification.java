package com.nexo.app.modules.estoque.infrastructure.persistence;

import com.nexo.app.modules.estoque.domain.Estoque;
import com.nexo.app.modules.estoque.application.dto.TipoEstoqueFilter;
import com.nexo.app.modules.estoque.domain.TipoEstoque;
import com.nexo.app.shared.infrastructure.persistence.SpecificationUtils;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

import java.util.ArrayList;
import java.util.List;

public class TipoEstoqueSpecification {
    public static Specification<TipoEstoque> filterBy(TipoEstoqueFilter filter) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            // O estoque da oficina da frota (tipo FROTA) tem telas próprias e não aparece no almoxarifado.
            predicates.add(cb.notEqual(root.get("nome"), Estoque.TIPO_FROTA));
            if (filter.nome() != null && !filter.nome().isBlank()) {
                predicates.add(cb.like(cb.lower(root.get("nome")), "%" + filter.nome().toLowerCase() + "%"));
            }
            if (filter.ativo() != null) {
                predicates.add(cb.equal(root.get("ativo"), filter.ativo()));
            }
            SpecificationUtils.buscaRapida(filter.buscaGlobal(), predicates, cb, root, "nome");

            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }
}
