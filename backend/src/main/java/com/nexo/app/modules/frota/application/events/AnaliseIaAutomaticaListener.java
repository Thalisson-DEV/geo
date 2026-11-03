package com.nexo.app.modules.frota.application.events;

import com.nexo.app.modules.frota.application.usecases.AnaliseIaFrotaUseCases;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Análise automática do Assistente: fora da transação e da resposta ao app, porque a chamada ao
 * modelo leva dezenas de segundos. Falha não afeta o registro: o relatório oferece tentar de novo.
 */
@Component
@RequiredArgsConstructor
public class AnaliseIaAutomaticaListener {

    private final AnaliseIaFrotaUseCases analises;

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void aoPedirAnalise(AnaliseIaPedida evento) {
        analises.analisarAutomaticamente(evento.alvo(), evento.idAlvo());
    }
}
