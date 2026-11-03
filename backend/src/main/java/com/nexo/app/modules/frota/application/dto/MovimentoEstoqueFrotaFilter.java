package com.nexo.app.modules.frota.application.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * @param tipos ENTRADA, SAIDA, TRANSFERENCIA, AJUSTE, ESTORNO
 * @param busca código, nome da peça ou documento
 * @param ate   inclusive
 */
public record MovimentoEstoqueFrotaFilter(
        UUID idEstoque,
        UUID idMaterial,
        UUID idVeiculo,
        UUID idReferencia,
        List<String> tipos,
        String busca,
        LocalDate de,
        LocalDate ate
) {
}
