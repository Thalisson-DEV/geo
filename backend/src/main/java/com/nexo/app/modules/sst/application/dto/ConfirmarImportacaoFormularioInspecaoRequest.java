package com.nexo.app.modules.sst.application.dto;

import jakarta.validation.constraints.NotEmpty;

import java.util.List;

public record ConfirmarImportacaoFormularioInspecaoRequest(
        @NotEmpty(message = "Informe ao menos uma pergunta para importar")
        List<FormularioInspecaoImportacaoDTO> perguntas
) {
}
