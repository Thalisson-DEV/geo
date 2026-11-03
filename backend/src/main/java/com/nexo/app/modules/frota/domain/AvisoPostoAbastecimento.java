package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Aviso ao posto da liberação ou do cancelamento. Nesta etapa sai por atalho: a mensagem
 * fica pronta e quem libera abre o WhatsApp do posto com ela; o aviso registra quando foi
 * aberto. O envio automático pela API do WhatsApp é um ponto futuro (as colunas de mensagem
 * externa, erro e tentativas já existem para isso).
 */
@Entity
@Table(name = "frota_abastecimento_avisos_posto")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AvisoPostoAbastecimento extends BaseEntity {

    public enum Motivo { LIBERACAO, CANCELAMENTO }

    public enum Situacao { PENDENTE, ENVIADO, FALHOU }

    @Column(name = "id_abastecimento", nullable = false, updatable = false)
    private UUID idAbastecimento;

    @Column(name = "motivo", nullable = false, length = 20, updatable = false)
    @jakarta.persistence.Enumerated(jakarta.persistence.EnumType.STRING)
    private Motivo motivo;

    @Column(name = "situacao", nullable = false, length = 20)
    @jakarta.persistence.Enumerated(jakarta.persistence.EnumType.STRING)
    private Situacao situacao;

    @Column(name = "whatsapp", length = 20, updatable = false)
    private String whatsapp;

    @Column(name = "mensagem", nullable = false, length = 1000, updatable = false)
    private String mensagem;

    @Column(name = "id_mensagem_externa", length = 120)
    private String idMensagemExterna;

    @Column(name = "erro", length = 500)
    private String erro;

    @Column(name = "tentativas", nullable = false)
    private int tentativas;

    @Column(name = "enviado_em")
    private OffsetDateTime enviadoEm;

    public AvisoPostoAbastecimento(UUID idAbastecimento, Motivo motivo, String whatsapp, String mensagem) {
        this.idAbastecimento = idAbastecimento;
        this.motivo = motivo;
        this.whatsapp = whatsapp;
        this.mensagem = Textos.obrigatorio(mensagem, "mensagem ao posto", 1000);
        this.situacao = Situacao.PENDENTE;
    }

    /** Quem libera abriu o WhatsApp do posto com a mensagem. Abrir de novo não muda o registro. */
    public void marcarAberto(OffsetDateTime agora) {
        if (whatsapp == null) {
            throw new InvarianteVioladaException("O posto não tem WhatsApp cadastrado. Copie a mensagem e envie por outro meio.");
        }
        if (situacao == Situacao.ENVIADO) return;
        this.situacao = Situacao.ENVIADO;
        this.enviadoEm = agora;
        this.tentativas++;
    }

    /** Atalho do WhatsApp com a conversa do posto e a mensagem; nulo sem número. */
    public String linkWhatsapp() {
        return whatsapp == null ? null : "https://wa.me/" + whatsapp + "?text=" + URLEncoder.encode(mensagem, StandardCharsets.UTF_8).replace("+", "%20");
    }
}
