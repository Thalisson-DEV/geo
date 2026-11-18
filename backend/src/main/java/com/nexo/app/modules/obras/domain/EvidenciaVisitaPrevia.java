package com.nexo.app.modules.obras.domain;

import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * Foto ou PDF da visita prévia. Ligada a uma pergunta do checklist ou geral da visita. É sempre opcional: a visita se
 * salva sem nenhuma evidência, mesmo com resposta não conforme. Guarda o enunciado da pergunta para continuar legível
 * se o modelo mudar.
 */
@Entity
@Table(name = "evidencias_visita_previa_obra")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class EvidenciaVisitaPrevia extends BaseEntity {

    public static final String PDF = "application/pdf";
    public static final Set<String> TIPOS_ACEITOS = Set.of("image/jpeg", "image/png", PDF);

    /** Pergunta do checklist a que a evidência se refere. */
    public record Pergunta(String id, String enunciado) {
    }

    /** O arquivo já guardado no armazenamento; foto tem miniatura, PDF não. */
    public record Arquivo(String nome, String contentType, long tamanhoBytes, String chaveStorage, String chaveMiniatura) {
    }

    @Column(name = "id_obra", nullable = false, updatable = false)
    private UUID idObra;

    @Column(name = "id_visita", nullable = false, updatable = false)
    private UUID idVisita;

    @Column(name = "id_pergunta", length = 100, updatable = false)
    private String idPergunta;

    @Column(name = "enunciado_pergunta", length = 500, updatable = false)
    private String enunciadoPergunta;

    @Column(name = "legenda", length = 500)
    private String legenda;

    @Column(name = "nome_arquivo", nullable = false, updatable = false)
    private String nomeArquivo;

    @Column(name = "content_type", nullable = false, length = 100, updatable = false)
    private String contentType;

    @Column(name = "tamanho_bytes", nullable = false, updatable = false)
    private long tamanhoBytes;

    @Column(name = "chave_storage", nullable = false, length = 500, updatable = false)
    private String chaveStorage;

    @Column(name = "chave_miniatura", length = 500, updatable = false)
    private String chaveMiniatura;

    public EvidenciaVisitaPrevia(UUID idObra, UUID idVisita, Pergunta pergunta, String legenda, Arquivo arquivo) {
        this.idObra = Objects.requireNonNull(idObra);
        this.idVisita = Objects.requireNonNull(idVisita);
        if (!TIPOS_ACEITOS.contains(arquivo.contentType())) {
            throw new InvarianteVioladaException("Envie a evidência em JPG, PNG ou PDF.");
        }
        if (pergunta != null) {
            this.idPergunta = pergunta.id();
            this.enunciadoPergunta = pergunta.enunciado().length() > 500 ? pergunta.enunciado().substring(0, 500) : pergunta.enunciado();
        }
        this.nomeArquivo = arquivo.nome();
        this.contentType = arquivo.contentType();
        this.tamanhoBytes = arquivo.tamanhoBytes();
        this.chaveStorage = arquivo.chaveStorage();
        this.chaveMiniatura = arquivo.chaveMiniatura();
        alterarLegenda(legenda);
    }

    public boolean isFoto() {
        return !PDF.equals(contentType);
    }

    public void alterarLegenda(String legenda) {
        if (legenda != null && legenda.length() > 500) {
            throw new InvarianteVioladaException("A legenda passa de 500 caracteres.");
        }
        this.legenda = legenda != null && !legenda.isBlank() ? legenda.trim() : null;
    }
}
