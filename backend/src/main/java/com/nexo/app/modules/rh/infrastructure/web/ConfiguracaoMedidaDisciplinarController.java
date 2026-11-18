package com.nexo.app.modules.rh.infrastructure.web;

import com.nexo.app.modules.rh.application.dto.MotivoMedidaDisciplinarRequest;
import com.nexo.app.modules.rh.application.dto.MotivoMedidaDisciplinarResponse;
import com.nexo.app.modules.rh.application.dto.ParametrosRhRequest;
import com.nexo.app.modules.rh.application.dto.ParametrosRhResponse;
import com.nexo.app.modules.rh.application.dto.TipoMedidaDisciplinarRequest;
import com.nexo.app.modules.rh.application.dto.TipoMedidaDisciplinarResponse;
import com.nexo.app.modules.rh.application.usecases.MotivoMedidaDisciplinarUseCases;
import com.nexo.app.modules.rh.application.usecases.ParametrosRhUseCases;
import com.nexo.app.modules.rh.application.usecases.TipoMedidaDisciplinarUseCases;
import com.nexo.app.modules.rh.doc.ConfiguracaoMedidaDisciplinarControllerDoc;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/rh/medidas-disciplinares/configuracao")
@RequiredArgsConstructor
public class ConfiguracaoMedidaDisciplinarController implements ConfiguracaoMedidaDisciplinarControllerDoc {

    private static final String LEITURA = "hasAuthority('rh:medida-disciplinar:read')";
    private static final String ESCRITA = "hasAuthority('rh:medida-disciplinar:write')";

    private final TipoMedidaDisciplinarUseCases tipos;
    private final MotivoMedidaDisciplinarUseCases motivos;
    private final ParametrosRhUseCases parametros;

    @Override
    @GetMapping("/tipos")
    @PreAuthorize(LEITURA)
    public ResponseEntity<List<TipoMedidaDisciplinarResponse>> listarTipos(@RequestParam(defaultValue = "false") boolean apenasAtivos) {
        return ResponseEntity.ok(tipos.listar(apenasAtivos));
    }

    @Override
    @PostMapping("/tipos")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<TipoMedidaDisciplinarResponse> criarTipo(@Valid @RequestBody TipoMedidaDisciplinarRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(tipos.criar(request));
    }

    @Override
    @PutMapping("/tipos/{id}")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<TipoMedidaDisciplinarResponse> atualizarTipo(@PathVariable UUID id, @Valid @RequestBody TipoMedidaDisciplinarRequest request) {
        return ResponseEntity.ok(tipos.atualizar(id, request));
    }

    @Override
    @PatchMapping("/tipos/{id}/ativar")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<Void> ativarTipo(@PathVariable UUID id) {
        tipos.ativar(id);
        return ResponseEntity.noContent().build();
    }

    @Override
    @PatchMapping("/tipos/{id}/desativar")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<Void> desativarTipo(@PathVariable UUID id) {
        tipos.desativar(id);
        return ResponseEntity.noContent().build();
    }

    @Override
    @GetMapping("/motivos")
    @PreAuthorize(LEITURA)
    public ResponseEntity<List<MotivoMedidaDisciplinarResponse>> listarMotivos(@RequestParam(defaultValue = "false") boolean apenasAtivos) {
        return ResponseEntity.ok(motivos.listar(apenasAtivos));
    }

    @Override
    @PostMapping("/motivos")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<MotivoMedidaDisciplinarResponse> criarMotivo(@Valid @RequestBody MotivoMedidaDisciplinarRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(motivos.criar(request));
    }

    @Override
    @PutMapping("/motivos/{id}")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<MotivoMedidaDisciplinarResponse> atualizarMotivo(@PathVariable UUID id, @Valid @RequestBody MotivoMedidaDisciplinarRequest request) {
        return ResponseEntity.ok(motivos.atualizar(id, request));
    }

    @Override
    @PatchMapping("/motivos/{id}/ativar")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<Void> ativarMotivo(@PathVariable UUID id) {
        motivos.ativar(id);
        return ResponseEntity.noContent().build();
    }

    @Override
    @PatchMapping("/motivos/{id}/desativar")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<Void> desativarMotivo(@PathVariable UUID id) {
        motivos.desativar(id);
        return ResponseEntity.noContent().build();
    }

    @Override
    @GetMapping("/parametros")
    @PreAuthorize(LEITURA)
    public ResponseEntity<ParametrosRhResponse> parametros() {
        return ResponseEntity.ok(parametros.buscar());
    }

    @Override
    @PutMapping("/parametros")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<ParametrosRhResponse> atualizarParametros(@Valid @RequestBody ParametrosRhRequest request) {
        return ResponseEntity.ok(parametros.atualizar(request));
    }
}
