package com.nexo.app.modules.sst.doc;

import com.nexo.app.modules.sst.application.dto.ModeloAprRequest;
import com.nexo.app.modules.sst.application.dto.ModeloAprResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;

@Tag(name = "SST - APR", description = "Riscos, medidas de controle e verificações da APR do app de campo")
@SecurityRequirement(name = "bearerAuth")
public interface ModeloAprControllerDoc {

    @Operation(summary = "Buscar o cadastro da APR e as condições que o app reconhece")
    ResponseEntity<ModeloAprResponse> obter();

    @Operation(summary = "Salvar o cadastro da APR; APRs já lançadas continuam como foram respondidas")
    ResponseEntity<ModeloAprResponse> salvar(ModeloAprRequest request);
}
