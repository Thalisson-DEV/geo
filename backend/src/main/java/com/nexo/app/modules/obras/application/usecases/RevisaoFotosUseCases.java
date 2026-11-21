package com.nexo.app.modules.obras.application.usecases;

import com.nexo.app.modules.obras.application.dto.RevisaoFotosDtos;
import com.nexo.app.modules.obras.domain.EvidenciaPonto;
import com.nexo.app.modules.obras.domain.Obra;
import com.nexo.app.modules.obras.domain.PontoPlanejamento;
import com.nexo.app.modules.obras.infrastructure.persistence.EvidenciaPontoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.EvidenciaPontoSpecification;
import com.nexo.app.modules.obras.infrastructure.persistence.ObraRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.PontoPlanejamentoRepository;
import com.nexo.app.modules.rh.EquipeApi;
import com.nexo.app.modules.rh.EquipeResponse;
import com.nexo.app.shared.application.dto.PageResponse;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Revisão das fotos de campo antes da medição: o escritório aprova ou reprova (com a inconformidade); a reprovada volta a
 * ser pendência para a equipe e não entra na medição. O ranking mede a qualidade das fotos por equipe.
 */
@Service
@RequiredArgsConstructor
public class RevisaoFotosUseCases {

    private static final ZoneId FUSO = ZoneId.of("America/Sao_Paulo");

    private final EvidenciaPontoRepository repository;
    private final ObraRepository obraRepository;
    private final PontoPlanejamentoRepository pontoRepository;
    private final EquipeApi equipeApi;

    @Transactional(readOnly = true)
    public PageResponse<RevisaoFotosDtos.FotoParaRevisao> listar(RevisaoFotosDtos.RevisaoFotoFilter filtro, Pageable pageable) {
        Page<EvidenciaPonto> pagina = repository.findAll(EvidenciaPontoSpecification.revisao(filtro), ordenada(pageable));
        List<EvidenciaPonto> fotos = pagina.getContent();
        Map<UUID, String> obras = obraRepository.findAllById(ids(fotos, EvidenciaPonto::getIdObra)).stream()
                .collect(Collectors.toMap(Obra::getId, Obra::getNumero));
        Map<UUID, String> pontos = pontoRepository.findAllById(ids(fotos, EvidenciaPonto::getIdPonto)).stream()
                .collect(Collectors.toMap(PontoPlanejamento::getId, PontoPlanejamento::getNumero));
        Map<UUID, String> equipes = codigos(ids(fotos, EvidenciaPonto::getIdEquipe));
        return PageResponse.fromPage(pagina.map(f -> new RevisaoFotosDtos.FotoParaRevisao(f.getId(), f.getIdObra(), obras.get(f.getIdObra()),
                f.getIdPonto(), pontos.get(f.getIdPonto()), f.getTituloItem(), f.getEtapa(), f.getLegenda(), f.momentoDaFoto(),
                f.getLatitude(), f.getLongitude(), f.getIdEquipe(), equipes.get(f.getIdEquipe()), f.getIdLocal() != null, f.getRevisao(),
                f.getInconformidade(), f.getInconformidade() != null ? f.getInconformidade().rotulo() : null, f.getMotivoReprovacao(),
                f.getRevisadaPor(), f.getRevisadaEm())));
    }

    @Transactional
    public RevisaoFotosDtos.FotoParaRevisao revisar(UUID id, RevisaoFotosDtos.Decisao decisao) {
        EvidenciaPonto foto = repository.findById(id).filter(EvidenciaPonto::isAtivo)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Foto não encontrada."));
        String usuario = usuarioAtual();
        if (Boolean.TRUE.equals(decisao.aprovar())) {
            foto.aprovar(usuario);
        } else {
            foto.reprovar(decisao.inconformidade(), decisao.motivo(), usuario);
        }
        repository.save(foto);
        return listar(new RevisaoFotosDtos.RevisaoFotoFilter(foto.getRevisao(), foto.getIdObra(), null, null, null, null), PageRequest.of(0, 500))
                .getContent().stream().filter(f -> f.id().equals(id)).findFirst().orElseThrow();
    }

