package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.application.dto.ProdutoAbastecimentoFilter;
import com.nexo.app.modules.frota.domain.ProdutoAbastecimento;
import com.nexo.app.shared.infrastructure.persistence.SpecificationUtils;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

import java.util.ArrayList;
import java.util.List;

public final class ProdutoAbastecimentoSpecification {

    private ProdutoAbastecimentoSpecification() {
    }

    public static Specification<ProdutoAbastecimento> of(ProdutoAbastecimentoFilter filtro) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (filtro != null) {
                SpecificationUtils.buscaRapida(filtro.busca(), predicates, cb, root, "nome");
                if (filtro.ativo() != null) {
                    predicates.add(cb.equal(root.get("ativo"), filtro.ativo()));
                }
                if (filtro.categoria() != null) {
                    predicates.add(cb.equal(root.get("categoria"), filtro.categoria()));
                }
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }
}
