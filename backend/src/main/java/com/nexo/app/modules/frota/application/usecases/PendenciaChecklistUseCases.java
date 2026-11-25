package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.listas.ListaConfiguravel;
import com.nexo.app.modules.listas.ListasApi;

import com.nexo.app.modules.frota.application.dto.AbrirOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.AbrirOsPendenciasRequest;
import com.nexo.app.modules.frota.application.dto.ConcluirOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.FotoChecklistResponse;
import com.nexo.app.modules.frota.application.dto.JustificativaRequest;
import com.nexo.app.modules.frota.application.dto.OrdemServicoDetalheResponse;
import com.nexo.app.modules.frota.application.dto.PendenciaChecklistFilter;
import com.nexo.app.modules.frota.application.dto.PendenciaChecklistResponse;
import com.nexo.app.modules.frota.application.dto.ResolverPendenciasRequest;
import com.nexo.app.modules.frota.application.dto.ServicoOrdemServicoRequest;
import com.nexo.app.modules.frota.domain.Checklist;
import com.nexo.app.modules.frota.domain.Criticidade;
import com.nexo.app.modules.frota.domain.FotoChecklist;
import com.nexo.app.modules.frota.domain.OrdemServico;
import com.nexo.app.modules.frota.domain.OrigemOrdemServico;
import com.nexo.app.modules.frota.domain.PendenciaChecklist;
import com.nexo.app.modules.frota.domain.TipoManutencao;
import com.nexo.app.modules.frota.domain.TipoOficina;
import com.nexo.app.modules.frota.infrastructure.persistence.ChecklistRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.OrdemServicoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.PendenciaChecklistRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.PendenciaChecklistSpecification;
import com.nexo.app.shared.application.dto.PageResponse;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import com.nexo.app.shared.infrastructure.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Fila de Não OK do checklist e as decisões do gestor: abrir OS, registrar que foi resolvido
 * na hora (OS já concluída) ou descartar o que foi marcado por engano.
 */
@Service
@RequiredArgsConstructor
public class PendenciaChecklistUseCases {

    private static final DateTimeFormatter DIA_HORA = DateTimeFormatter.ofPattern("dd/MM HH:mm");
    private static final int LIMITE_DESCRICAO_OS = 2000;
    private static final int LIMITE_SERVICO = 300;

    private final PendenciaChecklistRepository repository;
    private final ChecklistRepository checklists;
    private final OrdemServicoUseCases ordens;
    private final OrdemServicoRepository ordemRepository;
    private final ExecucaoOrdemServicoUseCases execucao;
    private final ReferenciasFrota referencias;
    private final HistoricoChecklist historico;
    private final ListasApi listasApi;

    @Transactional(readOnly = true)
    public PageResponse<PendenciaChecklistResponse> listar(PendenciaChecklistFilter filtro, Pageable pageable) {
        var pagina = repository.findAll(PendenciaChecklistSpecification.of(filtro), pageable);
        return PageResponse.fromPage(new PageImpl<>(montar(pagina.getContent()), pageable, pagina.getTotalElements()));
    }

    @Transactional
    public OrdemServicoDetalheResponse abrirOs(AbrirOsPendenciasRequest request) {
        var pendencias = abertasDoMesmoVeiculo(request.idsPendencia());
        var checklist = checklistDe(pendencias);
        var descricao = descricao(pendencias, request.observacao());
        var os = ordens.abrir(new AbrirOrdemServicoRequest(pendencias.getFirst().getIdVeiculo(), TipoManutencao.CORRETIVA,
                OrigemOrdemServico.CHECKLIST, request.criticidade() == null ? Criticidade.MEDIA : request.criticidade(),
                null, descricao, request.idsItem(), checklist.getIdCondutor(), null, null, request.tipoOficina(),
                request.idFornecedor(), request.oficinaNome(), null));
        var agora = OffsetDateTime.now();
        var usuario = SecurityUtils.getUsuarioLogadoId();
        pendencias.forEach(p -> p.encaminharParaOs(os.ordem().id(), usuario, agora));
        repository.saveAll(pendencias);
        return os;
    }

