package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.domain.OrdemServico;
import com.nexo.app.modules.frota.domain.SolicitacaoOrdemServico;
import com.nexo.app.modules.frota.domain.TipoEventoOrdemServico;
import com.nexo.app.modules.frota.infrastructure.persistence.OrdemServicoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.SolicitacaoOrdemServicoRepository;
import com.nexo.app.shared.domain.events.FrotaOrcamentoOsDecididoEvent;
import com.nexo.app.shared.domain.events.SolicitacaoFinanceiraCriadaEvent;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import com.nexo.app.shared.infrastructure.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * O lado da frota nas compras e pagamentos abertos por uma OS: grava o vínculo quando o
 * financeiro cria a solicitação e registra as decisões no histórico da OS.
 */
@Service
@RequiredArgsConstructor
public class OrcamentoOrdemServicoUseCases {

    private final OrdemServicoRepository ordens;
    private final SolicitacaoOrdemServicoRepository vinculos;
    private final OrdemServicoUseCases ordemServico;
    private final ApplicationEventPublisher eventPublisher;

    /**
     * Roda dentro da transação da criação no financeiro: recusar aqui desfaz a criação, e
     * a pessoa vê o motivo na tela do financeiro.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void vincular(SolicitacaoFinanceiraCriadaEvent evento) {
        if (!OrdemServicoUseCases.ORIGEM_FINANCEIRO.equals(evento.origemTipo())) {
            return;
        }
        if (vinculos.findByIdSolicitacao(evento.idSolicitacao()).isPresent()) {
            return;
        }
        OrdemServico os = ordens.findById(evento.origemId())
                .filter(OrdemServico::isAtivo)
                .orElseThrow(() -> new RecursoNaoEncontradoException("A OS de origem não foi encontrada."));
        if (!os.aceitaOrcamento()) {
            throw new InvarianteVioladaException("A OS " + os.getNumero() + " está "
                    + os.getSituacao().getRotulo().toLowerCase() + " e não aceita novo orçamento.");
        }
        vinculos.save(new SolicitacaoOrdemServico(os.getId(), evento.idSolicitacao(), evento.tipo()));
        ordemServico.registrar(os, TipoEventoOrdemServico.ORCAMENTO_VINCULADO,
                ("PAGAMENTO".equals(evento.tipo()) ? "Solicitação de pagamento" : "Solicitação de compra")
                        + " aberta no financeiro.", SecurityUtils.getUsuarioLogadoId());
    }

    /** Decisão do financeiro sobre uma solicitação; ignora as que não vieram de OS. */
    @Transactional
    public void registrarDecisao(UUID idSolicitacao, String tipo, Long numero, boolean aprovada,
                                 BigDecimal valor, String motivo) {
        var vinculo = vinculos.findByIdSolicitacao(idSolicitacao).orElse(null);
        if (vinculo == null) {
            return;
        }
        OrdemServico os = ordens.findById(vinculo.getIdOrdemServico()).orElse(null);
        if (os == null) {
            return;
        }
        String documento = ("PAGAMENTO".equals(tipo) ? "Solicitação de pagamento" : "Solicitação de compra")
                + " nº " + numero;
        String descricao = aprovada
                ? documento + " aprovada" + (valor == null ? "." : " (" + moeda(valor) + ").")
                : documento + " reprovada" + (motivo == null || motivo.isBlank() ? "." : ": " + motivo);
        ordemServico.registrar(os, aprovada ? TipoEventoOrdemServico.ORCAMENTO_APROVADO
                : TipoEventoOrdemServico.ORCAMENTO_REPROVADO, descricao, null);
        eventPublisher.publishEvent(new FrotaOrcamentoOsDecididoEvent(os.getId(), os.getNumero(), os.identificacao(),
                aprovada ? "APROVADA" : "REPROVADA", tipo, numero, valor, os.getIdUsuarioAbertura(),
                OrdemServicoUseCases.link(os)));
    }

    /** NumberFormat não é thread-safe: um por chamada. */
    private static String moeda(BigDecimal valor) {
        return java.text.NumberFormat.getCurrencyInstance(java.util.Locale.of("pt", "BR")).format(valor);
    }
}
