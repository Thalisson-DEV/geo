package com.nexo.app.shared.application.dto;

import java.util.List;
import java.util.Optional;

/**
 * Catálogo de um enum exposto à interface em {@code GET /api/v1/meta/enums/{nome}}.
 * Cada módulo declara o seu como bean; o shared só os reúne (sem depender dos módulos).
 */
public interface EnumDeUi {

    /** Nome público do enum na URL, em kebab-case (ex.: {@code status-chamado}). */
    String nome();

    /** Valores na ordem em que aparecem nos filtros. */
    List<StatusDto> valores();

    default Optional<StatusDto> porCodigo(String codigo) {
        return valores().stream().filter(v -> v.code().equals(codigo)).findFirst();
    }
}
