package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.Apolice;
import com.nexo.app.modules.frota.domain.CoberturaApolice;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

public final class ApoliceSpecification {

    private ApoliceSpecification() {
    }

    /**
     * @param busca      trecho do número ou do segurado
     * @param idVeiculo  só as apólices que cobrem (ou cobriram) o veículo
     * @param fimAntesDe fim da vigência antes da data (vencidas)
     * @param fimDe      fim da vigência a partir da data
     * @param fimAte     fim da vigência até a data
     * @param fimDepois  fim da vigência depois da data (vigentes fora da faixa de aviso)
     */
    public static Specification<Apolice> of(String busca, Collection<UUID> idsSeguradora, UUID idVeiculo, Collection<UUID> idsBase,
                                            LocalDate fimAntesDe, LocalDate fimDe, LocalDate fimAte, LocalDate fimDepois) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.isTrue(root.get("ativo")));
            if (busca != null && !busca.isBlank()) {
                String like = "%" + busca.trim().toLowerCase(Locale.ROOT) + "%";
                predicates.add(cb.or(cb.like(cb.lower(root.get("numero")), like), cb.like(cb.lower(root.get("segurado")), like)));
            }
            if (idsSeguradora != null && !idsSeguradora.isEmpty()) {
                predicates.add(root.get("idSeguradora").in(idsSeguradora));
            }
            if (idsBase != null && !idsBase.isEmpty()) {
                predicates.add(root.get("idBaseOperacional").in(idsBase));
            }
            if (idVeiculo != null) {
                var sub = query.subquery(UUID.class);
                var c = sub.from(CoberturaApolice.class);
                sub.select(c.get("apolice").get("id")).where(cb.equal(c.get("idVeiculo"), idVeiculo), cb.isTrue(c.get("ativo")));
                predicates.add(root.get("id").in(sub));
            }
            if (fimAntesDe != null) {
                predicates.add(cb.lessThan(root.get("vigenciaFim"), fimAntesDe));
            }
            if (fimDe != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("vigenciaFim"), fimDe));
            }
            if (fimAte != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("vigenciaFim"), fimAte));
            }
            if (fimDepois != null) {
                predicates.add(cb.greaterThan(root.get("vigenciaFim"), fimDepois));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }
}
