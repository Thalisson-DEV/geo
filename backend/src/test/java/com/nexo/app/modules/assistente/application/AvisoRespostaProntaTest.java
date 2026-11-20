package com.nexo.app.modules.assistente.application;

import com.nexo.app.modules.assistente.domain.StatusMensagemAssistente;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class AvisoRespostaProntaTest {

    @Test
    void soRespostasDemoradasAvisamNoSino() {
        assertThat(AvisoRespostaPronta.deveAvisar(StatusMensagemAssistente.CONCLUIDA, 95_000)).isTrue();
        assertThat(AvisoRespostaPronta.deveAvisar(StatusMensagemAssistente.FALHOU, 400_000)).isTrue();
        assertThat(AvisoRespostaPronta.deveAvisar(StatusMensagemAssistente.CONCLUIDA, 30_000)).isFalse();
    }

    @Test
    void interrupcaoPeloUsuarioNaoAvisa() {
        assertThat(AvisoRespostaPronta.deveAvisar(StatusMensagemAssistente.CANCELADA, 400_000)).isFalse();
    }
}
