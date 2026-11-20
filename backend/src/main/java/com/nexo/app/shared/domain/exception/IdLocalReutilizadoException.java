package com.nexo.app.shared.domain.exception;

import org.springframework.http.HttpStatus;

/**
 * O aparelho reenviou um id já usado, mas com outro conteúdo. O reenvio legítimo (mesmo id, mesmo conteúdo) devolve o
 * registro existente; isto aqui é outro registro com o id repetido e não pode substituir o primeiro.
 */
public class IdLocalReutilizadoException extends BaseBusinessException {

    public static final String CODIGO = "ID_LOCAL_REUTILIZADO";

    public IdLocalReutilizadoException(String detail) {
        super("Registro do aparelho em conflito", detail, HttpStatus.CONFLICT, "id-local-reutilizado");
    }
}
