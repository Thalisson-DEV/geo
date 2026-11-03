package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.application.dto.ModeloChecklistFilter;
import com.nexo.app.modules.frota.domain.ModeloChecklist;
import com.nexo.app.shared.infrastructure.persistence.SpecificationUtils;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

import java.util.ArrayList;
import java.util.List;

public final class ModeloChecklistSpecification {

    private ModeloChecklistSpecification() {
    }

    public static Specification<ModeloChecklist> of(ModeloChecklistFilter filtro) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (filtro != null) {
                SpecificationUtils.buscaRapida(filtro.busca(), predicates, cb, root, "nome", "instrucoes");
                if (filtro.tipo() != null) {
                    predicates.add(cb.equal(root.get("tipo"), filtro.tipo()));
                }
                if (filtro.ativo() != null) {
                    predicates.add(cb.equal(root.get("ativo"), filtro.ativo()));
                }
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }
}
