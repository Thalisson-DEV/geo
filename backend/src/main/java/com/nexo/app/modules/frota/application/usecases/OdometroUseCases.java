package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.FrotaOdometroApi;
import com.nexo.app.modules.frota.application.dto.LeituraOdometroFilter;
import com.nexo.app.modules.frota.application.dto.LeituraOdometroResponse;
import com.nexo.app.modules.frota.application.dto.RegistrarLeituraRequest;
import com.nexo.app.modules.frota.application.dto.TrocaPainelRequest;
import com.nexo.app.modules.frota.domain.FichaVeiculo;
import com.nexo.app.modules.frota.domain.LeituraOdometro;
import com.nexo.app.modules.frota.domain.OrigemLeituraOdometro;
import com.nexo.app.modules.frota.domain.SituacaoLeituraOdometro;
import com.nexo.app.modules.frota.domain.TipoLeituraOdometro;
import com.nexo.app.modules.frota.domain.TravaMedicao;
import com.nexo.app.modules.frota.domain.UnidadeMedicao;
import com.nexo.app.modules.frota.infrastructure.persistence.FichaVeiculoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.LeituraOdometroRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.LeituraOdometroSpecification;
import com.nexo.app.shared.application.dto.PageResponse;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import com.nexo.app.shared.infrastructure.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Livro-razão do odômetro: registra leituras de todas as origens, calcula o KM atual e
 * expõe a fila de inconsistências para o gestor.
 */
@Service
@RequiredArgsConstructor
public class OdometroUseCases implements FrotaOdometroApi {

    /** Limites abertos de um trecho sem troca de painel antes ou depois. */
    private static final OffsetDateTime INICIO_DOS_TEMPOS = OffsetDateTime.of(1900, 1, 1, 0, 0, 0, 0, ZoneOffset.UTC);
    private static final OffsetDateTime FIM_DOS_TEMPOS = OffsetDateTime.of(9999, 1, 1, 0, 0, 0, 0, ZoneOffset.UTC);

    private final LeituraOdometroRepository repository;
    private final FichaVeiculoRepository fichaRepository;
    private final ParametrosFrotaUseCases parametros;
    private final ReferenciasFrota referencias;

    /** Lançamento manual pela web: quem digita corrige na hora, então incoerência é recusada. */
    @Transactional
    public LeituraOdometroResponse registrarManual(UUID idVeiculo, RegistrarLeituraRequest request) {
        LeituraOdometro leitura = registrar(idVeiculo, request.km(), request.lidoEm(),
                OrigemLeituraOdometro.MANUAL, null, SecurityUtils.getUsuarioLogadoId(), request.justificativa());
        return montar(List.of(leitura)).get(0);
    }

