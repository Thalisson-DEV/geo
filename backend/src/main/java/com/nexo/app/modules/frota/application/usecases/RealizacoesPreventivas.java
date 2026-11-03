package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.domain.ControlePreventivo;
import com.nexo.app.modules.frota.domain.OrdemServico;
import com.nexo.app.modules.frota.domain.RealizacaoPreventiva;
import com.nexo.app.modules.frota.domain.SituacaoRealizacaoPreventiva;
import com.nexo.app.modules.frota.infrastructure.persistence.ControlePreventivoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.RealizacaoPreventivaRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Fecha o ciclo preventivo quando a OS ligada a ele termina: concluída, a realização vira a
 * base do próximo ciclo; cancelada, o controle volta a esperar uma OS com a base de antes.
 *
 * <p>Chamado pelo {@link OrdemServicoUseCases} na mesma transação da OS, para o controle
 * nunca ficar apontando para uma OS que já não está aberta.</p>
 */
@Component
@RequiredArgsConstructor
class RealizacoesPreventivas {

    private final RealizacaoPreventivaRepository realizacoes;
    private final ControlePreventivoRepository controles;
    private final OdometroUseCases odometro;

    void aoConcluir(OrdemServico os) {
        List<RealizacaoPreventiva> abertas = abertas(os);
        if (abertas.isEmpty()) return;
        Long km = os.getKmEncerramento() != null ? os.getKmEncerramento() : os.getKmAbertura();
        Long medicao;
        if (km != null) {
            medicao = odometro.acumuladoEm(os.getIdVeiculo(), km, os.getFimReal());
        } else {
            var atual = odometro.medicoesAtuais(List.of(os.getIdVeiculo())).get(os.getIdVeiculo());
            medicao = atual == null || atual.unidade() != os.getUnidadeMedicao() ? null : atual.acumulado();
        }
        var data = os.getFimReal().atZoneSameInstant(LiberacaoCnhUseCases.FUSO).toLocalDate();
        for (RealizacaoPreventiva realizacao : abertas) {
            realizacao.concluir(data, medicao, os.getUnidadeMedicao());
            ControlePreventivo controle = realizacao.getControle();
            controle.concluirRealizacao(realizacao);
            controles.save(controle);
        }
        realizacoes.saveAll(abertas);
    }

    void aoCancelar(OrdemServico os) {
        List<RealizacaoPreventiva> abertas = abertas(os);
        for (RealizacaoPreventiva realizacao : abertas) {
            realizacao.cancelar();
            ControlePreventivo controle = realizacao.getControle();
            controle.liberarRealizacao(realizacao);
            controles.save(controle);
        }
        realizacoes.saveAll(abertas);
    }

    private List<RealizacaoPreventiva> abertas(OrdemServico os) {
        if (os.getId() == null || !os.isVeicular()) return List.of();
        return realizacoes.findAllByIdOrdemServicoAndSituacaoAndAtivoTrue(os.getId(), SituacaoRealizacaoPreventiva.ABERTA);
    }
}
