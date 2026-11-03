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
 * Opção de resposta ou motivo de Não OK. Não é apagada: as respostas antigas a referenciam,
 * então sai do modelo por desativação.
 */
@Entity
@Table(name = "frota_checklist_alternativas")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AlternativaChecklist extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_pergunta", nullable = false, updatable = false)
    private PerguntaChecklist pergunta;

    @Enumerated(EnumType.STRING)
    @Column(name = "tipo", nullable = false, length = 10, updatable = false)
    private TipoAlternativaChecklist tipo;

    @Column(name = "ordem", nullable = false)
    private int ordem;

    @Column(name = "texto", nullable = false, length = 120)
    private String texto;

    /** Opção que conta como problema e vira pendência, como um Não OK. */
    @Column(name = "indica_problema", nullable = false)
    private boolean indicaProblema;

    AlternativaChecklist(PerguntaChecklist pergunta, TipoAlternativaChecklist tipo) {
        this.pergunta = pergunta;
        this.tipo = tipo;
    }

    void preencher(int ordem, String texto, boolean indicaProblema) {
        this.ordem = ordem;
        this.texto = Textos.obrigatorio(texto, tipo == TipoAlternativaChecklist.OPCAO ? "texto da opção" : "texto do motivo", 120);
        this.indicaProblema = tipo == TipoAlternativaChecklist.OPCAO && indicaProblema;
    }
}