    @Override
    @Transactional
    public ResultadoLeitura registrarLeitura(UUID idVeiculo, long km, OffsetDateTime lidoEm,
                                             OrigemLeitura origem, UUID idOrigem, UUID idUsuario) {
        LeituraOdometro leitura = registrar(idVeiculo, km, lidoEm,
                OrigemLeituraOdometro.valueOf(origem.name()), idOrigem, idUsuario, null);
        var medicao = medicaoAtual(idVeiculo).orElse(null);
        return new ResultadoLeitura(leitura.getId(), leitura.isValida(),
                leitura.isInconsistente() ? leitura.getMotivoSituacao() : null,
                medicao == null ? null : medicao.valor(),
                Unidade.valueOf(leitura.getUnidade().name()),
                medicao == null ? null : medicao.acumulado());
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<Long> kmAtual(UUID idVeiculo) {
        return maiorValidaDoTrechoAtual(idVeiculo).map(LeituraOdometro::getKm);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<Medicao> medicaoAtual(UUID idVeiculo) {
        return maiorValidaDoTrechoAtual(idVeiculo).map(l -> new Medicao(l.getKm(),
                Unidade.valueOf(l.getUnidade().name()),
                l.getKm() + deslocamentoAcumulado(trocasValidas(List.of(idVeiculo)).getOrDefault(idVeiculo, List.of()))));
    }

    /**
     * Trava dos lançamentos de campo agora: a maior leitura válida do painel em uso e o limite
     * de salto da unidade. O app recebe isso na sincronização para recusar na digitação.
     */
    @Transactional(readOnly = true)
    public TravaMedicao trava(UUID idVeiculo) {
        var ficha = fichaRepository.findByIdVeiculo(idVeiculo)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Veículo não encontrado na frota."));
        // A estimativa da telemetria não trava o campo: o painel prevalece sobre ela.
        var ultima = maiorValidaPainelDoTrechoAtual(idVeiculo).orElse(null);
        var unidade = ultima == null ? ficha.getUnidadeMedicao() : ultima.getUnidade();
        return new TravaMedicao(unidade, ultima == null ? null : ultima.getKm(), parametros.obter().limiteSalto(unidade));
    }

    /** Travas de vários veículos de uma vez (catálogo do app). */
    @Transactional(readOnly = true)
    public Map<UUID, TravaMedicao> travas(java.util.Collection<UUID> idsVeiculo) {
        var parametrosFrota = parametros.obter();
        var atuais = idsVeiculo.isEmpty() ? Map.<UUID, LeituraOdometroRepository.KmAtualProjection>of()
                : repository.buscarKmAtualPainel(idsVeiculo).stream()
                .collect(Collectors.toMap(LeituraOdometroRepository.KmAtualProjection::getIdVeiculo, Function.identity()));
        return fichaRepository.findAllByIdVeiculoIn(idsVeiculo).stream().collect(Collectors.toMap(FichaVeiculo::getIdVeiculo, f -> {
            var atual = atuais.get(f.getIdVeiculo());
            return new TravaMedicao(f.getUnidadeMedicao(), atual == null ? null : atual.getKm(),
                    parametrosFrota.limiteSalto(f.getUnidadeMedicao()));
        }));
    }

    /**
     * Troca de painel: fecha o painel antigo com o último valor e abre o novo. A partir daí as
     * leituras só são comparadas com o painel novo, e o acumulado soma o que o antigo rodou.
     */
    @Transactional
    public LeituraOdometroResponse trocarPainel(UUID idVeiculo, TrocaPainelRequest request) {
        FichaVeiculo ficha = fichaRepository.findByIdVeiculo(idVeiculo)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Veículo não encontrado na frota."));
        UnidadeMedicao unidadeNova = request.unidade() == null ? ficha.getUnidadeMedicao() : request.unidade();
        ficha.trocarPainel(unidadeNova);
        var ultimaValida = repository.findFirstByIdVeiculoAndSituacaoOrderByLidoEmDescKmDesc(
                idVeiculo, SituacaoLeituraOdometro.VALIDA).orElse(null);
        LeituraOdometro troca = LeituraOdometro.registrarTrocaPainel(idVeiculo, unidadeNova,
                request.valorFechamento(), request.valorInicial(), request.lidoEm(),
                SecurityUtils.getUsuarioLogadoId(), ultimaValida, request.observacao());
        fichaRepository.save(ficha);
        return montar(List.of(repository.save(troca))).get(0);
    }

    @Transactional(readOnly = true)
    public PageResponse<LeituraOdometroResponse> listar(LeituraOdometroFilter filtro, Pageable pageable) {
        List<UUID> escopo = null;
        if (filtro != null && !filtro.idsBase().isEmpty()) {
            escopo = fichaRepository.findAllByIdBaseOperacionalIn(filtro.idsBase()).stream()
                    .map(FichaVeiculo::getIdVeiculo).toList();
        }
        Pageable ordenado = pageable.getSort().isSorted() ? pageable
                : PageRequest.of(pageable.getPageNumber(), pageable.getPageSize(),
                        Sort.by(Sort.Order.desc("lidoEm"), Sort.Order.desc("km")));
        Page<LeituraOdometro> pagina = repository.findAll(LeituraOdometroSpecification.of(filtro, escopo), ordenado);
        var conteudo = montar(pagina.getContent());
        return PageResponse.fromPage(new org.springframework.data.domain.PageImpl<>(conteudo, ordenado, pagina.getTotalElements()));
    }

    @Transactional
    public LeituraOdometroResponse anular(UUID id, String justificativa) {
        LeituraOdometro leitura = buscarEntidade(id);
        if (leitura.isTrocaPainel() && leitura.isValida()) {
            exigirTrocaAnulavel(leitura);
        }
        leitura.anular(SecurityUtils.getUsuarioLogadoId(), justificativa);
        return montar(List.of(repository.save(leitura))).get(0);
    }

    @Transactional
    public LeituraOdometroResponse confirmar(UUID id, String justificativa) {
        LeituraOdometro leitura = buscarEntidade(id);
        leitura.confirmar(justificativa);
        return montar(List.of(repository.save(leitura))).get(0);
    }

    /**
     * Grava a leitura classificada contra as vizinhas válidas. Idempotente por
     * {@code (origem, idOrigem)}: o mesmo registro reenviado devolve a leitura existente.
     */
    LeituraOdometro registrar(UUID idVeiculo, long km, OffsetDateTime lidoEm,
                              OrigemLeituraOdometro origem, UUID idOrigem, UUID idUsuario, String justificativaSalto) {
        if (idOrigem != null) {
            var existente = repository.findByOrigemAndIdOrigem(origem, idOrigem);
            if (existente.isPresent()) {
                if (!existente.get().getIdVeiculo().equals(idVeiculo)) {
                    throw new InvarianteVioladaException("O registro de origem já gerou leitura para outro veículo.");
                }
                return existente.get();
            }
        }
        FichaVeiculo ficha = fichaRepository.findByIdVeiculo(idVeiculo)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Veículo não encontrado na frota."));
        if (!ficha.isAtivo()) {
            throw new InvarianteVioladaException("O veículo " + ficha.getPlaca() + " está desativado.");
        }
        if (lidoEm == null) {
            throw new InvarianteVioladaException("Informe a data e hora da leitura.");
        }
        // Só compara com leituras do mesmo trecho (entre trocas de painel).
        var trocaInicial = repository.findFirstByIdVeiculoAndTipoAndSituacaoAndLidoEmLessThanEqualOrderByLidoEmDesc(
                idVeiculo, TipoLeituraOdometro.TROCA_PAINEL, SituacaoLeituraOdometro.VALIDA, lidoEm).orElse(null);
        OffsetDateTime inicio = trocaInicial == null ? INICIO_DOS_TEMPOS : trocaInicial.getLidoEm();
        OffsetDateTime fim = repository.findFirstByIdVeiculoAndTipoAndSituacaoAndLidoEmAfterOrderByLidoEmAsc(
                        idVeiculo, TipoLeituraOdometro.TROCA_PAINEL, SituacaoLeituraOdometro.VALIDA, lidoEm)
                .map(LeituraOdometro::getLidoEm).orElse(FIM_DOS_TEMPOS);
        // Leitura de painel só se compara com painel: a estimativa da telemetria não a recusa nem a marca.
        var anterior = (origem.isPainel()
                ? repository.findFirstByIdVeiculoAndSituacaoAndOrigemNotAndLidoEmBetweenOrderByLidoEmDescKmDesc(
                idVeiculo, SituacaoLeituraOdometro.VALIDA, OrigemLeituraOdometro.TELEMETRIA, inicio, lidoEm)
                : repository.findFirstByIdVeiculoAndSituacaoAndLidoEmBetweenOrderByLidoEmDescKmDesc(
                idVeiculo, SituacaoLeituraOdometro.VALIDA, inicio, lidoEm)).orElse(null);
        var posterior = (origem.isPainel()
                ? repository.findFirstByIdVeiculoAndSituacaoAndOrigemNotAndLidoEmAfterAndLidoEmBeforeOrderByLidoEmAscKmAsc(
                idVeiculo, SituacaoLeituraOdometro.VALIDA, OrigemLeituraOdometro.TELEMETRIA, lidoEm, fim)
                : repository.findFirstByIdVeiculoAndSituacaoAndLidoEmAfterAndLidoEmBeforeOrderByLidoEmAscKmAsc(
                idVeiculo, SituacaoLeituraOdometro.VALIDA, lidoEm, fim)).orElse(null);
        // Leitura atrasada de um painel antigo fica na unidade daquele trecho.
        var unidade = anterior != null ? anterior.getUnidade()
                : posterior != null ? posterior.getUnidade()
                : trocaInicial != null ? trocaInicial.getUnidade()
                : ficha.getUnidadeMedicao();
        var parametrosFrota = parametros.obter();
        int limiteDia = parametrosFrota.limiteDiario(unidade);
        var trava = new TravaMedicao(unidade, anterior == null ? null : anterior.getKm(), parametrosFrota.limiteSalto(unidade));
        // Campo: o valor fora da trava não entra (casa decimal a mais vira revisões vencidas).
        if (origem.isCampo()) {
            trava.exigir(km);
        }

        LeituraOdometro leitura = LeituraOdometro.registrar(idVeiculo, unidade, km, lidoEm, origem, idOrigem,
                idUsuario, anterior, posterior, limiteDia);
        if (origem == OrigemLeituraOdometro.MANUAL) {
            boolean menorOuForaDeOrdem = (anterior != null && km < anterior.getKm())
                    || (posterior != null && km > posterior.getKm());
            boolean salto = !trava.aceita(km) || leitura.isInconsistente();
            if (menorOuForaDeOrdem) {
                throw new InvarianteVioladaException(leitura.getMotivoSituacao()
                        + " Confira o valor digitado ou anule a leitura errada antes.");
            }
            if (salto) {
                if (justificativaSalto == null || justificativaSalto.isBlank()) {
                    String motivo = leitura.isInconsistente() ? leitura.getMotivoSituacao()
                            : "O valor passa o último registrado em mais de " + trava.limite() + " " + unidade.sufixo() + ".";
                    throw new InvarianteVioladaException(motivo + " Se o valor está certo, informe a justificativa.");
                }
                leitura.aceitarSalto(justificativaSalto);
            }
        }
        LeituraOdometro salva = repository.save(leitura);
        if (origem.isPainel() && salva.isValida()) {
            anularEstimativasSuperadas(salva, inicio);
        }
        return salva;
    }

    /**
     * O painel prevalece: estimativas da telemetria do mesmo trecho, até o instante da leitura de
     * painel, com valor acima dela, deixam de valer (anuladas e auditadas, nunca apagadas).
     */
    private void anularEstimativasSuperadas(LeituraOdometro painel, OffsetDateTime inicioTrecho) {
        var superadas = repository.findAllByIdVeiculoAndSituacaoAndOrigemAndLidoEmBetweenAndKmGreaterThan(
                painel.getIdVeiculo(), SituacaoLeituraOdometro.VALIDA, OrigemLeituraOdometro.TELEMETRIA,
                inicioTrecho, painel.getLidoEm(), painel.getKm());
        if (superadas.isEmpty()) {
            return;
        }
        String quando = painel.getLidoEm().atZoneSameInstant(LiberacaoCnhUseCases.FUSO)
                .format(java.time.format.DateTimeFormatter.ofPattern("dd/MM HH:mm"));
        for (LeituraOdometro estimativa : superadas) {
            estimativa.anular(null, "Superada pela leitura do painel de " + quando + " ("
                    + painel.getKm() + " " + painel.getUnidade().sufixo() + ").");
        }
        repository.saveAll(superadas);
    }

    /**
     * Anular a troca junta dois trechos. Só vale para a última troca, sem leituras válidas
     * depois dela, e sem mudança de unidade (a ficha já mudou e o histórico misturaria km e horas).
     */
    private void exigirTrocaAnulavel(LeituraOdometro troca) {
        boolean temLeituraDepois = repository.findFirstByIdVeiculoAndSituacaoAndLidoEmAfterAndLidoEmBeforeOrderByLidoEmAscKmAsc(
                troca.getIdVeiculo(), SituacaoLeituraOdometro.VALIDA, troca.getLidoEm(), FIM_DOS_TEMPOS).isPresent();
        if (temLeituraDepois) {
            throw new InvarianteVioladaException(
                    "Já há leituras válidas depois desta troca de painel. Anule-as antes de anular a troca.");
        }
        if (troca.getDeslocamento() == null) {
            throw new InvarianteVioladaException(
                    "Esta troca mudou a unidade do veículo. Registre uma nova troca para voltar à unidade anterior.");
        }
    }

    private Optional<LeituraOdometro> maiorValidaPainelDoTrechoAtual(UUID idVeiculo) {
        OffsetDateTime inicio = inicioDoTrecho(idVeiculo, FIM_DOS_TEMPOS);
        return repository.findFirstByIdVeiculoAndSituacaoAndOrigemNotAndLidoEmGreaterThanEqualOrderByKmDescLidoEmDesc(
                idVeiculo, SituacaoLeituraOdometro.VALIDA, OrigemLeituraOdometro.TELEMETRIA, inicio);
    }

    /**
     * Última leitura de painel válida do trecho atual (a âncora da estimativa da telemetria).
     * Vazia sem leitura de painel: a telemetria espera o primeiro checklist para calibrar.
     */
    @Transactional(readOnly = true)
    public Optional<LeituraOdometro> ultimaLeituraPainel(UUID idVeiculo) {
        OffsetDateTime inicio = inicioDoTrecho(idVeiculo, FIM_DOS_TEMPOS);
        return repository.findFirstByIdVeiculoAndSituacaoAndOrigemNotAndLidoEmBetweenOrderByLidoEmDescKmDesc(
                idVeiculo, SituacaoLeituraOdometro.VALIDA, OrigemLeituraOdometro.TELEMETRIA, inicio, FIM_DOS_TEMPOS);
    }

    private Optional<LeituraOdometro> maiorValidaDoTrechoAtual(UUID idVeiculo) {
        OffsetDateTime inicio = inicioDoTrecho(idVeiculo, FIM_DOS_TEMPOS);
        return repository.findFirstByIdVeiculoAndSituacaoAndLidoEmGreaterThanEqualOrderByKmDescLidoEmDesc(
                idVeiculo, SituacaoLeituraOdometro.VALIDA, inicio);
    }

    /** Trocas de painel válidas por veículo, da mais antiga para a mais recente. */
    private Map<UUID, List<LeituraOdometro>> trocasValidas(java.util.Collection<UUID> idsVeiculo) {
        if (idsVeiculo.isEmpty()) return Map.of();
        return repository.findAllByIdVeiculoInAndTipoAndSituacaoOrderByLidoEmAsc(
                        idsVeiculo, TipoLeituraOdometro.TROCA_PAINEL, SituacaoLeituraOdometro.VALIDA).stream()
                .collect(Collectors.groupingBy(LeituraOdometro::getIdVeiculo));
    }

    /**
     * Soma dos deslocamentos das trocas na unidade atual. Uma troca com mudança de unidade
     * (deslocamento nulo) zera a soma: o acumulado recomeça na unidade nova.
     */
    static long deslocamentoAcumulado(List<LeituraOdometro> trocasEmOrdem) {
        long soma = 0;
        for (LeituraOdometro troca : trocasEmOrdem) {
            soma = troca.getDeslocamento() == null ? 0 : soma + troca.getDeslocamento();
        }
        return soma;
    }

    /** Acumulado (valor atual + painéis anteriores) dos veículos informados. */
    Map<UUID, Long> deslocamentoPorVeiculo(java.util.Collection<UUID> idsVeiculo) {
        return trocasValidas(idsVeiculo).entrySet().stream()
                .collect(Collectors.toMap(Map.Entry::getKey, e -> deslocamentoAcumulado(e.getValue())));
    }

    /** Se o veículo já tem alguma leitura válida (a unidade só muda por troca de painel). */
    boolean possuiLeituraValida(UUID idVeiculo) {
        return repository.existsByIdVeiculoAndSituacao(idVeiculo, SituacaoLeituraOdometro.VALIDA);
    }

    /** Instante da última troca de painel até {@code instante}, ou o início dos tempos. */
    private OffsetDateTime inicioDoTrecho(UUID idVeiculo, OffsetDateTime instante) {
        return repository.findFirstByIdVeiculoAndTipoAndSituacaoAndLidoEmLessThanEqualOrderByLidoEmDesc(
                        idVeiculo, TipoLeituraOdometro.TROCA_PAINEL, SituacaoLeituraOdometro.VALIDA, instante)
                .map(LeituraOdometro::getLidoEm).orElse(INICIO_DOS_TEMPOS);
    }

    private LeituraOdometro buscarEntidade(UUID id) {
        return repository.findById(id)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Leitura de odômetro não encontrada."));
    }

    private List<LeituraOdometroResponse> montar(List<LeituraOdometro> leituras) {
        var idsVeiculo = leituras.stream().map(LeituraOdometro::getIdVeiculo).collect(Collectors.toSet());
        Map<UUID, String> placas = fichaRepository.findAllByIdVeiculoIn(idsVeiculo).stream()
                .collect(Collectors.toMap(FichaVeiculo::getIdVeiculo, FichaVeiculo::getPlaca));
        Map<UUID, String> logins = referencias.loginsUsuarios(
                leituras.stream().map(LeituraOdometro::getIdUsuarioRegistro).toList());
        return leituras.stream().map(l -> new LeituraOdometroResponse(
                l.getId(),
                l.getIdVeiculo(),
                placas.get(l.getIdVeiculo()),
                l.getKm(),
                l.getLidoEm(),
                l.getOrigem(),
                l.getIdOrigem(),
                l.getSituacao(),
                l.getMotivoSituacao(),
                l.getKmAnterior(),
                l.getIdUsuarioRegistro() == null ? null : logins.get(l.getIdUsuarioRegistro()),
                l.getDataAnulacao(),
                l.getJustificativaAnulacao(),
                l.getUnidade(),
                l.getTipo(),
                l.getDeslocamento()
        )).toList();
    }

    /** KM atual e data da última leitura válida dos veículos informados. */
    Map<UUID, LeituraOdometroRepository.KmAtualProjection> kmAtualPorVeiculo(java.util.Collection<UUID> idsVeiculo) {
        if (idsVeiculo.isEmpty()) return Map.of();
        return repository.buscarKmAtual(idsVeiculo).stream()
                .collect(Collectors.toMap(LeituraOdometroRepository.KmAtualProjection::getIdVeiculo, Function.identity()));
    }

    /**
     * Medição atual: o acumulado (soma os painéis anteriores da mesma unidade, para contar o uso),
     * o valor do painel em uso (o que se lê no veículo) e desde quando esse painel vale.
     */
    public record MedicaoAcumulada(long acumulado, long painel, UnidadeMedicao unidade, OffsetDateTime lidoEm,
                                   OffsetDateTime inicioPainel) {

        /** Quanto o acumulado está à frente do painel em uso. */
        public long deslocamento() {
            return acumulado - painel;
        }
    }

    /** Medição acumulada atual de vários veículos; quem ainda não tem leitura fica de fora. */
    @Transactional(readOnly = true)
    public Map<UUID, MedicaoAcumulada> medicoesAtuais(java.util.Collection<UUID> idsVeiculo) {
        if (idsVeiculo.isEmpty()) return Map.of();
        var atuais = kmAtualPorVeiculo(idsVeiculo);
        var trocas = trocasValidas(atuais.keySet());
        Map<UUID, UnidadeMedicao> unidades = fichaRepository.findAllByIdVeiculoIn(atuais.keySet()).stream()
                .collect(Collectors.toMap(FichaVeiculo::getIdVeiculo, FichaVeiculo::getUnidadeMedicao));
        return atuais.values().stream().collect(Collectors.toMap(LeituraOdometroRepository.KmAtualProjection::getIdVeiculo, a -> {
            var doVeiculo = trocas.getOrDefault(a.getIdVeiculo(), List.of());
            return new MedicaoAcumulada(a.getKm() + deslocamentoAcumulado(doVeiculo), a.getKm(),
                    unidades.getOrDefault(a.getIdVeiculo(), UnidadeMedicao.KM), a.getLidoEm(),
                    doVeiculo.isEmpty() ? null : doVeiculo.get(doVeiculo.size() - 1).getLidoEm());
        }));
    }

    /**
     * Converte o valor do painel num instante (ex.: o KM do encerramento de uma OS) para o
     * acumulado: soma os deslocamentos das trocas de painel válidas até aquele instante.
     */
    @Transactional(readOnly = true)
    public long acumuladoEm(UUID idVeiculo, long valorPainel, OffsetDateTime instante) {
        var trocas = trocasValidas(List.of(idVeiculo)).getOrDefault(idVeiculo, List.of()).stream()
                .filter(t -> !t.getLidoEm().isAfter(instante)).toList();
        return valorPainel + deslocamentoAcumulado(trocas);
    }

    /**
     * Média de uso por dia (km ou h) desde {@code desde}, pelas leituras válidas do painel
     * atual. Menos de {@code diasMinimos} entre a primeira e a última leitura não dá média.
     */
    @Transactional(readOnly = true)
    public Map<UUID, Double> usoDiario(java.util.Collection<UUID> idsVeiculo, OffsetDateTime desde, int diasMinimos) {
        if (idsVeiculo.isEmpty()) return Map.of();
        var medias = new java.util.HashMap<UUID, Double>();
        for (var faixa : repository.buscarFaixaUso(idsVeiculo, desde)) {
            double dias = java.time.Duration.between(faixa.getPrimeira(), faixa.getUltima()).toHours() / 24.0;
            if (dias < diasMinimos) continue;
            medias.put(faixa.getIdVeiculo(), (faixa.getMaior() - faixa.getMenor()) / dias);
        }
        return medias;
    }

    Map<UUID, Long> inconsistentesPorVeiculo(java.util.Collection<UUID> idsVeiculo) {
        if (idsVeiculo.isEmpty()) return Map.of();
        return repository.contarInconsistentes(idsVeiculo).stream()
                .collect(Collectors.toMap(LeituraOdometroRepository.ContagemPorVeiculoProjection::getIdVeiculo,
                        LeituraOdometroRepository.ContagemPorVeiculoProjection::getTotal));
    }
}