    /** Qualidade das fotos do app por equipe no período (pelo dia em que a foto chegou). */
    @Transactional(readOnly = true)
    public List<RevisaoFotosDtos.LinhaRanking> ranking(LocalDate de, LocalDate ate) {
        LocalDate fim = ate != null ? ate : LocalDate.now(FUSO);
        LocalDate inicio = de != null ? de : fim.minusDays(30);
        List<EvidenciaPonto> fotos = repository.findAll((root, query, cb) -> cb.and(
                cb.isTrue(root.get("ativo")),
                cb.isNotNull(root.get("idEquipe")),
                cb.greaterThanOrEqualTo(root.get("dataCriacao"), inicio.atStartOfDay(FUSO).toOffsetDateTime()),
                cb.lessThan(root.get("dataCriacao"), fim.plusDays(1).atStartOfDay(FUSO).toOffsetDateTime())));
        Map<UUID, List<EvidenciaPonto>> porEquipe = fotos.stream().collect(Collectors.groupingBy(EvidenciaPonto::getIdEquipe));
        Map<UUID, String> equipes = codigos(porEquipe.keySet());
        return porEquipe.entrySet().stream().map(e -> {
            List<EvidenciaPonto> lista = e.getValue();
            long aprovadas = lista.stream().filter(f -> f.getRevisao() == EvidenciaPonto.Revisao.APROVADA).count();
            long reprovadas = lista.stream().filter(EvidenciaPonto::reprovada).count();
            long revisadas = aprovadas + reprovadas;
            BigDecimal percentual = revisadas == 0 ? null
                    : BigDecimal.valueOf(aprovadas * 100.0 / revisadas).setScale(1, RoundingMode.HALF_UP);
            String principal = lista.stream().map(EvidenciaPonto::getInconformidade).filter(Objects::nonNull)
                    .collect(Collectors.groupingBy(Function.identity(), Collectors.counting())).entrySet().stream()
                    .max(Map.Entry.comparingByValue()).map(x -> x.getKey().rotulo()).orElse(null);
            return new RevisaoFotosDtos.LinhaRanking(e.getKey(), equipes.getOrDefault(e.getKey(), "Equipe"), lista.size(), aprovadas, reprovadas,
                    lista.size() - revisadas, percentual, principal);
        }).sorted(Comparator.comparing((RevisaoFotosDtos.LinhaRanking l) -> l.percentualAprovacao() == null ? BigDecimal.valueOf(-1) : l.percentualAprovacao())
                .reversed().thenComparing(RevisaoFotosDtos.LinhaRanking::equipe)).toList();
    }

    public List<RevisaoFotosDtos.OpcaoInconformidade> inconformidades() {
        return Arrays.stream(EvidenciaPonto.Inconformidade.values()).map(i -> new RevisaoFotosDtos.OpcaoInconformidade(i, i.rotulo())).toList();
    }

    /** HashMap também quando vazio: foto antiga não tem equipe, e {@code Map.of().get(null)} lança NPE. */
    private Map<UUID, String> codigos(Collection<UUID> ids) {
        Map<UUID, String> codigos = new HashMap<>();
        if (ids.isEmpty()) {
            return codigos;
        }
        equipeApi.buscarPorIdsResponse(ids).forEach((EquipeResponse e) -> codigos.put(e.id(), e.codigo()));
        return codigos;
    }

    private static Set<UUID> ids(List<EvidenciaPonto> fotos, Function<EvidenciaPonto, UUID> campo) {
        return fotos.stream().map(campo).filter(Objects::nonNull).collect(Collectors.toSet());
    }

    /** Mais antigas primeiro (quem espera há mais tempo); aceita a ordenação da tabela por data. */
    private static Pageable ordenada(Pageable pageable) {
        Sort sort = pageable.getSort().isSorted()
                ? Sort.by(pageable.getSort().stream().map(o -> new Sort.Order(o.getDirection(), "dataFoto".equals(o.getProperty()) ? "dataCriacao" : "dataCriacao")).toList())
                : Sort.by("dataCriacao").ascending();
        return pageable.isUnpaged() ? PageRequest.of(0, 50, sort) : PageRequest.of(pageable.getPageNumber(), pageable.getPageSize(), sort.and(Sort.by("id")));
    }

    private static String usuarioAtual() {
        var autenticacao = SecurityContextHolder.getContext().getAuthentication();
        return autenticacao != null ? autenticacao.getName() : "sistema";
    }
}
