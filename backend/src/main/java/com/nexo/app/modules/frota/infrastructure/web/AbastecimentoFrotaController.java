package com.nexo.app.modules.frota.infrastructure.web;

import com.nexo.app.modules.frota.application.dto.AbastecimentoAvulsoRequest;
import com.nexo.app.modules.frota.application.dto.AbastecimentoDetalheResponse;
import com.nexo.app.modules.frota.application.dto.AprovarAbastecimentoRequest;
import com.nexo.app.modules.frota.application.dto.AbastecimentoFilter;
import com.nexo.app.modules.frota.application.dto.AbastecimentoResumoResponse;
import com.nexo.app.modules.frota.application.dto.CancelarAbastecimentoRequest;
import com.nexo.app.modules.frota.application.dto.JustificativaRequest;
import com.nexo.app.modules.frota.application.dto.LiberarAbastecimentoRequest;
import com.nexo.app.modules.frota.application.usecases.AbastecimentoUseCases;
import com.nexo.app.modules.frota.doc.AbastecimentoFrotaControllerDoc;
import com.nexo.app.shared.application.dto.PageResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

@RestController
@RequestMapping("/v1/frota/abastecimentos")
@RequiredArgsConstructor
public class AbastecimentoFrotaController implements AbastecimentoFrotaControllerDoc {

    private static final String LEITURA = "hasAnyAuthority('frota:abastecimento:read', 'frota:abastecimento:aprovar', "
            + "'frota:abastecimento:liberar')";
    private static final String APROVAR = "hasAuthority('frota:abastecimento:aprovar')";
    private static final String LIBERAR = "hasAuthority('frota:abastecimento:liberar')";

    private final AbastecimentoUseCases useCases;

    @Override
    @GetMapping
    @PreAuthorize(LEITURA)
    public ResponseEntity<PageResponse<AbastecimentoResumoResponse>> listar(@ParameterObject AbastecimentoFilter filtro,
                                                                          @ParameterObject Pageable pageable) {
        return ResponseEntity.ok(useCases.listar(filtro, pageable));
    }

    @Override
    @GetMapping("/{id}")
    @PreAuthorize(LEITURA)
    public ResponseEntity<AbastecimentoDetalheResponse> detalhar(@PathVariable UUID id) {
        return ResponseEntity.ok(useCases.detalhar(id));
    }

    @Override
    @PostMapping("/{id}/aprovacao")
    @PreAuthorize(APROVAR)
    public ResponseEntity<AbastecimentoDetalheResponse> aprovar(@PathVariable UUID id,
                                                                @Valid @RequestBody AprovarAbastecimentoRequest request) {
        return ResponseEntity.ok(useCases.aprovar(id, request.quantidades()));
    }

    @Override
    @PostMapping("/avulsos")
    @PreAuthorize(APROVAR)
    public ResponseEntity<AbastecimentoDetalheResponse> lancarAvulso(@Valid @RequestBody AbastecimentoAvulsoRequest request) {
        return ResponseEntity.status(org.springframework.http.HttpStatus.CREATED).body(useCases.lancarAvulso(request));
    }

    @Override
    @PostMapping("/{id}/reprovacao")
    @PreAuthorize(APROVAR)
    public ResponseEntity<AbastecimentoDetalheResponse> reprovar(@PathVariable UUID id, @Valid @RequestBody JustificativaRequest request) {
        return ResponseEntity.ok(useCases.reprovar(id, request.justificativa()));
    }

    @Override
    @PostMapping("/{id}/liberacao")
    @PreAuthorize(LIBERAR)
    public ResponseEntity<AbastecimentoDetalheResponse> liberar(@PathVariable UUID id,
                                                                @RequestBody(required = false) LiberarAbastecimentoRequest request) {
        return ResponseEntity.ok(useCases.liberar(id, request));
    }

    @Override
    @PostMapping("/{id}/cancelamento")
    @PreAuthorize(LIBERAR)
    public ResponseEntity<AbastecimentoDetalheResponse> cancelar(@PathVariable UUID id,
                                                                 @Valid @RequestBody(required = false) CancelarAbastecimentoRequest request) {
        return ResponseEntity.ok(useCases.cancelar(id, request == null ? null : request.motivo()));
    }

    @Override
    @PostMapping("/{id}/avisos/{idAviso}/aberto")
    @PreAuthorize(LIBERAR)
    public ResponseEntity<AbastecimentoDetalheResponse> marcarAvisoAberto(@PathVariable UUID id, @PathVariable UUID idAviso) {
        return ResponseEntity.ok(useCases.marcarAvisoAberto(id, idAviso));
    }

    @Override
    @GetMapping("/{id}/fotos/{idFoto}")
    @PreAuthorize(LEITURA)
    public ResponseEntity<Resource> foto(@PathVariable UUID id, @PathVariable UUID idFoto) {
        var arquivo = useCases.baixarFoto(id, idFoto);
        String disposition = ContentDisposition.inline().filename(arquivo.nome(), StandardCharsets.UTF_8).build().toString();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(arquivo.contentType()))
                .contentLength(arquivo.tamanhoBytes())
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition)
                .header(HttpHeaders.CACHE_CONTROL, "private, max-age=3600")
                .body(new InputStreamResource(arquivo.conteudo()));
    }
}
