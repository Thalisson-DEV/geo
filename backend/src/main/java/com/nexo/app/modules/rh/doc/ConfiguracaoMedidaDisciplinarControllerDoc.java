package com.nexo.app.modules.rh.doc;

import com.nexo.app.modules.rh.application.dto.MotivoMedidaDisciplinarRequest;
import com.nexo.app.modules.rh.application.dto.MotivoMedidaDisciplinarResponse;
import com.nexo.app.modules.rh.application.dto.ParametrosRhRequest;
import com.nexo.app.modules.rh.application.dto.ParametrosRhResponse;
import com.nexo.app.modules.rh.application.dto.TipoMedidaDisciplinarRequest;
import com.nexo.app.modules.rh.application.dto.TipoMedidaDisciplinarResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.UUID;

@Tag(name = "RH — Cadastros das medidas disciplinares", description = "Tipos, motivos e parâmetros")
public interface ConfiguracaoMedidaDisciplinarControllerDoc {

    @Operation(summary = "Listar tipos", description = "Ordenados por gravidade.")
    ResponseEntity<List<TipoMedidaDisciplinarResponse>> listarTipos(boolean apenasAtivos);

    @Operation(summary = "Criar tipo")
    ResponseEntity<TipoMedidaDisciplinarResponse> criarTipo(TipoMedidaDisciplinarRequest request);

    @Operation(summary = "Atualizar tipo")
    ResponseEntity<TipoMedidaDisciplinarResponse> atualizarTipo(UUID id, TipoMedidaDisciplinarRequest request);

    @Operation(summary = "Ativar tipo")
    ResponseEntity<Void> ativarTipo(UUID id);

    @Operation(summary = "Desativar tipo", description = "Some do formulário; as medidas já registradas continuam com ele.")
    ResponseEntity<Void> desativarTipo(UUID id);

    @Operation(summary = "Listar motivos")
    ResponseEntity<List<MotivoMedidaDisciplinarResponse>> listarMotivos(boolean apenasAtivos);

    @Operation(summary = "Criar motivo")
    ResponseEntity<MotivoMedidaDisciplinarResponse> criarMotivo(MotivoMedidaDisciplinarRequest request);

    @Operation(summary = "Renomear motivo")
    ResponseEntity<MotivoMedidaDisciplinarResponse> atualizarMotivo(UUID id, MotivoMedidaDisciplinarRequest request);

    @Operation(summary = "Ativar motivo")
    ResponseEntity<Void> ativarMotivo(UUID id);

    @Operation(summary = "Desativar motivo")
    ResponseEntity<Void> desativarMotivo(UUID id);

    @Operation(summary = "Parâmetros", description = "Janela de reincidência e prazo de imediatidade.")
    ResponseEntity<ParametrosRhResponse> parametros();

    @Operation(summary = "Atualizar parâmetros")
    ResponseEntity<ParametrosRhResponse> atualizarParametros(ParametrosRhRequest request);
}
