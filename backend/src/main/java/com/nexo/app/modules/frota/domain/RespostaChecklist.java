package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.BaseEntity;
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

/**
 * Resposta a uma pergunta. Guarda a cópia do que foi perguntado e respondido, para que editar
 * o modelo não mude o histórico.
 */
@Entity
@Table(name = "frota_checklist_respostas")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RespostaChecklist extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_checklist", nullable = false, updatable = false)
    private Checklist checklist;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_pergunta", nullable = false, updatable = false)
    private PerguntaChecklist pergunta;

    @Column(name = "ordem", nullable = false, updatable = false)
    private int ordem;

    @Column(name = "grupo", length = 80, updatable = false)
    private String grupo;

    @Column(name = "pergunta_texto", nullable = false, length = 300, updatable = false)
    private String perguntaTexto;

    @Enumerated(EnumType.STRING)
    @Column(name = "tipo_resposta", nullable = false, length = 20, updatable = false)
    private TipoRespostaChecklist tipoResposta;

    /** OK/Não OK; nulo nos outros tipos. */
    @Column(name = "conforme", updatable = false)
    private Boolean conforme;

    /** Opção escolhida (opções) ou motivo do Não OK. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_alternativa", updatable = false)
    private AlternativaChecklist alternativa;

    @Column(name = "resposta_texto", length = 500, updatable = false)
    private String respostaTexto;

    @Column(name = "motivo_texto", length = 120, updatable = false)
    private String motivoTexto;

    @Column(name = "comentario", length = 1000, updatable = false)
    private String comentario;

    /** Não OK ou opção que indica problema: vira pendência para o gestor. */
    @Column(name = "problema", nullable = false, updatable = false)
    private boolean problema;

    RespostaChecklist(Checklist checklist, PerguntaChecklist pergunta, int ordem, String grupo, Boolean conforme,
                      AlternativaChecklist alternativa, String respostaTexto, String comentario) {
        this.checklist = checklist;
        this.pergunta = pergunta;
        this.ordem = ordem;
        this.grupo = grupo;
        this.perguntaTexto = pergunta.getTexto();
        this.tipoResposta = pergunta.getTipoResposta();
        this.conforme = conforme;
        this.alternativa = alternativa;
        this.comentario = Textos.opcional(comentario, 1000);
        switch (tipoResposta) {
            case OK_NOK -> {
                this.motivoTexto = alternativa == null ? null : alternativa.getTexto();
                this.problema = Boolean.FALSE.equals(conforme);
            }
            case OPCOES -> {
                this.respostaTexto = alternativa.getTexto();
                this.problema = alternativa.isIndicaProblema();
            }
            case TEXTO -> this.respostaTexto = Textos.obrigatorio(respostaTexto, "resposta de \"" + perguntaTexto + "\"", 500);
        }
    }

    /** Texto curto para listas e para a descrição da OS: "Faróis — Queimado". */
    public String resumo() {
        String detalhe = switch (tipoResposta) {
            case OK_NOK -> Boolean.TRUE.equals(conforme) ? "OK" : (motivoTexto == null ? "Não OK" : motivoTexto);
            case OPCOES, TEXTO -> respostaTexto;
        };
        return perguntaTexto + " — " + detalhe;
    }
}
