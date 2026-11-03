package com.nexo.app.modules.frota.infrastructure.web;

import com.nexo.app.modules.frota.application.dto.CarteiraAprovacaoRequest;
import com.nexo.app.modules.frota.application.dto.CarteiraAprovacaoResponse;
import com.nexo.app.modules.frota.application.dto.IncluirBaseCarteiraRequest;
import com.nexo.app.modules.frota.application.dto.PostoAbastecimentoFilter;
import com.nexo.app.modules.frota.application.dto.PostoAbastecimentoRequest;
import com.nexo.app.modules.frota.application.dto.PostoAbastecimentoResponse;
import com.nexo.app.modules.frota.application.dto.PrecoPostoRequest;
import com.nexo.app.modules.frota.application.dto.PrecoPostoResponse;
import com.nexo.app.modules.frota.application.dto.SugestaoPrecoPostoResponse;
import com.nexo.app.modules.frota.application.usecases.PrecoPostoUseCases;
import com.nexo.app.modules.frota.application.dto.ProdutoAbastecimentoFilter;
import com.nexo.app.modules.frota.application.dto.ProdutoAbastecimentoRequest;
import com.nexo.app.modules.frota.application.dto.ProdutoAbastecimentoResponse;
import com.nexo.app.modules.frota.application.usecases.CarteiraAprovacaoUseCases;
import com.nexo.app.modules.frota.application.usecases.PostoAbastecimentoUseCases;
import com.nexo.app.modules.frota.application.usecases.ProdutoAbastecimentoUseCases;
import com.nexo.app.modules.frota.doc.ConfiguracaoAbastecimentoFrotaControllerDoc;
import com.nexo.app.shared.application.dto.PageResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Pageable;
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
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/frota/abastecimento")
@RequiredArgsConstructor
public class ConfiguracaoAbastecimentoFrotaController implements ConfiguracaoAbastecimentoFrotaControllerDoc {

    private static final String LEITURA = "hasAnyAuthority('frota:abastecimento:read', 'frota:abastecimento:configurar')";
    private static final String CONFIGURAR = "hasAuthority('frota:abastecimento:configurar')";
    /** Preço do posto: quem configura e o administrativo que libera e confere as faturas. */
    private static final String PRECOS = "hasAnyAuthority('frota:abastecimento:configurar', 'frota:abastecimento:liberar')";

    private final PostoAbastecimentoUseCases postos;
    private final ProdutoAbastecimentoUseCases produtos;
    private final CarteiraAprovacaoUseCases carteiras;
    private final PrecoPostoUseCases precos;

    @Override
    @GetMapping("/postos/{id}/precos")
    @PreAuthorize(LEITURA)
    public ResponseEntity<List<PrecoPostoResponse>> listarPrecos(@PathVariable UUID id) {
        return ResponseEntity.ok(precos.listar(id));
    }

    @Override
    @PostMapping("/postos/{id}/precos")
    @PreAuthorize(PRECOS)
    public ResponseEntity<PrecoPostoResponse> registrarPreco(@PathVariable UUID id, @Valid @RequestBody PrecoPostoRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(precos.registrar(id, request));
    }

    @Override
    @GetMapping("/sugestoes-preco")
    @PreAuthorize(PRECOS)
    public ResponseEntity<List<SugestaoPrecoPostoResponse>> listarSugestoesPreco() {
        return ResponseEntity.ok(precos.pendentes());
    }

    @Override
    @PostMapping("/sugestoes-preco/{id}/confirmacao")
    @PreAuthorize(PRECOS)
    public ResponseEntity<SugestaoPrecoPostoResponse> confirmarSugestaoPreco(@PathVariable UUID id) {
        return ResponseEntity.ok(precos.confirmar(id));
    }

    @Override
    @PostMapping("/sugestoes-preco/{id}/descarte")
    @PreAuthorize(PRECOS)
    public ResponseEntity<SugestaoPrecoPostoResponse> descartarSugestaoPreco(@PathVariable UUID id) {
        return ResponseEntity.ok(precos.descartar(id));
    }

    @Override
    @GetMapping("/postos")
    @PreAuthorize(LEITURA)
    public ResponseEntity<PageResponse<PostoAbastecimentoResponse>> listarPostos(@ParameterObject PostoAbastecimentoFilter filtro,
                                                                               @ParameterObject Pageable pageable) {
        return ResponseEntity.ok(postos.listar(filtro, pageable));
    }

