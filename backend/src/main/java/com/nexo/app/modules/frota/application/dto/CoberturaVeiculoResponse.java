package com.nexo.app.modules.frota.application.dto;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Como cada veículo da frota está em relação ao seguro hoje.
 *
 * @param cobertoAte         último dia coberto sem interrupção (somando as renovações já cadastradas)
 * @param perdeCoberturaEm   primeiro dia descoberto, quando cai dentro da faixa de aviso
 * @param ultimaCoberturaAte sem cobertura hoje: último dia em que esteve coberto
 * @param proximaCoberturaEm sem cobertura hoje: início de uma apólice já cadastrada
 */
public record CoberturaVeiculoResponse(
        UUID idVeiculo,
        String placa,
        String modelo,
        UUID idBaseOperacional,
        String baseOperacional,
        boolean cobertoHoje,
        UUID idApolice,
        String numeroApolice,
        LocalDate cobertoAte,
        LocalDate perdeCoberturaEm,
        LocalDate ultimaCoberturaAte,
        LocalDate proximaCoberturaEm
) {
}
