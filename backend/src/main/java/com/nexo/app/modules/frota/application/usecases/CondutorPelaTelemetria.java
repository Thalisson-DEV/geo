package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.application.events.MotoristaIdentificadoNaTelemetria;
import com.nexo.app.modules.frota.domain.OrigemVinculoCondutor;
import com.nexo.app.modules.frota.infrastructure.persistence.VinculoCondutorRepository;
import com.nexo.app.shared.domain.exception.BaseBusinessException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Condutor do veículo pelo cartão de identificação do rastreador: quando o motorista informado
 * pela telemetria muda, ele passa a ser o condutor do veículo daquele instante em diante. É a fonte
 * mais confiável (o cartão é pessoal), então dispensa o checklist para registrar a troca.
 *
 * <p>Roda depois da sincronização, em transação própria: um vínculo recusado (período sobreposto,
 * colaborador desligado) fica só no log e não desfaz as leituras da telemetria.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
class CondutorPelaTelemetria {

    private final VinculoCondutorUseCases vinculos;
    private final VinculoCondutorRepository repository;
    private final ReferenciasFrota referencias;

    @TransactionalEventListener(fallbackExecution = true)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void aoIdentificar(MotoristaIdentificadoNaTelemetria evento) {
        if (vinculos.condutorEm(evento.idVeiculo(), evento.em()).filter(evento.idColaborador()::equals).isPresent()) {
            return;
        }
        if (!referencias.colaboradorAtivo(evento.idColaborador())
                || repository.existeEncerradoDepois(evento.idVeiculo(), evento.idColaborador(), evento.em())) {
            return;
        }
        try {
            // A CNH é conferida no checklist e na tela de condutores; o cartão só diz quem está dirigindo.
            vinculos.vincular(evento.idVeiculo(), evento.idColaborador(), evento.em(), OrigemVinculoCondutor.TELEMETRIA,
                    evento.idRastreador(), "Identificado pelo cartão no rastreador", false);
        } catch (BaseBusinessException e) {
            log.info("Condutor da telemetria não vinculado ao veículo {}: {}", evento.idVeiculo(), e.getMessage());
        }
    }
}