    /** Abre e conclui a OS no mesmo passo: o histórico do veículo guarda o que foi feito e por quem. */
    @Transactional
    public OrdemServicoDetalheResponse resolverNaHora(ResolverPendenciasRequest request) {
        boolean temExecutor = request.idExecutor() != null;
        boolean temNome = request.executorNome() != null && !request.executorNome().isBlank();
        if (temExecutor == temNome) {
            throw new InvarianteVioladaException("Informe quem fez o serviço: um colaborador ou o nome de quem fez.");
        }
        if (temExecutor && !referencias.colaboradorAtivo(request.idExecutor())) {
            throw new InvarianteVioladaException("Colaborador não encontrado ou desligado.");
        }
        var pendencias = abertasDoMesmoVeiculo(request.idsPendencia());
        var checklist = checklistDe(pendencias);
        var tipoOficina = temExecutor ? TipoOficina.INTERNA : TipoOficina.EXTERNA;
        var oficinaNome = temExecutor ? null : request.executorNome().trim();
        var agora = OffsetDateTime.now();

        var aberta = ordens.abrir(new AbrirOrdemServicoRequest(pendencias.getFirst().getIdVeiculo(), TipoManutencao.CORRETIVA,
                OrigemOrdemServico.CHECKLIST, Criticidade.BAIXA, null, descricao(pendencias, null), request.idsItem(),
                checklist.getIdCondutor(), agora, null, tipoOficina, null, oficinaNome, false));
        UUID idOs = aberta.ordem().id();
        if (temExecutor) {
            execucao.lancarServico(idOs, new ServicoOrdemServicoRequest(limitar(request.descricaoServico(), LIMITE_SERVICO),
                    request.idsItem().getFirst(), request.idExecutor(), null, BigDecimal.ONE, BigDecimal.ZERO));
        }
        var servico = request.descricaoServico().trim() + baseDoServico(request.idBaseOperacional());
        var concluida = ordens.concluir(idOs, new ConcluirOrdemServicoRequest(agora, agora, servico, null,
                BigDecimal.ZERO, null, tipoOficina, null, oficinaNome, null,
                request.causa() == null || request.causa().isBlank() ? "SERVICO_CORRETIVO"
                        : listasApi.exigirAtiva(ListaConfiguravel.CAUSA_MANUTENCAO, request.causa())));

        var usuario = SecurityUtils.getUsuarioLogadoId();
        pendencias.forEach(p -> p.resolverNaHora(idOs, usuario, agora));
        repository.saveAll(pendencias);
        return concluida;
    }

    @Transactional
    public PendenciaChecklistResponse descartar(UUID id, JustificativaRequest request) {
        var pendencia = repository.findById(id)
                .filter(PendenciaChecklist::isAtivo)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Pendência não encontrada."));
        pendencia.descartar(request.justificativa(), SecurityUtils.getUsuarioLogadoId(), OffsetDateTime.now());
        return montar(List.of(repository.save(pendencia))).getFirst();
    }

    private List<PendenciaChecklist> abertasDoMesmoVeiculo(Collection<UUID> ids) {
        var pendencias = repository.findAllById(ids.stream().distinct().toList()).stream()
                .filter(PendenciaChecklist::isAtivo).toList();
        if (pendencias.size() != ids.stream().distinct().count()) {
            throw new RecursoNaoEncontradoException("Alguma pendência escolhida não foi encontrada.");
        }
        if (pendencias.stream().map(PendenciaChecklist::getIdVeiculo).distinct().count() > 1) {
            throw new InvarianteVioladaException("Escolha pendências de um único veículo para a mesma OS.");
        }
        pendencias.stream().filter(p -> !p.isAberta()).findFirst().ifPresent(p -> {
            throw new InvarianteVioladaException("A pendência \"" + p.getResposta().resumo() + "\" já foi tratada.");
        });
        return pendencias;
    }

    /** Checklist mais recente entre as pendências: dele vem o condutor da OS. */
    private Checklist checklistDe(List<PendenciaChecklist> pendencias) {
        return checklists.findAllById(pendencias.stream().map(PendenciaChecklist::getIdChecklist).distinct().toList()).stream()
                .max(java.util.Comparator.comparing(Checklist::getPreenchidoEm))
                .orElseThrow(() -> new RecursoNaoEncontradoException("Checklist da pendência não encontrado."));
    }

