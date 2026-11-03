package com.nexo.app.modules.frota.infrastructure.web;

import com.nexo.app.modules.frota.application.dto.CatalogoChecklistAppResponse;
import com.nexo.app.modules.frota.application.dto.ChecklistAppItemResponse;
import com.nexo.app.modules.frota.application.dto.ChecklistDetalheResponse;
import com.nexo.app.modules.frota.application.dto.ChecklistRegistradoResponse;
import com.nexo.app.modules.frota.application.dto.RegistrarChecklistRequest;
import com.nexo.app.modules.frota.application.usecases.ChecklistAppUseCases;
import com.nexo.app.modules.frota.application.usecases.ChecklistConsultaUseCases;
import com.nexo.app.modules.frota.doc.ChecklistAppFrotaControllerDoc;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

/**
 * Qualquer usuário do app preenche o checklist (campo ou administrativo, resposta do cliente em 15/10/2026)
 * e consulta os que fez e o histórico dos veículos (resposta do usuário em 16/10/2026).
 */
@RestController
@RequestMapping("/v1/frota/app")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class ChecklistAppFrotaController implements ChecklistAppFrotaControllerDoc {

    private final ChecklistAppUseCases useCases;
    private final ChecklistConsultaUseCases consulta;

    @Override
    @GetMapping("/checklist/catalogo")
    public ResponseEntity<CatalogoChecklistAppResponse> catalogo() {
        return ResponseEntity.ok(useCases.catalogo());
    }

    @Override
    @PostMapping("/checklists")
    public ResponseEntity<ChecklistRegistradoResponse> registrar(@Valid @RequestBody RegistrarChecklistRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(useCases.registrar(request));
    }

    @Override
    @PostMapping(value = "/checklists/{idAparelho}/fotos/{idFoto}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ChecklistRegistradoResponse> enviarFoto(@PathVariable UUID idAparelho, @PathVariable UUID idFoto,
                                                                  @RequestPart("arquivo") MultipartFile arquivo) {
        return ResponseEntity.ok(useCases.enviarFoto(idAparelho, idFoto, arquivo));
    }

    @Override
    @GetMapping("/checklists")
    public ResponseEntity<List<ChecklistAppItemResponse>> meus(@RequestParam(defaultValue = "30") int dias) {
        return ResponseEntity.ok(consulta.meusNoApp(dias));
    }

    @Override
    @GetMapping("/checklists/veiculo/{idVeiculo}")
    public ResponseEntity<List<ChecklistAppItemResponse>> doVeiculo(@PathVariable UUID idVeiculo) {
        return ResponseEntity.ok(consulta.doVeiculoNoApp(idVeiculo));
    }

    @Override
    @GetMapping("/checklists/{id}")
    public ResponseEntity<ChecklistDetalheResponse> detalhar(@PathVariable UUID id) {
        return ResponseEntity.ok(consulta.detalhar(id));
    }

    @Override
    @GetMapping("/checklists/{id}/fotos/{idFoto}")
    public ResponseEntity<Resource> foto(@PathVariable UUID id, @PathVariable UUID idFoto) {
        var arquivo = consulta.baixarFoto(id, idFoto);
        String disposition = ContentDisposition.inline().filename(arquivo.nome(), StandardCharsets.UTF_8).build().toString();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(arquivo.contentType()))
                .contentLength(arquivo.tamanhoBytes())
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition)
                .header(HttpHeaders.CACHE_CONTROL, "private, max-age=3600")
                .body(new InputStreamResource(arquivo.conteudo()));
    }
}
