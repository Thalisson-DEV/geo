package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.UUID;

/** Não OK do checklist esperando a decisão do gestor. Nunca vira OS sozinho. */
@Entity
@Table(name = "frota_checklist_pendencias")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PendenciaChecklist extends BaseEntity {

    @Column(name = "id_checklist", nullable = false, updatable = false)
    private UUID idChecklist;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_resposta", nullable = false, updatable = false)
    private RespostaChecklist resposta;

    @Column(name = "id_veiculo", nullable = false, updatable = false)
    private UUID idVeiculo;

    @Column(name = "id_base_operacional", updatable = false)
    private UUID idBaseOperacional;

    @Enumerated(EnumType.STRING)
    @Column(name = "situacao", nullable = false, length = 20)
    private SituacaoPendenciaChecklist situacao = SituacaoPendenciaChecklist.ABERTA;

    @Column(name = "id_ordem_servico")
    private UUID idOrdemServico;

    @Column(name = "justificativa", length = 1000)
    private String justificativa;

    @Column(name = "id_usuario_decisao")
    private UUID idUsuarioDecisao;

    @Column(name = "decidida_em")
    private OffsetDateTime decididaEm;

    public PendenciaChecklist(Checklist checklist, RespostaChecklist resposta) {
        this.idChecklist = checklist.getId();
        this.resposta = resposta;
        this.idVeiculo = checklist.getIdVeiculo();
        this.idBaseOperacional = checklist.getIdBaseOperacional();
    }

    public boolean isAberta() {
        return situacao == SituacaoPendenciaChecklist.ABERTA;
    }

    /** O gestor abriu OS para o problema; o serviço segue pela OS. */
    public void encaminharParaOs(UUID idOrdemServico, UUID idUsuario, OffsetDateTime agora) {
        decidir(SituacaoPendenciaChecklist.OS_ABERTA, idOrdemServico, null, idUsuario, agora);
    }

    /** Resolvido na hora: a OS já nasceu concluída, para manter o histórico. */
    public void resolverNaHora(UUID idOrdemServico, UUID idUsuario, OffsetDateTime agora) {
        decidir(SituacaoPendenciaChecklist.RESOLVIDA_NA_HORA, idOrdemServico, null, idUsuario, agora);
    }

    /** Não OK marcado por engano. */
    public void descartar(String justificativa, UUID idUsuario, OffsetDateTime agora) {
        if (justificativa == null || justificativa.isBlank()) {
            throw new InvarianteVioladaException("Informe a justificativa do descarte.");
        }
        decidir(SituacaoPendenciaChecklist.DESCARTADA, null, Textos.opcional(justificativa, 1000), idUsuario, agora);
    }

    private void decidir(SituacaoPendenciaChecklist nova, UUID idOrdemServico, String justificativa, UUID idUsuario,
                         OffsetDateTime agora) {
        if (!isAberta()) {
            throw new InvarianteVioladaException("A pendência \"" + resposta.resumo() + "\" já foi tratada: " + situacao.getRotulo() + ".");
        }
        if (nova != SituacaoPendenciaChecklist.DESCARTADA && idOrdemServico == null) {
            throw new InvarianteVioladaException("Informe a OS da pendência.");
        }
        this.situacao = nova;
        this.idOrdemServico = idOrdemServico;
        this.justificativa = justificativa;
        this.idUsuarioDecisao = idUsuario;
        this.decididaEm = agora;
    }
}
