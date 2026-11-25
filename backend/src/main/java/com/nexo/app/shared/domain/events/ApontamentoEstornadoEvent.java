package com.nexo.app.shared.domain.events;

import java.util.UUID;

/** Um apontamento de execução de obra foi estornado: quem reagiu a ele (como o estoque) desfaz o que fez. */
public record ApontamentoEstornadoEvent(UUID idApontamento, UUID idObra, UUID idEquipe) {}
