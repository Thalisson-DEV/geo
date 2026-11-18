package com.nexo.app.modules.frota.application.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Recorte dos relatórios gerenciais. Sem período, os seis meses anteriores mais o mês atual.
 * {@code idProcesso} recorta pelos veículos vinculados às equipes do processo; {@code regime}
 * (PROPRIO, LOCADO) e {@code situacao} usam os valores da ficha do veículo.
 */
public record RelatorioGerencialFrotaFilter(
        LocalDate de,
        LocalDate ate,
        List<UUID> idBase,
        List<UUID> idProcesso,
        List<UUID> idTipoVeiculo,
        List<String> regime,
        List<String> situacao,
        List<UUID> idVeiculo
) {
}
