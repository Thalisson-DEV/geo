package com.nexo.app.modules.obras.infrastructure.persistence;

import com.nexo.app.modules.obras.application.dto.RevisaoFotosDtos;
import com.nexo.app.modules.obras.domain.EvidenciaPonto;
import com.nexo.app.modules.obras.domain.Obra;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Subquery;
import org.springframework.data.jpa.domain.Specification;

import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/** Fila de revisão das fotos de campo. */
public final class EvidenciaPontoSpecification {

    private static final ZoneId FUSO = ZoneId.of("America/Sao_Paulo");

    private EvidenciaPontoSpecification() {
    }

    public static Specification<EvidenciaPonto> revisao(RevisaoFotosDtos.RevisaoFotoFilter f) {
        return (root, query, cb) -> {
            List<Predicate> p = new ArrayList<>();
            p.add(cb.isTrue(root.get("ativo")));
            p.add(cb.equal(root.get("revisao"), f.status() != null ? f.status() : EvidenciaPonto.Revisao.PENDENTE));
            if (f.idObra() != null) {
                p.add(cb.equal(root.get("idObra"), f.idObra()));
            }
            if (f.idEquipe() != null) {
                p.add(cb.equal(root.get("idEquipe"), f.idEquipe()));
            }
            if (f.numeroObra() != null && !f.numeroObra().isBlank()) {
                Subquery<UUID> obras = query.subquery(UUID.class);
                var obra = obras.from(Obra.class);
                obras.select(obra.get("id")).where(cb.like(cb.lower(obra.get("numero")), "%" + f.numeroObra().trim().toLowerCase(Locale.ROOT) + "%"));
                p.add(root.get("idObra").in(obras));
            }
            if (f.de() != null) {
                p.add(cb.greaterThanOrEqualTo(root.get("dataCriacao"), f.de().atStartOfDay(FUSO).toOffsetDateTime()));
            }
            if (f.ate() != null) {
                p.add(cb.lessThan(root.get("dataCriacao"), f.ate().plusDays(1).atStartOfDay(FUSO).toOffsetDateTime()));
            }
            return cb.and(p.toArray(Predicate[]::new));
        };
    }
}
