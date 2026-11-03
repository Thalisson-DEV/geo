package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.application.dto.ChecklistFilter;
import com.nexo.app.modules.frota.domain.Checklist;
import com.nexo.app.modules.frota.domain.RespostaChecklist;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

public final class ChecklistSpecification {

    private static final ZoneId FUSO = ZoneId.of("America/Sao_Paulo");

    private ChecklistSpecification() {
    }

    public static Specification<Checklist> of(ChecklistFilter filtro) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.isTrue(root.get("ativo")));
            if (filtro == null) {
                return cb.and(predicates.toArray(new Predicate[0]));
            }
            if (filtro.idVeiculo() != null) {
                predicates.add(cb.equal(root.get("idVeiculo"), filtro.idVeiculo()));
            }
            if (filtro.idCondutor() != null) {
                predicates.add(cb.equal(root.get("idCondutor"), filtro.idCondutor()));
            }
            if (filtro.idsBase() != null && !filtro.idsBase().isEmpty()) {
                predicates.add(root.get("idBaseOperacional").in(filtro.idsBase()));
            }
            if (filtro.de() != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("preenchidoEm"),
                        filtro.de().atStartOfDay(FUSO).toOffsetDateTime()));
            }
            if (filtro.ate() != null) {
                predicates.add(cb.lessThan(root.get("preenchidoEm"),
                        filtro.ate().plusDays(1).atStartOfDay(FUSO).toOffsetDateTime()));
            }
            if (filtro.comProblema() != null) {
                var sub = query.subquery(Long.class);
                var resposta = sub.from(RespostaChecklist.class);
                sub.select(cb.literal(1L)).where(cb.equal(resposta.get("checklist"), root), cb.isTrue(resposta.get("problema")));
                predicates.add(filtro.comProblema() ? cb.exists(sub) : cb.not(cb.exists(sub)));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }
}
