package com.nexo.app.modules.execucao.application.dto;

import java.util.UUID;

/** Execução e o número da nota já aberto (o banco guarda cifrado). */
public record NumeroDaNota(UUID execucaoId, String numero) {
}
