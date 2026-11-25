package com.nexo.app.modules.estoque.infrastructure.web;

import com.nexo.app.modules.estoque.application.dto.BalcaoRequests;
import com.nexo.app.modules.estoque.application.dto.BalcaoResponses;
import com.nexo.app.modules.estoque.application.usecases.BalcaoUseCases;
import com.nexo.app.modules.estoque.application.usecases.ParametrosEstoqueUseCases;
import com.nexo.app.modules.estoque.doc.BalcaoControllerDoc;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
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
@RequestMapping("/v1/balcao")
@RequiredArgsConstructor
public class BalcaoController implements BalcaoControllerDoc {

    private final BalcaoUseCases useCases;
    private final ParametrosEstoqueUseCases parametros;

    @Override
    @GetMapping
    @PreAuthorize("hasAnyAuthority('estoque:balcao:operate', 'estoque:solicitacao:deliver')")
    public ResponseEntity<BalcaoResponses.Painel> painel(
            @RequestParam(required = false) UUID idAlmoxarifado,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate data) {
        return ResponseEntity.ok(useCases.painel(idAlmoxarifado, data));
    }

    @Override
    @GetMapping("/equipes/{idEquipe}")
    @PreAuthorize("hasAnyAuthority('estoque:balcao:operate', 'estoque:solicitacao:deliver')")
    public ResponseEntity<BalcaoResponses.Atendimento> atendimento(
            @PathVariable UUID idEquipe,
            @RequestParam UUID idAlmoxarifado,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate data) {
        return ResponseEntity.ok(useCases.atendimento(idEquipe, idAlmoxarifado, data));
    }

    @Override
    @PostMapping("/equipes/{idEquipe}/retiradas")
    @PreAuthorize("hasAnyAuthority('estoque:balcao:operate', 'estoque:solicitacao:deliver')")
    public ResponseEntity<BalcaoResponses.AtendimentoResumo> registrarRetirada(
            @PathVariable UUID idEquipe, @Valid @RequestBody BalcaoRequests.RegistrarRetirada request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(useCases.registrarRetirada(idEquipe, request));
    }

    @Override
    @PostMapping("/equipes/{idEquipe}/devolucoes")
    @PreAuthorize("hasAnyAuthority('estoque:balcao:operate', 'estoque:solicitacao:return')")
    public ResponseEntity<BalcaoResponses.AtendimentoResumo> registrarDevolucao(
            @PathVariable UUID idEquipe, @Valid @RequestBody BalcaoRequests.RegistrarDevolucao request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(useCases.registrarDevolucao(idEquipe, request));
    }

    @Override
    @GetMapping("/atendimentos/{id}")
    @PreAuthorize("hasAnyAuthority('estoque:balcao:operate', 'estoque:saldo:read')")
    public ResponseEntity<BalcaoResponses.AtendimentoResumo> buscarAtendimento(@PathVariable UUID id) {
        return ResponseEntity.ok(useCases.buscarAtendimento(id));
    }

    @Override
    @GetMapping("/atendimentos/{id}/{parte}")
    @PreAuthorize("hasAnyAuthority('estoque:balcao:operate', 'estoque:saldo:read')")
    public ResponseEntity<Resource> comprovante(@PathVariable UUID id, @PathVariable String parte) {
        return useCases.comprovante(id, parte)
                .<ResponseEntity<Resource>>map(a -> ResponseEntity.ok()
                        .contentType(MediaType.parseMediaType(a.contentType()))
                        .contentLength(a.tamanhoBytes())
                        .cacheControl(CacheControl.noStore())
                        .body(new InputStreamResource(a.conteudo())))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @Override
    @GetMapping("/estoque-equipes")
    @PreAuthorize("hasAnyAuthority('estoque:balcao:operate', 'estoque:saldo:read')")
    public ResponseEntity<List<BalcaoResponses.EquipeNoBalcao>> estoqueDasEquipes(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate data) {
        return ResponseEntity.ok(useCases.estoqueDasEquipes(data));
    }

    @Override
    @GetMapping("/estoque-equipes/itens")
    @PreAuthorize("hasAnyAuthority('estoque:balcao:operate', 'estoque:saldo:read')")
    public ResponseEntity<List<BalcaoResponses.ItemNasEquipes>> itensDasEquipes() {
        return ResponseEntity.ok(useCases.itensDasEquipes());
    }

    @Override
    @GetMapping("/estoque-equipes/{idEquipe}/caminhao")
    @PreAuthorize("hasAnyAuthority('estoque:balcao:operate', 'estoque:saldo:read')")
    public ResponseEntity<List<BalcaoResponses.GrupoCaminhao>> caminhaoPorObra(@PathVariable UUID idEquipe) {
        return ResponseEntity.ok(useCases.caminhaoPorObra(idEquipe));
    }

    @Override
    @GetMapping("/parametros")
    @PreAuthorize("hasAnyAuthority('estoque:balcao:operate', 'estoque:parametros:write', 'estoque:saldo:read')")
    public ResponseEntity<BalcaoResponses.Parametros> parametros() {
        return ResponseEntity.ok(parametros.consultar());
    }

    @Override
    @PutMapping("/parametros")
    @PreAuthorize("hasAuthority('estoque:parametros:write')")
    public ResponseEntity<BalcaoResponses.Parametros> atualizarParametros(@Valid @RequestBody BalcaoRequests.Parametros request) {
        return ResponseEntity.ok(parametros.atualizar(request));
    }
}
