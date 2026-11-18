package com.nexo.app.modules.financeiro.application.usecases;

import com.nexo.app.modules.financeiro.application.dto.AprovacaoRequest;
import com.nexo.app.modules.financeiro.application.dto.SolicitacaoEmDecisaoResponse;
import com.nexo.app.modules.financeiro.application.dto.SolicitacaoEmDecisaoResponse.CampoFicha;
import com.nexo.app.modules.financeiro.domain.SolicitacaoBase;
import com.nexo.app.modules.financeiro.domain.StatusSolicitacao;
import com.nexo.app.modules.financeiro.domain.TipoSolicitacao;
import com.nexo.app.modules.financeiro.infrastructure.persistence.SolicitacaoCompraRepository;
import com.nexo.app.modules.financeiro.infrastructure.persistence.SolicitacaoPagamentoRepository;
import com.nexo.app.shared.application.notificacao.DetalhesNotificacao.Campo;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * A fila de decisão de compras e pagamentos para quem decide fora da tela (Bússola e IAs conectadas).
 *
 * <p>A decisão passa pelos mesmos casos de uso da tela e do e-mail: mesmas regras, histórico, avisos e
 * e-mails. Quem chama confere a permissão de aprovar; aqui fica só o que é do financeiro.</p>
 */
@Service
@RequiredArgsConstructor
public class AprovacoesFinanceiroUseCases {

    private final SolicitacaoCompraRepository compraRepository;
    private final SolicitacaoPagamentoRepository pagamentoRepository;
    private final SolicitacaoCompraUseCases compraUseCases;
    private final SolicitacaoPagamentoUseCases pagamentoUseCases;
    private final FichaSolicitacaoFinanceira ficha;

    /** As que aguardam aprovação, das mais antigas para as mais novas. */
    @Transactional(readOnly = true)
    public List<SolicitacaoEmDecisaoResponse> pendentes(TipoSolicitacao tipo, int limite) {
        var pagina = PageRequest.of(0, Math.max(1, limite));
        List<? extends SolicitacaoBase> lista = tipo == TipoSolicitacao.COMPRA
                ? compraRepository.findByStatusAndAtivoTrueOrderByDataSubmissaoAsc(StatusSolicitacao.SOLICITADO, pagina)
                : pagamentoRepository.findByStatusAndAtivoTrueOrderByDataSubmissaoAsc(StatusSolicitacao.SOLICITADO, pagina);
        return lista.stream().map(s -> montar(s, false)).toList();
    }

    @Transactional(readOnly = true)
    public Optional<SolicitacaoEmDecisaoResponse> buscarPorNumero(TipoSolicitacao tipo, long numero) {
        Optional<? extends SolicitacaoBase> achada = tipo == TipoSolicitacao.COMPRA
                ? compraRepository.findByNumero(numero) : pagamentoRepository.findByNumero(numero);
        return achada.filter(SolicitacaoBase::isAtivo).map(s -> montar(s, true));
    }

    @Transactional
    public SolicitacaoEmDecisaoResponse aprovar(TipoSolicitacao tipo, UUID id, BigDecimal valorAprovado, String observacao,
                                                UUID usuarioDecisaoId) {
        var request = new AprovacaoRequest(valorAprovado, observacao);
        if (tipo == TipoSolicitacao.COMPRA) {
            compraUseCases.aprovar(id, request, usuarioDecisaoId);
        } else {
            pagamentoUseCases.aprovar(id, request, usuarioDecisaoId);
        }
        return recarregar(tipo, id);
    }

    @Transactional
    public SolicitacaoEmDecisaoResponse rejeitar(TipoSolicitacao tipo, UUID id, String motivo, UUID usuarioDecisaoId) {
        if (tipo == TipoSolicitacao.COMPRA) {
            compraUseCases.rejeitar(id, motivo, usuarioDecisaoId);
        } else {
            pagamentoUseCases.rejeitar(id, motivo, usuarioDecisaoId);
        }
        return recarregar(tipo, id);
    }

    private SolicitacaoEmDecisaoResponse recarregar(TipoSolicitacao tipo, UUID id) {
        SolicitacaoBase solicitacao = tipo == TipoSolicitacao.COMPRA
                ? compraUseCases.buscarEntity(id) : pagamentoUseCases.buscarEntity(id);
        return montar(solicitacao, false);
    }

    private SolicitacaoEmDecisaoResponse montar(SolicitacaoBase s, boolean comFicha) {
        List<Campo> campos = ficha.montar(s);
        var nucleo = s.getNucleo();
        return new SolicitacaoEmDecisaoResponse(
                s.getId(),
                s.getTipoSolicitacao(),
                s.getNumero(),
                FichaSolicitacaoFinanceira.titulo(s),
                FichaSolicitacaoFinanceira.situacao(s.getStatus()),
                s.getStatus() == StatusSolicitacao.SOLICITADO,
                valor(campos, "Solicitante"),
                fornecedor(campos, nucleo.getFornecedorNome()),
                nucleo.getValor(),
                s.getValorAprovado(),
                nucleo.getDescricao(),
                valor(campos, "Base operacional"),
                s.getDataSubmissao(),
                FichaSolicitacaoFinanceira.caminho(s),
                comFicha ? campos.stream().map(c -> new CampoFicha(c.rotulo(), c.valor())).toList() : List.of());
    }

    /** O fornecedor como a tela mostra (o cadastrado, quando houver), sem a marca de não cadastrado. */
    private static String fornecedor(List<Campo> campos, String digitado) {
        String naFicha = valor(campos, "Fornecedor");
        return naFicha != null ? naFicha.replace(" (não cadastrado)", "") : digitado;
    }

    private static String valor(List<Campo> campos, String rotulo) {
        return campos.stream().filter(c -> rotulo.equals(c.rotulo())).map(Campo::valor).findFirst().orElse(null);
    }
}
