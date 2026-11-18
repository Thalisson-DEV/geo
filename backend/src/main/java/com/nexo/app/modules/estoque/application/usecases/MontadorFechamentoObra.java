package com.nexo.app.modules.estoque.application.usecases;

import com.nexo.app.modules.estoque.application.dto.FechamentoObraResponses;
import com.nexo.app.modules.estoque.application.services.ResolvedorAutorEventoSolicitacao;
import com.nexo.app.modules.estoque.domain.EfeitoEstoque;
import com.nexo.app.modules.estoque.domain.Estoque;
import com.nexo.app.modules.estoque.domain.ItemOperacaoSolicitacao;
import com.nexo.app.modules.estoque.domain.ItemSolicitacao;
import com.nexo.app.modules.estoque.domain.MotivoPendencia;
import com.nexo.app.modules.estoque.domain.OperacaoSolicitacaoMaterial;
import com.nexo.app.modules.estoque.domain.SituacaoFechamentoObra;
import com.nexo.app.modules.estoque.domain.SituacaoFechamentoSolicitacao;
import com.nexo.app.modules.estoque.domain.SolicitacaoMaterial;
import com.nexo.app.modules.estoque.domain.TipoOperacaoSolicitacao;
import com.nexo.app.modules.estoque.infrastructure.persistence.ItemOperacaoSolicitacaoRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.SolicitacaoMaterialRepository;
import com.nexo.app.modules.obras.ObraApi;
import com.nexo.app.modules.rh.ColaboradorApi;
import com.nexo.app.modules.rh.ResumoColaborador;
import com.nexo.app.modules.rh.SupervisorApi;
import com.nexo.app.modules.rh.SupervisorResponse;
import com.nexo.app.shared.infrastructure.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/** Monta as respostas do fechamento, resolvendo nomes de uma vez por página. */
@Component
@RequiredArgsConstructor
class MontadorFechamentoObra {

    static final String PERMISSAO_CRIAR = "obras:fechamento:create";
    static final String PERMISSAO_MOVIMENTAR = "obras:fechamento:movimentar";
    private static final Set<String> ORDENACAO_FORA_DO_BANCO = Set.of(
            "obra", "encarregado", "supervisor", "coordenador", "solicitante", "itens");

    private final SolicitacaoMaterialRepository solicitacaoRepository;
    private final ItemOperacaoSolicitacaoRepository itemOperacaoRepository;
    private final ObraApi obraApi;
    private final ColaboradorApi colaboradorApi;
    private final SupervisorApi supervisorApi;
    private final ResolvedorAutorEventoSolicitacao resolvedorAutor;

    /** Nomes e situações compartilhados por uma página inteira. */
    Contexto contexto(Collection<SolicitacaoMaterial> solicitacoes) {
        Set<UUID> obras = solicitacoes.stream().map(SolicitacaoMaterial::getIdObra)
                .filter(Objects::nonNull).collect(Collectors.toSet());
        Set<UUID> colaboradores = solicitacoes.stream().map(SolicitacaoMaterial::getIdEncarregado)
                .filter(Objects::nonNull).collect(Collectors.toSet());
        Set<UUID> supervisores = solicitacoes.stream().map(SolicitacaoMaterial::getIdSupervisor)
                .filter(Objects::nonNull).collect(Collectors.toSet());
        Set<UUID> usuarios = solicitacoes.stream().map(SolicitacaoMaterial::getIdRequisitante)
                .filter(Objects::nonNull).collect(Collectors.toSet());

        Map<UUID, FechamentoObraResponses.Obra> obrasPorId = new HashMap<>();
        obras.forEach(id -> obraApi.buscarPorId(id).ifPresent(obra -> obrasPorId.put(
                id, new FechamentoObraResponses.Obra(obra.id(), obra.numero(), obra.titulo()))));

        Map<UUID, ResumoColaborador> encarregados = colaboradores.isEmpty()
                ? Map.of() : colaboradorApi.buscarResumosPorIds(colaboradores);

        Map<UUID, SupervisorResponse> supervisoresPorId = new HashMap<>();
        supervisores.forEach(id -> supervisorApi.buscarPorIdResponse(id)
                .ifPresent(supervisor -> supervisoresPorId.put(id, supervisor)));

        Map<UUID, String> solicitantes = new HashMap<>();
        usuarios.forEach(id -> solicitantes.put(id, resolvedorAutor.nomeDoColaborador(id).orElse(null)));

        return new Contexto(obrasPorId, encarregados, supervisoresPorId, solicitantes,
                situacoesDasObras(obras), OffsetDateTime.now());
    }

