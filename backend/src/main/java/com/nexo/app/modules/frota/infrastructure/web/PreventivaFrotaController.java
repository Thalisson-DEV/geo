package com.nexo.app.modules.frota.infrastructure.web;

import com.nexo.app.modules.frota.application.dto.AbrirOsPreventivaRequest;
import com.nexo.app.modules.frota.application.dto.AcompanhamentoPreventivaFilter;
import com.nexo.app.modules.frota.application.dto.AcompanhamentoPreventivaResponse;
import com.nexo.app.modules.frota.application.dto.ControlePreventivoResponse;
import com.nexo.app.modules.frota.application.dto.CorretivaPorItemResponse;
import com.nexo.app.modules.frota.application.dto.InformarRealizacaoPreventivaRequest;
import com.nexo.app.modules.frota.application.dto.OsPreventivaAbertaResponse;
import com.nexo.app.modules.frota.application.dto.PlanoPreventivoFilter;
import com.nexo.app.modules.frota.application.dto.PlanoPreventivoRequest;
import com.nexo.app.modules.frota.application.dto.PlanoPreventivoResponse;
import com.nexo.app.modules.frota.application.dto.PreventivaVeiculoResponse;
import com.nexo.app.modules.frota.application.usecases.PlanoPreventivoUseCases;
import com.nexo.app.modules.frota.application.usecases.PreventivaUseCases;
import com.nexo.app.modules.frota.doc.PreventivaFrotaControllerDoc;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
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
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/frota/preventiva")
@RequiredArgsConstructor
public class PreventivaFrotaController implements PreventivaFrotaControllerDoc {

    private static final String LEITURA = "hasAuthority('frota:preventiva:read')";
    private static final String ESCRITA = "hasAuthority('frota:preventiva:write')";

    private final PlanoPreventivoUseCases planos;
    private final PreventivaUseCases preventiva;

    @Override
    @GetMapping("/planos")
    @PreAuthorize(LEITURA)
    public ResponseEntity<List<PlanoPreventivoResponse>> listarPlanos(@ParameterObject PlanoPreventivoFilter filtro) {
        return ResponseEntity.ok(planos.listar(filtro));
    }

    @Override
    @GetMapping("/planos/{id}")
    @PreAuthorize(LEITURA)
    public ResponseEntity<PlanoPreventivoResponse> buscarPlano(@PathVariable UUID id) {
        return ResponseEntity.ok(planos.buscarPorId(id));
    }

    @Override
    @PostMapping("/planos")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<PlanoPreventivoResponse> criarPlano(@Valid @RequestBody PlanoPreventivoRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(planos.criar(request));
    }

    @Override
    @PutMapping("/planos/{id}")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<PlanoPreventivoResponse> atualizarPlano(@PathVariable UUID id,
                                                                  @Valid @RequestBody PlanoPreventivoRequest request) {
        return ResponseEntity.ok(planos.atualizar(id, request));
    }

    @Override
    @DeleteMapping("/planos/{id}")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<Void> desativarPlano(@PathVariable UUID id) {
        planos.desativar(id);
        return ResponseEntity.noContent().build();
    }

    @Override
    @PutMapping("/planos/{id}/ativar")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<Void> ativarPlano(@PathVariable UUID id) {
        planos.ativar(id);
        return ResponseEntity.noContent().build();
    }

    @Override
    @GetMapping("/acompanhamento")
    @PreAuthorize(LEITURA)
    public ResponseEntity<AcompanhamentoPreventivaResponse> acompanhamento(
            @ParameterObject AcompanhamentoPreventivaFilter filtro,
            @ParameterObject @PageableDefault(size = 50) Pageable pageable) {
        return ResponseEntity.ok(preventiva.acompanhamento(filtro, pageable));
    }

    @Override
    @PostMapping("/controles/{idControle}/realizacao")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<ControlePreventivoResponse> informarRealizacao(
            @PathVariable UUID idControle, @Valid @RequestBody InformarRealizacaoPreventivaRequest request) {
        return ResponseEntity.ok(preventiva.informarRealizacao(idControle, request));
    }

    @Override
    @PostMapping("/controles/abrir-os")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<OsPreventivaAbertaResponse> abrirOs(@Valid @RequestBody AbrirOsPreventivaRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(preventiva.abrirOs(request));
    }

    @Override
    @GetMapping("/veiculos/{idVeiculo}")
    @PreAuthorize(LEITURA)
    public ResponseEntity<PreventivaVeiculoResponse> doVeiculo(@PathVariable UUID idVeiculo) {
        return ResponseEntity.ok(preventiva.doVeiculo(idVeiculo));
    }

    @Override
    @GetMapping("/corretivas")
    @PreAuthorize(LEITURA)
    public ResponseEntity<List<CorretivaPorItemResponse>> corretivas(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate de,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate ate,
            @RequestParam(required = false) List<UUID> idBase,
            @RequestParam(required = false) List<UUID> idTipoVeiculo) {
        return ResponseEntity.ok(preventiva.corretivasPorItem(de, ate, idBase, idTipoVeiculo));
    }
}
