package com.nexo.app.modules.estoque.infrastructure.persistence;

import com.nexo.app.modules.estoque.domain.CatalogoMaterial;
import com.nexo.app.modules.estoque.domain.Material;
import com.nexo.app.modules.estoque.domain.MovimentacaoEstoque;
import com.nexo.app.modules.estoque.domain.MovimentacaoEstoque.TipoMovimentacao;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Path;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/** Consultas do estoque da oficina da frota: sempre restritas ao catálogo FROTA. */
public final class EstoqueFrotaSpecification {

    private static final String AJUSTE = "AJUSTE_INVENTARIO";

    private EstoqueFrotaSpecification() {
    }

    public static Specification<Material> pecas(String busca, String grupo, Boolean ativo) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("catalogo"), CatalogoMaterial.FROTA));
            if (ativo != null) {
                predicates.add(cb.equal(root.get("ativo"), ativo));
            }
            if (grupo != null && !grupo.isBlank()) {
                predicates.add(cb.equal(cb.lower(root.get("grupo")), grupo.trim().toLowerCase(Locale.ROOT)));
            }
            if (busca != null && !busca.isBlank()) {
                String termo = "%" + busca.trim().toLowerCase(Locale.ROOT) + "%";
                predicates.add(cb.or(cb.like(cb.lower(root.get("codigo")), termo), cb.like(cb.lower(root.get("descricao")), termo)));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    /**
     * @param tipos ENTRADA, SAIDA, TRANSFERENCIA, AJUSTE, ESTORNO (o ajuste é a entrada ou baixa com motivo de inventário)
     */
    public static Specification<MovimentacaoEstoque> movimentos(UUID idEstoque, UUID idMaterial, UUID idVeiculo, UUID idReferencia,
                                                                Collection<String> tipos, String busca,
                                                                OffsetDateTime de, OffsetDateTime ate) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            Path<Object> material = root.get("material");
            predicates.add(cb.equal(material.get("catalogo"), CatalogoMaterial.FROTA));
            if (idEstoque != null) {
                predicates.add(cb.or(cb.equal(root.get("estoqueOrigem").get("id"), idEstoque),
                        cb.equal(root.get("estoqueDestino").get("id"), idEstoque)));
            }
            if (idMaterial != null) {
                predicates.add(cb.equal(material.get("id"), idMaterial));
            }
            if (idVeiculo != null) {
                predicates.add(cb.equal(root.get("idVeiculo"), idVeiculo));
            }
            if (idReferencia != null) {
                predicates.add(cb.equal(root.get("idReferenciaOperacao"), idReferencia));
            }
            if (tipos != null && !tipos.isEmpty()) {
                predicates.add(cb.or(tipos.stream().map(t -> tipo(cb, root.get("tipo"), root.get("motivo"), t)).toArray(Predicate[]::new)));
            }
            if (busca != null && !busca.isBlank()) {
                String termo = "%" + busca.trim().toLowerCase(Locale.ROOT) + "%";
                predicates.add(cb.or(cb.like(cb.lower(material.get("codigo")), termo), cb.like(cb.lower(material.get("descricao")), termo),
                        cb.like(cb.lower(cb.coalesce(root.get("documento"), "")), termo)));
            }
            if (de != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("dataHora"), de));
            }
            if (ate != null) {
                predicates.add(cb.lessThan(root.get("dataHora"), ate));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private static Predicate tipo(CriteriaBuilder cb, Path<TipoMovimentacao> tipo, Expression<String> motivo, String filtro) {
        Expression<String> motivoOuVazio = cb.coalesce(motivo, "");
        return switch (filtro.toUpperCase(Locale.ROOT)) {
            case "ENTRADA" -> cb.and(cb.equal(tipo, TipoMovimentacao.ENTRADA_AVULSA), cb.notEqual(motivoOuVazio, AJUSTE));
            case "SAIDA" -> cb.and(cb.equal(tipo, TipoMovimentacao.BAIXA_AVULSA), cb.notEqual(motivoOuVazio, AJUSTE));
            case "AJUSTE" -> cb.equal(motivoOuVazio, AJUSTE);
            case "TRANSFERENCIA" -> cb.equal(tipo, TipoMovimentacao.TRANSFERENCIA);
            case "ESTORNO" -> cb.equal(tipo, TipoMovimentacao.ESTORNO);
            default -> cb.disjunction();
        };
    }
}
