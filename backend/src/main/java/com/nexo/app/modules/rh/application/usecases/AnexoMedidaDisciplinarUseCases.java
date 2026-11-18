package com.nexo.app.modules.rh.application.usecases;

import com.nexo.app.modules.rh.application.dto.ArquivoMedidaDisciplinar;
import com.nexo.app.modules.rh.application.dto.MedidaDisciplinarResponse;
import com.nexo.app.modules.rh.domain.AnexoMedidaDisciplinar;
import com.nexo.app.modules.rh.domain.TipoEventoMedidaDisciplinar;
import com.nexo.app.modules.rh.infrastructure.persistence.AnexoMedidaDisciplinarRepository;
import com.nexo.app.shared.domain.exception.ArmazenamentoException;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import com.nexo.app.shared.infrastructure.storage.ObjectStorageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Anexos opcionais da medida (documento assinado, foto, outro documento), guardados no
 * armazenamento de objetos com o SHA-256 do conteúdo. A remoção é lógica: o arquivo fica para
 * auditoria.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AnexoMedidaDisciplinarUseCases {

    private static final long TAMANHO_MAXIMO_BYTES = 15L * 1024 * 1024;
    private static final Map<String, String> TIPOS_PERMITIDOS = Map.of(
            "application/pdf", "pdf",
            "image/jpeg", "jpg",
            "image/png", "png",
            "image/webp", "webp");

    private final MedidaDisciplinarUseCases medidas;
    private final AnexoMedidaDisciplinarRepository anexos;
    private final ObjectStorageService objectStorage;

    @Transactional
    public MedidaDisciplinarResponse anexar(UUID id, MultipartFile arquivo) {
        var medida = medidas.buscarEntidade(id);
        medida.exigirNaoCancelada();
        if (arquivo == null || arquivo.isEmpty()) {
            throw new InvarianteVioladaException("Envie um arquivo não vazio.");
        }
        if (arquivo.getSize() > TAMANHO_MAXIMO_BYTES) {
            throw new InvarianteVioladaException("O arquivo excede o limite de 15 MB.");
        }
        String contentType = contentType(arquivo);
        byte[] conteudo;
        try {
            conteudo = arquivo.getBytes();
        } catch (IOException e) {
            throw new ArmazenamentoException("Falha ao ler o arquivo enviado.", e);
        }
        String chave = "rh/medidas-disciplinares/" + medida.getId() + "/" + UUID.randomUUID() + "." + TIPOS_PERMITIDOS.get(contentType);
        objectStorage.enviar(chave, new ByteArrayInputStream(conteudo), conteudo.length, contentType);
        String nome = nomeSeguro(arquivo, contentType);
        try {
            anexos.saveAndFlush(new AnexoMedidaDisciplinar(medida.getId(), chave, nome, contentType, conteudo.length, sha256(conteudo)));
        } catch (RuntimeException e) {
            try {
                objectStorage.remover(chave);
            } catch (RuntimeException falha) {
                log.warn("Não foi possível remover o objeto órfão {}: {}", chave, falha.getMessage());
            }
            throw e;
        }
        medidas.registrarHistorico(medida, TipoEventoMedidaDisciplinar.ANEXO_INCLUIDO, "Anexo incluído: " + nome + ".");
        return medidas.detalhar(medida);
    }

    @Transactional(readOnly = true)
    public ArquivoMedidaDisciplinar baixar(UUID id, UUID idAnexo) {
        var anexo = anexo(id, idAnexo);
        var objeto = objectStorage.baixar(anexo.getArquivoChave());
        return new ArquivoMedidaDisciplinar(anexo.getArquivoNome(), anexo.getArquivoContentType(), anexo.getArquivoTamanhoBytes(),
                objeto.conteudo());
    }

    @Transactional
    public MedidaDisciplinarResponse remover(UUID id, UUID idAnexo) {
        var medida = medidas.buscarEntidade(id);
        medida.exigirNaoCancelada();
        var anexo = anexo(id, idAnexo);
        anexo.desativar();
        anexos.save(anexo);
        medidas.registrarHistorico(medida, TipoEventoMedidaDisciplinar.ANEXO_REMOVIDO, "Anexo removido: " + anexo.getArquivoNome() + ".");
        return medidas.detalhar(medida);
    }

    private AnexoMedidaDisciplinar anexo(UUID id, UUID idAnexo) {
        return anexos.findById(idAnexo).filter(AnexoMedidaDisciplinar::isAtivo).filter(a -> a.getIdMedida().equals(id))
                .orElseThrow(() -> new RecursoNaoEncontradoException("Anexo não encontrado nesta medida."));
    }

    static String sha256(byte[] conteudo) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(conteudo));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 indisponível na JVM", e);
        }
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
