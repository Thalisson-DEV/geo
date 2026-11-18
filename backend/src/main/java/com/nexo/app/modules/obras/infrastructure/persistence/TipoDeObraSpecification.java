package com.nexo.app.modules.obras.infrastructure.persistence;

import com.nexo.app.modules.obras.application.dto.TipoDeObraFilter;
import com.nexo.app.modules.obras.domain.TipoDeObra;
import com.nexo.app.shared.infrastructure.persistence.SpecificationUtils;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

import java.util.ArrayList;
import java.util.List;

public final class TipoDeObraSpecification {

    private TipoDeObraSpecification() {
    }

    public static Specification<TipoDeObra> filterBy(TipoDeObraFilter filter) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (filter != null) {
                if (filter.controleExecucao() != null) {
                    predicates.add(cb.equal(root.get("controleExecucao"), filter.controleExecucao()));
                }
                if (filter.subtipo() != null) {
                    predicates.add(cb.equal(root.get("subtipo"), filter.subtipo()));
                }
                if (filter.ativo() != null) {
                    predicates.add(cb.equal(root.get("ativo"), filter.ativo()));
                }
                SpecificationUtils.buscaRapida(filter.buscaGlobal(), predicates, cb, root, "nome", "descricao");
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }
}
