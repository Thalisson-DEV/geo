package com.nexo.app.modules.frota.application.dto;

import java.util.List;
import java.util.UUID;

/**
 * Carteira de um aprovador. Quem tem a permissão de aprovar e ainda não tem carteira aparece
 * com a lista vazia: sem placas, não aprova nada.
 */
public record CarteiraAprovacaoResponse(
        UUID idUsuario,
        String login,
        String nome,
        List<Placa> placas
) {

    public record Placa(UUID idVeiculo, String placa, String descricao, UUID idBaseOperacional, String baseNome) {
    }
}
