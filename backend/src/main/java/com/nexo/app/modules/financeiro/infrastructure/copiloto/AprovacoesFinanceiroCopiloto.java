package com.nexo.app.modules.financeiro.infrastructure.copiloto;

import com.nexo.app.modules.assistente.application.aprovacao.Decisao;
import com.nexo.app.modules.assistente.application.aprovacao.ProvedorAprovacoes;
import com.nexo.app.modules.assistente.application.aprovacao.SolicitacaoEmAprovacao;
import com.nexo.app.modules.financeiro.application.dto.SolicitacaoEmDecisaoResponse;
import com.nexo.app.modules.financeiro.application.usecases.AprovacoesFinanceiroUseCases;
import com.nexo.app.modules.financeiro.domain.TipoSolicitacao;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * O que a Bússola aprova no Financeiro: solicitações de compra e de pagamento, para quem tem a permissão de
 * aprovar de cada uma (a mesma da tela e do e-mail de decisão).
 */
@Configuration(proxyBeanMethods = false)
public class AprovacoesFinanceiroCopiloto {

    @Bean
    ProvedorAprovacoes aprovacoesCompraFinanceiro(AprovacoesFinanceiroUseCases useCases) {
        return new Fila(useCases, TipoSolicitacao.COMPRA, "compra", "Solicitação de compra", "financeiro:compra:aprovar");
    }

    @Bean
    ProvedorAprovacoes aprovacoesPagamentoFinanceiro(AprovacoesFinanceiroUseCases useCases) {
        return new Fila(useCases, TipoSolicitacao.PAGAMENTO, "pagamento", "Solicitação de pagamento",
                "financeiro:pagamento:aprovar");
    }

    private record Fila(AprovacoesFinanceiroUseCases useCases, TipoSolicitacao tipoSolicitacao, String tipo, String rotulo,
            String permissao) implements ProvedorAprovacoes {

        @Override
        public String modulo() {
            return "Financeiro";
        }

        @Override
        public Set<String> autoridades() {
            return Set.of(permissao);
        }

        @Override
        public List<SolicitacaoEmAprovacao> pendentes(int limite) {
            return useCases.pendentes(tipoSolicitacao, limite).stream().map(Fila::converter).toList();
        }

        @Override
        public Optional<SolicitacaoEmAprovacao> buscar(long numero) {
            return useCases.buscarPorNumero(tipoSolicitacao, numero).map(Fila::converter);
        }

        @Override
        public SolicitacaoEmAprovacao decidir(UUID id, Decisao decisao, UUID usuarioId) {
            return converter(decisao.acao() == Decisao.Acao.APROVAR
                    ? useCases.aprovar(tipoSolicitacao, id, decisao.valorAprovado(), decisao.texto(), usuarioId)
                    : useCases.rejeitar(tipoSolicitacao, id, decisao.texto(), usuarioId));
        }

        private static SolicitacaoEmAprovacao converter(SolicitacaoEmDecisaoResponse s) {
            return new SolicitacaoEmAprovacao(s.id(), s.numero(), s.titulo(), s.situacao(), s.aguardandoDecisao(),
                    s.solicitante(), s.fornecedor(), s.valor(), s.valorAprovado(), s.descricao(), s.base(), s.dataSubmissao(),
                    s.caminho(), s.ficha().stream().map(c -> new SolicitacaoEmAprovacao.Campo(c.rotulo(), c.valor())).toList());
        }
    }
}
