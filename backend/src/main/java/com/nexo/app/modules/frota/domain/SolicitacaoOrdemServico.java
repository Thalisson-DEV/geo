package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.UUID;

/**
 * Compra ou pagamento do financeiro aberto a partir de uma OS. A situação da
 * solicitação mora no financeiro; aqui fica só o vínculo.
 */
@Entity
@Table(name = "frota_os_solicitacoes")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SolicitacaoOrdemServico extends BaseEntity {

    @Column(name = "id_ordem_servico", nullable = false, updatable = false)
    private UUID idOrdemServico;

    @Column(name = "id_solicitacao", nullable = false, unique = true, updatable = false)
    private UUID idSolicitacao;

    /** {@code COMPRA} ou {@code PAGAMENTO}. */
    @Column(name = "tipo", nullable = false, length = 20, updatable = false)
    private String tipo;

    public SolicitacaoOrdemServico(UUID idOrdemServico, UUID idSolicitacao, String tipo) {
        this.idOrdemServico = idOrdemServico;
        this.idSolicitacao = idSolicitacao;
        this.tipo = tipo;
    }
}