    Map<UUID, SituacaoFechamentoObra> situacoesDasObras(Collection<UUID> idsObras) {
        if (idsObras.isEmpty()) {
            return Map.of();
        }
        return agruparSituacoes(solicitacaoRepository.contarSituacoesFechamentoPorObra(idsObras));
    }

    static Map<UUID, SituacaoFechamentoObra> agruparSituacoes(List<Object[]> linhas) {
        Map<UUID, Map<SituacaoFechamentoSolicitacao, Long>> porObra = new HashMap<>();
        for (Object[] linha : linhas) {
            UUID idObra = (UUID) linha[0];
            SituacaoFechamentoSolicitacao situacao = (SituacaoFechamentoSolicitacao) linha[1];
            if (idObra == null || situacao == null) {
                continue;
            }
            porObra.computeIfAbsent(idObra, chave -> new EnumMap<>(SituacaoFechamentoSolicitacao.class))
                    .merge(situacao, ((Number) linha[2]).longValue(), Long::sum);
        }
        Map<UUID, SituacaoFechamentoObra> resultado = new HashMap<>();
        porObra.forEach((idObra, contagem) -> resultado.put(
                idObra, SituacaoFechamentoObra.de(contagem.keySet(), false)));
        return resultado;
    }

    FechamentoObraResponses.Resumo resumo(SolicitacaoMaterial solicitacao, Contexto contexto) {
        BigDecimal solicitada = solicitacao.getItens().stream()
                .map(ItemSolicitacao::getQuantidade).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal movimentada = solicitacao.getItens().stream()
                .map(ItemSolicitacao::getQuantidadeOperadaLiquida).reduce(BigDecimal.ZERO, BigDecimal::add);
        SupervisorResponse supervisor = contexto.supervisores().get(solicitacao.getIdSupervisor());
        return new FechamentoObraResponses.Resumo(
                solicitacao.getId(),
                solicitacao.getVersao(),
                solicitacao.getTipoTecnico().getCodigo(),
                obra(solicitacao, contexto),
                solicitacao.getSituacaoFechamento(),
                contexto.situacoesObras().getOrDefault(solicitacao.getIdObra(), SituacaoFechamentoObra.SEM_SOLICITACOES),
                new FechamentoObraResponses.Prazo(
                        solicitacao.getPrazoVigenteAte(), solicitacao.situacaoPrazoVigente(contexto.agora())),
                solicitacao.possuiPendenciaFechamento(),
                solicitacao.getReserva() == null ? null : solicitacao.getReserva().getNumeroApi(),
                pessoa(solicitacao.getIdRequisitante(), contexto.solicitantes()),
                encarregado(solicitacao.getIdEncarregado(), contexto),
                supervisor(supervisor),
                coordenador(supervisor),
                solicitacao.getItens().size(),
                solicitada,
                movimentada,
                solicitacao.getDataSolicitacao(),
                estoque(solicitacao.getAlmoxarifadoAtendimento()),
                solicitacao.getMovimentacaoConcluidaEm(),
                acoes(solicitacao));
    }

