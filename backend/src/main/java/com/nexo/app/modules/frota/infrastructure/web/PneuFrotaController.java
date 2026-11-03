package com.nexo.app.modules.frota.infrastructure.web;

import com.nexo.app.modules.frota.application.dto.DescartePneuRequest;
import com.nexo.app.modules.frota.application.dto.DiagramaPneusRequest;
import com.nexo.app.modules.frota.application.dto.EnvioPneuRequest;
import com.nexo.app.modules.frota.application.dto.EventoPneuFilter;
import com.nexo.app.modules.frota.application.dto.EventoPneuResponse;
import com.nexo.app.modules.frota.application.dto.InspecaoPneuRequest;
import com.nexo.app.modules.frota.application.dto.InspecaoPneuResponse;
import com.nexo.app.modules.frota.application.dto.MovimentacaoPneusRequest;
import com.nexo.app.modules.frota.application.dto.PneuFilter;
import com.nexo.app.modules.frota.application.dto.PneuRequest;
import com.nexo.app.modules.frota.application.dto.PneuResponse;
import com.nexo.app.modules.frota.application.dto.ResumoPneusResponse;
import com.nexo.app.modules.frota.application.dto.RetornoPneuRequest;
import com.nexo.app.modules.frota.application.dto.VeiculoPneusResponse;
import com.nexo.app.modules.frota.application.usecases.InspecaoPneuUseCases;
import com.nexo.app.modules.frota.application.usecases.MovimentacaoPneuUseCases;
import com.nexo.app.modules.frota.application.usecases.PneuUseCases;
import com.nexo.app.modules.frota.doc.PneuFrotaControllerDoc;
import com.nexo.app.shared.application.dto.PageResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
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
@RequestMapping("/v1/frota/pneus")
@RequiredArgsConstructor
public class PneuFrotaController implements PneuFrotaControllerDoc {

    private static final String LEITURA = "hasAuthority('frota:pneu:read')";
    private static final String ESCRITA = "hasAuthority('frota:pneu:write')";

    private final PneuUseCases pneus;
    private final MovimentacaoPneuUseCases movimentacao;
    private final InspecaoPneuUseCases inspecoes;

    @Override
    @GetMapping
    @PreAuthorize(LEITURA)
    public ResponseEntity<PageResponse<PneuResponse>> listar(@ParameterObject PneuFilter filtro,
                                                             @ParameterObject @PageableDefault(size = 30, sort = "marcaFogo") Pageable pageable) {
        return ResponseEntity.ok(pneus.listar(filtro, pageable));
    }

    @Override
    @GetMapping("/resumo")
    @PreAuthorize(LEITURA)
    public ResponseEntity<ResumoPneusResponse> resumo() {
        return ResponseEntity.ok(pneus.resumo());
    }

    @Override
    @GetMapping("/marcas")
    @PreAuthorize(LEITURA)
    public ResponseEntity<List<String>> marcas() {
        return ResponseEntity.ok(pneus.marcas());
    }

    @Override
    @GetMapping("/{id}")
    @PreAuthorize(LEITURA)
    public ResponseEntity<PneuResponse> buscar(@PathVariable UUID id) {
        return ResponseEntity.ok(pneus.buscar(id));
    }

    @Override
    @PostMapping
    @PreAuthorize(ESCRITA)
    public ResponseEntity<PneuResponse> cadastrar(@Valid @RequestBody PneuRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(pneus.cadastrar(request));
    }

    @Override
    @PutMapping("/{id}")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<PneuResponse> atualizar(@PathVariable UUID id, @Valid @RequestBody PneuRequest request) {
        return ResponseEntity.ok(pneus.atualizar(id, request));
    }

    @Override
    @GetMapping("/{id}/historico")
    @PreAuthorize(LEITURA)
    public ResponseEntity<List<EventoPneuResponse>> historico(@PathVariable UUID id) {
        return ResponseEntity.ok(pneus.historico(id));
    }

    @Override
    @GetMapping("/eventos")
    @PreAuthorize(LEITURA)
    public ResponseEntity<PageResponse<EventoPneuResponse>> eventos(@ParameterObject EventoPneuFilter filtro,
                                                                    @ParameterObject @PageableDefault(size = 30, sort = "ocorridoEm", direction = Sort.Direction.DESC) Pageable pageable) {
        return ResponseEntity.ok(pneus.eventos(filtro, pageable));
    }

    @Override
    @PostMapping("/{id}/envio")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<PneuResponse> enviar(@PathVariable UUID id, @Valid @RequestBody EnvioPneuRequest request) {
        return ResponseEntity.ok(pneus.enviar(id, request));
    }

    @Override
    @PostMapping("/{id}/retorno")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<PneuResponse> retornar(@PathVariable UUID id, @Valid @RequestBody RetornoPneuRequest request) {
        return ResponseEntity.ok(pneus.retornar(id, request));
    }

    @Override
    @PostMapping("/{id}/descarte")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<PneuResponse> descartar(@PathVariable UUID id, @Valid @RequestBody DescartePneuRequest request) {
        return ResponseEntity.ok(pneus.descartar(id, request));
    }

    @Override
    @PostMapping("/{id}/transferencia")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<PneuResponse> transferir(@PathVariable UUID id, @RequestParam UUID idEstoque) {
        return ResponseEntity.ok(pneus.transferir(id, idEstoque));
    }

    @Override
    @GetMapping("/veiculos/{idVeiculo}")
    @PreAuthorize(LEITURA)
    public ResponseEntity<VeiculoPneusResponse> veiculo(@PathVariable UUID idVeiculo) {
        return ResponseEntity.ok(movimentacao.veiculo(idVeiculo));
    }

    @Override
    @PutMapping("/veiculos/{idVeiculo}/diagrama")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<VeiculoPneusResponse> definirDiagrama(@PathVariable UUID idVeiculo, @Valid @RequestBody DiagramaPneusRequest request) {
        return ResponseEntity.ok(movimentacao.definirDiagrama(idVeiculo, request));
    }

    @Override
    @PostMapping("/movimentacoes")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<VeiculoPneusResponse> movimentar(@Valid @RequestBody MovimentacaoPneusRequest request) {
        return ResponseEntity.ok(movimentacao.movimentar(request));
    }

    @Override
    @GetMapping("/inspecoes")
    @PreAuthorize(LEITURA)
    public ResponseEntity<PageResponse<InspecaoPneuResponse>> inspecoes(@RequestParam(required = false) UUID idVeiculo,
                                                                        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate de,
                                                                        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate ate,
                                                                        @ParameterObject @PageableDefault(size = 20, sort = "realizadaEm", direction = Sort.Direction.DESC) Pageable pageable) {
        return ResponseEntity.ok(inspecoes.listar(idVeiculo, de, ate, pageable));
    }

    @Override
    @PostMapping("/inspecoes")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<InspecaoPneuResponse> registrarInspecao(@Valid @RequestBody InspecaoPneuRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(inspecoes.registrar(request));
    }
}
