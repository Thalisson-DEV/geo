package com.nexo.app.modules.listas.infrastructure.web;

import com.nexo.app.modules.listas.ListaConfiguravel;
import com.nexo.app.modules.listas.ListasApi;
import com.nexo.app.modules.listas.application.dto.ListaConfiguravelResponse;
import com.nexo.app.modules.listas.application.dto.OpcaoListaFilter;
import com.nexo.app.modules.listas.application.dto.OpcaoListaRequest;
import com.nexo.app.modules.listas.application.dto.OpcaoListaResponse;
import com.nexo.app.modules.listas.application.usecases.OpcaoListaUseCases;
import com.nexo.app.modules.listas.doc.OpcaoListaControllerDoc;
import com.nexo.app.shared.application.dto.PageResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Pageable;
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
@RequestMapping("/v1/listas/{lista}")
@RequiredArgsConstructor
public class OpcaoListaController implements OpcaoListaControllerDoc {

    private static final String LER = "@permissoesListas.podeLer(#lista)";
    private static final String ESCREVER = "@permissoesListas.podeEscrever(#lista)";

    private final OpcaoListaUseCases useCases;

    @Override
    @GetMapping
    @PreAuthorize(LER)
    public ResponseEntity<ListaConfiguravelResponse> descrever(@PathVariable ListaConfiguravel lista) {
        return ResponseEntity.ok(useCases.descrever(lista));
    }

    @Override
    @GetMapping("/opcoes")
    @PreAuthorize(LER)
    public ResponseEntity<PageResponse<OpcaoListaResponse>> listar(@PathVariable ListaConfiguravel lista,
                                                                   @ParameterObject OpcaoListaFilter filter,
                                                                   @ParameterObject Pageable pageable) {
        return ResponseEntity.ok(useCases.listar(lista, filter, pageable));
    }

    /** Qualquer usuário logado pode ver as opções ativas: formulários de várias áreas usam estas listas. */
    @Override
    @GetMapping("/opcoes/ativas")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<ListasApi.Opcao>> ativas(@PathVariable ListaConfiguravel lista) {
        return ResponseEntity.ok(useCases.ativas(lista));
    }

    /** Nome de cada código, inclusive dos desativados, para painéis e relatórios mostrarem registros antigos. */
    @Override
    @GetMapping("/rotulos")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<java.util.Map<String, String>> rotulos(@PathVariable ListaConfiguravel lista) {
        return ResponseEntity.ok(useCases.rotulos(lista));
    }

    @Override
    @PostMapping("/opcoes")
    @PreAuthorize(ESCREVER)
    public ResponseEntity<OpcaoListaResponse> criar(@PathVariable ListaConfiguravel lista, @Valid @RequestBody OpcaoListaRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(useCases.criar(lista, request));
    }

    @Override
    @PutMapping("/opcoes/{id}")
    @PreAuthorize(ESCREVER)
    public ResponseEntity<OpcaoListaResponse> atualizar(@PathVariable ListaConfiguravel lista, @PathVariable UUID id,
                                                        @Valid @RequestBody OpcaoListaRequest request) {
        return ResponseEntity.ok(useCases.atualizar(lista, id, request));
    }

    @Override
    @PatchMapping("/opcoes/{id}/posicao")
    @PreAuthorize(ESCREVER)
    public ResponseEntity<Void> mover(@PathVariable ListaConfiguravel lista, @PathVariable UUID id, @RequestParam int delta) {
        useCases.mover(lista, id, delta);
        return ResponseEntity.noContent().build();
    }

    @Override
    @PatchMapping("/opcoes/{id}/desativar")
    @PreAuthorize(ESCREVER)
    public ResponseEntity<Void> desativar(@PathVariable ListaConfiguravel lista, @PathVariable UUID id) {
        useCases.desativar(lista, id);
        return ResponseEntity.noContent().build();
    }

    @Override
    @PatchMapping("/opcoes/{id}/reativar")
    @PreAuthorize(ESCREVER)
    public ResponseEntity<Void> reativar(@PathVariable ListaConfiguravel lista, @PathVariable UUID id) {
        useCases.reativar(lista, id);
        return ResponseEntity.noContent().build();
    }
}
