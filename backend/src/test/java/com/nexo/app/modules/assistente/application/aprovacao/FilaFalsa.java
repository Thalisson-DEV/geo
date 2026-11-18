package com.nexo.app.modules.assistente.application.aprovacao;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/** Fila de aprovacao em memoria para os testes: guarda o que foi decidido e por quem. */
public final class FilaFalsa implements ProvedorAprovacoes {

    public record Decidida(long numero, Decisao decisao, UUID usuario) {
    }

    private final String tipo;
    private final String rotulo;
    private final String permissao;
    private final Map<Long, SolicitacaoEmAprovacao> solicitacoes = new LinkedHashMap<>();
    public final List<Decidida> decididas = new ArrayList<>();
    public final Set<Long> recusar = new HashSet<>();

    public FilaFalsa(String tipo, String rotulo, String permissao) {
        this.tipo = tipo;
        this.rotulo = rotulo;
        this.permissao = permissao;
    }

    public FilaFalsa com(long numero, String fornecedor, String valor, boolean aguardando) {
        String titulo = (tipo.equals("compra") ? "Compra" : "Pagamento") + " nº " + numero;
        solicitacoes.put(numero, new SolicitacaoEmAprovacao(UUID.randomUUID(), numero, titulo,
                aguardando ? "Aguardando aprovação" : "Aprovada", aguardando, "Maria Souza", fornecedor, new BigDecimal(valor),
                null, "Pecas para o caminhao", "Juazeiro", OffsetDateTime.now().minusDays(3), "/financeiro/x/" + numero,
                List.of(new SolicitacaoEmAprovacao.Campo("Fornecedor", fornecedor))));
        return this;
    }

    @Override
    public String tipo() {
        return tipo;
    }

    @Override
    public String rotulo() {
        return rotulo;
    }

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
        return solicitacoes.values().stream().filter(SolicitacaoEmAprovacao::aguardando).limit(limite).toList();
    }

    @Override
    public Optional<SolicitacaoEmAprovacao> buscar(long numero) {
        return Optional.ofNullable(solicitacoes.get(numero));
    }

    @Override
    public SolicitacaoEmAprovacao decidir(UUID id, Decisao decisao, UUID usuarioId) {
        SolicitacaoEmAprovacao s = solicitacoes.values().stream().filter(x -> x.id().equals(id)).findFirst().orElseThrow();
        if (recusar.contains(s.numero())) throw new IllegalStateException("Solicitação já decidida por outra pessoa.");
        decididas.add(new Decidida(s.numero(), decisao, usuarioId));
        BigDecimal aprovado = decisao.acao() == Decisao.Acao.APROVAR
                ? (decisao.valorAprovado() != null ? decisao.valorAprovado() : s.valor()) : null;
        SolicitacaoEmAprovacao nova = new SolicitacaoEmAprovacao(s.id(), s.numero(), s.titulo(),
                aprovado != null ? "Aprovada" : "Rejeitada", false, s.solicitante(), s.fornecedor(), s.valor(), aprovado,
                s.descricao(), s.base(), s.enviadaEm(), s.caminho(), s.ficha());
        solicitacoes.put(s.numero(), nova);
        return nova;
    }
}
