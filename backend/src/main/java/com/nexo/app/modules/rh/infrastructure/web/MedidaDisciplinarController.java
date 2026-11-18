package com.nexo.app.modules.rh.infrastructure.web;

import com.nexo.app.modules.rh.application.dto.CancelarMedidaDisciplinarRequest;
import com.nexo.app.modules.rh.application.dto.MedidaDisciplinarFilter;
import com.nexo.app.modules.rh.application.dto.MedidaDisciplinarRequest;
import com.nexo.app.modules.rh.application.dto.MedidaDisciplinarResponse;
import com.nexo.app.modules.rh.application.dto.ReincidenciaMedidaDisciplinarResponse;
import com.nexo.app.modules.rh.application.usecases.AnexoMedidaDisciplinarUseCases;
import com.nexo.app.modules.rh.application.usecases.MedidaDisciplinarUseCases;
import com.nexo.app.modules.rh.doc.MedidaDisciplinarControllerDoc;
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
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.UUID;

@RestController
@RequestMapping("/v1/rh/medidas-disciplinares")
@RequiredArgsConstructor
public class MedidaDisciplinarController implements MedidaDisciplinarControllerDoc {

    private static final String LEITURA = "hasAuthority('rh:medida-disciplinar:read')";
    private static final String ESCRITA = "hasAuthority('rh:medida-disciplinar:write')";
    private static final String CANCELAMENTO = "hasAuthority('rh:medida-disciplinar:cancelar')";

    private final MedidaDisciplinarUseCases useCases;
    private final AnexoMedidaDisciplinarUseCases anexos;

    @Override
    @GetMapping
    @PreAuthorize(LEITURA)
    public ResponseEntity<PageResponse<MedidaDisciplinarResponse>> listar(@ParameterObject MedidaDisciplinarFilter filtro,
                                                                        @ParameterObject @PageableDefault(sort = "dataFato", direction = Sort.Direction.DESC) Pageable pageable) {
        return ResponseEntity.ok(useCases.listar(filtro, pageable));
    }

    @Override
    @GetMapping("/{id}")
    @PreAuthorize(LEITURA)
    public ResponseEntity<MedidaDisciplinarResponse> buscar(@PathVariable UUID id) {
        return ResponseEntity.ok(useCases.buscarPorId(id));
    }

    @Override
    @GetMapping("/reincidencia")
    @PreAuthorize(LEITURA)
    public ResponseEntity<ReincidenciaMedidaDisciplinarResponse> reincidencia(@RequestParam(required = false) UUID idColaborador,
                                                                             @RequestParam(required = false) UUID idMotivo,
                                                                             @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dataFato,
                                                                             @RequestParam(required = false) UUID idIgnorar) {
        return ResponseEntity.ok(useCases.reincidencia(idColaborador, idMotivo, dataFato, idIgnorar));
    }

    @Override
    @PostMapping
    @PreAuthorize(ESCRITA)
    public ResponseEntity<MedidaDisciplinarResponse> registrar(@Valid @RequestBody MedidaDisciplinarRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(useCases.registrar(request));
    }

    @Override
    @PutMapping("/{id}")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<MedidaDisciplinarResponse> editar(@PathVariable UUID id, @Valid @RequestBody MedidaDisciplinarRequest request) {
        return ResponseEntity.ok(useCases.editar(id, request));
    }

    @Override
    @PostMapping("/{id}/cancelamento")
    @PreAuthorize(CANCELAMENTO)
    public ResponseEntity<MedidaDisciplinarResponse> cancelar(@PathVariable UUID id,
                                                             @Valid @RequestBody CancelarMedidaDisciplinarRequest request) {
        return ResponseEntity.ok(useCases.cancelar(id, request));
    }

    @Override
    @PostMapping(value = "/{id}/anexos", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize(ESCRITA)
    public ResponseEntity<MedidaDisciplinarResponse> anexar(@PathVariable UUID id, @RequestPart("arquivo") MultipartFile arquivo) {
        return ResponseEntity.ok(anexos.anexar(id, arquivo));
    }

    @Override
    @GetMapping("/{id}/anexos/{idAnexo}")
    @PreAuthorize(LEITURA)
    public ResponseEntity<Resource> baixarAnexo(@PathVariable UUID id, @PathVariable UUID idAnexo) {
        var arquivo = anexos.baixar(id, idAnexo);
        String disposition = ContentDisposition.inline().filename(arquivo.nome(), StandardCharsets.UTF_8).build().toString();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(arquivo.contentType()))
                .contentLength(arquivo.tamanhoBytes())
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition)
                .body(new InputStreamResource(arquivo.conteudo()));
    }

    @Override
    @DeleteMapping("/{id}/anexos/{idAnexo}")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<MedidaDisciplinarResponse> removerAnexo(@PathVariable UUID id, @PathVariable UUID idAnexo) {
        return ResponseEntity.ok(anexos.remover(id, idAnexo));
    }
}
