package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.UUID;

/** Foto, boletim de ocorrência ou outro documento do sinistro (arquivo no armazenamento de objetos). */
@Entity
@Table(name = "frota_sinistro_anexos")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AnexoSinistro extends BaseEntity {

    @Column(name = "id_sinistro", nullable = false, updatable = false)
    private UUID idSinistro;

    @Column(name = "arquivo_chave", nullable = false, length = 500, updatable = false)
    private String arquivoChave;

    @Column(name = "arquivo_nome", nullable = false, length = 255)
    private String arquivoNome;

    @Column(name = "arquivo_content_type", length = 120)
    private String arquivoContentType;

    @Column(name = "arquivo_tamanho_bytes")
    private Long arquivoTamanhoBytes;

    public AnexoSinistro(UUID idSinistro, String chave, String nome, String contentType, long tamanho) {
        this.idSinistro = idSinistro;
        this.arquivoChave = chave;
        this.arquivoNome = nome;
        this.arquivoContentType = contentType;
        this.arquivoTamanhoBytes = tamanho;
    }
}
