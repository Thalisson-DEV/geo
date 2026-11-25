package com.nexo.app.modules.sst.application.dto;

import com.nexo.app.modules.sst.domain.CondicaoApr;
import com.nexo.app.modules.sst.domain.EstruturaApr;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * Cadastro da APR e as condições que o app sabe reconhecer, com o rótulo de cada uma para a tela de edição.
 */
public record ModeloAprResponse(EstruturaApr estrutura, List<Condicao> condicoes, OffsetDateTime alteradoEm,
                                String alteradoPor) {

    public record Condicao(CondicaoApr valor, String rotulo) {
    }
}
