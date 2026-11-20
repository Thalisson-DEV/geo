package com.nexo.app.shared.application.dto;

import com.fasterxml.jackson.annotation.JsonValue;
import io.swagger.v3.oas.annotations.media.Schema;

import java.util.Locale;

/**
 * Severidade visual de um status, nos mesmos valores do {@code p-tag} do PrimeNG.
 * Serializa em minúsculas ({@code "success"}, {@code "warn"}...).
 */
@Schema(description = "Severidade visual do status (valores do p-tag)",
        allowableValues = {"success", "info", "warn", "danger", "secondary", "contrast"})
public enum UiSeverity {
    SUCCESS, INFO, WARN, DANGER, SECONDARY, CONTRAST;

    @JsonValue
    public String valor() {
        return name().toLowerCase(Locale.ROOT);
    }
}