    /** O que o usuário logado pode fazer com a solicitação no estado em que ela está. */
    private static FechamentoObraResponses.Acoes acoes(SolicitacaoMaterial solicitacao) {
        boolean podeCriar = SecurityUtils.possuiAutoridade(PERMISSAO_CRIAR);
        boolean podeMovimentar = SecurityUtils.possuiAutoridade(PERMISSAO_MOVIMENTAR);
        boolean aberta = aberta(solicitacao);
        return new FechamentoObraResponses.Acoes(
                podeCriar && editavel(solicitacao),
                podeCriar && aberta && solicitacao.getReserva() == null,
                podeCriar && aberta && solicitacao.getReserva() != null
                        && !solicitacao.reservaBloqueadaParaAlteracao(),
                (podeCriar || podeMovimentar) && aberta,
                podeCriar && aberta && !solicitacao.possuiQuantidadeMovimentadaFechamento()
                        && solicitacao.abertaPor(SecurityUtils.getUsuarioLogadoId()),
                podeMovimentar && aberta && solicitacao.getReserva() != null
                        && solicitacao.getItens().stream().anyMatch(item -> item.getQuantidadePendente().signum() > 0));
    }

    private static boolean aberta(SolicitacaoMaterial solicitacao) {
        return solicitacao.getSituacaoFechamento() != SituacaoFechamentoSolicitacao.CANCELADA;
    }

    private static boolean editavel(SolicitacaoMaterial solicitacao) {
        return aberta(solicitacao) && solicitacao.getSituacaoFechamento() != SituacaoFechamentoSolicitacao.MOVIMENTADA;
    }

    FechamentoObraResponses.Detalhe detalhe(SolicitacaoMaterial solicitacao, List<OperacaoSolicitacaoMaterial> operacoes) {
        Contexto contexto = contexto(List.of(solicitacao));
        SupervisorResponse supervisor = contexto.supervisores().get(solicitacao.getIdSupervisor());
        OffsetDateTime agora = contexto.agora();
        boolean podeMovimentar = SecurityUtils.possuiAutoridade(PERMISSAO_MOVIMENTAR);
        boolean aberta = aberta(solicitacao);
        boolean editavel = editavel(solicitacao);

        Map<UUID, String> operadores = new HashMap<>();
        operacoes.forEach(operacao -> operadores.computeIfAbsent(
                operacao.getIdUsuarioOperador(), id -> resolvedorAutor.nomeDoColaborador(id).orElse(null)));

        MotivoPendencia geral = solicitacao.getMotivoPendenciaGeral();
        return new FechamentoObraResponses.Detalhe(
                solicitacao.getId(),
                solicitacao.getVersao(),
                solicitacao.getTipoTecnico().getCodigo(),
                obra(solicitacao, contexto),
                estoque(solicitacao.getAlmoxarifadoAtendimento()),
                estoque(estoqueObra(solicitacao)),
                solicitacao.getSituacaoFechamento(),
                contexto.situacoesObras().getOrDefault(solicitacao.getIdObra(), SituacaoFechamentoObra.SEM_SOLICITACOES),
                new FechamentoObraResponses.Prazo(solicitacao.getPrazoReservaAte(), solicitacao.situacaoPrazoReserva(agora)),
                solicitacao.getPrazoMovimentacaoAte() == null ? null : new FechamentoObraResponses.Prazo(
                        solicitacao.getPrazoMovimentacaoAte(), solicitacao.situacaoPrazoMovimentacao(agora)),
                new FechamentoObraResponses.Prazo(solicitacao.getPrazoVigenteAte(), solicitacao.situacaoPrazoVigente(agora)),
                solicitacao.getReserva() == null ? null : new FechamentoObraResponses.Reserva(
                        solicitacao.getReserva().getNumeroApi(),
                        solicitacao.getReserva().getDataCriacao(),
                        solicitacao.getReserva().getRegistradaEm()),
                pessoa(solicitacao.getIdRequisitante(), contexto.solicitantes()),
                encarregado(solicitacao.getIdEncarregado(), contexto),
                supervisor(supervisor),
                coordenador(supervisor),
                solicitacao.getObservacao(),
                geral == null ? null : new FechamentoObraResponses.Pendencia(
                        geral.getId(), geral.getNome(), solicitacao.getJustificativaPendenciaGeral()),
                solicitacao.possuiPendenciaFechamento(),
                solicitacao.getDataSolicitacao(),
                solicitacao.getMovimentacaoConcluidaEm(),
                solicitacao.getCanceladaEm(),
                solicitacao.getMotivoCancelamento(),
                solicitacao.getItens().stream()
                        .sorted(java.util.Comparator.comparing(item -> item.getMaterial().getCodigo()))
                        .map(item -> item(item, editavel))
                        .toList(),
                operacoes.stream()
                        .sorted(java.util.Comparator.comparing(OperacaoSolicitacaoMaterial::getRealizadaEm).reversed())
                        .map(operacao -> movimentacao(operacao, operadores, podeMovimentar && aberta))
                        .toList(),
                acoes(solicitacao));
    }

