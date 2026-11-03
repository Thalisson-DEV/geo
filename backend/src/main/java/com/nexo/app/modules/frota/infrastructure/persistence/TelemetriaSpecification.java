package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.EventoFilter;
import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.RastreadorFilter;
import com.nexo.app.modules.frota.domain.EventoTelemetria;
import com.nexo.app.modules.frota.domain.RastreadorTelemetria;
import com.nexo.app.modules.frota.domain.SituacaoRastreador;
import com.nexo.app.shared.infrastructure.persistence.SpecificationUtils;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

public final class TelemetriaSpecification {

    private TelemetriaSpecification() {
    }

    /**
     * @param idsVeiculoPorBusca veículos da frota cuja placa contém a busca (nulo sem busca)
     * @param idsVeiculoPorBase  veículos das bases filtradas (nulo sem esse filtro)
     * @param semComunicacaoDesde limite da última comunicação para o filtro "sem comunicação"
     */
    public static Specification<RastreadorTelemetria> rastreadores(RastreadorFilter filtro, Collection<UUID> idsVeiculoPorBusca,
                                                                   Collection<UUID> idsVeiculoPorBase,
                                                                   OffsetDateTime semComunicacaoDesde) {
        return (root, query, cb) -> {
            List<Predicate> p = new ArrayList<>();
            p.add(cb.isTrue(root.get("ativo")));
            if (filtro == null) {
                return cb.and(p.toArray(new Predicate[0]));
            }
            SpecificationUtils.filtrarPor(filtro.provedores(), p, root.get("provedor"));
            SpecificationUtils.filtrarPor(filtro.situacoes(), p, root.get("situacao"));
            if (filtro.busca() != null && !filtro.busca().isBlank()) {
                String termo = "%" + filtro.busca().trim().toLowerCase(Locale.ROOT) + "%";
                String placa = "%" + RastreadorTelemetria.normalizarPlaca(filtro.busca()).toLowerCase(Locale.ROOT) + "%";
                List<Predicate> ou = new ArrayList<>();
                ou.add(cb.like(cb.lower(root.get("placaProvedor")), placa));
                ou.add(cb.like(cb.lower(root.get("nomeProvedor")), termo));
                ou.add(cb.like(cb.lower(root.get("idExterno")), termo));
                ou.add(cb.like(cb.lower(root.get("motoristaNome")), termo));
                if (idsVeiculoPorBusca != null && !idsVeiculoPorBusca.isEmpty()) {
                    ou.add(root.get("idVeiculo").in(idsVeiculoPorBusca));
                }
                p.add(cb.or(ou.toArray(new Predicate[0])));
            }
            if (idsVeiculoPorBase != null) {
                p.add(idsVeiculoPorBase.isEmpty() ? cb.disjunction() : root.get("idVeiculo").in(idsVeiculoPorBase));
            }
            if (Boolean.TRUE.equals(filtro.semComunicacao())) {
                p.add(cb.equal(root.get("situacao"), SituacaoRastreador.VINCULADO));
                p.add(cb.or(cb.isNull(root.get("ultimaComunicacao")),
                        cb.lessThan(root.get("ultimaComunicacao"), semComunicacaoDesde)));
            }
            return cb.and(p.toArray(new Predicate[0]));
        };
    }

    /**
     * @param idsVeiculoPorBusca     veículos cuja placa contém a busca (nulo sem busca)
     * @param idsColaboradorPorBusca condutores cujo nome contém a busca (nulo sem busca)
     * @param idsVeiculoPorBase      veículos das bases filtradas (nulo sem esse filtro)
     */
    public static Specification<EventoTelemetria> eventos(EventoFilter filtro, Collection<UUID> idsVeiculoPorBusca,
                                                          Collection<UUID> idsColaboradorPorBusca,
                                                          Collection<UUID> idsVeiculoPorBase) {
        return (root, query, cb) -> {
            List<Predicate> p = new ArrayList<>();
            p.add(cb.isTrue(root.get("ativo")));
            if (filtro == null) {
                return cb.and(p.toArray(new Predicate[0]));
            }
            SpecificationUtils.filtrarPor(filtro.tipos(), p, root.get("tipo"));
            SpecificationUtils.filtrarPor(filtro.provedores(), p, root.get("provedor"));
            if (filtro.idVeiculo() != null) {
                p.add(cb.equal(root.get("idVeiculo"), filtro.idVeiculo()));
            }
            if (filtro.idColaborador() != null) {
                p.add(cb.equal(root.get("idColaborador"), filtro.idColaborador()));
            }
            if (Boolean.TRUE.equals(filtro.semCondutor())) {
                p.add(cb.isNull(root.get("idColaborador")));
            }
            if (filtro.busca() != null && !filtro.busca().isBlank()) {
                String termo = "%" + filtro.busca().trim().toLowerCase(Locale.ROOT) + "%";
                String placa = "%" + RastreadorTelemetria.normalizarPlaca(filtro.busca()).toLowerCase(Locale.ROOT) + "%";
                List<Predicate> ou = new ArrayList<>();
                ou.add(cb.like(cb.lower(root.get("placa")), placa));
                ou.add(cb.like(cb.lower(root.get("motoristaNome")), termo));
                ou.add(cb.like(cb.lower(root.get("endereco")), termo));
                if (idsVeiculoPorBusca != null && !idsVeiculoPorBusca.isEmpty()) {
                    ou.add(root.get("idVeiculo").in(idsVeiculoPorBusca));
                }
                if (idsColaboradorPorBusca != null && !idsColaboradorPorBusca.isEmpty()) {
                    ou.add(root.get("idColaborador").in(idsColaboradorPorBusca));
                }
                p.add(cb.or(ou.toArray(new Predicate[0])));
            }
            if (idsVeiculoPorBase != null) {
                p.add(idsVeiculoPorBase.isEmpty() ? cb.disjunction() : root.get("idVeiculo").in(idsVeiculoPorBase));
            }
            if (filtro.de() != null) {
                p.add(cb.greaterThanOrEqualTo(root.get("ocorridoEm"), filtro.de()));
            }
            if (filtro.ate() != null) {
                p.add(cb.lessThan(root.get("ocorridoEm"), filtro.ate()));
            }
            return cb.and(p.toArray(new Predicate[0]));
        };
    }
}
