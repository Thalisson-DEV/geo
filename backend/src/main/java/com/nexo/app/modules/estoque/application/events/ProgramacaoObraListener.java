package com.nexo.app.modules.estoque.application.events;

import com.nexo.app.modules.estoque.application.usecases.SolicitacaoProgramacaoObraUseCases;
import com.nexo.app.shared.domain.events.ProgramacaoObraEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Mantém a solicitação técnica gerada pela programação na mesma transação da programação. */
@Component
@RequiredArgsConstructor
public class ProgramacaoObraListener {

    private final SolicitacaoProgramacaoObraUseCases useCases;

    @EventListener
    @Transactional(propagation = Propagation.MANDATORY)
    public void aoMudarProgramacao(ProgramacaoObraEvent evento) {
        useCases.aplicar(evento);
    }
}
