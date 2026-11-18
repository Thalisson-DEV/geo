package com.nexo.app.modules.frota.infrastructure.web;

import org.junit.jupiter.api.Test;
import org.springframework.security.access.prepost.PreAuthorize;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * A agenda junta eventos de leituras diferentes: o controller deixa passar quem tem qualquer uma
 * delas, e o caso de uso filtra os tipos pela permissão de cada um.
 */
class AgendaFrotaControllerAcessoTest {

    @Test
    void aceitaQualquerLeituraQueAlimentaOCalendario() {
        String regra = AgendaFrotaController.class.getAnnotation(PreAuthorize.class).value();

        assertThat(regra).contains("frota:os:read", "frota:documento:read", "frota:condutor:read", "frota:preventiva:read");
    }
}
