package com.nexo.app.modules.frota.infrastructure.web;

import com.nexo.app.modules.frota.application.dto.AbrirOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.AgendarOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.BaixaOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.ConcluirOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.EditarOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.FornecedorFrotaResponse;
import com.nexo.app.modules.frota.application.dto.IniciarOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.JustificativaRequest;
import com.nexo.app.modules.frota.application.dto.OrdemServicoDetalheResponse;
import com.nexo.app.modules.frota.application.dto.OrdemServicoFilter;
import com.nexo.app.modules.frota.application.dto.OrdemServicoResponse;
import com.nexo.app.modules.frota.application.dto.PainelOrdensServicoResponse;
import com.nexo.app.modules.frota.application.dto.ParadaVeiculoRequest;
import com.nexo.app.modules.frota.application.dto.PreenchimentoFinanceiroResponse;
import com.nexo.app.modules.frota.application.dto.PrevisaoOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.PreviaRepeticaoResponse;
import com.nexo.app.modules.frota.application.usecases.OrdemServicoUseCases;
import com.nexo.app.modules.frota.doc.OrdemServicoFrotaControllerDoc;
import com.nexo.app.shared.application.dto.PageResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Pageable;
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

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/frota/ordens-servico")
@RequiredArgsConstructor
public class OrdemServicoFrotaController implements OrdemServicoFrotaControllerDoc {

    private static final String LEITURA = "hasAuthority('frota:os:read')";
    private static final String ESCRITA = "hasAuthority('frota:os:write')";
    private static final String EXECUCAO = "hasAuthority('frota:os:executar')";

    private final OrdemServicoUseCases ordens;

    @Override
    @GetMapping
    @PreAuthorize(LEITURA)
    public ResponseEntity<PageResponse<OrdemServicoResponse>> listar(@ParameterObject OrdemServicoFilter filtro,
                                                                    @ParameterObject Pageable pageable) {
        return ResponseEntity.ok(ordens.listar(filtro, pageable));
    }

    @Override
    @GetMapping("/painel")
    @PreAuthorize(LEITURA)
    public ResponseEntity<PainelOrdensServicoResponse> painel(@RequestParam(required = false) List<UUID> idsBase) {
        return ResponseEntity.ok(ordens.painel(idsBase));
    }

    @Override
    @GetMapping("/{id}")
    @PreAuthorize(LEITURA)
    public ResponseEntity<OrdemServicoDetalheResponse> buscar(@PathVariable UUID id) {
        return ResponseEntity.ok(ordens.detalhar(id));
    }

    @Override
    @PostMapping
    @PreAuthorize(ESCRITA)
    public ResponseEntity<OrdemServicoDetalheResponse> abrir(@Valid @RequestBody AbrirOrdemServicoRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ordens.abrir(request));
    }

    @Override
    @PutMapping("/{id}")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<OrdemServicoDetalheResponse> editar(@PathVariable UUID id,
                                                              @Valid @RequestBody EditarOrdemServicoRequest request) {
        return ResponseEntity.ok(ordens.editar(id, request));
    }

    @Override
    @PostMapping("/{id}/agendamento")
    @PreAuthorize("hasAnyAuthority('frota:os:write', 'frota:os:executar')")
    public ResponseEntity<OrdemServicoDetalheResponse> agendar(@PathVariable UUID id,
                                                               @Valid @RequestBody AgendarOrdemServicoRequest request) {
        return ResponseEntity.ok(ordens.agendar(id, request));
    }

    @Override
    @PostMapping("/{id}/inicio")
    @PreAuthorize(EXECUCAO)
    public ResponseEntity<OrdemServicoDetalheResponse> iniciar(@PathVariable UUID id,
                                                               @Valid @RequestBody IniciarOrdemServicoRequest request) {
        return ResponseEntity.ok(ordens.iniciar(id, request));
    }

    @Override
    @PutMapping("/{id}/previsao")
    @PreAuthorize(EXECUCAO)
    public ResponseEntity<OrdemServicoDetalheResponse> alterarPrevisao(@PathVariable UUID id,
                                                                       @Valid @RequestBody PrevisaoOrdemServicoRequest request) {
        return ResponseEntity.ok(ordens.alterarPrevisao(id, request));
    }

    @Override
    @PostMapping("/{id}/conclusao")
    @PreAuthorize(EXECUCAO)
    public ResponseEntity<OrdemServicoDetalheResponse> concluir(@PathVariable UUID id,
                                                                @Valid @RequestBody ConcluirOrdemServicoRequest request) {
        return ResponseEntity.ok(ordens.concluir(id, request));
    }

    @Override
    @PostMapping("/{id}/baixa")
    @PreAuthorize(EXECUCAO)
    public ResponseEntity<OrdemServicoDetalheResponse> completarConclusao(@PathVariable UUID id,
                                                                @Valid @RequestBody BaixaOrdemServicoRequest request) {
        return ResponseEntity.ok(ordens.completarConclusao(id, request));
    }

    @Override
    @PostMapping("/{id}/reabertura")
    @PreAuthorize(EXECUCAO)
    public ResponseEntity<OrdemServicoDetalheResponse> reabrir(@PathVariable UUID id,
                                                               @Valid @RequestBody JustificativaRequest request) {
        return ResponseEntity.ok(ordens.reabrir(id, request.justificativa()));
    }

    @Override
    @PostMapping("/{id}/cancelamento")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<OrdemServicoDetalheResponse> cancelar(@PathVariable UUID id,
                                                                @Valid @RequestBody JustificativaRequest request) {
        return ResponseEntity.ok(ordens.cancelar(id, request.justificativa()));
    }

    @Override
    @PostMapping("/{id}/parada")
    @PreAuthorize("hasAnyAuthority('frota:os:write', 'frota:os:executar')")
    public ResponseEntity<OrdemServicoDetalheResponse> alterarParada(@PathVariable UUID id,
                                                                     @Valid @RequestBody ParadaVeiculoRequest request) {
        return ResponseEntity.ok(ordens.alterarParada(id, request));
    }

    @Override
    @GetMapping("/{id}/preenchimento-financeiro")
    @PreAuthorize(LEITURA)
    public ResponseEntity<PreenchimentoFinanceiroResponse> preenchimentoFinanceiro(@PathVariable UUID id) {
        return ResponseEntity.ok(ordens.preenchimentoFinanceiro(id));
    }

    @Override
    @GetMapping("/repeticoes")
    @PreAuthorize(LEITURA)
    public ResponseEntity<List<PreviaRepeticaoResponse>> previaRepeticoes(@RequestParam UUID idVeiculo,
                                                                          @RequestParam List<UUID> idsItem) {
        return ResponseEntity.ok(ordens.previaRepeticoes(idVeiculo, idsItem));
    }

    @Override
    @GetMapping("/fornecedores")
    @PreAuthorize(LEITURA)
    public ResponseEntity<List<FornecedorFrotaResponse>> fornecedores() {
        return ResponseEntity.ok(ordens.fornecedores());
    }
}
