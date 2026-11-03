package com.nexo.app.modules.estoque.infrastructure.persistence;

import com.nexo.app.modules.estoque.application.dto.EstoqueFilter;
import com.nexo.app.modules.estoque.domain.Estoque;
import com.nexo.app.shared.infrastructure.persistence.SpecificationUtils;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

import java.util.ArrayList;
import java.util.List;

public class EstoqueSpecification {
    public static Specification<Estoque> filterBy(EstoqueFilter filter) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            // O estoque da oficina da frota (tipo FROTA) tem telas próprias e não aparece no almoxarifado.
            predicates.add(cb.notEqual(root.get("tipoEstoque").get("nome"), Estoque.TIPO_FROTA));
            
            if (filter.nomeIdentificador() != null && !filter.nomeIdentificador().isBlank()) {
                predicates.add(cb.like(cb.lower(root.get("nomeIdentificador")), "%" + filter.nomeIdentificador().toLowerCase() + "%"));
            }
            
            if (filter.idTipoEstoque() != null) {
                predicates.add(cb.equal(root.get("tipoEstoque").get("id"), filter.idTipoEstoque()));
            }
            
            if (filter.idEquipe() != null) {
                predicates.add(cb.equal(root.get("idEquipe"), filter.idEquipe()));
            }
            
            if (filter.ativo() != null) {
                predicates.add(cb.equal(root.get("ativo"), filter.ativo()));
            }
            
            SpecificationUtils.buscaRapida(filter.buscaGlobal(), predicates, cb, root, "nomeIdentificador");

            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }
}
