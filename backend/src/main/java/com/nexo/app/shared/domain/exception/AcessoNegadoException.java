package com.nexo.app.shared.domain.exception;

import org.springframework.http.HttpStatus;

/** O usuário tem a permissão, mas o recurso pedido é de outro escopo (ex.: o pacote de outra equipe). */
public class AcessoNegadoException extends BaseBusinessException {

    public AcessoNegadoException(String detail) {
        super("Acesso negado", detail, HttpStatus.FORBIDDEN, "acesso-negado");
    }
}
