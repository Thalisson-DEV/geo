package com.nexo.app.modules.frota.infrastructure.web;

import com.nexo.app.modules.estoque.EstoqueFrotaApi;
import com.nexo.app.modules.frota.application.dto.AjusteEstoqueFrotaRequest;
import com.nexo.app.modules.frota.application.dto.AlmoxarifadoFrotaRequest;
import com.nexo.app.modules.frota.application.dto.AlmoxarifadoFrotaResponse;
import com.nexo.app.modules.frota.application.dto.EntradaEstoqueFrotaRequest;
import com.nexo.app.modules.frota.application.dto.MovimentoEstoqueFrotaFilter;
import com.nexo.app.modules.frota.application.dto.MovimentoEstoqueFrotaResponse;
import com.nexo.app.modules.frota.application.dto.ParametrosPecaFrotaRequest;
import com.nexo.app.modules.frota.application.dto.PecaFrotaRequest;
import com.nexo.app.modules.frota.application.dto.SaidaEstoqueFrotaRequest;
import com.nexo.app.modules.frota.application.dto.TransferenciaEstoqueFrotaRequest;
import com.nexo.app.modules.frota.application.usecases.EstoqueOficinaFrotaUseCases;
import com.nexo.app.modules.frota.doc.EstoqueOficinaFrotaControllerDoc;
import com.nexo.app.shared.application.dto.PageResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
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

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/frota/estoque")
@RequiredArgsConstructor
public class EstoqueOficinaFrotaController implements EstoqueOficinaFrotaControllerDoc {

    private static final String LEITURA = "hasAuthority('frota:estoque:read')";
    private static final String ESCRITA = "hasAuthority('frota:estoque:write')";

    private final EstoqueOficinaFrotaUseCases useCases;

    @Override
    @GetMapping("/almoxarifados")
    @PreAuthorize(LEITURA)
    public ResponseEntity<List<AlmoxarifadoFrotaResponse>> almoxarifados() {
        return ResponseEntity.ok(useCases.almoxarifados());
    }

    @Override
    @PostMapping("/almoxarifados")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<AlmoxarifadoFrotaResponse> criarAlmoxarifado(@Valid @RequestBody AlmoxarifadoFrotaRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(useCases.criarAlmoxarifado(request));
    }

    @Override
    @PutMapping("/almoxarifados/{id}")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<AlmoxarifadoFrotaResponse> atualizarAlmoxarifado(@PathVariable UUID id, @Valid @RequestBody AlmoxarifadoFrotaRequest request) {
        return ResponseEntity.ok(useCases.atualizarAlmoxarifado(id, request));
    }

    @Override
    @DeleteMapping("/almoxarifados/{id}")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<Void> desativarAlmoxarifado(@PathVariable UUID id) {
        useCases.desativarAlmoxarifado(id);
        return ResponseEntity.noContent().build();
    }

    @Override
    @GetMapping("/pecas")
    @PreAuthorize(LEITURA)
    public ResponseEntity<PageResponse<EstoqueFrotaApi.Peca>> pecas(@RequestParam(required = false) String busca,
                                                                    @RequestParam(required = false) String grupo,
                                                                    @RequestParam(required = false) Boolean ativo,
                                                                    @ParameterObject @PageableDefault(size = 50, sort = "descricao", direction = Sort.Direction.ASC) Pageable pageable) {
        return ResponseEntity.ok(useCases.pecas(busca, grupo, ativo, pageable));
    }

    @Override
    @GetMapping("/pecas/grupos")
    @PreAuthorize(LEITURA)
    public ResponseEntity<List<String>> grupos() {
        return ResponseEntity.ok(useCases.grupos());
    }

    @Override
    @PostMapping("/pecas")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<EstoqueFrotaApi.Peca> criarPeca(@Valid @RequestBody PecaFrotaRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(useCases.criarPeca(request));
    }

    @Override
    @PutMapping("/pecas/{id}")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<EstoqueFrotaApi.Peca> atualizarPeca(@PathVariable UUID id, @Valid @RequestBody PecaFrotaRequest request) {
        return ResponseEntity.ok(useCases.atualizarPeca(id, request));
    }

    @Override
    @DeleteMapping("/pecas/{id}")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<Void> desativarPeca(@PathVariable UUID id) {
        useCases.desativarPeca(id);
        return ResponseEntity.noContent().build();
    }

    @Override
    @GetMapping("/saldos")
    @PreAuthorize(LEITURA)
    public ResponseEntity<List<EstoqueFrotaApi.SaldoPeca>> saldos(@RequestParam(required = false) UUID idEstoque) {
        return ResponseEntity.ok(useCases.saldos(idEstoque));
    }

    @Override
    @GetMapping("/resumo")
    @PreAuthorize(LEITURA)
    public ResponseEntity<EstoqueFrotaApi.Resumo> resumo(@RequestParam(required = false) UUID idEstoque) {
        return ResponseEntity.ok(useCases.resumo(idEstoque));
    }

    @Override
    @PutMapping("/almoxarifados/{idEstoque}/pecas/{idMaterial}")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<EstoqueFrotaApi.SaldoPeca> definirParametros(@PathVariable UUID idEstoque, @PathVariable UUID idMaterial,
                                                                      @Valid @RequestBody ParametrosPecaFrotaRequest request) {
        return ResponseEntity.ok(useCases.definirParametros(idEstoque, idMaterial, request));
    }

    @Override
    @GetMapping("/movimentos")
    @PreAuthorize(LEITURA)
    public ResponseEntity<PageResponse<MovimentoEstoqueFrotaResponse>> movimentos(@ParameterObject MovimentoEstoqueFrotaFilter filtro,
                                                                                 @ParameterObject @PageableDefault(size = 30, sort = "dataHora", direction = Sort.Direction.DESC) Pageable pageable) {
        return ResponseEntity.ok(useCases.movimentos(filtro, pageable));
    }

    @Override
    @PostMapping("/entradas")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<List<MovimentoEstoqueFrotaResponse>> entrada(@Valid @RequestBody EntradaEstoqueFrotaRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(useCases.entrada(request));
    }

    @Override
    @PostMapping("/saidas")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<List<MovimentoEstoqueFrotaResponse>> saida(@Valid @RequestBody SaidaEstoqueFrotaRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(useCases.saida(request));
    }

    @Override
    @PostMapping("/transferencias")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<List<MovimentoEstoqueFrotaResponse>> transferencia(@Valid @RequestBody TransferenciaEstoqueFrotaRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(useCases.transferencia(request));
    }

    @Override
    @PostMapping("/ajustes")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<MovimentoEstoqueFrotaResponse> ajuste(@Valid @RequestBody AjusteEstoqueFrotaRequest request) {
        var mov = useCases.ajuste(request);
        return mov == null ? ResponseEntity.noContent().build() : ResponseEntity.ok(mov);
    }
}
