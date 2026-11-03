package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.UUID;

/** Nota, recibo ou comprovante anexado à despesa (arquivo no armazenamento de objetos). */
@Entity
@Table(name = "frota_despesa_anexos")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AnexoDespesa extends BaseEntity {

    @Column(name = "id_despesa", nullable = false, updatable = false)
    private UUID idDespesa;

    @Column(name = "arquivo_chave", nullable = false, length = 500, updatable = false)
    private String arquivoChave;

    @Column(name = "arquivo_nome", nullable = false, length = 255)
    private String arquivoNome;

    @Column(name = "arquivo_content_type", length = 120)
    private String arquivoContentType;

    @Column(name = "arquivo_tamanho_bytes")
    private Long arquivoTamanhoBytes;

    public AnexoDespesa(UUID idDespesa, String chave, String nome, String contentType, long tamanho) {
        this.idDespesa = idDespesa;
        this.arquivoChave = chave;
        this.arquivoNome = nome;
        this.arquivoContentType = contentType;
        this.arquivoTamanhoBytes = tamanho;
    }
}
