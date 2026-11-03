package com.nexo.app.modules.frota.infrastructure.web;

import com.nexo.app.modules.frota.application.dto.DespesaImportacaoLinha;
import com.nexo.app.modules.frota.application.dto.DespesaVeiculoFilter;
import com.nexo.app.modules.frota.application.dto.DespesaVeiculoRequest;
import com.nexo.app.modules.frota.application.dto.DespesaVeiculoResponse;
import com.nexo.app.modules.frota.application.dto.ImportacaoDespesasResponse;
import com.nexo.app.modules.frota.application.dto.PreenchimentoFinanceiroResponse;
import com.nexo.app.modules.frota.application.dto.ResumoDespesasResponse;
import com.nexo.app.modules.frota.application.usecases.DespesaVeiculoUseCases;
import com.nexo.app.modules.frota.application.usecases.ImportarDespesasUseCase;
import com.nexo.app.modules.frota.application.usecases.PagamentoDespesaUseCases;
import com.nexo.app.modules.frota.doc.DespesaVeiculoFrotaControllerDoc;
import com.nexo.app.shared.application.dto.PageResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
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
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/frota/despesas")
@RequiredArgsConstructor
public class DespesaVeiculoFrotaController implements DespesaVeiculoFrotaControllerDoc {

    private static final String LEITURA = "hasAuthority('frota:despesa:read')";
    private static final String ESCRITA = "hasAuthority('frota:despesa:write')";

    private final DespesaVeiculoUseCases useCases;
    private final PagamentoDespesaUseCases pagamentos;
    private final ImportarDespesasUseCase importacao;

    @Override
    @GetMapping
    @PreAuthorize(LEITURA)
    public ResponseEntity<PageResponse<DespesaVeiculoResponse>> listar(@ParameterObject DespesaVeiculoFilter filtro,
                                                                     @ParameterObject @PageableDefault(sort = "data", direction = Sort.Direction.DESC) Pageable pageable) {
        return ResponseEntity.ok(useCases.listar(filtro, pageable));
    }

    @Override
    @GetMapping("/resumo")
    @PreAuthorize(LEITURA)
    public ResponseEntity<ResumoDespesasResponse> resumo(@ParameterObject DespesaVeiculoFilter filtro) {
        return ResponseEntity.ok(useCases.resumo(filtro));
    }

    @Override
    @GetMapping("/{id}")
    @PreAuthorize(LEITURA)
    public ResponseEntity<DespesaVeiculoResponse> buscar(@PathVariable UUID id) {
        return ResponseEntity.ok(useCases.buscarPorId(id));
    }

    @Override
    @PostMapping
    @PreAuthorize(ESCRITA)
    public ResponseEntity<DespesaVeiculoResponse> criar(@Valid @RequestBody DespesaVeiculoRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(useCases.criar(request));
    }

    @Override
    @PutMapping("/{id}")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<DespesaVeiculoResponse> atualizar(@PathVariable UUID id, @Valid @RequestBody DespesaVeiculoRequest request) {
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
    @PostMapping(value = "/{id}/anexos", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize(ESCRITA)
    public ResponseEntity<DespesaVeiculoResponse> anexar(@PathVariable UUID id, @RequestPart("arquivo") MultipartFile arquivo) {
        return ResponseEntity.ok(useCases.anexar(id, arquivo));
    }

    @Override
    @GetMapping("/{id}/anexos/{idAnexo}")
    @PreAuthorize(LEITURA)
    public ResponseEntity<Resource> baixarAnexo(@PathVariable UUID id, @PathVariable UUID idAnexo) {
        var arquivo = useCases.baixarAnexo(id, idAnexo);
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
    public ResponseEntity<DespesaVeiculoResponse> removerAnexo(@PathVariable UUID id, @PathVariable UUID idAnexo) {
        return ResponseEntity.ok(useCases.removerAnexo(id, idAnexo));
    }

    @Override
    @GetMapping("/{id}/preenchimento-financeiro")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<PreenchimentoFinanceiroResponse> preenchimentoFinanceiro(@PathVariable UUID id) {
        return ResponseEntity.ok(pagamentos.preenchimentoFinanceiro(id));
    }

    @Override
    @PostMapping(value = "/importacao", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize(ESCRITA)
    public ResponseEntity<ImportacaoDespesasResponse> validarImportacao(@RequestPart("arquivo") MultipartFile arquivo) {
        return ResponseEntity.ok(importacao.validar(arquivo));
    }

    @Override
    @PostMapping("/importacao/confirmacao")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<ImportacaoDespesasResponse> confirmarImportacao(@RequestBody List<DespesaImportacaoLinha> linhas) {
        return ResponseEntity.ok(importacao.confirmar(linhas));
    }

    @Override
    @GetMapping("/importacao/modelo")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<byte[]> modelo() {
        return ResponseEntity.ok()
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename("modelo-despesas-frota.csv").build().toString())
                .body(importacao.modelo());
    }
}
