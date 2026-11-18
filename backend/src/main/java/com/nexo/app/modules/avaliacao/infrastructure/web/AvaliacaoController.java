package com.nexo.app.modules.avaliacao.infrastructure.web;

import com.nexo.app.modules.avaliacao.application.dto.AvaliacaoDtos.CampanhaRequest;
import com.nexo.app.modules.avaliacao.application.dto.AvaliacaoDtos.CampanhaResponse;
import com.nexo.app.modules.avaliacao.application.dto.AvaliacaoDtos.ConviteResponse;
import com.nexo.app.modules.avaliacao.application.dto.AvaliacaoDtos.Origem;
import com.nexo.app.modules.avaliacao.application.dto.AvaliacaoDtos.RespostaItem;
import com.nexo.app.modules.avaliacao.application.dto.AvaliacaoDtos.RespostaRequest;
import com.nexo.app.modules.avaliacao.application.dto.AvaliacaoDtos.ResumoResponse;
import com.nexo.app.modules.avaliacao.application.usecases.AvaliacaoUseCases;
import com.nexo.app.modules.avaliacao.doc.AvaliacaoControllerDoc;
import com.nexo.app.shared.infrastructure.security.SecurityUtils;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/avaliacoes")
@RequiredArgsConstructor
public class AvaliacaoController implements AvaliacaoControllerDoc {

    private final AvaliacaoUseCases useCases;

    @Override
    @GetMapping("/convite")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ConviteResponse> convite() {
        return useCases.convite(SecurityUtils.getUsuarioLogadoId())
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @Override
    @PostMapping("/{campanhaId}/respostas")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> responder(@PathVariable UUID campanhaId, @Valid @RequestBody RespostaRequest request) {
        useCases.responder(campanhaId, SecurityUtils.getUsuarioLogadoId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).build();
    }

    @Override
    @PostMapping("/{campanhaId}/adiamento")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> adiar(@PathVariable UUID campanhaId) {
        useCases.adiar(campanhaId, SecurityUtils.getUsuarioLogadoId());
        return ResponseEntity.noContent().build();
    }

    @Override
    @PostMapping("/{campanhaId}/recusa")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> recusar(@PathVariable UUID campanhaId) {
        useCases.recusar(campanhaId, SecurityUtils.getUsuarioLogadoId());
        return ResponseEntity.noContent().build();
    }

    @Override
    @GetMapping("/campanhas")
    @PreAuthorize("hasAnyAuthority('avaliacao:read', 'avaliacao:manage')")
    public ResponseEntity<List<CampanhaResponse>> listarCampanhas() {
        return ResponseEntity.ok(useCases.listarCampanhas());
    }

    @Override
    @PostMapping("/campanhas")
    @PreAuthorize("hasAuthority('avaliacao:manage')")
    public ResponseEntity<CampanhaResponse> abrirCampanha(@Valid @RequestBody CampanhaRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(useCases.abrirCampanha(request));
    }

    @Override
    @PatchMapping("/campanhas/{id}/encerramento")
    @PreAuthorize("hasAuthority('avaliacao:manage')")
    public ResponseEntity<CampanhaResponse> encerrarCampanha(@PathVariable UUID id) {
        return ResponseEntity.ok(useCases.encerrarCampanha(id));
    }

    @Override
    @GetMapping("/campanhas/{id}/resumo")
    @PreAuthorize("hasAnyAuthority('avaliacao:read', 'avaliacao:manage')")
    public ResponseEntity<ResumoResponse> resumo(@PathVariable UUID id,
                                                 @RequestParam(required = false) Origem origem) {
        return ResponseEntity.ok(useCases.resumo(id, origem));
    }

    @Override
    @GetMapping("/campanhas/{id}/respostas")
    @PreAuthorize("hasAnyAuthority('avaliacao:read', 'avaliacao:manage')")
    public ResponseEntity<List<RespostaItem>> respostas(@PathVariable UUID id,
                                                        @RequestParam(required = false) Origem origem) {
        return ResponseEntity.ok(useCases.listarRespostas(id, origem));
    }
}
