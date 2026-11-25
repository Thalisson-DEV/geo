package com.nexo.app.modules.listas.doc;

import com.nexo.app.modules.listas.ListaConfiguravel;
import com.nexo.app.modules.listas.ListasApi;
import com.nexo.app.modules.listas.application.dto.ListaConfiguravelResponse;
import com.nexo.app.modules.listas.application.dto.OpcaoListaFilter;
import com.nexo.app.modules.listas.application.dto.OpcaoListaRequest;
import com.nexo.app.modules.listas.application.dto.OpcaoListaResponse;
import com.nexo.app.shared.application.dto.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.UUID;

@Tag(name = "Listas configuráveis", description = "Opções que cada cliente ajusta: motivos, tipos, causas e naturezas")
@SecurityRequirement(name = "bearerAuth")
public interface OpcaoListaControllerDoc {

    @Operation(summary = "Nome e explicação da lista")
    ResponseEntity<ListaConfiguravelResponse> descrever(ListaConfiguravel lista);

    @Operation(summary = "Listar opções da lista com paginação e filtros")
    ResponseEntity<PageResponse<OpcaoListaResponse>> listar(ListaConfiguravel lista, @ParameterObject OpcaoListaFilter filter, @ParameterObject Pageable pageable);

    @Operation(summary = "Opções ativas, na ordem do cadastro, para montar escolhas")
    ResponseEntity<List<ListasApi.Opcao>> ativas(ListaConfiguravel lista);

    @Operation(summary = "Nome de cada código da lista, inclusive desativados")
    ResponseEntity<java.util.Map<String, String>> rotulos(ListaConfiguravel lista);

    @Operation(summary = "Incluir opção; o código nasce do nome e não muda")
    ResponseEntity<OpcaoListaResponse> criar(ListaConfiguravel lista, OpcaoListaRequest request);

    @Operation(summary = "Corrigir nome e descrição da opção")
    ResponseEntity<OpcaoListaResponse> atualizar(ListaConfiguravel lista, UUID id, OpcaoListaRequest request);

    @Operation(summary = "Subir (-1) ou descer (1) a opção na ordem")
    ResponseEntity<Void> mover(ListaConfiguravel lista, UUID id, int delta);

    @Operation(summary = "Desativar opção; registros antigos continuam com ela")
    ResponseEntity<Void> desativar(ListaConfiguravel lista, UUID id);

    @Operation(summary = "Reativar opção")
    ResponseEntity<Void> reativar(ListaConfiguravel lista, UUID id);
}
