package com.nexo.app.modules.iam.application.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;

public record VincularColaboradorRequest(
    @Schema(description = "Colaborador que passa a ser dono do acesso; nulo desfaz o vínculo")
    UUID idColaborador
) {}
