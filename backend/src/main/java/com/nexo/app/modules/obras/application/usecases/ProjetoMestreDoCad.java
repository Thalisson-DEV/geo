package com.nexo.app.modules.obras.application.usecases;

import com.nexo.app.modules.obras.domain.PlanejamentoObra;
import com.nexo.app.modules.obras.infrastructure.persistence.PlanejamentoObraRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.UUID;

/**
 * Obra sem projeto que recebe o DXF ou DWG do projeto (anexado pela ficha, por exemplo): a planta em PDF é gerada e
 * vira o projeto mestre na hora, sem esperar alguém abrir o planejamento. Assim o app de campo já recebe a folha.
 * Corre logo depois de gravado o anexo, ainda dentro do envio: quando a tela recarrega, a planta já é o projeto. Um
 * problema com a planta nunca desfaz nem derruba o envio do arquivo, que já foi gravado.
 */
@Slf4j
@Component
public class ProjetoMestreDoCad {

    /** Arquivo CAD acabou de ser anexado à obra. */
    public record ProjetoCadAnexado(UUID idObra, UUID idAnexo) {
    }

    private final PlanejamentoObraRepository planejamentoRepository;
    private final PlanejamentoObraUseCases planejamento;
    private final TransactionTemplate transacaoPropria;

    public ProjetoMestreDoCad(PlanejamentoObraRepository planejamentoRepository, PlanejamentoObraUseCases planejamento,
                              PlatformTransactionManager transacoes) {
        this.planejamentoRepository = planejamentoRepository;
        this.planejamento = planejamento;
        this.transacaoPropria = new TransactionTemplate(transacoes);
        // Depois do commit do anexo, a transação dele acabou: a planta grava na sua.
        this.transacaoPropria.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void aoAnexarCad(ProjetoCadAnexado anexado) {
        try {
            transacaoPropria.executeWithoutResult(status -> definirSeFaltar(anexado));
        } catch (RuntimeException e) {
            // O arquivo continua anexado; a planta pode ser gerada pelo planejamento ("Gerar a planta deste arquivo").
            log.warn("Não foi possível gerar a planta do arquivo CAD {} da obra {}: {}", anexado.idAnexo(), anexado.idObra(), e.getMessage());
        }
    }

    void definirSeFaltar(ProjetoCadAnexado anexado) {
        boolean temProjeto = planejamentoRepository.findByIdObraAndAtivoTrue(anexado.idObra())
                .map(PlanejamentoObra::getIdAnexoMestre)
                .isPresent();
        if (!temProjeto) {
            planejamento.definirProjetoMestre(anexado.idObra(), anexado.idAnexo());
            log.info("Planta gerada do arquivo CAD {} virou o projeto da obra {}", anexado.idAnexo(), anexado.idObra());
        }
    }
}
