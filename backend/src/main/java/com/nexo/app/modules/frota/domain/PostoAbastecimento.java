package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.UUID;

/**
 * Posto externo onde a frota abastece. O WhatsApp recebe o aviso da liberação; o fornecedor
 * do financeiro recebe a fatura do posto.
 */
@Entity
@Table(name = "frota_postos")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PostoAbastecimento extends BaseEntity {

    @Column(name = "nome", nullable = false, length = 120)
    private String nome;

    @Column(name = "cnpj", length = 14)
    private String cnpj;

    @Column(name = "id_base_operacional")
    private UUID idBaseOperacional;

    /** E.164 sem o "+", ex.: 5574999990000. */
    @Column(name = "whatsapp", length = 20)
    private String whatsapp;

    @Column(name = "id_fornecedor")
    private UUID idFornecedor;

    @Column(name = "observacao", length = 500)
    private String observacao;

    public record Dados(String nome, String cnpj, UUID idBaseOperacional, String whatsapp, UUID idFornecedor, String observacao) {
    }

    public PostoAbastecimento(Dados dados) {
        preencher(dados);
    }

    public void atualizar(Dados dados) {
        if (!isAtivo()) {
            throw new InvarianteVioladaException("Não é possível alterar um posto desativado.");
        }
        preencher(dados);
    }

    private void preencher(Dados dados) {
        this.nome = Textos.obrigatorio(dados.nome(), "nome do posto", 120);
        this.cnpj = cnpj(dados.cnpj());
        this.idBaseOperacional = dados.idBaseOperacional();
        this.whatsapp = whatsapp(dados.whatsapp());
        this.idFornecedor = dados.idFornecedor();
        this.observacao = Textos.opcional(dados.observacao(), 500);
    }

    private static String cnpj(String valor) {
        String digitos = valor == null ? "" : valor.replaceAll("\\D", "");
        if (digitos.isEmpty()) {
            return null;
        }
        if (digitos.length() != 14) {
            throw new InvarianteVioladaException("O CNPJ do posto deve ter 14 dígitos.");
        }
        return digitos;
    }

    /** Aceita o número com ou sem DDI; sem DDI, entende como Brasil (55). */
    static String whatsapp(String valor) {
        String digitos = valor == null ? "" : valor.replaceAll("\\D", "");
        if (digitos.isEmpty()) {
            return null;
        }
        if (digitos.length() == 10 || digitos.length() == 11) {
            digitos = "55" + digitos;
        }
        if (digitos.length() < 12 || digitos.length() > 15) {
            throw new InvarianteVioladaException("O WhatsApp do posto deve ter DDD e número, ex.: (74) 99999-0000.");
        }
        return digitos;
    }
}