    @Override
    @GetMapping("/postos/{id}")
    @PreAuthorize(LEITURA)
    public ResponseEntity<PostoAbastecimentoResponse> buscarPosto(@PathVariable UUID id) {
        return ResponseEntity.ok(postos.buscarPorId(id));
    }

    @Override
    @PostMapping("/postos")
    @PreAuthorize(CONFIGURAR)
    public ResponseEntity<PostoAbastecimentoResponse> criarPosto(@Valid @RequestBody PostoAbastecimentoRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(postos.criar(request));
    }

    @Override
    @PutMapping("/postos/{id}")
    @PreAuthorize(CONFIGURAR)
    public ResponseEntity<PostoAbastecimentoResponse> atualizarPosto(@PathVariable UUID id,
                                                                     @Valid @RequestBody PostoAbastecimentoRequest request) {
        return ResponseEntity.ok(postos.atualizar(id, request));
    }

    @Override
    @DeleteMapping("/postos/{id}")
    @PreAuthorize(CONFIGURAR)
    public ResponseEntity<Void> desativarPosto(@PathVariable UUID id) {
        postos.desativar(id);
        return ResponseEntity.noContent().build();
    }

    @Override
    @PutMapping("/postos/{id}/ativar")
    @PreAuthorize(CONFIGURAR)
    public ResponseEntity<Void> ativarPosto(@PathVariable UUID id) {
        postos.ativar(id);
        return ResponseEntity.noContent().build();
    }

    @Override
    @GetMapping("/produtos")
    @PreAuthorize(LEITURA)
    public ResponseEntity<PageResponse<ProdutoAbastecimentoResponse>> listarProdutos(@ParameterObject ProdutoAbastecimentoFilter filtro,
                                                                                   @ParameterObject Pageable pageable) {
        return ResponseEntity.ok(produtos.listar(filtro, pageable));
    }

    @Override
    @PostMapping("/produtos")
    @PreAuthorize(CONFIGURAR)
    public ResponseEntity<ProdutoAbastecimentoResponse> criarProduto(@Valid @RequestBody ProdutoAbastecimentoRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(produtos.criar(request));
    }

    @Override
    @PutMapping("/produtos/{id}")
    @PreAuthorize(CONFIGURAR)
    public ResponseEntity<ProdutoAbastecimentoResponse> atualizarProduto(@PathVariable UUID id,
                                                                         @Valid @RequestBody ProdutoAbastecimentoRequest request) {
        return ResponseEntity.ok(produtos.atualizar(id, request));
    }

    @Override
    @DeleteMapping("/produtos/{id}")
    @PreAuthorize(CONFIGURAR)
    public ResponseEntity<Void> desativarProduto(@PathVariable UUID id) {
        produtos.desativar(id);
        return ResponseEntity.noContent().build();
    }

    @Override
    @PutMapping("/produtos/{id}/ativar")
    @PreAuthorize(CONFIGURAR)
    public ResponseEntity<Void> ativarProduto(@PathVariable UUID id) {
        produtos.ativar(id);
        return ResponseEntity.noContent().build();
    }

    @Override
    @GetMapping("/carteiras")
    @PreAuthorize(LEITURA)
    public ResponseEntity<List<CarteiraAprovacaoResponse>> listarCarteiras() {
        return ResponseEntity.ok(carteiras.listar());
    }

    @Override
    @GetMapping("/carteiras/{idUsuario}")
    @PreAuthorize(LEITURA)
    public ResponseEntity<CarteiraAprovacaoResponse> buscarCarteira(@PathVariable UUID idUsuario) {
        return ResponseEntity.ok(carteiras.buscar(idUsuario));
    }

    @Override
    @PutMapping("/carteiras/{idUsuario}")
    @PreAuthorize(CONFIGURAR)
    public ResponseEntity<CarteiraAprovacaoResponse> definirPlacas(@PathVariable UUID idUsuario,
                                                                   @Valid @RequestBody CarteiraAprovacaoRequest request) {
        return ResponseEntity.ok(carteiras.definirPlacas(idUsuario, request.idsVeiculo()));
    }

    @Override
    @PostMapping("/carteiras/{idUsuario}/bases")
    @PreAuthorize(CONFIGURAR)
    public ResponseEntity<CarteiraAprovacaoResponse> incluirBase(@PathVariable UUID idUsuario,
                                                                 @Valid @RequestBody IncluirBaseCarteiraRequest request) {
        return ResponseEntity.ok(carteiras.incluirBase(idUsuario, request.idBaseOperacional()));
    }
}