    /** "Faróis — Queimado: lado esquerdo (checklist de 15/10 07:12, Maria)", uma linha por pendência. */
    private String descricao(List<PendenciaChecklist> pendencias, String observacao) {
        var porId = checklists.findAllById(pendencias.stream().map(PendenciaChecklist::getIdChecklist).distinct().toList())
                .stream().collect(Collectors.toMap(Checklist::getId, Function.identity()));
        var condutores = referencias.nomesColaboradores(porId.values().stream().map(Checklist::getIdCondutor)
                .filter(java.util.Objects::nonNull).toList());
        var linhas = pendencias.stream().map(p -> {
            var c = porId.get(p.getIdChecklist());
            var r = p.getResposta();
            var quem = c.getIdCondutor() == null ? c.getFinalidade().getRotulo().toLowerCase()
                    : condutores.getOrDefault(c.getIdCondutor(), "condutor");
            return r.resumo() + (r.getComentario() == null ? "" : ": " + r.getComentario())
                    + " (checklist de " + DIA_HORA.format(c.getPreenchidoEm().atZoneSameInstant(LiberacaoCnhUseCases.FUSO))
                    + ", " + quem + ")";
        }).collect(Collectors.joining("; "));
        var texto = observacao == null || observacao.isBlank() ? linhas : linhas + ". " + observacao.trim();
        return limitar(texto, LIMITE_DESCRICAO_OS);
    }

    private String baseDoServico(UUID idBase) {
        if (idBase == null) return "";
        var nome = referencias.nomesBases(List.of(idBase)).get(idBase);
        if (nome == null) {
            throw new InvarianteVioladaException("Base operacional não encontrada.");
        }
        return " (feito na base " + nome + ")";
    }

    private List<PendenciaChecklistResponse> montar(List<PendenciaChecklist> pendencias) {
        Map<UUID, Checklist> porId = checklists.findAllById(pendencias.stream().map(PendenciaChecklist::getIdChecklist).distinct().toList())
                .stream().collect(Collectors.toMap(Checklist::getId, Function.identity()));
        var condutores = referencias.nomesColaboradores(porId.values().stream().map(Checklist::getIdCondutor).distinct().toList());
        var bases = referencias.nomesBases(pendencias.stream().map(PendenciaChecklist::getIdBaseOperacional)
                .filter(Objects::nonNull).distinct().toList());
        var logins = referencias.loginsUsuarios(pendencias.stream().map(PendenciaChecklist::getIdUsuarioDecisao)
                .filter(Objects::nonNull).distinct().toList());
        Map<UUID, Long> numeros = ordemRepository.findAllById(pendencias.stream().map(PendenciaChecklist::getIdOrdemServico)
                        .filter(Objects::nonNull).distinct().toList()).stream()
                .collect(Collectors.toMap(OrdemServico::getId, OrdemServico::getNumero));

        return pendencias.stream().map(p -> {
            var c = porId.get(p.getIdChecklist());
            var r = p.getResposta();
            var fotos = c.getFotos().stream()
                    .filter(f -> f.getResposta() != null && f.getResposta().getId().equals(r.getId()))
                    .toList();
            return new PendenciaChecklistResponse(
                    p.getId(),
                    p.getSituacao(),
                    p.getSituacao().getRotulo(),
                    c.getId(),
                    c.getPreenchidoEm(),
                    p.getIdVeiculo(),
                    c.getPlaca(),
                    p.getIdBaseOperacional() == null ? null : bases.get(p.getIdBaseOperacional()),
                    c.getIdCondutor() == null ? null : condutores.get(c.getIdCondutor()),
                    r.getGrupo(),
                    r.getPerguntaTexto(),
                    r.resumo(),
                    r.getComentario(),
                    fotos.stream().map(PendenciaChecklistUseCases::foto).toList(),
                    (int) fotos.stream().filter(f -> !f.isRecebida()).count(),
                    p.getIdOrdemServico(),
                    p.getIdOrdemServico() == null ? null : numeros.get(p.getIdOrdemServico()),
                    p.getJustificativa(),
                    p.getIdUsuarioDecisao() == null ? null : logins.get(p.getIdUsuarioDecisao()),
                    p.getDecididaEm(),
                    // Em aberto: o histórico vai até agora (conta os Não OK repetidos depois); decidida: até o checklist.
                    historico.porPergunta(p.getIdVeiculo(), List.of(r.getPergunta().getId()),
                                    p.isAberta() ? OffsetDateTime.now() : c.getPreenchidoEm())
                            .get(r.getPergunta().getId()));
        }).toList();
    }

    static FotoChecklistResponse foto(FotoChecklist f) {
        return new FotoChecklistResponse(f.getId(), f.getTipo(), f.getDescricao(), f.isRecebida());
    }

    private static String limitar(String texto, int max) {
        var t = texto.trim();
        return t.length() <= max ? t : t.substring(0, max - 1) + "…";
    }
}
