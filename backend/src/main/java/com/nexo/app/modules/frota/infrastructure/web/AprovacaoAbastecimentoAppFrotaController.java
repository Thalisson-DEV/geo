package com.nexo.app.modules.frota.infrastructure.web;

import com.nexo.app.modules.frota.application.dto.AbastecimentoResumoResponse;
import com.nexo.app.modules.frota.application.dto.AprovacaoAbastecimentoAppResponse;
import com.nexo.app.modules.frota.application.dto.AprovarAbastecimentoRequest;
import com.nexo.app.modules.frota.application.dto.JustificativaRequest;
import com.nexo.app.modules.frota.application.usecases.AprovacaoAbastecimentoAppUseCases;
import com.nexo.app.modules.frota.doc.AprovacaoAbastecimentoAppFrotaControllerDoc;
import com.nexo.app.modules.frota.domain.SituacaoAbastecimento;
import com.nexo.app.shared.application.dto.PageResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.format.annotation.DateTimeFormat;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** O gestor aprova o abastecimento pelo celular, com as mesmas regras da web. */
@RestController
@RequestMapping("/v1/frota/app/abastecimento/aprovacoes")
@RequiredArgsConstructor
@PreAuthorize("hasAuthority('frota:abastecimento:aprovar')")
public class AprovacaoAbastecimentoAppFrotaController implements AprovacaoAbastecimentoAppFrotaControllerDoc {

    private final AprovacaoAbastecimentoAppUseCases useCases;

    @Override
    @GetMapping
    public ResponseEntity<List<AbastecimentoResumoResponse>> fila() {
        return ResponseEntity.ok(useCases.fila());
    }

    @Override
    @GetMapping("/carteira")
    public ResponseEntity<PageResponse<AbastecimentoResumoResponse>> carteira(
            @RequestParam(required = false) List<SituacaoAbastecimento> situacao,
            @RequestParam(required = false) String busca,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate de,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate ate,
            @ParameterObject @PageableDefault(size = 30, sort = "solicitadoEm", direction = Sort.Direction.DESC) Pageable pageable) {
        return ResponseEntity.ok(useCases.carteira(situacao, busca, de, ate, pageable));
    }

    @Override
    @GetMapping("/{id}")
    public ResponseEntity<AprovacaoAbastecimentoAppResponse> detalhar(@PathVariable UUID id) {
        return ResponseEntity.ok(useCases.detalhar(id));
    }

    @Override
    @PostMapping("/{id}/aprovacao")
    public ResponseEntity<AprovacaoAbastecimentoAppResponse> aprovar(@PathVariable UUID id,
                                                                     @Valid @RequestBody AprovarAbastecimentoRequest request) {
        return ResponseEntity.ok(useCases.aprovar(id, request.quantidades()));
    }

    @Override
    @PostMapping("/{id}/reprovacao")
    public ResponseEntity<AprovacaoAbastecimentoAppResponse> reprovar(@PathVariable UUID id,
                                                                      @Valid @RequestBody JustificativaRequest request) {
        return ResponseEntity.ok(useCases.reprovar(id, request.justificativa()));
    }

    @Override
    @GetMapping("/{id}/fotos/{idFoto}")
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
