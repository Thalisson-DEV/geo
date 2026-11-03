package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.application.dto.PendenciaChecklistFilter;
import com.nexo.app.modules.frota.domain.PendenciaChecklist;
import com.nexo.app.modules.frota.domain.SituacaoPendenciaChecklist;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

import java.util.ArrayList;
import java.util.List;

public final class PendenciaChecklistSpecification {

    private PendenciaChecklistSpecification() {
    }

    public static Specification<PendenciaChecklist> of(PendenciaChecklistFilter filtro) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.isTrue(root.get("ativo")));
            var situacao = filtro == null || filtro.situacao() == null ? SituacaoPendenciaChecklist.ABERTA : filtro.situacao();
            predicates.add(cb.equal(root.get("situacao"), situacao));
            if (filtro != null && filtro.idsBase() != null && !filtro.idsBase().isEmpty()) {
                predicates.add(root.get("idBaseOperacional").in(filtro.idsBase()));
            }
            if (filtro != null && filtro.idVeiculo() != null) {
                predicates.add(cb.equal(root.get("idVeiculo"), filtro.idVeiculo()));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }
}
