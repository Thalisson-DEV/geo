package com.nexo.app.modules.obras.domain;

import com.nexo.app.shared.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.Objects;
import java.util.UUID;

/**
 * Assinatura de Web Push de um aparelho (o app instalado na tela inicial). Recebe os avisos de mudança na agenda da
 * equipe. Depois de várias falhas seguidas, ou quando o navegador a desfaz, sai de uso.
 */
@Entity
@Table(name = "assinaturas_push")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AssinaturaPush extends BaseEntity {

    private static final int FALHAS_PARA_DESATIVAR = 5;

    @Column(name = "id_usuario", nullable = false)
    private UUID idUsuario;

    @Column(name = "id_equipe")
    private UUID idEquipe;

    @Column(name = "endpoint", nullable = false, length = 1000)
    private String endpoint;

    @Column(name = "chave_p256dh", nullable = false, length = 200)
    private String p256dh;

    @Column(name = "chave_auth", nullable = false, length = 100)
    private String auth;

    @Column(name = "falhas", nullable = false)
    private int falhas;

    public AssinaturaPush(UUID idUsuario, UUID idEquipe, String endpoint, String p256dh, String auth) {
        this.endpoint = Objects.requireNonNull(endpoint);
        renovar(idUsuario, idEquipe, p256dh, auth);
    }

    /** O mesmo aparelho assinou de novo (outro login ou chaves novas). */
    public void renovar(UUID idUsuario, UUID idEquipe, String p256dh, String auth) {
        this.idUsuario = Objects.requireNonNull(idUsuario);
        this.idEquipe = idEquipe;
        this.p256dh = Objects.requireNonNull(p256dh);
        this.auth = Objects.requireNonNull(auth);
        this.falhas = 0;
        if (!isAtivo()) {
            ativar();
        }
    }

    public void registrarEntrega() {
        this.falhas = 0;
    }

    public void registrarFalha() {
        this.falhas++;
        if (falhas >= FALHAS_PARA_DESATIVAR) {
            desativar();
        }
    }
}
