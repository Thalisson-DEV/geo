package com.nexo.app.modules.listas.infrastructure.persistence;

import com.nexo.app.modules.listas.ListaConfiguravel;
import com.nexo.app.modules.listas.application.dto.OpcaoListaFilter;
import com.nexo.app.modules.listas.domain.OpcaoLista;
import com.nexo.app.shared.infrastructure.persistence.SpecificationUtils;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

import java.util.ArrayList;
import java.util.List;

public final class OpcaoListaSpecification {

    private OpcaoListaSpecification() {
    }

    public static Specification<OpcaoLista> filterBy(ListaConfiguravel lista, OpcaoListaFilter filter) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("lista"), lista));
            if (filter != null) {
                if (filter.ativo() != null) {
                    predicates.add(cb.equal(root.get("ativo"), filter.ativo()));
                }
                SpecificationUtils.buscaRapida(filter.buscaGlobal(), predicates, cb, root, "rotulo", "descricao", "codigo");
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }
}
