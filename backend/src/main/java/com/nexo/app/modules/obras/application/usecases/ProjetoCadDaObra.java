package com.nexo.app.modules.obras.application.usecases;

import com.nexo.app.modules.obras.application.dto.AnexoObraResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.Comparator;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

/**
 * Arquivo CAD do projeto entre os anexos da obra (o DXF ou DWG que o projetista entregou junto do PDF). O mais recente
 * vale; o DWG só conta quando o ambiente tem conversor.
 */
@Component
@RequiredArgsConstructor
public class ProjetoCadDaObra {

    private final AnexoObraUseCases anexos;
    private final ConversorDwg conversorDwg;

    public Optional<AnexoObraResponse> anexo(UUID idObra) {
        return anexos.listarPorObra(idObra).stream()
                .filter(a -> dxf(a.nomeArquivo()) || (dwg(a.nomeArquivo()) && conversorDwg.disponivel()))
                .max(Comparator.comparing(AnexoObraResponse::dataCriacao, Comparator.nullsFirst(Comparator.naturalOrder())));
    }

    /** Conteúdo em DXF: o DWG é convertido aqui. */
    public byte[] conteudoDxf(UUID idObra, AnexoObraResponse anexo) {
        byte[] conteudo;
        try (var stream = anexos.baixar(idObra, anexo.id()).stream()) {
            conteudo = stream.readAllBytes();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return dwg(anexo.nomeArquivo()) ? conversorDwg.paraDxf(conteudo) : conteudo;
    }

    static boolean dxf(String nome) {
        return nome != null && nome.toLowerCase(Locale.ROOT).endsWith(".dxf");
    }

    static boolean dwg(String nome) {
        return nome != null && nome.toLowerCase(Locale.ROOT).endsWith(".dwg");
    }
}
