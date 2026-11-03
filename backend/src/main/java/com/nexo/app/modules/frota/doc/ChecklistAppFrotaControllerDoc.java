package com.nexo.app.modules.frota.doc;

import com.nexo.app.modules.frota.application.dto.CatalogoChecklistAppResponse;
import com.nexo.app.modules.frota.application.dto.ChecklistAppItemResponse;
import com.nexo.app.modules.frota.application.dto.ChecklistDetalheResponse;
import com.nexo.app.modules.frota.application.dto.ChecklistRegistradoResponse;
import com.nexo.app.modules.frota.application.dto.RegistrarChecklistRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

@Tag(name = "Frota — Checklist no app", description = "Preenchimento e consulta do checklist do veículo pelo app de campo")
public interface ChecklistAppFrotaControllerDoc {

    @Operation(summary = "Catálogo para uso offline", description = "Modelos em uso e, por veículo, os modelos que ele usa, a medição atual e o condutor vinculado.")
    ResponseEntity<CatalogoChecklistAppResponse> catalogo();

    @Operation(summary = "Enviar checklist",
            description = "Grava o checklist, a medição no livro-razão, a passagem de veículo e as pendências de Não OK. "
                    + "Reenviar o mesmo idAparelho devolve o checklist já gravado. As fotos seguem pelo endpoint de fotos.")
    ResponseEntity<ChecklistRegistradoResponse> registrar(RegistrarChecklistRequest request);

    @Operation(summary = "Enviar foto do checklist", description = "Uma foto por chamada, pelo id gerado no aparelho. Reenviar não duplica.")
    ResponseEntity<ChecklistRegistradoResponse> enviarFoto(UUID idAparelho, UUID idFoto, MultipartFile arquivo);

    @Operation(summary = "Meus checklists", description = "Os que a pessoa preencheu nos últimos dias (padrão 30, até 90), em qualquer aparelho; até 50.")
    ResponseEntity<List<ChecklistAppItemResponse>> meus(int dias);

    @Operation(summary = "Checklists do veículo", description = "Os 20 últimos checklists do veículo, de qualquer pessoa: como o veículo foi entregue.")
    ResponseEntity<List<ChecklistAppItemResponse>> doVeiculo(UUID idVeiculo);

    @Operation(summary = "Detalhe do checklist", description = "Pelo id do servidor: respostas, fotos e o que o gestor decidiu em cada Não OK.")
    ResponseEntity<ChecklistDetalheResponse> detalhar(UUID id);

    @Operation(summary = "Foto do checklist", description = "Foto de resposta ou de recebimento já recebida pelo servidor.")
    ResponseEntity<Resource> foto(UUID id, UUID idFoto);
}
