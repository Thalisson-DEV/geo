package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.Abastecimento;
import com.nexo.app.modules.frota.domain.AlertaAbastecimento;
import com.nexo.app.modules.frota.domain.OrigemAbastecimento;
import com.nexo.app.modules.frota.domain.SituacaoAbastecimento;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public final class AbastecimentoSpecification {

    private static final ZoneId FUSO = ZoneId.of("America/Sao_Paulo");

    private AbastecimentoSpecification() {
    }

    /**
     * @param idsVeiculo null não filtra; vazio não encontra nada (ex.: carteira sem placas)
     */
    public static Specification<Abastecimento> of(Collection<SituacaoAbastecimento> situacoes, Collection<UUID> idsVeiculo,
                                                  Collection<UUID> idsBase, UUID idPosto, LocalDate de, LocalDate ate,
                                                  Boolean comAlerta, OrigemAbastecimento origem) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.isTrue(root.get("ativo")));
            if (situacoes != null && !situacoes.isEmpty()) {
                predicates.add(root.get("situacao").in(situacoes));
            }
            if (idsVeiculo != null) {
                predicates.add(idsVeiculo.isEmpty() ? cb.disjunction() : root.get("idVeiculo").in(idsVeiculo));
            }
            if (idsBase != null && !idsBase.isEmpty()) {
                predicates.add(root.get("idBaseOperacional").in(idsBase));
            }
            if (idPosto != null) {
                predicates.add(cb.equal(root.get("posto").get("id"), idPosto));
            }
            if (de != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("solicitadoEm"), de.atStartOfDay(FUSO).toOffsetDateTime()));
            }
            if (ate != null) {
                predicates.add(cb.lessThan(root.get("solicitadoEm"), ate.plusDays(1).atStartOfDay(FUSO).toOffsetDateTime()));
            }
            if (origem != null) {
                predicates.add(cb.equal(root.get("origem"), origem));
            }
            if (comAlerta != null) {
                var sub = query.subquery(Long.class);
                var alerta = sub.from(AlertaAbastecimento.class);
                sub.select(cb.literal(1L)).where(cb.equal(alerta.get("abastecimento"), root));
                predicates.add(comAlerta ? cb.exists(sub) : cb.not(cb.exists(sub)));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }
}
