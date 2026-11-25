package com.nexo.app.modules.estoque.application.events;

import com.nexo.app.modules.estoque.application.usecases.AplicacaoMaterialObraUseCases;
import com.nexo.app.shared.domain.events.ApontamentoEstornadoEvent;
import com.nexo.app.shared.domain.events.ItemExecutadoEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/** O apontamento e a baixa do material andam na mesma transação: o que foi apontado já aparece no estoque. */
@Component
@RequiredArgsConstructor
public class ApontamentoObraListener {

    private final AplicacaoMaterialObraUseCases useCases;

    @EventListener
    public void aoExecutar(ItemExecutadoEvent evento) {
        useCases.aoExecutar(evento);
    }

    @EventListener
    public void aoEstornar(ApontamentoEstornadoEvent evento) {
        useCases.aoEstornar(evento);
    }
}
