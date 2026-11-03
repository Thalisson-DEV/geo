package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.shared.domain.exception.ArmazenamentoException;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.infrastructure.storage.ObjectStorageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;

/**
 * Envio de anexos da frota (apólice, sinistro) ao armazenamento de objetos: PDF ou imagem até
 * 15 MB, com o objeto removido se o registro do anexo não puder ser gravado.
 */
@Slf4j
@Component
@RequiredArgsConstructor
class AnexosFrota {

    private static final long TAMANHO_MAXIMO_BYTES = 15L * 1024 * 1024;
    private static final Map<String, String> TIPOS_PERMITIDOS = Map.of(
            "application/pdf", "pdf",
            "image/jpeg", "jpg",
            "image/png", "png",
            "image/webp", "webp");

    private final ObjectStorageService objectStorage;

    record Arquivo(String chave, String nome, String contentType, long tamanho) {
    }

    /** @param pasta ex.: {@code frota/sinistros/<id>} */
    <T> T enviar(String pasta, MultipartFile arquivo, Function<Arquivo, T> gravar) {
        if (arquivo == null || arquivo.isEmpty()) {
            throw new InvarianteVioladaException("Envie um arquivo não vazio.");
        }
        if (arquivo.getSize() > TAMANHO_MAXIMO_BYTES) {
            throw new InvarianteVioladaException("O arquivo excede o limite de 15 MB.");
        }
        String contentType = contentType(arquivo);
        String chave = pasta + "/" + UUID.randomUUID() + "." + TIPOS_PERMITIDOS.get(contentType);
        try (InputStream entrada = arquivo.getInputStream()) {
            objectStorage.enviar(chave, entrada, arquivo.getSize(), contentType);
        } catch (IOException e) {
            throw new ArmazenamentoException("Falha ao ler o arquivo enviado.", e);
        }
        try {
            return gravar.apply(new Arquivo(chave, nomeSeguro(arquivo, contentType), contentType, arquivo.getSize()));
        } catch (RuntimeException e) {
            try {
                objectStorage.remover(chave);
            } catch (RuntimeException falha) {
                log.warn("Não foi possível remover o objeto órfão {}: {}", chave, falha.getMessage());
            }
            throw e;
        }
    }

    InputStream baixar(String chave) {
        return objectStorage.baixar(chave).conteudo();
    }

    private static String contentType(MultipartFile arquivo) {
        String informado = arquivo.getContentType() == null ? null
                : arquivo.getContentType().toLowerCase(Locale.ROOT).split(";")[0].trim();
        if (informado != null && TIPOS_PERMITIDOS.containsKey(informado)) {
            return informado;
        }
        String extensao = StringUtils.getFilenameExtension(arquivo.getOriginalFilename());
        if (extensao != null) {
            String ext = extensao.toLowerCase(Locale.ROOT).equals("jpeg") ? "jpg" : extensao.toLowerCase(Locale.ROOT);
            for (var entrada : TIPOS_PERMITIDOS.entrySet()) {
                if (entrada.getValue().equals(ext)) return entrada.getKey();
            }
        }
        throw new InvarianteVioladaException("Tipo de arquivo não suportado. Envie PDF ou imagem (JPG, PNG, WEBP).");
    }

    private static String nomeSeguro(MultipartFile arquivo, String contentType) {
        String original = arquivo.getOriginalFilename();
        String nome = StringUtils.hasText(original) ? StringUtils.getFilename(StringUtils.cleanPath(original)) : null;
        if (!StringUtils.hasText(nome)) {
            nome = "anexo." + TIPOS_PERMITIDOS.get(contentType);
        }
        return nome.length() <= 255 ? nome : nome.substring(nome.length() - 255);
    }
}
