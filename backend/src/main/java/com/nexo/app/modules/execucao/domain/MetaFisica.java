package com.nexo.app.modules.execucao.domain;

import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.FeriadosNacionais;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import jakarta.validation.constraints.NotNull;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Meta física da Concessionária: quantas notas de cada tipo de serviço uma base operacional
 * deve executar num mês. Cada nota conta uma vez, não importa quantos serviços tenha.
 *
 * <p>A Concessionária pode enviar a meta de duas formas: a quantidade mensal de cada serviço,
 * ou o total do mês da base e apenas o parcial por serviço até uma data. No segundo
 * caso o total é repartido na proporção do parcial ({@link DistribuicaoMetaFisica}) e
 * os números enviados ficam guardados para conferência.</p>
 *
 * <p>Invariantes: base e mês são imutáveis; ao menos um serviço, sem repetição; a
 * soma das quantidades é positiva; com total da Concessionária, a soma fecha com ele.</p>
 */
@Entity
@Table(name = "metas_fisicas")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MetaFisica extends BaseEntity {

    static final int QUANTIDADE_MAXIMA = 1_000_000;

    @NotNull
    @Column(name = "id_base_operacional", nullable = false)
    private UUID idBaseOperacional;

    /** Dia 1º do mês da meta. */
    @NotNull
    @Column(name = "competencia", nullable = false)
    private LocalDate competencia;

    @Column(name = "total_mes_concessionaria")
    private Integer totalMesConcessionária;

    @Column(name = "parcial_ate")
    private LocalDate parcialAte;

    @Column(name = "descricao", length = 200)
    private String descricao;

    @OneToMany(mappedBy = "meta", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("dataCriacao ASC")
    private List<MetaFisicaItem> itens = new ArrayList<>();

    /** Serviço informado no cadastro: a meta do mês ou, com o total da Concessionária, o parcial. */
    public record Servico(UUID idTipoServico, Integer quantidade, Integer parcialConcessionária) {
    }

    public MetaFisica(UUID idBaseOperacional, YearMonth competencia) {
        this.idBaseOperacional = Objects.requireNonNull(idBaseOperacional, "Base operacional é obrigatória");
        this.competencia = Objects.requireNonNull(competencia, "Mês da meta é obrigatório").atDay(1);
    }

    public YearMonth getMes() {
        return YearMonth.from(competencia);
    }

    /**
     * Define os serviços da meta. Com {@code totalMesConcessionária}, a quantidade de cada
     * serviço é calculada pelo parcial; sem ele, vale a quantidade informada.
     */
    public void definir(Integer totalMesConcessionária, LocalDate parcialAte, String descricao, List<Servico> servicos) {
        if (servicos == null || servicos.isEmpty()) {
            throw new InvarianteVioladaException("Informe ao menos um tipo de serviço na meta.");
        }
        Set<UUID> tipos = new HashSet<>();
        for (Servico servico : servicos) {
            if (servico == null || servico.idTipoServico() == null) {
                throw new InvarianteVioladaException("Escolha o tipo de serviço de cada linha da meta.");
            }
            if (!tipos.add(servico.idTipoServico())) {
                throw new InvarianteVioladaException("O mesmo tipo de serviço aparece duas vezes na meta.");
            }
        }

        List<Integer> quantidades;
        List<Integer> parciais;
        if (totalMesConcessionária != null) {
            if (totalMesConcessionária > QUANTIDADE_MAXIMA) {
                throw new InvarianteVioladaException("O total do mês ultrapassa o limite permitido.");
            }
            parciais = servicos.stream().map(Servico::parcialConcessionária).toList();
            quantidades = DistribuicaoMetaFisica.distribuir(totalMesConcessionária, parciais);
            if (parcialAte != null && !YearMonth.from(parcialAte).equals(getMes())) {
                throw new InvarianteVioladaException("A data do parcial da Concessionária precisa ser do mês da meta.");
            }
        } else {
            quantidades = servicos.stream().map(Servico::quantidade).toList();
            parciais = servicos.stream().map(s -> (Integer) null).toList();
            for (Integer quantidade : quantidades) {
                if (quantidade == null || quantidade < 0) {
                    throw new InvarianteVioladaException("Informe a meta do mês de cada serviço (zero ou mais).");
                }
                if (quantidade > QUANTIDADE_MAXIMA) {
                    throw new InvarianteVioladaException("A meta de um serviço ultrapassa o limite permitido.");
                }
            }
            if (quantidades.stream().mapToInt(Integer::intValue).sum() <= 0) {
                throw new InvarianteVioladaException("A meta do mês precisa ter ao menos uma nota.");
            }
        }

        this.totalMesConcessionária = totalMesConcessionária;
        this.parcialAte = totalMesConcessionária != null ? parcialAte : null;
        this.descricao = descricao == null || descricao.isBlank() ? null : descricao.trim();
        sincronizarItens(servicos, quantidades, parciais);
    }

    public int total() {
        return itens.stream().mapToInt(MetaFisicaItem::getQuantidade).sum();
    }

    /** Segunda a sexta do mês, sem os feriados nacionais. */
    public int diasUteis() {
        YearMonth mes = getMes();
        int total = 0;
        for (LocalDate dia = mes.atDay(1); !dia.isAfter(mes.atEndOfMonth()); dia = dia.plusDays(1)) {
            DayOfWeek dow = dia.getDayOfWeek();
            if (dow != DayOfWeek.SATURDAY && dow != DayOfWeek.SUNDAY && !FeriadosNacionais.feriado(dia)) {
                total++;
            }
        }
        return total;
    }

    /** Duas metas ativas não podem ser da mesma base no mesmo mês. */
    public boolean conflitaCom(MetaFisica outra) {
        return idBaseOperacional.equals(outra.idBaseOperacional) && competencia.equals(outra.competencia);
    }

    /**
     * Atualiza os itens no lugar (pelo tipo de serviço): apagar e reinserir o mesmo tipo
     * no mesmo flush violaria a unicidade, porque o Hibernate insere antes de apagar.
     */
    private void sincronizarItens(List<Servico> servicos, List<Integer> quantidades, List<Integer> parciais) {
        Map<UUID, MetaFisicaItem> atuais = itens.stream()
                .collect(Collectors.toMap(MetaFisicaItem::getIdTipoServico, Function.identity()));
        Set<UUID> manter = new HashSet<>();
        for (int i = 0; i < servicos.size(); i++) {
            UUID tipo = servicos.get(i).idTipoServico();
            manter.add(tipo);
            MetaFisicaItem atual = atuais.get(tipo);
            if (atual != null) {
                atual.definir(quantidades.get(i), parciais.get(i));
            } else {
                itens.add(new MetaFisicaItem(this, tipo, quantidades.get(i), parciais.get(i)));
            }
        }
        itens.removeIf(item -> !manter.contains(item.getIdTipoServico()));
    }
}
