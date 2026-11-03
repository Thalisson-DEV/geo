package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.BaseEntity;
import jakarta.persistence.CascadeType;
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
import java.util.Objects;
import java.util.UUID;

/**
 * Foto esperada pelo checklist. Nasce sem arquivo, com o id que o aparelho gerou, e recebe o
 * arquivo no envio seguinte; reenviar a mesma foto não muda nada.
 */
@Entity
@Table(name = "frota_checklist_fotos")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FotoChecklist extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_checklist", nullable = false, updatable = false)
    private Checklist checklist;

    @Column(name = "id_aparelho", nullable = false, updatable = false)
    private UUID idAparelho;

    @Enumerated(EnumType.STRING)
    @Column(name = "tipo", nullable = false, length = 20, updatable = false)
    private TipoFotoChecklist tipo;

    /** PERSIST: o Hibernate grava as coleções em ordem alfabética (fotos antes de respostas). */
    @ManyToOne(fetch = FetchType.LAZY, cascade = CascadeType.PERSIST)
    @JoinColumn(name = "id_resposta", updatable = false)
    private RespostaChecklist resposta;

    @Column(name = "id_foto_recebimento", updatable = false)
    private UUID idFotoRecebimento;

    @Column(name = "descricao", length = 120, updatable = false)
    private String descricao;

    @Column(name = "arquivo_chave", length = 500)
    private String arquivoChave;

    @Column(name = "arquivo_nome", length = 255)
    private String arquivoNome;

    @Column(name = "arquivo_content_type", length = 120)
    private String arquivoContentType;

    @Column(name = "arquivo_tamanho_bytes")
    private Long arquivoTamanhoBytes;

    @Column(name = "recebida_em")
    private OffsetDateTime recebidaEm;

    static FotoChecklist daResposta(Checklist checklist, UUID idAparelho, RespostaChecklist resposta) {
        var foto = new FotoChecklist(checklist, idAparelho, TipoFotoChecklist.RESPOSTA);
        foto.resposta = resposta;
        foto.descricao = resposta.getPerguntaTexto().length() > 120 ? resposta.getPerguntaTexto().substring(0, 120) : resposta.getPerguntaTexto();
        return foto;
    }

    static FotoChecklist deRecebimento(Checklist checklist, UUID idAparelho, FotoRecebimentoChecklist pedida) {
        var foto = new FotoChecklist(checklist, idAparelho, TipoFotoChecklist.RECEBIMENTO);
        foto.idFotoRecebimento = pedida.getId();
        foto.descricao = pedida.getDescricao();
        return foto;
    }

    private FotoChecklist(Checklist checklist, UUID idAparelho, TipoFotoChecklist tipo) {
        this.checklist = checklist;
        this.idAparelho = Objects.requireNonNull(idAparelho, "O id da foto é obrigatório");
        this.tipo = tipo;
    }

    public boolean isRecebida() {
        return arquivoChave != null;
    }

    /** Devolve falso quando a foto já tinha chegado (reenvio do app). */
    public boolean anexar(String chave, String nome, String contentType, long tamanhoBytes, OffsetDateTime agora) {
        if (isRecebida()) return false;
        this.arquivoChave = Objects.requireNonNull(chave);
        this.arquivoNome = nome;
        this.arquivoContentType = contentType;
        this.arquivoTamanhoBytes = tamanhoBytes;
        this.recebidaEm = agora;
        return true;
    }
}
