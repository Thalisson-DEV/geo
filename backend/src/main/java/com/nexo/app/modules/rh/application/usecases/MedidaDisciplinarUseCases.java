package com.nexo.app.modules.rh.application.usecases;

import com.nexo.app.modules.rh.ColaboradorApi;
import com.nexo.app.modules.rh.MedidaDisciplinarApi;
import com.nexo.app.modules.rh.ResumoColaborador;
import com.nexo.app.modules.rh.ResumoMedidaDisciplinar;
import com.nexo.app.modules.rh.application.dto.CancelarMedidaDisciplinarRequest;
import com.nexo.app.modules.rh.application.dto.MedidaDisciplinarFilter;
import com.nexo.app.modules.rh.application.dto.MedidaDisciplinarRequest;
import com.nexo.app.modules.rh.application.dto.MedidaDisciplinarResponse;
import com.nexo.app.modules.rh.application.dto.ReincidenciaMedidaDisciplinarResponse;
import com.nexo.app.modules.rh.domain.AnexoMedidaDisciplinar;
import com.nexo.app.modules.rh.domain.HistoricoMedidaDisciplinar;
import com.nexo.app.modules.rh.domain.MedidaDisciplinar;
import com.nexo.app.modules.rh.domain.OrigemMedidaDisciplinar;
import com.nexo.app.modules.rh.domain.SituacaoMedidaDisciplinar;
import com.nexo.app.modules.rh.domain.TipoEventoMedidaDisciplinar;
import com.nexo.app.modules.rh.infrastructure.persistence.AnexoMedidaDisciplinarRepository;
import com.nexo.app.modules.rh.infrastructure.persistence.BaseOperacionalRepository;
import com.nexo.app.modules.rh.infrastructure.persistence.ColaboradorRepository;
import com.nexo.app.modules.rh.infrastructure.persistence.HistoricoMedidaDisciplinarRepository;
import com.nexo.app.modules.rh.infrastructure.persistence.MedidaDisciplinarRepository;
import com.nexo.app.modules.rh.infrastructure.persistence.MedidaDisciplinarSpecification;
import com.nexo.app.shared.application.dto.PageResponse;
import com.nexo.app.shared.domain.events.MedidaDisciplinarCriadaEvent;
import com.nexo.app.shared.domain.events.RhMedidaDisciplinarAplicadaEvent;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import com.nexo.app.shared.infrastructure.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Medidas disciplinares: lançamento da medida já aplicada, correção, cancelamento, listagem,
 * reincidência e a API pública para outros módulos. Anexos ficam em
 * {@link AnexoMedidaDisciplinarUseCases}.
 */
@Service
@RequiredArgsConstructor
public class MedidaDisciplinarUseCases implements MedidaDisciplinarApi {

    static final ZoneId FUSO = ZoneId.of("America/Sao_Paulo");
    static final DateTimeFormatter DATA = DateTimeFormatter.ofPattern("dd/MM/yyyy", Locale.of("pt", "BR"));
    private static final List<SituacaoMedidaDisciplinar> CONTAM_REINCIDENCIA = List.of(SituacaoMedidaDisciplinar.APLICADA);

    private final MedidaDisciplinarRepository repository;
    private final HistoricoMedidaDisciplinarRepository historicos;
    private final AnexoMedidaDisciplinarRepository anexos;
    private final ColaboradorRepository colaboradores;
    private final BaseOperacionalRepository bases;
    private final ColaboradorApi colaboradorApi;
    private final TipoMedidaDisciplinarUseCases tipos;
    private final MotivoMedidaDisciplinarUseCases motivos;
    private final ParametrosRhUseCases parametros;
    private final ApplicationEventPublisher eventos;

