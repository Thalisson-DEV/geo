package com.nexo.app.modules.obras.domain;

import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.text.Normalizer;
import java.util.Locale;

/**
 * Cadastro dos tipos de obra (Comum, LPT, Corretiva, Preventiva, Kit, Medidor...).
 *
 * <p>Define se a execução é controlada por OS (material da obra) ou por OC (material da ocorrência)
 * e se o tipo é um subtipo vinculado a uma obra principal (kit, medidor).</p>
 */
@Entity
@Table(name = "tipos_obra")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TipoDeObra extends BaseEntity {

    @Column(name = "codigo", nullable = false, unique = true, length = 30, updatable = false)
    private String codigo;

    @Column(name = "nome", nullable = false, unique = true, length = 60)
    private String nome;

    @Column(name = "descricao", length = 255)
    private String descricao;

    @Enumerated(EnumType.STRING)
    @Column(name = "controle_execucao", nullable = false, length = 4)
    private ControleExecucaoObra controleExecucao;

    @Column(name = "subtipo", nullable = false)
    private boolean subtipo;

    public TipoDeObra(String nome, String descricao, ControleExecucaoObra controleExecucao, boolean subtipo) {
        this.nome = nomeValido(nome);
        this.codigo = codigoDe(this.nome);
        aplicar(descricao, controleExecucao, subtipo);
    }

    public void atualizar(String nome, String descricao, ControleExecucaoObra controleExecucao, boolean subtipo) {
        if (!isAtivo()) {
            throw new InvarianteVioladaException("Não é possível alterar um tipo de obra desativado.");
        }
        this.nome = nomeValido(nome);
        aplicar(descricao, controleExecucao, subtipo);
    }

    /** Corretiva e preventiva: o material vai direto para a OC ou OS digitada na solicitação. */
    public boolean usaOcorrencia() {
        return controleExecucao != null && controleExecucao.porExecucao();
    }

    /**
     * Classe operacional usada pelo estoque e pelos relatórios (OBRA, LPT, CORRETIVA, PREVENTIVA).
     * Os tipos de fábrica mantêm a própria classe; os novos seguem o controle (OS/OC = corretiva, direto na obra = obra).
     */
    public TipoObra classeOperacional() {
        for (TipoObra classe : TipoObra.values()) {
            if (classe.name().equals(codigo)) {
                return classe;
            }
        }
        return usaOcorrencia() ? TipoObra.CORRETIVA : TipoObra.OBRA;
    }

    private void aplicar(String descricao, ControleExecucaoObra controleExecucao, boolean subtipo) {
        if (controleExecucao == null) {
            throw new InvarianteVioladaException("Informe para onde vai o material: direto na obra, na OS ou na OC.");
        }
        this.descricao = descricao != null && !descricao.isBlank() ? descricao.trim() : null;
        this.controleExecucao = controleExecucao;
        this.subtipo = subtipo;
    }

    private static String nomeValido(String nome) {
        if (nome == null || nome.isBlank()) {
            throw new InvarianteVioladaException("O nome do tipo de obra é obrigatório.");
        }
        String limpo = nome.trim().replaceAll("\\s+", " ").toUpperCase(Locale.ROOT);
        if (limpo.length() < 2 || limpo.length() > 60) {
            throw new InvarianteVioladaException("O nome do tipo de obra deve ter entre 2 e 60 caracteres.");
        }
        return limpo;
    }

    public static String codigoDe(String nome) {
        String semAcento = Normalizer.normalize(nome, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        String codigo = semAcento.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]+", "_").replaceAll("(^_+)|(_+$)", "");
        return codigo.length() > 30 ? codigo.substring(0, 30) : codigo;
    }
}
