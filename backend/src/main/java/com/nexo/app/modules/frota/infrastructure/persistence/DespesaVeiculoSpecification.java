package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.DespesaVeiculo;
import com.nexo.app.modules.frota.domain.FormaPagamentoDespesa;
import com.nexo.app.modules.frota.domain.SituacaoPagamentoDespesa;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public final class DespesaVeiculoSpecification {

    private DespesaVeiculoSpecification() {
    }

    /**
     * @param idsVeiculo null não filtra; vazio não encontra nada (ex.: busca por placa sem resultado)
     * @param semPagamento só as a pagar que ainda não têm solicitação no financeiro
     */
    public static Specification<DespesaVeiculo> of(Collection<UUID> idsVeiculo, Collection<UUID> idsBase, Collection<UUID> idsTipo,
                                                   LocalDate de, LocalDate ate, FormaPagamentoDespesa forma,
                                                   SituacaoPagamentoDespesa situacaoPagamento, boolean semPagamento) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.isTrue(root.get("ativo")));
            if (idsVeiculo != null) {
                predicates.add(idsVeiculo.isEmpty() ? cb.disjunction() : root.get("idVeiculo").in(idsVeiculo));
            }
            if (idsBase != null && !idsBase.isEmpty()) {
                predicates.add(root.get("idBaseOperacional").in(idsBase));
            }
            if (idsTipo != null && !idsTipo.isEmpty()) {
                predicates.add(root.get("tipo").get("id").in(idsTipo));
            }
            if (de != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("data"), de));
            }
            if (ate != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("data"), ate));
            }
            if (forma != null) {
                predicates.add(cb.equal(root.get("formaPagamento"), forma));
            }
            if (situacaoPagamento != null) {
                predicates.add(cb.equal(root.get("situacaoPagamento"), situacaoPagamento));
            }
            if (semPagamento) {
                predicates.add(cb.equal(root.get("formaPagamento"), FormaPagamentoDespesa.A_PAGAR));
                predicates.add(cb.isNull(root.get("situacaoPagamento")));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }
}