    // ── Consulta ────────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public PageResponse<MedidaDisciplinarResponse> listar(MedidaDisciplinarFilter filtro, Pageable pageable) {
        Page<MedidaDisciplinar> pagina = repository.findAll(especificacao(filtro), pageable);
        return PageResponse.fromPage(new PageImpl<>(montar(pagina.getContent(), false), pageable, pagina.getTotalElements()));
    }

    @Transactional(readOnly = true)
    public MedidaDisciplinarResponse buscarPorId(UUID id) {
        return detalhar(buscarEntidade(id));
    }

    /**
     * Medidas aplicadas ou cientes do colaborador com o mesmo motivo, dentro da janela contada da
     * data do fato, e o tipo logo acima da gravidade da mais recente.
     */
    @Transactional(readOnly = true)
    public ReincidenciaMedidaDisciplinarResponse reincidencia(UUID idColaborador, UUID idMotivo, LocalDate dataFato, UUID idIgnorar) {
        var p = parametros.entidade();
        if (idColaborador == null || idMotivo == null) {
            return new ReincidenciaMedidaDisciplinarResponse(p.getJanelaReincidenciaMeses(), p.getDiasImediatidade(), List.of(),
                    null, null, null);
        }
        LocalDate referencia = dataFato != null ? dataFato : hoje();
        var anteriores = repository.anteriores(idColaborador, idMotivo, referencia.minusMonths(p.getJanelaReincidenciaMeses()),
                        CONTAM_REINCIDENCIA).stream()
                .filter(m -> !m.getId().equals(idIgnorar))
                .filter(m -> !m.getDataFato().isAfter(referencia))
                .toList();
        if (anteriores.isEmpty()) {
            return new ReincidenciaMedidaDisciplinarResponse(p.getJanelaReincidenciaMeses(), p.getDiasImediatidade(), List.of(),
                    null, null, null);
        }
        int gravidadeUltima = anteriores.get(0).getTipo().getGravidade();
        var sugerido = tipos.acimaDe(gravidadeUltima);
        return new ReincidenciaMedidaDisciplinarResponse(p.getJanelaReincidenciaMeses(), p.getDiasImediatidade(),
                anteriores.stream().map(m -> new ReincidenciaMedidaDisciplinarResponse.Anterior(m.getId(), m.getTipo().getNome(),
                        m.getTipo().getGravidade(), m.getDataFato(), m.getDataAplicacao(), m.getSituacao().getRotulo())).toList(),
                gravidadeUltima, sugerido.map(t -> t.getId()).orElse(null), sugerido.map(t -> t.getNome()).orElse(null));
    }

    @Override
    @Transactional(readOnly = true)
    public Map<UUID, ResumoMedidaDisciplinar> resumos(Collection<UUID> ids) {
        if (ids == null || ids.isEmpty()) return Map.of();
        var distintos = ids.stream().filter(Objects::nonNull).distinct().toList();
        if (distintos.isEmpty()) return Map.of();
        return repository.findAllByIdIn(distintos).stream().collect(Collectors.toMap(MedidaDisciplinar::getId,
                m -> new ResumoMedidaDisciplinar(m.getId(), m.getSituacao().name(), m.getSituacao().getRotulo(), m.getTipo().getNome(),
                        m.getTipo().getGravidade(), m.getDataFato(), m.getDataAplicacao())));
    }

    // ── Ciclo ───────────────────────────────────────────────────────────────────────

    /**
     * Lança a medida que já foi aplicada ao colaborador e avisa que ela foi aplicada. Com origem (ex.: a multa da frota), publica
     * {@link MedidaDisciplinarCriadaEvent} na mesma transação: quem reconhece a origem grava o
     * vínculo, e uma recusa desfaz a criação.
     */
    @Transactional
    public MedidaDisciplinarResponse registrar(MedidaDisciplinarRequest request) {
        var dados = dados(request);
        UUID usuario = SecurityUtils.getUsuarioLogadoId();
        OffsetDateTime agora = OffsetDateTime.now(FUSO);
        MedidaDisciplinar medida = request.origem() == null
                ? MedidaDisciplinar.registrar(dados, usuario, agora)
                : MedidaDisciplinar.registrarPorOrigem(dados, origem(request.origem().tipo()), request.origem().id(), usuario, agora);
        medida = repository.save(medida);
        registrarHistorico(medida, TipoEventoMedidaDisciplinar.REGISTRADA,
                medida.getTipo().getNome() + " por " + medida.getMotivo().getNome().toLowerCase(Locale.ROOT)
                        + (medida.getOrigem() == OrigemMedidaDisciplinar.MANUAL ? "" : " (" + medida.getOrigem().getRotulo().toLowerCase(Locale.ROOT) + ")")
                        + ", aplicada em " + DATA.format(medida.getDataAplicacao()) + ".");
        if (medida.getIdOrigem() != null) {
            eventos.publishEvent(new MedidaDisciplinarCriadaEvent(medida.getId(), medida.getIdColaborador(),
                    medida.getOrigem().name(), medida.getIdOrigem()));
        }
        var colaborador = colaboradorApi.buscarResumosPorIds(List.of(medida.getIdColaborador())).get(medida.getIdColaborador());
        eventos.publishEvent(new RhMedidaDisciplinarAplicadaEvent(medida.getId(), colaborador == null ? "colaborador" : colaborador.nomeCompleto(),
                medida.getTipo().getNome(), medida.getMotivo().getNome(), nomeBase(medida.getIdBaseOperacional()),
                DATA.format(medida.getDataFato()), link(medida), usuario));
        return detalhar(medida);
    }

    @Transactional
    public MedidaDisciplinarResponse editar(UUID id, MedidaDisciplinarRequest request) {
        var medida = buscarEntidade(id);
        medida.editar(dados(request), hoje());
        repository.save(medida);
        registrarHistorico(medida, TipoEventoMedidaDisciplinar.EDITADA, "Dados da medida corrigidos.");
        return detalhar(medida);
    }

    @Transactional
    public MedidaDisciplinarResponse cancelar(UUID id, CancelarMedidaDisciplinarRequest request) {
        var medida = buscarEntidade(id);
        medida.cancelar(request == null ? null : request.justificativa(), SecurityUtils.getUsuarioLogadoId(), OffsetDateTime.now(FUSO));
        repository.save(medida);
        registrarHistorico(medida, TipoEventoMedidaDisciplinar.CANCELADA, "Cancelada: " + medida.getJustificativaCancelamento());
        return detalhar(medida);
    }

    // ── Apoio ───────────────────────────────────────────────────────────────────────

    MedidaDisciplinar buscarEntidade(UUID id) {
        return repository.findById(id).orElseThrow(() -> new RecursoNaoEncontradoException("Medida disciplinar não encontrada."));
    }

    void registrarHistorico(MedidaDisciplinar medida, TipoEventoMedidaDisciplinar tipo, String descricao) {
        historicos.save(new HistoricoMedidaDisciplinar(medida.getId(), tipo, descricao, SecurityUtils.getUsuarioLogadoId(),
                OffsetDateTime.now(FUSO)));
    }

    /** Detalhe com histórico e anexos. */
    MedidaDisciplinarResponse detalhar(MedidaDisciplinar medida) {
        return montar(List.of(medida), true).get(0);
    }

    static LocalDate hoje() {
        return LocalDate.now(FUSO);
    }

    static String link(MedidaDisciplinar medida) {
        return "/rh/medidas-disciplinares?medida=" + medida.getId();
    }

    String nomeBase(UUID idBase) {
        if (idBase == null) return "sem base";
        return bases.findById(idBase).map(b -> b.getNome()).orElse("sem base");
    }

    private MedidaDisciplinar.Dados dados(MedidaDisciplinarRequest r) {
        var colaborador = colaboradores.findById(r.idColaborador())
                .orElseThrow(() -> new InvarianteVioladaException("Colaborador não encontrado."));
        return new MedidaDisciplinar.Dados(colaborador.getId(),
                colaborador.getBaseOperacional() == null ? null : colaborador.getBaseOperacional().getId(),
                tipos.buscarEntidade(r.idTipo()), motivos.buscarEntidade(r.idMotivo()), r.dataFato(), r.dataAplicacao(),
                r.descricao(), r.diasSuspensao(), r.inicioSuspensao());
    }

    private static OrigemMedidaDisciplinar origem(String tipo) {
        try {
            return OrigemMedidaDisciplinar.valueOf(tipo.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new InvarianteVioladaException("Origem da medida não reconhecida: " + tipo + ".");
        }
    }

    private Specification<MedidaDisciplinar> especificacao(MedidaDisciplinarFilter f) {
        var filtro = f == null ? MedidaDisciplinarFilter.vazio() : f;
        Collection<UUID> idsColaborador = null;
        if (filtro.idColaborador() != null) {
            idsColaborador = List.of(filtro.idColaborador());
        } else if (StringUtils.hasText(filtro.busca())) {
            idsColaborador = colaboradorApi.buscarIdsPorTrechoDoNome(filtro.busca().trim());
        }
        return MedidaDisciplinarSpecification.of(idsColaborador, filtro.idsBase(), filtro.idsTipo(), filtro.idsMotivo(),
                filtro.situacoes(), filtro.origens(), filtro.de(), filtro.ate());
    }

    private List<MedidaDisciplinarResponse> montar(List<MedidaDisciplinar> medidas, boolean detalhe) {
        if (medidas.isEmpty()) return List.of();
        var p = parametros.entidade();
        Map<UUID, ResumoColaborador> pessoas = colaboradorApi.buscarResumosPorIds(
                medidas.stream().map(MedidaDisciplinar::getIdColaborador).toList());
        var idsBase = medidas.stream().map(MedidaDisciplinar::getIdBaseOperacional).filter(Objects::nonNull).distinct().toList();
        Map<UUID, String> nomesBase = bases.findAllById(idsBase).stream().collect(Collectors.toMap(b -> b.getId(), b -> b.getNome()));
        Map<UUID, List<AnexoMedidaDisciplinar>> anexosPorMedida = anexos.findAllByIdMedidaInAndAtivoTrue(
                medidas.stream().map(MedidaDisciplinar::getId).toList()).stream()
                .collect(Collectors.groupingBy(AnexoMedidaDisciplinar::getIdMedida));
        Map<UUID, String> usuarios = new HashMap<>();
        return medidas.stream().map(m -> {
            var pessoa = pessoas.get(m.getIdColaborador());
            var anexosMedida = anexosPorMedida.getOrDefault(m.getId(), List.of());
            List<MedidaDisciplinarResponse.Anexo> listaAnexos = !detalhe ? List.of() : anexosMedida.stream()
                    .sorted(java.util.Comparator.comparing(AnexoMedidaDisciplinar::getDataCriacao))
                    .map(a -> new MedidaDisciplinarResponse.Anexo(a.getId(), a.getArquivoNome(), a.getArquivoContentType(),
                            a.getArquivoTamanhoBytes(), a.getArquivoSha256(), a.getDataCriacao()))
                    .toList();
            List<MedidaDisciplinarResponse.Evento> eventosMedida = !detalhe ? List.of()
                    : historicos.findAllByIdMedidaOrderByOcorridoEmAsc(m.getId()).stream()
                    .map(h -> new MedidaDisciplinarResponse.Evento(h.getTipo(), h.getTipo().getRotulo(), h.getDescricao(),
                            nomeUsuario(h.getIdUsuario(), usuarios), h.getOcorridoEm()))
                    .toList();
            return new MedidaDisciplinarResponse(
                    m.getId(), m.getIdColaborador(), pessoa == null ? null : pessoa.nomeCompleto(), pessoa == null ? null : pessoa.funcao(),
                    m.getIdBaseOperacional(), m.getIdBaseOperacional() == null ? null : nomesBase.get(m.getIdBaseOperacional()),
                    m.getTipo().getId(), m.getTipo().getNome(), m.getTipo().getGravidade(), m.getTipo().isExigePeriodo(),
                    m.getMotivo().getId(), m.getMotivo().getNome(),
                    m.getDataFato(), m.getDataAplicacao(), detalhe ? m.getDescricao() : null,
                    m.getDiasSuspensao(), m.getInicioSuspensao(), m.getFimSuspensao(),
                    m.getSituacao(), m.getSituacao().getRotulo(),
                    nomeUsuario(m.getIdUsuarioAplicacao(), usuarios), m.getAplicadaEm(),
                    m.getOrigem(), m.getOrigem().getRotulo(), m.getIdOrigem(), m.getIdExterno(),
                    m.getCanceladaEm(), m.getJustificativaCancelamento(),
                    m.diasDesdeOFato(), m.foraDaImediatidade(p.getDiasImediatidade()),
                    anexosMedida.size(),
                    listaAnexos, eventosMedida, m.getDataCriacao());
        }).toList();
    }

    private String nomeUsuario(UUID idUsuario, Map<UUID, String> cache) {
        if (idUsuario == null) return null;
        return cache.computeIfAbsent(idUsuario, id -> colaboradorApi.buscarNomeCompletoPorUsuario(id).orElse("Usuário do sistema"));
    }
}