    static Estoque estoqueObra(SolicitacaoMaterial solicitacao) {
        return solicitacao.getTipoTecnico().isAdicao() ? solicitacao.getEstoqueDestino() : solicitacao.getEstoqueOrigem();
    }

    private FechamentoObraResponses.Item item(ItemSolicitacao item, boolean editavel) {
        MotivoPendencia motivo = item.getMotivoPendencia();
        return new FechamentoObraResponses.Item(
                item.getId(),
                item.getMaterial().getId(),
                item.getMaterial().getCodigo(),
                item.getMaterial().getDescricao(),
                item.getMaterial().getUnidadeMedida(),
                item.getQuantidade(),
                item.getQuantidadeOperadaLiquida(),
                item.getQuantidadePendente().max(BigDecimal.ZERO),
                motivo == null ? null : new FechamentoObraResponses.Pendencia(
                        motivo.getId(), motivo.getNome(), item.getJustificativaPendencia()),
                editavel && !item.possuiFatoOperacional(),
                item.getMaterial().getEquivalencias().stream()
                        .map(e -> new com.nexo.app.modules.estoque.UnidadeEquivalenteResponse(
                                e.getUnidade(), e.getQuantidadeUnidade(), e.getQuantidadeBase(),
                                e.getQuantidadeBase().divide(e.getQuantidadeUnidade(), java.math.MathContext.DECIMAL64).stripTrailingZeros()))
                        .toList());
    }

    private FechamentoObraResponses.Movimentacao movimentacao(
            OperacaoSolicitacaoMaterial operacao,
            Map<UUID, String> operadores,
            boolean podeMovimentar
    ) {
        boolean movimentacao = operacao.getTipo() == TipoOperacaoSolicitacao.MOVIMENTACAO;
        List<FechamentoObraResponses.ItemMovimentacao> itens = operacao.getItens().stream()
                .map(item -> new FechamentoObraResponses.ItemMovimentacao(
                        item.getId(),
                        item.getItemSolicitacao().getId(),
                        item.getCodigoMaterialSnapshot(),
                        item.getDescricaoMaterialSnapshot(),
                        item.getQuantidade(),
                        movimentacao ? estornavel(item) : BigDecimal.ZERO))
                .toList();
        boolean temEstornavel = itens.stream().anyMatch(item -> item.quantidadeEstornavel().signum() > 0);
        return new FechamentoObraResponses.Movimentacao(
                operacao.getId(),
                operacao.getTipo(),
                operacao.getEfeitoEstoque(),
                operacao.getOperacaoOriginal() == null ? null : operacao.getOperacaoOriginal().getId(),
                operacao.getRealizadaEm(),
                new FechamentoObraResponses.Pessoa(operacao.getIdUsuarioOperador(), operadores.get(operacao.getIdUsuarioOperador())),
                operacao.getMotivo(),
                itens,
                podeMovimentar && movimentacao && temEstornavel);
    }

    BigDecimal estornavel(ItemOperacaoSolicitacao item) {
        BigDecimal estornada = Objects.requireNonNullElse(
                itemOperacaoRepository.somarQuantidadeEstornadaPorItemOriginal(item.getId()), BigDecimal.ZERO);
        return item.getQuantidade().subtract(estornada).max(BigDecimal.ZERO);
    }

    private static FechamentoObraResponses.Obra obra(SolicitacaoMaterial solicitacao, Contexto contexto) {
        return contexto.obras().getOrDefault(solicitacao.getIdObra(),
                new FechamentoObraResponses.Obra(solicitacao.getIdObra(), null, null));
    }

