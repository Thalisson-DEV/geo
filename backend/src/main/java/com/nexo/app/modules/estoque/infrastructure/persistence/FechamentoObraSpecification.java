package com.nexo.app.modules.estoque.infrastructure.persistence;

import com.nexo.app.modules.estoque.application.dto.FechamentoObraFilter;
import com.nexo.app.modules.estoque.domain.ContextoSolicitacaoMaterial;
import com.nexo.app.modules.estoque.domain.ItemSolicitacao;
import com.nexo.app.modules.estoque.domain.ReservaSolicitacaoTecnica;
import com.nexo.app.modules.estoque.domain.SolicitacaoMaterial;
import com.nexo.app.shared.domain.HorasUteis;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Subquery;
import org.springframework.data.jpa.domain.Specification;

import java.math.BigInteger;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

/** Filtros da lista de encerramento de obras. */
public final class FechamentoObraSpecification {

    private static final String NUMERO_RESERVA = "[0-9]{1,20}";

    private FechamentoObraSpecification() {
    }

    /**
     * @param supervisoresDoCoordenador supervisores do coordenador filtrado (nulo sem filtro)
     * @param obrasNaSituacao obras cuja situação de fechamento casa com o filtro (nulo sem filtro)
     * @param limiteAlerta instante em que vencem as próximas 12 horas úteis
     * @param obrasDaBusca obras cujo número ou título casa com a busca (nulo sem busca)
     */
    public static Specification<SolicitacaoMaterial> filtrar(
            FechamentoObraFilter filtro,
            Collection<UUID> supervisoresDoCoordenador,
            Collection<UUID> obrasNaSituacao,
            OffsetDateTime agora,
            OffsetDateTime limiteAlerta,
            Collection<UUID> obrasDaBusca
    ) {
        return (root, query, cb) -> {
            List<Predicate> predicados = new ArrayList<>();
            predicados.add(cb.equal(root.get("contexto"), ContextoSolicitacaoMaterial.FECHAMENTO));
            if (filtro.idSolicitante() != null) {
                predicados.add(cb.equal(root.get("idRequisitante"), filtro.idSolicitante()));
            }
            if (filtro.idObra() != null) {
                predicados.add(cb.equal(root.get("idObra"), filtro.idObra()));
            }
            if (filtro.tipos() != null && !filtro.tipos().isEmpty()) {
                predicados.add(root.get("tipoTecnico").in(filtro.tipos()));
            }
            if (filtro.situacoes() != null && !filtro.situacoes().isEmpty()) {
                predicados.add(root.get("situacaoFechamento").in(filtro.situacoes()));
            }
            if (filtro.idSupervisor() != null) {
                predicados.add(cb.equal(root.get("idSupervisor"), filtro.idSupervisor()));
            }
            if (supervisoresDoCoordenador != null) {
                predicados.add(supervisoresDoCoordenador.isEmpty()
                        ? cb.disjunction() : root.get("idSupervisor").in(supervisoresDoCoordenador));
            }
            if (filtro.idEncarregado() != null) {
                predicados.add(cb.equal(root.get("idEncarregado"), filtro.idEncarregado()));
            }
            if (obrasNaSituacao != null) {
                predicados.add(obrasNaSituacao.isEmpty()
                        ? cb.disjunction() : root.get("idObra").in(obrasNaSituacao));
            }
            if (filtro.prazo() != null) {
                var prazo = root.<OffsetDateTime>get("prazoVigenteAte");
                switch (filtro.prazo()) {
                    case ATRASADO -> predicados.add(cb.lessThan(prazo, agora));
                    case VENCE_EM_BREVE -> predicados.add(cb.and(
                            cb.greaterThanOrEqualTo(prazo, agora), cb.lessThan(prazo, limiteAlerta)));
                    case NO_PRAZO -> predicados.add(cb.greaterThanOrEqualTo(prazo, limiteAlerta));
                    default -> {
                        // Cumprido não é prazo em curso: sem filtro.
                    }
                }
            }
            if (filtro.comPendencia() != null) {
                Predicate pendente = cb.or(cb.isNotNull(root.get("motivoPendencia")), existeItemPendente(root, query, cb));
                predicados.add(filtro.comPendencia() ? pendente : cb.not(pendente));
            }
            if (filtro.reserva() != null && filtro.reserva().trim().matches(NUMERO_RESERVA)) {
                predicados.add(existeReserva(root, query, cb, filtro.reserva().trim()));
            }
            if (filtro.idAlmoxarifado() != null) {
                predicados.add(cb.equal(root.get("almoxarifadoAtendimento").get("id"), filtro.idAlmoxarifado()));
            }
            var criadaEm = root.<OffsetDateTime>get("dataSolicitacao");
            if (filtro.criadaDe() != null) {
                predicados.add(cb.greaterThanOrEqualTo(criadaEm, inicioDoDia(filtro.criadaDe())));
            }
            if (filtro.criadaAte() != null) {
                predicados.add(cb.lessThan(criadaEm, inicioDoDia(filtro.criadaAte().plusDays(1))));
            }
            if (filtro.agendaDe() != null && filtro.agendaAte() != null) {
                OffsetDateTime de = inicioDoDia(filtro.agendaDe());
                OffsetDateTime ate = inicioDoDia(filtro.agendaAte().plusDays(1));
                var prazoVigente = root.<OffsetDateTime>get("prazoVigenteAte");
                var concluidaEm = root.<OffsetDateTime>get("movimentacaoConcluidaEm");
                predicados.add(cb.or(
                        cb.and(cb.greaterThanOrEqualTo(prazoVigente, de), cb.lessThan(prazoVigente, ate)),
                        cb.and(cb.greaterThanOrEqualTo(concluidaEm, de), cb.lessThan(concluidaEm, ate))));
            }
            if (obrasDaBusca != null) {
                String busca = filtro.busca().trim();
                Predicate porObra = obrasDaBusca.isEmpty() ? cb.disjunction() : root.get("idObra").in(obrasDaBusca);
                predicados.add(busca.matches(NUMERO_RESERVA)
                        ? cb.or(porObra, existeReserva(root, query, cb, busca)) : porObra);
            }
            return cb.and(predicados.toArray(Predicate[]::new));
        };
    }

