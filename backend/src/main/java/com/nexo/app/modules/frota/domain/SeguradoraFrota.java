package com.nexo.app.modules.frota.domain;

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

import java.util.UUID;

/**
 * Seguradora ou corretora da frota. O fornecedor do financeiro recebe o pagamento das parcelas;
 * o telefone de assistência é o que a equipe liga num sinistro ou pane.
 */
@Entity
@Table(name = "frota_seguradoras")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SeguradoraFrota extends BaseEntity {

    @Column(name = "id_fornecedor", nullable = false)
    private UUID idFornecedor;

    @Enumerated(EnumType.STRING)
    @Column(name = "papel", nullable = false, length = 20)
    private PapelSeguradora papel;

    /** Só dígitos, com DDD (ou 0800). */
    @Column(name = "telefone_assistencia", length = 13)
    private String telefoneAssistencia;

    @Column(name = "observacao", length = 500)
    private String observacao;

    public record Dados(UUID idFornecedor, PapelSeguradora papel, String telefoneAssistencia, String observacao) {
    }

    public SeguradoraFrota(Dados dados) {
        preencher(dados);
    }

    public void atualizar(Dados dados) {
        if (!isAtivo()) {
            throw new InvarianteVioladaException("Não é possível alterar uma seguradora desativada.");
        }
        preencher(dados);
    }

    private void preencher(Dados dados) {
        if (dados.idFornecedor() == null) {
            throw new InvarianteVioladaException("Escolha o fornecedor do financeiro.");
        }
        if (dados.papel() == null) {
            throw new InvarianteVioladaException("Informe se é seguradora ou corretora.");
        }
        this.idFornecedor = dados.idFornecedor();
        this.papel = dados.papel();
        this.telefoneAssistencia = telefone(dados.telefoneAssistencia());
        this.observacao = Textos.opcional(dados.observacao(), 500);
    }

    private static String telefone(String valor) {
        String digitos = valor == null ? "" : valor.replaceAll("\\D", "");
        if (digitos.isEmpty()) {
            return null;
        }
        if (digitos.length() < 8 || digitos.length() > 13) {
            throw new InvarianteVioladaException("O telefone de assistência deve ter de 8 a 13 dígitos, com DDD ou 0800.");
        }
        return digitos;
    }
}
