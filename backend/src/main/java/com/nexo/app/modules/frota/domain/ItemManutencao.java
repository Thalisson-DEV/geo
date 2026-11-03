package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.Column;
import jakarta.persistence.Embedded;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.Locale;

/**
 * Serviço ou peça que uma OS trata (ex.: "Pastilha de freio dianteira").
 *
 * <p>É a unidade da repetição: a mesma placa com o mesmo item dentro da janela é
 * manutenção repetida. A natureza liga o item ao recorte de custos do financeiro.</p>
 */
@Entity
@Table(name = "frota_itens_manutencao")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ItemManutencao extends BaseEntity {

    public static final int DIAS_REPETICAO_MAXIMO = 730;

    @Column(name = "nome", nullable = false, length = 120)
    private String nome;

    @Enumerated(EnumType.STRING)
    @Column(name = "natureza", nullable = false, length = 40)
    private NaturezaServico natureza;

    @Column(name = "descricao", length = 255)
    private String descricao;

    /** Janela própria de repetição; nula usa a janela padrão dos parâmetros. */
    @Column(name = "dias_repeticao")
    private Integer diasRepeticao;

    /** Preenchida só no que veio de importação (ex.: OS do EXP). */
    @Embedded
    private ReferenciaExterna referenciaExterna;

    public ItemManutencao(String nome, NaturezaServico natureza, String descricao, Integer diasRepeticao) {
        preencher(nome, natureza, descricao, diasRepeticao);
    }

    public void atualizar(String nome, NaturezaServico natureza, String descricao, Integer diasRepeticao) {
        if (!isAtivo()) {
            throw new InvarianteVioladaException("Não é possível alterar um item de manutenção desativado.");
        }
        preencher(nome, natureza, descricao, diasRepeticao);
    }

    /** Janela de repetição deste item, caindo na padrão quando não há uma própria. */
    public int janelaRepeticao(int padrao) {
        return diasRepeticao == null ? padrao : diasRepeticao;
    }

    /** Marca o registro como importado; só pode ser feito uma vez. */
    public void registrarReferenciaExterna(ReferenciaExterna referencia) {
        ReferenciaExterna.exigirVazia(this.referenciaExterna);
        this.referenciaExterna = referencia;
    }

    private void preencher(String nome, NaturezaServico natureza, String descricao, Integer diasRepeticao) {
        if (diasRepeticao != null && (diasRepeticao < 1 || diasRepeticao > DIAS_REPETICAO_MAXIMO)) {
            throw new InvarianteVioladaException(
                    "A janela de repetição deve estar entre 1 e " + DIAS_REPETICAO_MAXIMO + " dias.");
        }
        this.nome = Textos.obrigatorio(nome, "nome do item de manutenção", 120).toUpperCase(Locale.ROOT);
        if (natureza == null) {
            throw new InvarianteVioladaException("Informe a natureza do serviço.");
        }
        this.natureza = natureza;
        this.descricao = Textos.opcional(descricao, 255);
        this.diasRepeticao = diasRepeticao;
    }
}
