package com.nexo.app.modules.contrato;

import java.time.OffsetDateTime;
import java.util.UUID;

public record AcaoResponse(
    UUID id,
    String codigo,
    String nome,
    boolean ativo,
    OffsetDateTime dataCriacao,
    OffsetDateTime dataDesativacao,
    /** Serviço não efetuado: nota só com serviços improdutivos não conta para a meta física. */
    boolean improdutiva
) {
    /** Contrato anterior, sem a marcação de improdutiva. */
    public AcaoResponse(UUID id, String codigo, String nome, boolean ativo,
                        OffsetDateTime dataCriacao, OffsetDateTime dataDesativacao) {
        this(id, codigo, nome, ativo, dataCriacao, dataDesativacao, false);
    }
}
