package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.EventoPneu;
import com.nexo.app.modules.frota.domain.InspecaoPneu;
import com.nexo.app.modules.frota.domain.Pneu;
import com.nexo.app.modules.frota.domain.SituacaoPneu;
import com.nexo.app.modules.frota.domain.TipoEventoPneu;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

public final class PneuSpecification {

    private PneuSpecification() {
    }

    /**
     * @param busca      marca de fogo, série, marca, modelo ou placa
     * @param sulcoAte   só pneus com sulco atual até este valor (alerta de sulco)
     */
    public static Specification<Pneu> pneus(String busca, Collection<SituacaoPneu> situacoes, UUID idVeiculo, UUID idEstoque,
                                            String marca, BigDecimal sulcoAte) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.isTrue(root.get("ativo")));
            if (situacoes != null && !situacoes.isEmpty()) {
                predicates.add(root.get("situacao").in(situacoes));
            }
            if (idVeiculo != null) {
                predicates.add(cb.equal(root.get("idVeiculo"), idVeiculo));
            }
            if (idEstoque != null) {
                predicates.add(cb.equal(root.get("idEstoque"), idEstoque));
            }
            if (marca != null && !marca.isBlank()) {
                predicates.add(cb.equal(cb.lower(root.get("marca")), marca.trim().toLowerCase(Locale.ROOT)));
            }
            if (sulcoAte != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("sulcoAtualMm"), sulcoAte));
                predicates.add(cb.notEqual(root.get("situacao"), SituacaoPneu.DESCARTADO));
            }
            if (busca != null && !busca.isBlank()) {
                String termo = "%" + busca.trim().toLowerCase(Locale.ROOT) + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("marcaFogo")), termo),
                        cb.like(cb.lower(cb.coalesce(root.get("numeroSerie"), "")), termo),
                        cb.like(cb.lower(root.get("marca")), termo),
                        cb.like(cb.lower(cb.coalesce(root.get("modelo"), "")), termo),
                        cb.like(cb.lower(cb.coalesce(root.get("placa"), "")), termo)));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    public static Specification<EventoPneu> eventos(UUID idPneu, UUID idVeiculo, Collection<TipoEventoPneu> tipos,
                                                    OffsetDateTime de, OffsetDateTime ate) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.isTrue(root.get("ativo")));
            if (idPneu != null) {
                predicates.add(cb.equal(root.get("idPneu"), idPneu));
            }
            if (idVeiculo != null) {
                predicates.add(cb.equal(root.get("idVeiculo"), idVeiculo));
            }
            if (tipos != null && !tipos.isEmpty()) {
                predicates.add(root.get("tipo").in(tipos));
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

    public static Specification<InspecaoPneu> inspecoes(UUID idVeiculo, OffsetDateTime de, OffsetDateTime ate) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.isTrue(root.get("ativo")));
            if (idVeiculo != null) {
                predicates.add(cb.equal(root.get("idVeiculo"), idVeiculo));
            }
            if (de != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("realizadaEm"), de));
            }
            if (ate != null) {
                predicates.add(cb.lessThan(root.get("realizadaEm"), ate));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }
}
