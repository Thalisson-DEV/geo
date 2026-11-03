package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Tipo de despesa do veículo (lavagem, pedágio, mensalidade…), com subtipos opcionais. Os tipos
 * semeados têm código, que a importação usa; os criados na tela, não.
 */
@Entity
@Table(name = "frota_tipos_despesa")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TipoDespesa extends BaseEntity {

    @Column(name = "nome", nullable = false, length = 80)
    private String nome;

    @Column(name = "codigo", length = 30, updatable = false)
    private String codigo;

    @Column(name = "ordem", nullable = false)
    private int ordem;

    @OneToMany(mappedBy = "tipo", cascade = CascadeType.ALL)
    @OrderBy("ordem ASC")
    private List<SubtipoDespesa> subtipos = new ArrayList<>();

    public TipoDespesa(String nome, int ordem, List<String> subtipos) {
        this.nome = Textos.obrigatorio(nome, "nome do tipo", 80);
        this.ordem = ordem;
        definirSubtipos(subtipos);
    }

    public void atualizar(String nome, List<String> subtipos) {
        if (!isAtivo()) {
            throw new InvarianteVioladaException("Não é possível alterar um tipo de despesa desativado.");
        }
        this.nome = Textos.obrigatorio(nome, "nome do tipo", 80);
        definirSubtipos(subtipos);
    }

    /** Mantém os que continuam (pelo nome), reativa os que voltaram, inclui os novos e desativa os que saíram. */
    private void definirSubtipos(List<String> nomes) {
        var desejados = new ArrayList<String>();
        var vistos = new HashSet<String>();
        for (String n : nomes == null ? List.<String>of() : nomes) {
            String limpo = Textos.opcional(n, 80);
            if (limpo != null && vistos.add(chave(limpo))) {
                desejados.add(limpo);
            }
        }
        Set<String> chaves = new HashSet<>(desejados.stream().map(TipoDespesa::chave).toList());
        for (SubtipoDespesa s : subtipos) {
            if (!chaves.contains(chave(s.getNome())) && s.isAtivo()) {
                s.desativar();
            }
        }
        for (int i = 0; i < desejados.size(); i++) {
            String n = desejados.get(i);
            var existente = subtipos.stream().filter(s -> chave(s.getNome()).equals(chave(n))).findFirst();
            if (existente.isPresent()) {
                existente.get().reordenar(n, i + 1);
            } else {
                subtipos.add(new SubtipoDespesa(this, n, i + 1));
            }
        }
    }

    public List<SubtipoDespesa> subtiposAtivos() {
        return subtipos.stream().filter(SubtipoDespesa::isAtivo).toList();
    }

    private static String chave(String nome) {
        return nome.trim().toUpperCase(Locale.ROOT);
    }
}
