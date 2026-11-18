package com.nexo.app.modules.sst.infrastructure.web;

import com.nexo.app.modules.sst.application.dto.AtualizarFormularioDadosRequest;
import com.nexo.app.modules.sst.application.dto.ConfirmarImportacaoFormularioInspecaoRequest;
import com.nexo.app.modules.sst.application.dto.ImportacaoFormularioInspecaoResponse;
import com.nexo.app.modules.sst.application.dto.CriarFormularioRequest;
import com.nexo.app.modules.sst.application.dto.FormularioInspecaoFilter;
import com.nexo.app.modules.sst.application.dto.FormularioInspecaoResponse;
import com.nexo.app.modules.sst.application.dto.FormularioInspecaoResumoResponse;
import com.nexo.app.modules.sst.application.dto.ReordenarRequest;
import com.nexo.app.modules.sst.application.usecases.FormularioInspecaoUseCases;
import com.nexo.app.modules.sst.application.usecases.ImportarFormulariosInspecaoUseCase;
import com.nexo.app.modules.sst.doc.FormularioInspecaoControllerDoc;
import com.nexo.app.shared.application.dto.PageResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.UUID;

@RestController
@RequestMapping("/v1/sst/formularios-inspecao")
@RequiredArgsConstructor
public class FormularioInspecaoController implements FormularioInspecaoControllerDoc {

    private final FormularioInspecaoUseCases useCases;
    private final ImportarFormulariosInspecaoUseCase importarUseCase;

    @Override
    @PostMapping
    @PreAuthorize("hasAuthority('sst:formulario:write')")
    public ResponseEntity<FormularioInspecaoResponse> criar(@Valid @RequestBody CriarFormularioRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(useCases.criar(request));
    }

    @Override
    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('sst:formulario:read')")
    public ResponseEntity<FormularioInspecaoResponse> buscarPorId(@PathVariable UUID id) {
        return ResponseEntity.ok(useCases.buscarPorId(id));
    }

    @Override
    @GetMapping
    @PreAuthorize("hasAuthority('sst:formulario:read')")
    public ResponseEntity<PageResponse<FormularioInspecaoResumoResponse>> listar(
            @ParameterObject FormularioInspecaoFilter filter, @ParameterObject Pageable pageable) {
        return ResponseEntity.ok(useCases.listar(filter, pageable));
    }

    @Override
    @PutMapping("/{id}/estrutura")
    @PreAuthorize("hasAuthority('sst:formulario:write')")
    public ResponseEntity<FormularioInspecaoResponse> atualizarEstrutura(
            @PathVariable UUID id, @Valid @RequestBody CriarFormularioRequest request) {
        return ResponseEntity.ok(useCases.atualizarEstrutura(id, request));
    }

    @Override
    @PatchMapping("/{id}")
    @PreAuthorize("hasAuthority('sst:formulario:write')")
    public ResponseEntity<FormularioInspecaoResponse> atualizarDados(
            @PathVariable UUID id, @Valid @RequestBody AtualizarFormularioDadosRequest request) {
        return ResponseEntity.ok(useCases.atualizarDados(id, request));
    }

    @Override
    @PostMapping("/{id}/duplicar")
    @PreAuthorize("hasAuthority('sst:formulario:write')")
    public ResponseEntity<FormularioInspecaoResponse> duplicar(@PathVariable UUID id) {
        return ResponseEntity.status(HttpStatus.CREATED).body(useCases.duplicar(id));
    }

    @Override
    @PatchMapping("/{id}/grupos/ordenacao")
    @PreAuthorize("hasAuthority('sst:formulario:write')")
    public ResponseEntity<FormularioInspecaoResponse> reordenarGrupos(
            @PathVariable UUID id, @Valid @RequestBody ReordenarRequest request) {
        return ResponseEntity.ok(useCases.reordenarGrupos(id, request));
    }

    @Override
    @PatchMapping("/{id}/grupos/{idGrupo}/perguntas/ordenacao")
    @PreAuthorize("hasAuthority('sst:formulario:write')")
    public ResponseEntity<FormularioInspecaoResponse> reordenarPerguntas(
            @PathVariable UUID id, @PathVariable UUID idGrupo, @Valid @RequestBody ReordenarRequest request) {
        return ResponseEntity.ok(useCases.reordenarPerguntas(id, idGrupo, request));
    }

    @Override
    @PatchMapping("/{id}/grupos/{idGrupo}/perguntas/{idPergunta}/opcoes/ordenacao")
    @PreAuthorize("hasAuthority('sst:formulario:write')")
    public ResponseEntity<FormularioInspecaoResponse> reordenarOpcoes(
            @PathVariable UUID id, @PathVariable UUID idGrupo, @PathVariable UUID idPergunta,
            @Valid @RequestBody ReordenarRequest request) {
        return ResponseEntity.ok(useCases.reordenarOpcoes(id, idGrupo, idPergunta, request));
    }

    @Override
    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('sst:formulario:write')")
    public ResponseEntity<Void> desativar(@PathVariable UUID id) {
        useCases.desativar(id);
        return ResponseEntity.noContent().build();
    }

    @Override
    @PutMapping("/{id}/ativar")
    @PreAuthorize("hasAuthority('sst:formulario:write')")
    public ResponseEntity<Void> ativar(@PathVariable UUID id) {
        useCases.ativar(id);
        return ResponseEntity.noContent().build();
    }

    @Override
    @PostMapping(value = "/importar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasAuthority('sst:formulario:write')")
    public ResponseEntity<ImportacaoFormularioInspecaoResponse> importar(@RequestPart("arquivo") MultipartFile arquivo) {
        return ResponseEntity.ok(importarUseCase.executarValidacao(arquivo));
    }

    @Override
    @PostMapping("/confirmar-importacao")
    @PreAuthorize("hasAuthority('sst:formulario:write')")
    public ResponseEntity<ImportacaoFormularioInspecaoResponse> confirmarImportacao(
            @Valid @RequestBody ConfirmarImportacaoFormularioInspecaoRequest request) {
        return ResponseEntity.ok(importarUseCase.confirmarImportacao(request));
    }

    @Override
    @GetMapping(value = "/importar/modelo", produces = "text/csv")
    @PreAuthorize("hasAuthority('sst:formulario:write')")
    public ResponseEntity<byte[]> baixarModeloImportacao() {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"modelo-importacao-formularios-inspecao.csv\"")
                .header(HttpHeaders.CONTENT_TYPE, "text/csv; charset=UTF-8")
                .body(importarUseCase.obterModeloCsv());
    }
}
