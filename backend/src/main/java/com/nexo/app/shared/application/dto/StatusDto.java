package com.nexo.app.shared.application.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.Objects;

/**
 * Status pronto para a interface: código estável, rótulo em pt-BR e severidade do {@code p-tag}.
 * Evita que cada tela mantenha a própria tabela de rótulos e cores.
 */
@Schema(description = "Status com rótulo e severidade para a interface")
public record StatusDto(
        @Schema(description = "Código estável do enum", example = "APROVADO") String code,
        @Schema(description = "Rótulo em pt-BR", example = "Aprovado") String label,
        @Schema(description = "Severidade visual") UiSeverity severity) {

    public StatusDto {
        Objects.requireNonNull(code, "code é obrigatório");
        Objects.requireNonNull(label, "label é obrigatório");
        Objects.requireNonNull(severity, "severity é obrigatório");
    }
}