    private static FechamentoObraResponses.Estoque estoque(Estoque estoque) {
        return estoque == null ? null : new FechamentoObraResponses.Estoque(estoque.getId(), estoque.getNomeIdentificador());
    }

    private static FechamentoObraResponses.Pessoa pessoa(UUID id, Map<UUID, String> nomes) {
        return id == null ? null : new FechamentoObraResponses.Pessoa(id, nomes.get(id));
    }

    private static FechamentoObraResponses.Pessoa encarregado(UUID id, Contexto contexto) {
        if (id == null) {
            return null;
        }
        ResumoColaborador resumo = contexto.encarregados().get(id);
        return new FechamentoObraResponses.Pessoa(id, resumo == null ? null : resumo.nomeCompleto());
    }

    private static FechamentoObraResponses.Pessoa supervisor(SupervisorResponse supervisor) {
        if (supervisor == null) {
            return null;
        }
        String nome = supervisor.colaborador() == null ? null : supervisor.colaborador().nomeCompleto();
        return new FechamentoObraResponses.Pessoa(supervisor.id(), nome);
    }

    private static FechamentoObraResponses.Pessoa coordenador(SupervisorResponse supervisor) {
        return Optional.ofNullable(supervisor)
                .map(SupervisorResponse::coordenador)
                .map(coordenador -> new FechamentoObraResponses.Pessoa(
                        coordenador.id(),
                        coordenador.colaborador() == null ? null : coordenador.colaborador().nomeCompleto()))
                .orElse(null);
    }

    /** Campos que vêm de outros módulos ou são calculados: o banco não consegue ordenar por eles. */
    static boolean ordenaForaDoBanco(String campo) {
        return ORDENACAO_FORA_DO_BANCO.contains(campo);
    }

    /** Vazios ficam sempre no fim, nos dois sentidos; empate vai para a mais recente. */
    Comparator<SolicitacaoMaterial> comparador(String campo, boolean crescente, Contexto contexto) {
        Comparator<SolicitacaoMaterial> ordem = switch (campo) {
            case "itens" -> sentido(Comparator.comparingInt(solicitacao -> solicitacao.getItens().size()), crescente);
            default -> Comparator.comparing(solicitacao -> texto(campo, solicitacao, contexto),
                    Comparator.nullsLast(sentido(String.CASE_INSENSITIVE_ORDER, crescente)));
        };
        return ordem.thenComparing(SolicitacaoMaterial::getDataSolicitacao, Comparator.reverseOrder());
    }

    private static <T> Comparator<T> sentido(Comparator<T> ordem, boolean crescente) {
        return crescente ? ordem : ordem.reversed();
    }

    private static String texto(String campo, SolicitacaoMaterial solicitacao, Contexto contexto) {
        SupervisorResponse responsavel = contexto.supervisores().get(solicitacao.getIdSupervisor());
        return switch (campo) {
            case "obra" -> obra(solicitacao, contexto).numero();
            case "encarregado" -> encarregado(solicitacao.getIdEncarregado(), contexto) instanceof FechamentoObraResponses.Pessoa pessoa
                    ? pessoa.nome() : null;
            case "supervisor" -> supervisor(responsavel) instanceof FechamentoObraResponses.Pessoa pessoa ? pessoa.nome() : null;
            case "coordenador" -> coordenador(responsavel) instanceof FechamentoObraResponses.Pessoa pessoa ? pessoa.nome() : null;
            case "solicitante" -> contexto.solicitantes().get(solicitacao.getIdRequisitante());
            default -> null;
        };
    }

    static boolean efeitoFisico(OperacaoSolicitacaoMaterial operacao) {
        return operacao.getEfeitoEstoque() == EfeitoEstoque.FISICO;
    }

    record Contexto(
            Map<UUID, FechamentoObraResponses.Obra> obras,
            Map<UUID, ResumoColaborador> encarregados,
            Map<UUID, SupervisorResponse> supervisores,
            Map<UUID, String> solicitantes,
            Map<UUID, SituacaoFechamentoObra> situacoesObras,
            OffsetDateTime agora
    ) {
    }
}
