package com.nexo.app.modules.frota.infrastructure.web;

import com.nexo.app.modules.frota.application.dto.AbrirReparoSinistroRequest;
import com.nexo.app.modules.frota.application.dto.AcionarSeguradoraRequest;
import com.nexo.app.modules.frota.application.dto.CancelarSinistroRequest;
import com.nexo.app.modules.frota.application.dto.FinalizarSinistroRequest;
import com.nexo.app.modules.frota.application.dto.ResumoSinistrosResponse;
import com.nexo.app.modules.frota.application.dto.SinistroFilter;
import com.nexo.app.modules.frota.application.dto.SinistroRequest;
import com.nexo.app.modules.frota.application.dto.SinistroResponse;
import com.nexo.app.modules.frota.application.usecases.SinistroUseCases;
import com.nexo.app.modules.frota.doc.SinistroFrotaControllerDoc;
import com.nexo.app.shared.application.dto.PageResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.core.io.Resource;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
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
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.UUID;

@RestController
@RequestMapping("/v1/frota/sinistros")
@RequiredArgsConstructor
public class SinistroFrotaController implements SinistroFrotaControllerDoc {

    private static final String LEITURA = "hasAuthority('frota:sinistro:read')";
    private static final String ESCRITA = "hasAuthority('frota:sinistro:write')";

    private final SinistroUseCases useCases;

    @Override
    @GetMapping
    @PreAuthorize(LEITURA)
    public ResponseEntity<PageResponse<SinistroResponse>> listar(@ParameterObject SinistroFilter filtro,
                                                               @ParameterObject @PageableDefault(sort = "ocorridoEm", direction = Sort.Direction.DESC) Pageable pageable) {
        return ResponseEntity.ok(useCases.listar(filtro, pageable));
    }

    @Override
    @GetMapping("/resumo")
    @PreAuthorize(LEITURA)
    public ResponseEntity<ResumoSinistrosResponse> resumo(@ParameterObject SinistroFilter filtro) {
        return ResponseEntity.ok(useCases.resumo(filtro));
    }

    @Override
    @GetMapping("/{id}")
    @PreAuthorize(LEITURA)
    public ResponseEntity<SinistroResponse> buscar(@PathVariable UUID id) {
        return ResponseEntity.ok(useCases.buscarPorId(id));
    }

    @Override
    @PostMapping
    @PreAuthorize(ESCRITA)
    public ResponseEntity<SinistroResponse> registrar(@Valid @RequestBody SinistroRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(useCases.registrar(request));
    }

    @Override
    @PutMapping("/{id}")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<SinistroResponse> atualizar(@PathVariable UUID id, @Valid @RequestBody SinistroRequest request) {
        return ResponseEntity.ok(useCases.atualizar(id, request));
    }

    /** Abre a OS: exige também quem pode abrir OS na frota. */
    @Override
    @PostMapping("/{id}/ordem-servico")
    @PreAuthorize(ESCRITA + " and hasAuthority('frota:os:write')")
    public ResponseEntity<SinistroResponse> abrirOrdemServico(@PathVariable UUID id, @Valid @RequestBody AbrirReparoSinistroRequest request) {
        return ResponseEntity.ok(useCases.abrirOrdemServico(id, request));
    }

    @Override
    @PostMapping("/{id}/seguradora")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<SinistroResponse> acionarSeguradora(@PathVariable UUID id, @Valid @RequestBody AcionarSeguradoraRequest request) {
        return ResponseEntity.ok(useCases.acionarSeguradora(id, request));
    }

    @Override
    @PostMapping("/{id}/finalizacao")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<SinistroResponse> finalizar(@PathVariable UUID id, @Valid @RequestBody FinalizarSinistroRequest request) {
        return ResponseEntity.ok(useCases.finalizar(id, request.franquiaPaga()));
    }

    @Override
    @PostMapping("/{id}/cancelamento")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<SinistroResponse> cancelar(@PathVariable UUID id, @Valid @RequestBody CancelarSinistroRequest request) {
        return ResponseEntity.ok(useCases.cancelar(id, request.motivo()));
    }

    @Override
    @PostMapping(value = "/{id}/anexos", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize(ESCRITA)
    public ResponseEntity<SinistroResponse> anexar(@PathVariable UUID id, @RequestPart("arquivo") MultipartFile arquivo) {
        return ResponseEntity.ok(useCases.anexar(id, arquivo));
    }

    @Override
    @GetMapping("/{id}/anexos/{idAnexo}")
    @PreAuthorize(LEITURA)
    public ResponseEntity<Resource> baixarAnexo(@PathVariable UUID id, @PathVariable UUID idAnexo) {
        return ApoliceFrotaController.arquivo(useCases.baixarAnexo(id, idAnexo));
    }

    @Override
    @DeleteMapping("/{id}/anexos/{idAnexo}")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<SinistroResponse> removerAnexo(@PathVariable UUID id, @PathVariable UUID idAnexo) {
        return ResponseEntity.ok(useCases.removerAnexo(id, idAnexo));
    }
}
