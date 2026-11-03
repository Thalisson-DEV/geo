package com.nexo.app.modules.frota.infrastructure.web;

import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.ConsumoAbastecimentoResponse;
import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.EventoFilter;
import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.EventoResponse;
import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.MapaResponse;
import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.RastreadorFilter;
import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.RastreadorResponse;
import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.SituacaoResponse;
import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.TrajetoResponse;
import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.VeiculoResponse;
import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.VincularRequest;
import com.nexo.app.modules.frota.application.dto.UsoFrotaDtos.SaudeResponse;
import com.nexo.app.modules.frota.application.usecases.TelemetriaFrotaUseCases;
import com.nexo.app.modules.frota.application.usecases.UsoFrotaUseCases;
import com.nexo.app.modules.frota.doc.TelemetriaFrotaControllerDoc;
import com.nexo.app.shared.application.dto.PageResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
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

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/frota/telemetria")
@RequiredArgsConstructor
public class TelemetriaFrotaController implements TelemetriaFrotaControllerDoc {

    private final TelemetriaFrotaUseCases useCases;
    private final UsoFrotaUseCases uso;

    @Override
    @GetMapping("/situacao")
    @PreAuthorize("hasAuthority('frota:telemetria:read')")
    public ResponseEntity<SituacaoResponse> situacao() {
        return ResponseEntity.ok(useCases.situacao());
    }

    @Override
    @PostMapping("/sincronizacao")
    @PreAuthorize("hasAuthority('frota:telemetria:write')")
    public ResponseEntity<SituacaoResponse> sincronizar() {
        return ResponseEntity.ok(useCases.sincronizarAgora());
    }

    @Override
    @GetMapping("/rastreadores")
    @PreAuthorize("hasAuthority('frota:telemetria:read')")
    public ResponseEntity<PageResponse<RastreadorResponse>> listarRastreadores(@ParameterObject RastreadorFilter filtro,
                                                                              @ParameterObject Pageable pageable) {
        return ResponseEntity.ok(useCases.listarRastreadores(filtro, pageable));
    }

    @Override
    @GetMapping("/rastreadores/{id}")
    @PreAuthorize("hasAuthority('frota:telemetria:read')")
    public ResponseEntity<RastreadorResponse> detalharRastreador(@PathVariable UUID id) {
        return ResponseEntity.ok(useCases.detalharRastreador(id));
    }

    @Override
    @PutMapping("/rastreadores/{id}/veiculo")
    @PreAuthorize("hasAuthority('frota:telemetria:write')")
    public ResponseEntity<RastreadorResponse> vincular(@PathVariable UUID id, @Valid @RequestBody VincularRequest request) {
        return ResponseEntity.ok(useCases.vincular(id, request.idVeiculo()));
    }

    @Override
    @DeleteMapping("/rastreadores/{id}/veiculo")
    @PreAuthorize("hasAuthority('frota:telemetria:write')")
    public ResponseEntity<RastreadorResponse> desfazerVinculo(@PathVariable UUID id) {
        return ResponseEntity.ok(useCases.desfazerVinculo(id));
    }

    @Override
    @PostMapping("/rastreadores/{id}/ignorar")
    @PreAuthorize("hasAuthority('frota:telemetria:write')")
    public ResponseEntity<RastreadorResponse> ignorar(@PathVariable UUID id) {
        return ResponseEntity.ok(useCases.ignorar(id));
    }

    @Override
    @PostMapping("/rastreadores/{id}/reativar")
    @PreAuthorize("hasAuthority('frota:telemetria:write')")
    public ResponseEntity<RastreadorResponse> reativar(@PathVariable UUID id) {
        return ResponseEntity.ok(useCases.reativar(id));
    }

    @Override
    @GetMapping("/eventos")
    @PreAuthorize("hasAuthority('frota:telemetria:read')")
    public ResponseEntity<PageResponse<EventoResponse>> listarEventos(@ParameterObject EventoFilter filtro,
                                                                     @ParameterObject Pageable pageable) {
        return ResponseEntity.ok(useCases.listarEventos(filtro, pageable));
    }

    @Override
    @GetMapping("/eventos/{id}")
    @PreAuthorize("hasAuthority('frota:telemetria:read')")
    public ResponseEntity<EventoResponse> detalharEvento(@PathVariable UUID id) {
        return ResponseEntity.ok(useCases.detalharEvento(id));
    }

    @Override
    @GetMapping("/saude")
    @PreAuthorize("hasAuthority('frota:telemetria:read')")
    public ResponseEntity<SaudeResponse> saude() {
        return ResponseEntity.ok(uso.saude());
    }

    @Override
    @GetMapping("/mapa")
    @PreAuthorize("hasAuthority('frota:telemetria:read')")
    public ResponseEntity<MapaResponse> mapa(@RequestParam(required = false) List<UUID> idsBase) {
        return ResponseEntity.ok(useCases.mapa(idsBase));
    }

    @Override
    @GetMapping("/veiculos/{idVeiculo}")
    @PreAuthorize("hasAuthority('frota:telemetria:read')")
    public ResponseEntity<VeiculoResponse> veiculo(@PathVariable UUID idVeiculo) {
        return ResponseEntity.ok(useCases.veiculo(idVeiculo));
    }

    @Override
    @GetMapping("/veiculos/{idVeiculo}/trajeto")
    @PreAuthorize("hasAuthority('frota:telemetria:read')")
    public ResponseEntity<TrajetoResponse> trajeto(@PathVariable UUID idVeiculo,
                                                   @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime de,
                                                   @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime ate) {
        return ResponseEntity.ok(useCases.trajeto(idVeiculo, de, ate));
    }

    @Override
    @GetMapping("/abastecimentos/{idAbastecimento}/consumo")
    @PreAuthorize("hasAuthority('frota:telemetria:read')")
    public ResponseEntity<ConsumoAbastecimentoResponse> consumoAbastecimento(@PathVariable UUID idAbastecimento) {
        return ResponseEntity.ok(useCases.consumoAbastecimento(idAbastecimento));
    }
}
