package com.nexo.app.modules.rh.domain;

import com.nexo.app.shared.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.UUID;

/**
 * Arquivo anexado à medida (documento assinado, foto, outro documento). O SHA-256 prova que o arquivo
 * baixado é o mesmo que foi enviado.
 */
@Entity
@Table(name = "rh_medida_disciplinar_anexos")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AnexoMedidaDisciplinar extends BaseEntity {

    @Column(name = "id_medida", nullable = false, updatable = false)
    private UUID idMedida;

    @Column(name = "arquivo_chave", nullable = false, length = 500, updatable = false)
    private String arquivoChave;

    @Column(name = "arquivo_nome", nullable = false, length = 255)
    private String arquivoNome;

    @Column(name = "arquivo_content_type", length = 120)
    private String arquivoContentType;

    @Column(name = "arquivo_tamanho_bytes")
    private Long arquivoTamanhoBytes;

    @Column(name = "arquivo_sha256", nullable = false, length = 64, updatable = false)
    private String arquivoSha256;

    public AnexoMedidaDisciplinar(UUID idMedida, String chave, String nome, String contentType, long tamanho, String sha256) {
        this.idMedida = idMedida;
        this.arquivoChave = chave;
        this.arquivoNome = nome;
        this.arquivoContentType = contentType;
        this.arquivoTamanhoBytes = tamanho;
        this.arquivoSha256 = sha256;
    }
}