    private static OffsetDateTime inicioDoDia(LocalDate dia) {
        return dia.atStartOfDay(HorasUteis.FUSO).toOffsetDateTime();
    }

    private static Predicate existeReserva(
            Root<SolicitacaoMaterial> root,
            jakarta.persistence.criteria.CriteriaQuery<?> query,
            jakarta.persistence.criteria.CriteriaBuilder cb,
            String numero
    ) {
        Subquery<UUID> reserva = query.subquery(UUID.class);
        Root<ReservaSolicitacaoTecnica> raiz = reserva.from(ReservaSolicitacaoTecnica.class);
        reserva.select(raiz.get("solicitacao").get("id")).where(
                cb.equal(raiz.get("solicitacao").get("id"), root.get("id")),
                cb.equal(raiz.get("numero"), new BigInteger(numero)));
        return cb.exists(reserva);
    }

    private static Predicate existeItemPendente(
            Root<SolicitacaoMaterial> root,
            jakarta.persistence.criteria.CriteriaQuery<?> query,
            jakarta.persistence.criteria.CriteriaBuilder cb
    ) {
        Subquery<UUID> itens = query.subquery(UUID.class);
        Root<ItemSolicitacao> item = itens.from(ItemSolicitacao.class);
        itens.select(item.get("id")).where(
                cb.equal(item.get("solicitacao").get("id"), root.get("id")),
                cb.isNotNull(item.get("motivoPendencia")));
        return cb.exists(itens);
    }
}
