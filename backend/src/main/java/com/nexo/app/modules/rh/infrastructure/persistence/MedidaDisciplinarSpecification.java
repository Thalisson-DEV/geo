package com.nexo.app.modules.rh.infrastructure.persistence;

import com.nexo.app.modules.rh.domain.MedidaDisciplinar;
import com.nexo.app.modules.rh.domain.OrigemMedidaDisciplinar;
import com.nexo.app.modules.rh.domain.SituacaoMedidaDisciplinar;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public final class MedidaDisciplinarSpecification {

    private MedidaDisciplinarSpecification() {
    }

    /**
     * @param idsColaborador nulo = sem filtro; vazio = nenhum colaborador casou com a busca
     */
    public static Specification<MedidaDisciplinar> of(Collection<UUID> idsColaborador, Collection<UUID> idsBase,
                                                      Collection<UUID> idsTipo, Collection<UUID> idsMotivo,
                                                      Collection<SituacaoMedidaDisciplinar> situacoes,
                                                      Collection<OrigemMedidaDisciplinar> origens,
                                                      LocalDate de, LocalDate ate) {
        return (root, query, cb) -> {
            List<Predicate> p = new ArrayList<>();
            if (idsColaborador != null) {
                if (idsColaborador.isEmpty()) return cb.disjunction();
                p.add(root.get("idColaborador").in(idsColaborador));
            }
            if (idsBase != null && !idsBase.isEmpty()) p.add(root.get("idBaseOperacional").in(idsBase));
            if (idsTipo != null && !idsTipo.isEmpty()) p.add(root.get("tipo").get("id").in(idsTipo));
            if (idsMotivo != null && !idsMotivo.isEmpty()) p.add(root.get("motivo").get("id").in(idsMotivo));
            if (situacoes != null && !situacoes.isEmpty()) p.add(root.get("situacao").in(situacoes));
            if (origens != null && !origens.isEmpty()) p.add(root.get("origem").in(origens));
            if (de != null) p.add(cb.greaterThanOrEqualTo(root.get("dataFato"), de));
            if (ate != null) p.add(cb.lessThanOrEqualTo(root.get("dataFato"), ate));
            return cb.and(p.toArray(Predicate[]::new));
        };
    }
}
