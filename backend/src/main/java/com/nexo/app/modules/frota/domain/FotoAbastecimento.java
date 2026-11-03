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

import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

/**
 * Foto esperada pelo abastecimento. Nasce sem arquivo, com o id que o aparelho gerou, e recebe
 * o arquivo no envio seguinte; reenviar a mesma foto não muda nada.
 */
@Entity
@Table(name = "frota_abastecimento_fotos")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FotoAbastecimento extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_abastecimento", nullable = false, updatable = false)
    private Abastecimento abastecimento;

    @Column(name = "id_aparelho", nullable = false, updatable = false)
    private UUID idAparelho;

    @Enumerated(EnumType.STRING)
    @Column(name = "tipo", nullable = false, length = 20, updatable = false)
    private TipoFotoAbastecimento tipo;

    @Column(name = "arquivo_chave", length = 500)
    private String arquivoChave;

    @Column(name = "arquivo_nome", length = 255)
    private String arquivoNome;

    @Column(name = "arquivo_content_type", length = 120)
    private String arquivoContentType;

    @Column(name = "arquivo_tamanho_bytes")
    private Long arquivoTamanhoBytes;

    @Column(name = "hash_arquivo", length = 64)
    private String hashArquivo;

    @Column(name = "recebida_em")
    private OffsetDateTime recebidaEm;

    FotoAbastecimento(Abastecimento abastecimento, UUID idAparelho, TipoFotoAbastecimento tipo) {
        this.abastecimento = abastecimento;
        this.idAparelho = Objects.requireNonNull(idAparelho, "O id da foto é obrigatório");
        this.tipo = tipo;
    }

    public boolean isRecebida() {
        return arquivoChave != null;
    }

    /** Devolve falso quando a foto já tinha chegado (reenvio do app). */
    public boolean anexar(String chave, String nome, String contentType, long tamanhoBytes, String hash, OffsetDateTime agora) {
        if (isRecebida()) return false;
        this.arquivoChave = Objects.requireNonNull(chave);
        this.arquivoNome = nome;
        this.arquivoContentType = contentType;
        this.arquivoTamanhoBytes = tamanhoBytes;
        this.hashArquivo = hash;
        this.recebidaEm = agora;
        return true;
    }
}
