package com.nexo.app.modules.frota.doc;

import com.nexo.app.modules.frota.application.dto.CarteiraAprovacaoRequest;
import com.nexo.app.modules.frota.application.dto.CarteiraAprovacaoResponse;
import com.nexo.app.modules.frota.application.dto.IncluirBaseCarteiraRequest;
import com.nexo.app.modules.frota.application.dto.PostoAbastecimentoFilter;
import com.nexo.app.modules.frota.application.dto.PostoAbastecimentoRequest;
import com.nexo.app.modules.frota.application.dto.PostoAbastecimentoResponse;
import com.nexo.app.modules.frota.application.dto.PrecoPostoRequest;
import com.nexo.app.modules.frota.application.dto.PrecoPostoResponse;
import com.nexo.app.modules.frota.application.dto.SugestaoPrecoPostoResponse;
import com.nexo.app.modules.frota.application.dto.ProdutoAbastecimentoFilter;
import com.nexo.app.modules.frota.application.dto.ProdutoAbastecimentoRequest;
import com.nexo.app.modules.frota.application.dto.ProdutoAbastecimentoResponse;
import com.nexo.app.shared.application.dto.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.UUID;

@Tag(name = "Frota — Configuração do abastecimento", description = "Postos, produtos e carteiras de aprovação por placa")
public interface ConfiguracaoAbastecimentoFrotaControllerDoc {

    @Operation(summary = "Preços do posto", description = "Histórico por produto, do mais recente; marca o que vale hoje.")
    ResponseEntity<List<PrecoPostoResponse>> listarPrecos(UUID id);

    @Operation(summary = "Registrar preço do posto",
            description = "Vale a partir da data (hoje, se vazia). O realizado calcula o valor por ele; outro preço no mesmo dia substitui.")
    ResponseEntity<PrecoPostoResponse> registrarPreco(UUID id, PrecoPostoRequest request);

    @Operation(summary = "Sugestões de preço pelo cupom",
            description = "Preços lidos pela Bússola nos cupons, diferentes do cadastro do posto, aguardando confirmação.")
    ResponseEntity<List<SugestaoPrecoPostoResponse>> listarSugestoesPreco();

    @Operation(summary = "Confirmar sugestão de preço", description = "O preço do cupom passa a valer no posto a partir da data do cupom.")
    ResponseEntity<SugestaoPrecoPostoResponse> confirmarSugestaoPreco(UUID id);

    @Operation(summary = "Descartar sugestão de preço", description = "Mantém o preço cadastrado.")
    ResponseEntity<SugestaoPrecoPostoResponse> descartarSugestaoPreco(UUID id);

    @Operation(summary = "Listar postos")
    ResponseEntity<PageResponse<PostoAbastecimentoResponse>> listarPostos(PostoAbastecimentoFilter filtro, Pageable pageable);

    @Operation(summary = "Detalhar posto")
    ResponseEntity<PostoAbastecimentoResponse> buscarPosto(UUID id);

    @Operation(summary = "Criar posto", description = "WhatsApp com DDD; sem DDI entende Brasil (55).")
    ResponseEntity<PostoAbastecimentoResponse> criarPosto(PostoAbastecimentoRequest request);

    @Operation(summary = "Atualizar posto")
    ResponseEntity<PostoAbastecimentoResponse> atualizarPosto(UUID id, PostoAbastecimentoRequest request);

    @Operation(summary = "Desativar posto", description = "Some das novas solicitações; as antigas continuam com o posto.")
    ResponseEntity<Void> desativarPosto(UUID id);

    @Operation(summary = "Reativar posto")
    ResponseEntity<Void> ativarPosto(UUID id);

    @Operation(summary = "Listar produtos")
    ResponseEntity<PageResponse<ProdutoAbastecimentoResponse>> listarProdutos(ProdutoAbastecimentoFilter filtro, Pageable pageable);

    @Operation(summary = "Criar produto")
    ResponseEntity<ProdutoAbastecimentoResponse> criarProduto(ProdutoAbastecimentoRequest request);

    @Operation(summary = "Atualizar produto")
    ResponseEntity<ProdutoAbastecimentoResponse> atualizarProduto(UUID id, ProdutoAbastecimentoRequest request);

    @Operation(summary = "Desativar produto")
    ResponseEntity<Void> desativarProduto(UUID id);

    @Operation(summary = "Reativar produto")
    ResponseEntity<Void> ativarProduto(UUID id);

    @Operation(summary = "Carteiras de aprovação", description = "Todos com a permissão de aprovar, com as placas de cada um.")
    ResponseEntity<List<CarteiraAprovacaoResponse>> listarCarteiras();

    @Operation(summary = "Carteira de um aprovador")
    ResponseEntity<CarteiraAprovacaoResponse> buscarCarteira(UUID idUsuario);

    @Operation(summary = "Definir as placas da carteira", description = "Substitui a lista atual.")
    ResponseEntity<CarteiraAprovacaoResponse> definirPlacas(UUID idUsuario, CarteiraAprovacaoRequest request);

    @Operation(summary = "Incluir as placas de uma base",
            description = "Entram as placas ativas da base agora; placa cadastrada depois não entra sozinha.")
    ResponseEntity<CarteiraAprovacaoResponse> incluirBase(UUID idUsuario, IncluirBaseCarteiraRequest request);
}
