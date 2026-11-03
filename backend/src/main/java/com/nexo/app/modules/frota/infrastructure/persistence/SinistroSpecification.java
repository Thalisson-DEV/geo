package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.Sinistro;
import com.nexo.app.modules.frota.domain.SituacaoSinistro;
import com.nexo.app.modules.frota.domain.TipoSinistro;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public final class SinistroSpecification {

    private SinistroSpecification() {
    }

    /** @param idsVeiculo null não filtra; vazio não encontra nada (ex.: busca por placa sem resultado) */
    public static Specification<Sinistro> of(Collection<UUID> idsVeiculo, Collection<UUID> idsBase, Collection<TipoSinistro> tipos,
                                             Collection<SituacaoSinistro> situacoes, UUID idCondutor, UUID idApolice,
                                             OffsetDateTime de, OffsetDateTime ate) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.isTrue(root.get("ativo")));
            if (idsVeiculo != null) {
                predicates.add(idsVeiculo.isEmpty() ? cb.disjunction() : root.get("idVeiculo").in(idsVeiculo));
            }
            if (idsBase != null && !idsBase.isEmpty()) {
                predicates.add(root.get("idBaseOperacional").in(idsBase));
            }
            if (tipos != null && !tipos.isEmpty()) {
                predicates.add(root.get("tipo").in(tipos));
            }
            if (situacoes != null && !situacoes.isEmpty()) {
                predicates.add(root.get("situacao").in(situacoes));
            }
            if (idCondutor != null) {
                predicates.add(cb.equal(root.get("idCondutor"), idCondutor));
            }
            if (idApolice != null) {
                predicates.add(cb.equal(root.get("idApolice"), idApolice));
            }
            if (de != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("ocorridoEm"), de));
            }
            if (ate != null) {
                predicates.add(cb.lessThan(root.get("ocorridoEm"), ate));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }
}
