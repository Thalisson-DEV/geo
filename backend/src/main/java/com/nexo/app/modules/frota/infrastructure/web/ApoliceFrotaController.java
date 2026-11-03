package com.nexo.app.modules.frota.infrastructure.web;

import com.nexo.app.modules.frota.application.dto.ApoliceFilter;
import com.nexo.app.modules.frota.application.dto.ApoliceRequest;
import com.nexo.app.modules.frota.application.dto.ApoliceResponse;
import com.nexo.app.modules.frota.application.dto.ArquivoAnexoDespesa;
import com.nexo.app.modules.frota.application.dto.CoberturaApoliceRequest;
import com.nexo.app.modules.frota.application.dto.CoberturaVeiculoResponse;
import com.nexo.app.modules.frota.application.dto.EncerrarCoberturaRequest;
import com.nexo.app.modules.frota.application.dto.GerarParcelasRequest;
import com.nexo.app.modules.frota.application.dto.ParcelaApoliceRequest;
import com.nexo.app.modules.frota.application.dto.PreenchimentoFinanceiroResponse;
import com.nexo.app.modules.frota.application.usecases.ApoliceUseCases;
import com.nexo.app.modules.frota.application.usecases.PagamentoApoliceUseCases;
import com.nexo.app.modules.frota.doc.ApoliceFrotaControllerDoc;
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
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/frota/apolices")
@RequiredArgsConstructor
public class ApoliceFrotaController implements ApoliceFrotaControllerDoc {

    private static final String LEITURA = "hasAuthority('frota:seguro:read')";
    private static final String ESCRITA = "hasAuthority('frota:seguro:write')";

    private final ApoliceUseCases useCases;
    private final PagamentoApoliceUseCases pagamentos;

    @Override
    @GetMapping
    @PreAuthorize(LEITURA)
    public ResponseEntity<PageResponse<ApoliceResponse>> listar(@ParameterObject ApoliceFilter filtro,
                                                              @ParameterObject @PageableDefault(sort = "vigenciaFim", direction = Sort.Direction.ASC) Pageable pageable) {
        return ResponseEntity.ok(useCases.listar(filtro, pageable));
    }

    @Override
    @GetMapping("/cobrindo")
    @PreAuthorize(LEITURA + " or hasAuthority('frota:sinistro:write')")
    public ResponseEntity<List<ApoliceResponse>> cobrindo(@RequestParam UUID idVeiculo,
                                                          @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dia) {
        return ResponseEntity.ok(useCases.cobrindo(idVeiculo, dia));
    }

    @Override
    @GetMapping("/veiculos")
    @PreAuthorize(LEITURA)
    public ResponseEntity<List<CoberturaVeiculoResponse>> coberturaVeiculos() {
        return ResponseEntity.ok(useCases.coberturaVeiculos());
    }

    @Override
    @GetMapping("/{id}")
    @PreAuthorize(LEITURA)
    public ResponseEntity<ApoliceResponse> buscar(@PathVariable UUID id) {
        return ResponseEntity.ok(useCases.buscarPorId(id));
    }

    @Override
    @PostMapping
    @PreAuthorize(ESCRITA)
    public ResponseEntity<ApoliceResponse> criar(@Valid @RequestBody ApoliceRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(useCases.criar(request));
    }

    @Override
    @PutMapping("/{id}")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<ApoliceResponse> atualizar(@PathVariable UUID id, @Valid @RequestBody ApoliceRequest request) {
        return ResponseEntity.ok(useCases.atualizar(id, request));
    }

    @Override
    @DeleteMapping("/{id}")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<Void> excluir(@PathVariable UUID id) {
        useCases.excluir(id);
        return ResponseEntity.noContent().build();
    }

    @Override
    @PostMapping("/{id}/veiculos")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<ApoliceResponse> incluirVeiculo(@PathVariable UUID id, @Valid @RequestBody CoberturaApoliceRequest request) {
        return ResponseEntity.ok(useCases.incluirVeiculo(id, request));
    }

    @Override
    @PostMapping("/{id}/veiculos/{idCobertura}/encerramento")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<ApoliceResponse> encerrarCobertura(@PathVariable UUID id, @PathVariable UUID idCobertura,
                                                             @Valid @RequestBody EncerrarCoberturaRequest request) {
        return ResponseEntity.ok(useCases.encerrarCobertura(id, idCobertura, request.fim(), request.motivo(), request.observacao()));
    }

    @Override
    @DeleteMapping("/{id}/veiculos/{idCobertura}")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<ApoliceResponse> removerCobertura(@PathVariable UUID id, @PathVariable UUID idCobertura) {
        return ResponseEntity.ok(useCases.removerCobertura(id, idCobertura));
    }

    @Override
    @PostMapping("/{id}/parcelas/geracao")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<ApoliceResponse> gerarParcelas(@PathVariable UUID id, @Valid @RequestBody GerarParcelasRequest request) {
        return ResponseEntity.ok(useCases.gerarParcelas(id, request));
    }

    @Override
    @PostMapping("/{id}/parcelas")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<ApoliceResponse> incluirParcela(@PathVariable UUID id, @Valid @RequestBody ParcelaApoliceRequest request) {
        return ResponseEntity.ok(useCases.incluirParcela(id, request));
    }

    @Override
    @PutMapping("/{id}/parcelas/{idParcela}")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<ApoliceResponse> alterarParcela(@PathVariable UUID id, @PathVariable UUID idParcela,
                                                          @Valid @RequestBody ParcelaApoliceRequest request) {
        return ResponseEntity.ok(useCases.alterarParcela(id, idParcela, request));
    }

    @Override
    @DeleteMapping("/{id}/parcelas/{idParcela}")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<ApoliceResponse> removerParcela(@PathVariable UUID id, @PathVariable UUID idParcela) {
        return ResponseEntity.ok(useCases.removerParcela(id, idParcela));
    }

    @Override
    @GetMapping("/parcelas/{idParcela}/preenchimento-financeiro")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<PreenchimentoFinanceiroResponse> preenchimentoFinanceiro(@PathVariable UUID idParcela) {
        return ResponseEntity.ok(pagamentos.preenchimentoFinanceiro(idParcela));
    }

    @Override
    @PostMapping(value = "/{id}/anexos", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize(ESCRITA)
    public ResponseEntity<ApoliceResponse> anexar(@PathVariable UUID id, @RequestPart("arquivo") MultipartFile arquivo) {
        return ResponseEntity.ok(useCases.anexar(id, arquivo));
    }

    @Override
    @GetMapping("/{id}/anexos/{idAnexo}")
    @PreAuthorize(LEITURA)
    public ResponseEntity<Resource> baixarAnexo(@PathVariable UUID id, @PathVariable UUID idAnexo) {
        return arquivo(useCases.baixarAnexo(id, idAnexo));
    }

    @Override
    @DeleteMapping("/{id}/anexos/{idAnexo}")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<ApoliceResponse> removerAnexo(@PathVariable UUID id, @PathVariable UUID idAnexo) {
        return ResponseEntity.ok(useCases.removerAnexo(id, idAnexo));
    }

    static ResponseEntity<Resource> arquivo(ArquivoAnexoDespesa arquivo) {
        String disposition = ContentDisposition.inline().filename(arquivo.nome(), StandardCharsets.UTF_8).build().toString();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(arquivo.contentType()))
                .contentLength(arquivo.tamanhoBytes())
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition)
                .body(new InputStreamResource(arquivo.conteudo()));
    }
}
