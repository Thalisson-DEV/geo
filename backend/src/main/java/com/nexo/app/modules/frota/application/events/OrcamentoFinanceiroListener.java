package com.nexo.app.modules.frota.application.events;

import com.nexo.app.modules.frota.application.usecases.FaturaPostoUseCases;
import com.nexo.app.modules.frota.application.usecases.OrcamentoOrdemServicoUseCases;
import com.nexo.app.modules.frota.application.usecases.PagamentoApoliceUseCases;
import com.nexo.app.modules.frota.application.usecases.PagamentoDespesaUseCases;
import com.nexo.app.shared.domain.events.SolicitacaoFinanceiraAprovadaEvent;
import com.nexo.app.shared.domain.events.SolicitacaoFinanceiraCriadaEvent;
import com.nexo.app.shared.domain.events.SolicitacaoFinanceiraRejeitadaEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Acompanha as compras e pagamentos abertos pela frota (OS, fatura do posto, despesa do veículo e
 * parcela da apólice de seguro).
 *
 * <p>A criação é escutada na mesma transação (o vínculo nasce junto com a solicitação,
 * ou nenhum dos dois). As decisões são escutadas depois do commit do financeiro: uma
 * falha da frota não pode desfazer uma aprovação.</p>
 */
@Component
@RequiredArgsConstructor
public class OrcamentoFinanceiroListener {

    private final OrcamentoOrdemServicoUseCases orcamentos;
    private final FaturaPostoUseCases faturas;
    private final PagamentoDespesaUseCases despesas;
    private final PagamentoApoliceUseCases apolices;

    @EventListener
    @Transactional(propagation = Propagation.MANDATORY)
    public void aoCriarSolicitacao(SolicitacaoFinanceiraCriadaEvent event) {
        orcamentos.vincular(event);
        faturas.vincular(event);
        despesas.vincular(event);
        apolices.vincular(event);
    }

    @ApplicationModuleListener
    public void aoAprovarSolicitacao(SolicitacaoFinanceiraAprovadaEvent event) {
        orcamentos.registrarDecisao(event.idSolicitacao(), event.tipo(), event.numero(), true,
                event.valorAprovado(), null);
        despesas.registrarDecisao(event.idSolicitacao(), event.numero(), true, null);
        apolices.registrarDecisao(event.idSolicitacao(), event.numero(), true, null);
    }

    @ApplicationModuleListener
    public void aoRejeitarSolicitacao(SolicitacaoFinanceiraRejeitadaEvent event) {
        orcamentos.registrarDecisao(event.idSolicitacao(), event.tipo(), event.numero(), false,
                event.valor(), event.motivoRejeicao());
        despesas.registrarDecisao(event.idSolicitacao(), event.numero(), false, event.motivoRejeicao());
        apolices.registrarDecisao(event.idSolicitacao(), event.numero(), false, event.motivoRejeicao());
    }
}
