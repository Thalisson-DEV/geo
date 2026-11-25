package com.nexo.app.modules.estoque.application.services;

import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.infrastructure.storage.ObjectStorageService;
import com.nexo.app.shared.infrastructure.storage.StorageObject;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;

/**
 * Guarda a assinatura e a foto de quem retira ou devolve no balcão fora do banco (no armazenamento de objetos) e as
 * entrega de volta para o termo. A referência gravada é "objeto:&lt;chave&gt;"; "FISICA" marca termo em papel.
 */
@Service
@RequiredArgsConstructor
public class ComprovanteBalcaoService {

    public static final String FISICA = "FISICA";
    private static final String PREFIXO_OBJETO = "objeto:";
    private static final int MAX_ASSINATURA = 256 * 1024;
    private static final int MAX_FOTO = 1536 * 1024;

    private final ObjectStorageService armazenamento;

    public record Arquivo(java.io.InputStream conteudo, String contentType, long tamanhoBytes) {
    }

    /** Assinatura PNG em data URL, ou "FISICA". Nula ou vazia volta nula. */
    public String guardarAssinatura(UUID idAtendimento, String valor) {
        if (valor == null || valor.isBlank()) {
            return null;
        }
        if (FISICA.equalsIgnoreCase(valor.trim())) {
            return FISICA;
        }
        return guardar(idAtendimento, "assinatura", valor, MAX_ASSINATURA, "A assinatura");
    }

    /** Foto JPEG ou PNG em data URL. Nula ou vazia volta nula. */
    public String guardarFoto(UUID idAtendimento, String valor) {
        if (valor == null || valor.isBlank()) {
            return null;
        }
        return guardar(idAtendimento, "foto", valor, MAX_FOTO, "A foto");
    }

    public Optional<Arquivo> baixar(String referencia) {
        if (referencia == null || !referencia.startsWith(PREFIXO_OBJETO)) {
            return Optional.empty();
        }
        StorageObject objeto = armazenamento.baixar(referencia.substring(PREFIXO_OBJETO.length()));
        String tipo = objeto.contentType() == null || objeto.contentType().isBlank() ? "image/jpeg" : objeto.contentType();
        return Optional.of(new Arquivo(objeto.conteudo(), tipo, objeto.tamanhoBytes()));
    }

    private String guardar(UUID idAtendimento, String parte, String dataUrl, int maximo, String rotulo) {
        String tipo;
        String extensao;
        if (dataUrl.startsWith("data:image/png;base64,")) {
            tipo = "image/png";
            extensao = "png";
        } else if (dataUrl.startsWith("data:image/jpeg;base64,") || dataUrl.startsWith("data:image/jpg;base64,")) {
            tipo = "image/jpeg";
            extensao = "jpg";
        } else if (dataUrl.startsWith("data:image/webp;base64,")) {
            tipo = "image/webp";
            extensao = "webp";
        } else {
            throw new InvarianteVioladaException(rotulo + " deve ser uma imagem PNG, JPEG ou WebP.");
        }
        byte[] bytes;
        try {
            bytes = Base64.getDecoder().decode(dataUrl.substring(dataUrl.indexOf(',') + 1));
        } catch (IllegalArgumentException erro) {
            throw new InvarianteVioladaException(rotulo + " veio com codificação inválida.");
        }
        if (bytes.length == 0 || bytes.length > maximo) {
            throw new InvarianteVioladaException(rotulo + " deve ter até " + (maximo / 1024) + " KB.");
        }
        String chave = "estoque/balcao/%s/%s-%s.%s".formatted(idAtendimento, parte, UUID.randomUUID(), extensao);
        armazenamento.enviar(chave, new ByteArrayInputStream(bytes), bytes.length, tipo);
        return PREFIXO_OBJETO + chave;
    }
}
