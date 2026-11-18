package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.application.dto.OrdemServicoFilter;
import com.nexo.app.modules.frota.domain.Criticidade;
import com.nexo.app.modules.frota.domain.ItemOrdemServico;
import com.nexo.app.modules.frota.domain.OrdemServico;
import com.nexo.app.modules.frota.domain.SituacaoOrdemServico;
import com.nexo.app.shared.infrastructure.persistence.SpecificationUtils;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Order;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Subquery;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public final class OrdemServicoSpecification {

    private OrdemServicoSpecification() {
    }

    /** @param agora referência para "atrasada" (previsão de término vencida) */
    public static Specification<OrdemServico> of(OrdemServicoFilter filtro, OffsetDateTime agora) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.isTrue(root.get("ativo")));
            if (filtro == null) {
                return cb.and(predicates.toArray(new Predicate[0]));
            }
            if (filtro.busca() != null && !filtro.busca().isBlank()) {
                String termo = filtro.busca().trim();
                List<Expression<String>> campos = List.of(root.get("descricao"), root.get("oficinaNome"),
                        root.get("descricaoServico"), root.get("descricaoEquipamento"));
                List<Predicate> ors = new ArrayList<>();
                ors.add(cb.like(root.get("placa"), "%" + termo.toUpperCase(Locale.ROOT).replace("-", "") + "%"));
                ors.add(SpecificationUtils.predicadoBuscaRapida(termo, cb, campos));
                String digitos = termo.replace("#", "");
                if (digitos.matches("\\d{1,15}")) {
                    ors.add(cb.equal(root.get("numero"), Long.valueOf(digitos)));
                }
                predicates.add(cb.or(ors.toArray(new Predicate[0])));
            }
            SpecificationUtils.filtrarPor(filtro.idsBase(), predicates, root.get("idBaseOperacional"));
            SpecificationUtils.filtrarPor(filtro.situacoes(), predicates, root.get("situacao"));
            SpecificationUtils.filtrarPor(filtro.criticidades(), predicates, root.get("criticidade"));
            SpecificationUtils.filtrarPor(filtro.tiposManutencao(), predicates, root.get("tipoManutencao"));
            SpecificationUtils.filtrarPor(filtro.origens(), predicates, root.get("origem"));
            if (filtro.idVeiculo() != null) {
                predicates.add(cb.equal(root.get("idVeiculo"), filtro.idVeiculo()));
            }
            if (filtro.idCondutor() != null) {
                predicates.add(cb.equal(root.get("idCondutor"), filtro.idCondutor()));
            }
            if (filtro.abertaDe() != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("abertaEm"), filtro.abertaDe()));
            }
            if (filtro.abertaAte() != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("abertaEm"), filtro.abertaAte()));
            }
            if (filtro.concluidaDe() != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("fimReal"), filtro.concluidaDe()));
            }
            if (filtro.concluidaAte() != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("fimReal"), filtro.concluidaAte()));
            }
            if (Boolean.TRUE.equals(filtro.atrasadas())) {
                predicates.add(cb.equal(root.get("situacao"), SituacaoOrdemServico.EM_ANDAMENTO));
                predicates.add(cb.lessThan(root.get("previsaoTermino"), agora));
            }
            if (filtro.baixaPendente() != null) {
                predicates.add(cb.equal(root.get("situacao"), SituacaoOrdemServico.CONCLUIDA));
                predicates.add(filtro.baixaPendente() ? cb.isNull(root.get("finalizadaEm")) : cb.isNotNull(root.get("finalizadaEm")));
            }
            if (Boolean.TRUE.equals(filtro.semVeiculo())) {
                predicates.add(cb.isFalse(root.get("veicular")));
            }
            if (Boolean.TRUE.equals(filtro.veiculoParado())) {
                predicates.add(cb.isTrue(root.get("veiculoParado")));
                predicates.add(cb.isNull(root.get("liberadoEm")));
                predicates.add(root.get("situacao").in(SituacaoOrdemServico.ABERTAS));
            }
            if (!filtro.idsItem().isEmpty() || Boolean.TRUE.equals(filtro.comRepeticao())) {
                Subquery<Integer> itens = query.subquery(Integer.class);
                var item = itens.from(ItemOrdemServico.class);
                List<Predicate> condicoes = new ArrayList<>();
                condicoes.add(cb.equal(item.get("ordem"), root));
                if (!filtro.idsItem().isEmpty()) {
                    condicoes.add(item.get("item").get("id").in(filtro.idsItem()));
                }
                if (Boolean.TRUE.equals(filtro.comRepeticao())) {
                    condicoes.add(cb.isNotNull(item.get("idOsAnterior")));
                }
                itens.select(cb.literal(1)).where(condicoes.toArray(new Predicate[0]));
                predicates.add(cb.exists(itens));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    /** Campo de ordenação que segue a gravidade, não o texto do enum. */
    public static final String CRITICIDADE = "criticidade";

    /**
     * Aplica a ordenação na consulta. {@code criticidade} vira gravidade: decrescente põe primeiro o
     * veículo parado e, depois, urgente, alta, média e baixa, com a OS mais antiga antes em cada faixa.
     * Os demais campos seguem o atributo. A contagem da página não recebe ordenação.
     */
    public static Specification<OrdemServico> ordenada(Specification<OrdemServico> base, Sort sort) {
        return (root, query, cb) -> {
            Predicate predicado = base.toPredicate(root, query, cb);
            if (query.getResultType() == Long.class || query.getResultType() == long.class) {
                return predicado;
            }
            List<Order> ordens = new ArrayList<>();
            for (Sort.Order ordem : sort) {
                if (CRITICIDADE.equals(ordem.getProperty())) {
                    Expression<Integer> parado = cb.<Integer>selectCase()
                            .when(cb.and(cb.isTrue(root.get("veiculoParado")), cb.isNull(root.get("liberadoEm")),
                                    root.get("situacao").in(SituacaoOrdemServico.ABERTAS)), 0)
                            .otherwise(1);
                    var faixa = cb.<Integer>selectCase();
                    Criticidade[] porGravidade = {Criticidade.URGENTE, Criticidade.ALTA, Criticidade.MEDIA, Criticidade.BAIXA};
                    for (int i = 0; i < porGravidade.length; i++) {
                        faixa = faixa.when(cb.equal(root.get(CRITICIDADE), porGravidade[i]), i);
                    }
                    Expression<Integer> gravidade = faixa.otherwise(porGravidade.length);
                    boolean maisGravePrimeiro = ordem.isDescending();
                    ordens.add(maisGravePrimeiro ? cb.asc(parado) : cb.desc(parado));
                    ordens.add(maisGravePrimeiro ? cb.asc(gravidade) : cb.desc(gravidade));
                    ordens.add(cb.asc(root.get("abertaEm")));
                } else {
                    ordens.add(ordem.isAscending() ? cb.asc(root.get(ordem.getProperty())) : cb.desc(root.get(ordem.getProperty())));
                }
            }
            query.orderBy(ordens);
            return predicado;
        };
    }
}
