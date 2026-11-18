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
 * Evidência da OS: checklist da oficina assinado, foto de antes e depois, laudo. Arquivo no
 * armazenamento de objetos; a nota fiscal fica nos documentos fiscais, com número e valor.
 */
@Entity
@Table(name = "frota_os_anexos")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AnexoOrdemServico extends BaseEntity {

    @Column(name = "id_ordem_servico", nullable = false, updatable = false)
    private UUID idOrdemServico;

    @Column(name = "descricao", length = 200)
    private String descricao;

    @Column(name = "arquivo_chave", nullable = false, length = 500, updatable = false)
    private String arquivoChave;

    @Column(name = "arquivo_nome", nullable = false, length = 255)
    private String arquivoNome;

    @Column(name = "arquivo_content_type", length = 120)
    private String arquivoContentType;

    @Column(name = "arquivo_tamanho_bytes")
    private Long arquivoTamanhoBytes;

    public AnexoOrdemServico(UUID idOrdemServico, String descricao, String chave, String nome, String contentType,
                             long tamanho) {
        this.idOrdemServico = idOrdemServico;
        this.descricao = Textos.opcional(descricao, 200);
        this.arquivoChave = chave;
        this.arquivoNome = nome;
        this.arquivoContentType = contentType;
        this.arquivoTamanhoBytes = tamanho;
    }
}
