package com.nexo.app.modules.avaliacao.application.usecases;

import com.nexo.app.modules.avaliacao.application.dto.AvaliacaoDtos.CampanhaRequest;
import com.nexo.app.modules.avaliacao.application.dto.AvaliacaoDtos.CampanhaResponse;
import com.nexo.app.modules.avaliacao.application.dto.AvaliacaoDtos.ConviteResponse;
import com.nexo.app.modules.avaliacao.application.dto.AvaliacaoDtos.Facilidade;
import com.nexo.app.modules.avaliacao.application.dto.AvaliacaoDtos.Origem;
import com.nexo.app.modules.avaliacao.application.dto.AvaliacaoDtos.Problema;
import com.nexo.app.modules.avaliacao.application.dto.AvaliacaoDtos.RespostaItem;
import com.nexo.app.modules.avaliacao.application.dto.AvaliacaoDtos.RespostaRequest;
import com.nexo.app.modules.avaliacao.application.dto.AvaliacaoDtos.ResumoResponse;
import com.nexo.app.modules.avaliacao.infrastructure.persistence.AvaliacaoRepository;
import com.nexo.app.modules.avaliacao.infrastructure.persistence.AvaliacaoRepository.Campanha;
import com.nexo.app.modules.avaliacao.infrastructure.persistence.AvaliacaoRepository.Participacao;
import com.nexo.app.modules.avaliacao.infrastructure.persistence.AvaliacaoRepository.Resposta;
import com.nexo.app.modules.iam.UsuarioApi;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Regras do convite e das respostas da avaliação do aplicativo.
 *
 * <p><b>Para não incomodar.</b> O convite aparece uma vez; "responder depois" o esconde
 * por {@link #ADIAMENTO}. Depois de {@link #MAX_ADIAMENTOS} adiamentos, a aparição seguinte
 * é a última e oferece "não quero responder". Tudo isso fica gravado no servidor, então
 * vale para qualquer aparelho em que a pessoa entrar.</p>
 *
 * <p><b>Anonimato.</b> Na resposta anônima o id do usuário simplesmente não é gravado.
 * A participação ("já respondeu") é registrada à parte, sem ligação com o conteúdo.</p>
 *
 * @author <b>Thalisson</b>
 */
@Service
public class AvaliacaoUseCases {

    static final Duration ADIAMENTO = Duration.ofDays(3);
    static final int MAX_ADIAMENTOS = 3;
    static final ZoneId FUSO = ZoneId.of("America/Bahia");

    static final String RESPONDIDA = "RESPONDIDA";
    static final String ADIADA = "ADIADA";
    static final String RECUSADA = "RECUSADA";

    private final AvaliacaoRepository repository;
    private final UsuarioApi usuarioApi;
    private final Clock clock;

    @Autowired
    public AvaliacaoUseCases(AvaliacaoRepository repository, UsuarioApi usuarioApi) {
        this(repository, usuarioApi, Clock.systemUTC());
    }

    AvaliacaoUseCases(AvaliacaoRepository repository, UsuarioApi usuarioApi, Clock clock) {
        this.repository = repository;
        this.usuarioApi = usuarioApi;
        this.clock = clock;
    }

    // ── Quem responde ────────────────────────────────────────────────────────

    /** O convite da campanha aberta, ou vazio quando não há pesquisa no ar. */
    @Transactional(readOnly = true)
    public Optional<ConviteResponse> convite(UUID idUsuario) {
        OffsetDateTime agora = agora();
        return repository.buscarAberta(agora).map(campanha -> {
            Participacao p = repository.buscarParticipacao(campanha.id(), idUsuario).orElse(null);
            boolean jaRespondeu = p != null && RESPONDIDA.equals(p.situacao());
            boolean convidar = p == null
                    || (ADIADA.equals(p.situacao()) && (p.adiadaAte() == null || !p.adiadaAte().isAfter(agora)));
            boolean ultimaVez = p != null && ADIADA.equals(p.situacao()) && p.adiamentos() >= MAX_ADIAMENTOS;
            return new ConviteResponse(campanha.id(), campanha.titulo(), campanha.fim(), convidar, jaRespondeu,
                    ultimaVez);
        });
    }

    @Transactional
    public void responder(UUID idCampanha, UUID idUsuario, RespostaRequest req) {
        Campanha campanha = exigirAberta(idCampanha);
        LocalDate hoje = hoje();
        if (!repository.marcarRespondida(campanha.id(), idUsuario, hoje)) {
            throw new InvarianteVioladaException("Você já avaliou o aplicativo nesta pesquisa. Obrigado!");
        }
        List<String> problemas = req.problemas() == null ? List.of()
                : req.problemas().stream().filter(Objects::nonNull).distinct().map(Problema::name).toList();
        repository.inserirResposta(new Resposta(
                UUID.randomUUID(), campanha.id(),
                req.anonima() ? null : idUsuario,
                req.origem().name(),
                req.estrelas(),
                req.facilidade() == null ? null : req.facilidade().name(),
                problemas,
                textoOuNulo(req.problemaDetalhe()),
                textoOuNulo(req.sugestao()),
                textoOuNulo(req.versaoApp()),
                hoje));
    }

    /** "Responder depois": some por {@link #ADIAMENTO} em todos os aparelhos. */
    @Transactional
    public void adiar(UUID idCampanha, UUID idUsuario) {
        Campanha campanha = exigirAberta(idCampanha);
        Participacao atual = repository.buscarParticipacao(campanha.id(), idUsuario).orElse(null);
        if (atual != null && !ADIADA.equals(atual.situacao())) {
            return; // já respondeu ou recusou: adiar não muda nada
        }
        int adiamentos = atual == null ? 1 : atual.adiamentos() + 1;
        repository.salvarParticipacao(campanha.id(), idUsuario,
                new Participacao(ADIADA, agora().plus(ADIAMENTO), adiamentos), hoje());
    }

    /** "Não quero responder": o convite não volta. Responder pelo menu continua possível. */
    @Transactional
    public void recusar(UUID idCampanha, UUID idUsuario) {
        Campanha campanha = exigirAberta(idCampanha);
        Participacao atual = repository.buscarParticipacao(campanha.id(), idUsuario).orElse(null);
        if (atual != null && RESPONDIDA.equals(atual.situacao())) {
            return;
        }
        repository.salvarParticipacao(campanha.id(), idUsuario,
                new Participacao(RECUSADA, null, atual == null ? 0 : atual.adiamentos()), hoje());
    }

    // ── Painel ───────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<CampanhaResponse> listarCampanhas() {
        OffsetDateTime agora = agora();
        return repository.listarCampanhas().stream()
                .map(c -> paraResponse(c, agora))
                .toList();
    }

    @Transactional
    public CampanhaResponse abrirCampanha(CampanhaRequest req) {
        if (!req.fim().isAfter(req.inicio())) {
            throw new InvarianteVioladaException("O fim da pesquisa precisa ser depois do início.");
        }
        Campanha nova = new Campanha(UUID.randomUUID(), req.titulo().trim(), req.inicio(), req.fim(), null);
        repository.inserirCampanha(nova);
        return paraResponse(nova, agora());
    }

    @Transactional
    public CampanhaResponse encerrarCampanha(UUID id) {
        exigirCampanha(id);
        repository.encerrarCampanha(id, agora());
        return paraResponse(exigirCampanha(id), agora());
    }

    @Transactional(readOnly = true)
    public ResumoResponse resumo(UUID idCampanha, Origem origem) {
        exigirCampanha(idCampanha);
        List<Resposta> respostas = repository.listarRespostas(idCampanha, origem == null ? null : origem.name());

        Map<Integer, Long> porEstrelas = new LinkedHashMap<>();
        for (int n = 5; n >= 1; n--) {
            porEstrelas.put(n, 0L);
        }
        respostas.forEach(r -> porEstrelas.merge(r.estrelas(), 1L, Long::sum));

        Map<String, Long> porFacilidade = new LinkedHashMap<>();
        for (var f : Facilidade.values()) {
            porFacilidade.put(f.name(), 0L);
        }
        respostas.stream().map(Resposta::facilidade).filter(Objects::nonNull)
                .forEach(f -> porFacilidade.merge(f, 1L, Long::sum));

        Map<String, Long> porProblema = new LinkedHashMap<>();
        for (Problema p : Problema.values()) {
            porProblema.put(p.name(), 0L);
        }
        respostas.forEach(r -> r.problemas().forEach(p -> porProblema.merge(p, 1L, Long::sum)));

        Map<String, Long> porOrigem = new LinkedHashMap<>();
        for (Origem o : Origem.values()) {
            porOrigem.put(o.name(), 0L);
        }
        respostas.forEach(r -> porOrigem.merge(r.origem(), 1L, Long::sum));

        Double media = respostas.isEmpty() ? null
                : Math.round(respostas.stream().mapToInt(Resposta::estrelas).average().orElse(0) * 10) / 10.0;

        return new ResumoResponse(
                respostas.size(), media, porEstrelas, porFacilidade, porProblema, porOrigem,
                respostas.stream().filter(r -> r.idUsuario() == null).count(),
                respostas.stream().filter(r -> r.sugestao() != null).count(),
                repository.contarParticipacoes(idCampanha, ADIADA),
                repository.contarParticipacoes(idCampanha, RECUSADA));
    }

    @Transactional(readOnly = true)
    public List<RespostaItem> listarRespostas(UUID idCampanha, Origem origem) {
        exigirCampanha(idCampanha);
        List<Resposta> respostas = repository.listarRespostas(idCampanha, origem == null ? null : origem.name());
        Set<UUID> autores = respostas.stream().map(Resposta::idUsuario).filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<UUID, String> logins = autores.isEmpty() ? Map.of() : usuarioApi.buscarLoginsPorIds(autores);
        return respostas.stream().map(r -> new RespostaItem(
                r.id(), r.respondidaEm(), r.origem(), r.estrelas(), r.facilidade(), r.problemas(),
                r.problemaDetalhe(), r.sugestao(), r.versaoApp(),
                r.idUsuario() == null ? null : logins.getOrDefault(r.idUsuario(), "Usuário removido")))
                .toList();
    }

    // ── Apoio ────────────────────────────────────────────────────────────────

    private Campanha exigirCampanha(UUID id) {
        return repository.buscarCampanha(id)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Pesquisa de avaliação não encontrada."));
    }

    private Campanha exigirAberta(UUID id) {
        Campanha campanha = exigirCampanha(id);
        if (!campanha.abertaEm(agora())) {
            throw new InvarianteVioladaException("Esta pesquisa de avaliação já foi encerrada.");
        }
        return campanha;
    }

    private CampanhaResponse paraResponse(Campanha c, OffsetDateTime agora) {
        return new CampanhaResponse(c.id(), c.titulo(), c.inicio(), c.fim(), c.encerradaEm(), c.abertaEm(agora),
                repository.contarRespostas(c.id()));
    }

    private OffsetDateTime agora() {
        return OffsetDateTime.now(clock);
    }

    private LocalDate hoje() {
        return LocalDate.now(clock.withZone(FUSO));
    }

    private static String textoOuNulo(String valor) {
        if (valor == null) {
            return null;
        }
        String limpo = valor.trim();
        return limpo.isEmpty() ? null : limpo;
    }
}
