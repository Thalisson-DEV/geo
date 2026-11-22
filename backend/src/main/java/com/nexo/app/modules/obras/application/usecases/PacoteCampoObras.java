package com.nexo.app.modules.obras.application.usecases;

import com.nexo.app.modules.obras.application.dto.CampoObrasResponses;
import com.nexo.app.modules.obras.application.dto.DownloadAnexoObraDTO;
import com.nexo.app.modules.execucao.TurnoApi;
import com.nexo.app.modules.obras.domain.AnexoObra;
import com.nexo.app.modules.obras.domain.EstruturaChecklist;
import com.nexo.app.modules.obras.domain.EventoProgramacao;
import com.nexo.app.modules.obras.domain.EvidenciaPonto;
import com.nexo.app.modules.obras.domain.FichaAsBuilt;
import com.nexo.app.modules.obras.domain.ItemPlanejado;
import com.nexo.app.modules.obras.domain.KitAplicado;
import com.nexo.app.modules.obras.domain.ModeloChecklistObra;
import com.nexo.app.modules.obras.domain.Obra;
import com.nexo.app.modules.obras.domain.PlanejamentoObra;
import com.nexo.app.modules.obras.domain.PontoPlanejamento;
import com.nexo.app.modules.obras.domain.Programacao;
import com.nexo.app.modules.obras.domain.ProgramacaoItem;
import com.nexo.app.modules.obras.domain.StatusAprTurno;
import com.nexo.app.modules.obras.domain.StatusItemPlanejado;
import com.nexo.app.modules.obras.domain.StatusProgramacao;
import com.nexo.app.modules.obras.domain.VaoPlanejamento;
import com.nexo.app.modules.obras.infrastructure.persistence.AnexoObraRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.AprTurnoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.OcorrenciaTurnoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.EventoProgramacaoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.EvidenciaPontoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.FichaAsBuiltRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.KitAplicadoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.ModeloChecklistObraRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.ObraRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.PlanejamentoObraRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.PontoPlanejamentoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.ProgramacaoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.VaoPlanejamentoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.VisitaPreviaObraRepository;
import com.nexo.app.modules.obras.domain.RespostasChecklist;
import com.nexo.app.modules.obras.domain.EstruturaChecklist;
import com.nexo.app.modules.rh.EquipeApi;
import com.nexo.app.modules.rh.EquipeResponse;
import com.nexo.app.modules.rh.MunicipioApi;
import com.nexo.app.modules.rh.MunicipioResponse;
import com.nexo.app.shared.domain.exception.AcessoNegadoException;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import com.nexo.app.shared.infrastructure.storage.ObjectStorageService;
import com.nexo.app.shared.infrastructure.storage.StorageObject;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * O pacote offline da equipe: agenda de hoje e dos próximos 7 dias, obras com endereço, projeto, pontos e vãos, itens
 * programados, modelos de APR e de fotos e os avisos de mudança. Só a equipe do próprio encarregado; supervisor e
 * backoffice informam a equipe.
 */
@Service
@RequiredArgsConstructor
public class PacoteCampoObras {

    static final ZoneId FUSO = ZoneId.of("America/Sao_Paulo");
    static final int DIAS_A_FRENTE = 7;

    /** Opções da APR (a validar com o SST); o texto fica gravado como foi respondido. */
    static final List<String> RISCOS = List.of("Choque elétrico", "Arco elétrico", "Queda de altura",
            "Queda de materiais ou ferramentas", "Movimentação de carga", "Tráfego de veículos", "Escavação",
            "Animais peçonhentos", "Condições climáticas", "Calor ou esforço físico");
    static final List<String> MEDIDAS = List.of("Desenergização", "Bloqueio e aterramento", "Linha viva",
            "Sinalização e isolamento da área", "Inspeção de escada e cinto", "Plano de içamento", "EPI e EPC",
            "Revezamento e hidratação");
    static final List<String> VERIFICACOES = List.of("Conversa sobre os riscos feita com a equipe", "EPI em bom estado",
            "Ferramentas e veículo inspecionados", "Área sinalizada", "O clima permite o trabalho", "Desligamento confirmado");

    private final EquipeApi equipeApi;
    private final MunicipioApi municipioApi;
    private final CampoObrasUseCases campo;
    private final ProgramacaoRepository programacaoRepository;
    private final ObraRepository obraRepository;
    private final PlanejamentoObraRepository planejamentoRepository;
    private final AnexoObraRepository anexoRepository;
    private final PontoPlanejamentoRepository pontoRepository;
    private final VaoPlanejamentoRepository vaoRepository;
    private final EvidenciaPontoRepository evidenciaRepository;
    private final FichaAsBuiltRepository fichaRepository;
    private final ModeloChecklistObraRepository modeloRepository;
    private final EventoProgramacaoRepository eventoRepository;
    private final ObjectStorageService objectStorage;
    private final KitAplicadoRepository kitRepository;
    private final AprTurnoRepository aprRepository;
    private final OcorrenciaTurnoRepository ocorrenciaRepository;
    private final TurnoApi turnoApi;
    private final VisitaPreviaObraRepository visitaRepository;

    /**
     * @param idEquipe opcional para o encarregado (vale a equipe dele; outra equipe é 403); obrigatório para quem não
     *                 lidera equipe.
     */
    @Transactional(readOnly = true)
    public CampoObrasResponses.Pacote montar(UUID usuario, UUID idEquipe, OffsetDateTime desde) {
        UUID equipe = equipeDoPacote(usuario, idEquipe);
        EquipeResponse dadosEquipe = equipeApi.buscarPorIdResponse(equipe)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Equipe não encontrada."));
        LocalDate hoje = LocalDate.now(FUSO);
        LocalDate fim = hoje.plusDays(DIAS_A_FRENTE);
        OffsetDateTime agora = OffsetDateTime.now();

        List<Programacao> daJanela = programacaoRepository.listarDaEquipeNoPeriodoComItens(equipe, hoje, fim);
        List<Programacao> vigentes = daJanela.stream()
                .filter(p -> p.isAtivo() && p.getStatus() != StatusProgramacao.CANCELADA)
                .sorted(Comparator.comparing(Programacao::getDataInicio).thenComparing(Programacao::getNumero))
                .toList();
        Set<UUID> removidas = new LinkedHashSet<>();
        daJanela.stream().filter(p -> !p.isAtivo() || p.getStatus() == StatusProgramacao.CANCELADA)
                .forEach(p -> removidas.add(p.getId()));
        List<EventoProgramacao> eventos = eventoRepository.listarDaEquipeDesde(equipe,
                desde != null ? desde : agora.minusDays(DIAS_A_FRENTE));
        for (EventoProgramacao evento : eventos) {
            boolean saiuDaEquipe = equipe.equals(evento.getIdEquipeOrigem()) && !equipe.equals(evento.getIdEquipeDestino());
            if (saiuDaEquipe && vigentes.stream().noneMatch(p -> p.getId().equals(evento.getIdProgramacao()))) {
                removidas.add(evento.getIdProgramacao());
            }
        }

        // Visita prévia registrada depois do último pacote também reenvia a obra (a equipe precisa ver o recado do
        // supervisor), assim como projeto girado ou ponto mexido no planejamento (o desenho e os marcadores mudam).
        Set<UUID> comNovidadeNaObra = new java.util.HashSet<>();
        if (desde != null && !vigentes.isEmpty()) {
            List<UUID> idsObras = vigentes.stream().map(Programacao::getIdObra).distinct().toList();
            comNovidadeNaObra.addAll(visitaRepository.obrasComVisitaDesde(idsObras, desde));
            comNovidadeNaObra.addAll(planejamentoRepository.obrasComProjetoAlteradoDesde(idsObras, desde));
            comNovidadeNaObra.addAll(pontoRepository.obrasComPontoAlteradoDesde(idsObras, desde));
        }
        List<Programacao> enviadas = desde == null ? vigentes
                : vigentes.stream().filter(p -> mudouDesde(p, desde, eventos) || comNovidadeNaObra.contains(p.getIdObra())).toList();
        Map<UUID, Obra> obras = new LinkedHashMap<>();
        for (Programacao p : enviadas) {
            obras.computeIfAbsent(p.getIdObra(), id -> obraRepository.findById(id).orElse(null));
        }
        obras.values().removeIf(Objects::isNull);
        Map<UUID, Map<UUID, String>> locaisPorObra = new HashMap<>();
        List<CampoObrasResponses.ObraCampo> obrasCampo = new ArrayList<>();
        for (Obra obra : obras.values()) {
            obrasCampo.add(obraCampo(obra, locaisPorObra));
        }
        List<CampoObrasResponses.ProgramacaoCampo> programacoes = enviadas.stream()
                .map(p -> programacaoCampo(p, obras.get(p.getIdObra()), locaisPorObra.getOrDefault(p.getIdObra(), Map.of()), hoje))
                .toList();
        List<CampoObrasResponses.Aviso> avisos = eventos.stream()
                .filter(e -> e.getTipo() != com.nexo.app.modules.obras.domain.TipoEventoProgramacao.CRIADA || desde != null)
                .map(e -> new CampoObrasResponses.Aviso(e.getId(), e.getTipo(), e.getIdProgramacao(), e.getNumeroProgramacao(),
                        e.getIdObra(), e.getNumeroObra(), textoAviso(e, equipe), e.getDataCriacao()))
                .toList();
        return new CampoObrasResponses.Pacote(agora, desde, equipe, dadosEquipe.codigo(), hoje, fim, programacoes,
                List.copyOf(removidas), obrasCampo, modeloApr(), modelosFoto(), avisos, liberacaoDoDia(equipe, hoje),
                obrasAbertas(dadosEquipe));
    }

    /**
     * Obra para a execução avulsa (fora da agenda): a obra como no pacote e os itens que a equipe ainda pode executar —
     * pendentes, ou já incluídos na programação avulsa dela hoje. Obra encerrada não aparece.
     */
    @Transactional(readOnly = true)
    public CampoObrasResponses.ObraAvulsa buscarAvulsa(UUID usuario, String numero) {
        UUID equipe = campo.equipeDoUsuario(usuario)
                .orElseThrow(() -> new InvarianteVioladaException("A execução avulsa é da equipe de campo: o usuário não é encarregado de uma equipe."));
        Obra obra = obraRepository.findByNumeroIgnoreCaseAndAtivoTrue(numero == null ? "" : numero.trim())
                .filter(o -> !o.getStatusObra().isConcluida())
                .orElseThrow(() -> new RecursoNaoEncontradoException("Obra não encontrada ou encerrada."));
        Map<UUID, Map<UUID, String>> locaisPorObra = new HashMap<>();
        CampoObrasResponses.ObraCampo obraCampo = obraCampo(obra, locaisPorObra);
        Map<UUID, String> locais = locaisPorObra.getOrDefault(obra.getId(), Map.of());
        Optional<Programacao> avulsa = programacaoRepository.buscarAvulsa(obra.getId(), equipe, LocalDate.now(FUSO));
        Programaveis programaveis = itensProgramaveis(obra.getId(), locais, avulsa);
        return new CampoObrasResponses.ObraAvulsa(obraCampo, programaveis.itens(), programaveis.emOutra());
    }

    /**
     * APRs concluídas e impedimentos da equipe hoje, de todos os turnos do dia: o app junta com o que tem no aparelho, para
     * não pedir de novo a APR feita em outro aparelho ou antes de sair e entrar.
     */
    /** Obras em aberto da base da equipe (até 2000): sem sinal, a equipe ainda acha a obra para começar uma avulsa. */
    private List<CampoObrasResponses.ObraResumo> obrasAbertas(EquipeResponse equipe) {
        if (equipe.baseOperacional() == null) {
            return List.of();
        }
        List<Obra> abertas = obraRepository.listarAbertasDaBase(equipe.baseOperacional().id());
        Map<UUID, String> municipios = new HashMap<>();
        return abertas.stream().limit(2000).map(o -> new CampoObrasResponses.ObraResumo(o.getId(), o.getNumero(), o.getTitulo(),
                o.getIdMunicipio() == null ? null : municipios.computeIfAbsent(o.getIdMunicipio(),
                        id -> municipioApi.buscarPorIdResponse(id).map(MunicipioResponse::nome).orElse(null)))).toList();
    }

    private List<CampoObrasResponses.LiberacaoDia> liberacaoDoDia(UUID equipe, LocalDate hoje) {
        OffsetDateTime inicio = hoje.atStartOfDay(FUSO).toOffsetDateTime();
        List<UUID> turnos = turnoApi.listarSobrepostosAoPeriodo(inicio, inicio.plusDays(1), List.of(equipe)).stream()
                .map(com.nexo.app.modules.execucao.application.dto.TurnoResponse::id).toList();
        if (turnos.isEmpty()) {
            return List.of();
        }
        List<CampoObrasResponses.LiberacaoDia> lista = new ArrayList<>();
        aprRepository.findByIdTurnoInAndAtivoTrue(turnos).stream()
                .filter(a -> a.getStatus() == StatusAprTurno.CONCLUIDA && a.getDataConclusao() != null
                        && a.getDataConclusao().atZoneSameInstant(FUSO).toLocalDate().equals(hoje))
                .forEach(a -> lista.add(new CampoObrasResponses.LiberacaoDia("APR", a.getIdObra(),
                        a.getCampo() != null ? a.getCampo().getIdLocal() : null, a.getDataConclusao())));
        ocorrenciaRepository.findByIdTurnoInAndAtivoTrue(turnos).stream()
                .filter(o -> o.isImpedeExecucao() && o.momento() != null && o.momento().atZoneSameInstant(FUSO).toLocalDate().equals(hoje))
                .forEach(o -> lista.add(new CampoObrasResponses.LiberacaoDia("IMPEDIMENTO", o.getIdObra(),
                        o.getCampo() != null ? o.getCampo().getIdLocal() : null, o.momento())));
        return lista;
    }

    /** Projeto em PDF da obra, para o aparelho guardar offline. */
    @Transactional(readOnly = true)
    public DownloadAnexoObraDTO baixarProjeto(UUID usuario, UUID idObra) {
        Optional<UUID> equipe = campo.equipeDoUsuario(usuario);
        if (equipe.isPresent()) {
            LocalDate hoje = LocalDate.now(FUSO);
            boolean naAgenda = programacaoRepository.listarDaEquipeNoPeriodoComItens(equipe.get(), hoje.minusDays(1), hoje.plusDays(DIAS_A_FRENTE))
                    .stream().anyMatch(p -> p.getIdObra().equals(idObra));
            // Fora da agenda, só obra em aberto: é a execução avulsa, que a equipe começa buscando a obra.
            boolean emAberto = obraRepository.findById(idObra).map(o -> o.isAtivo() && !o.getStatusObra().isConcluida()).orElse(false);
            if (!naAgenda && !emAberto) {
                throw new AcessoNegadoException("A obra não está na agenda da sua equipe.");
            }
        }
        AnexoObra anexo = projetoMestre(idObra)
                .orElseThrow(() -> new RecursoNaoEncontradoException("A obra não tem projeto em PDF."));
        StorageObject objeto = objectStorage.baixar(anexo.getChaveStorage());
        // O tamanho vem do arquivo que sai do armazenamento: com o do cadastro, um anexo regravado deixaria o app
        // esperando bytes que não chegam.
        long tamanho = objeto.tamanhoBytes() > 0 ? objeto.tamanhoBytes() : anexo.getTamanhoBytes();
        return new DownloadAnexoObraDTO(objeto.conteudo(), anexo.getNomeArquivo(), anexo.getContentType(), tamanho);
    }

    /** Versão do arquivo: a chave do armazenamento muda a cada envio, e o tamanho separa o improvável. */
    public static String hashProjeto(AnexoObra anexo) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest((anexo.getChaveStorage() + "|" + anexo.getTamanhoBytes()).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private UUID equipeDoPacote(UUID usuario, UUID idEquipe) {
        Optional<UUID> propria = campo.equipeDoUsuario(usuario);
        if (propria.isPresent()) {
            if (idEquipe != null && !idEquipe.equals(propria.get())) {
                throw new AcessoNegadoException("O pacote de outra equipe não pode ser baixado por este usuário.");
            }
            return propria.get();
        }
        if (idEquipe == null) {
            throw new InvarianteVioladaException("Informe a equipe: o usuário não é encarregado de uma equipe.");
        }
        return idEquipe;
    }

    private static boolean mudouDesde(Programacao p, OffsetDateTime desde, List<EventoProgramacao> eventos) {
        if (depois(p.getDataCriacao(), desde) || depois(p.getDataUltimaAlteracao(), desde)) {
            return true;
        }
        if (eventos.stream().anyMatch(e -> p.getId().equals(e.getIdProgramacao()))) {
            return true;
        }
        return p.getItensAtivos().stream().map(ProgramacaoItem::getItemPlanejado)
                .anyMatch(i -> depois(i.getDataUltimaAlteracao(), desde));
    }

    private static boolean depois(OffsetDateTime momento, OffsetDateTime referencia) {
        return momento != null && momento.isAfter(referencia);
    }

    private CampoObrasResponses.ObraCampo obraCampo(Obra obra, Map<UUID, Map<UUID, String>> locaisPorObra) {
        List<PontoPlanejamento> pontos = pontoRepository.findByIdObraAndAtivoTrueOrderByPaginaAscNumeroAsc(obra.getId());
        List<VaoPlanejamento> vaos = vaoRepository.findByIdObraAndAtivoTrue(obra.getId());
        Map<UUID, String> numeros = pontos.stream().collect(Collectors.toMap(PontoPlanejamento::getId, PontoPlanejamento::getNumero, (a, b) -> a));
        Map<UUID, String> locais = new HashMap<>();
        numeros.forEach((id, numero) -> locais.put(id, "P" + numero));
        vaos.forEach(v -> locais.put(v.getId(), "P" + numeros.get(v.getIdPontoA()) + " — P" + numeros.get(v.getIdPontoB())));
        locaisPorObra.put(obra.getId(), locais);

        Optional<PlanejamentoObra> planejamento = planejamentoRepository.findByIdObraAndAtivoTrue(obra.getId());
        CampoObrasResponses.ProjetoPdf projeto = projetoMestre(obra.getId())
                .map(a -> new CampoObrasResponses.ProjetoPdf(a.getId(), a.getNomeArquivo(), a.getTamanhoBytes(), hashProjeto(a)))
                .orElse(null);
        List<EvidenciaPonto> fotos = evidenciaRepository.findByIdObraAndAtivoTrueOrderByDataCriacaoAsc(obra.getId());
        List<FichaAsBuilt> fichas = fichaRepository.findByIdObraAndAtivoTrue(obra.getId());
        UUID idModelo = fichas.stream().map(FichaAsBuilt::getIdModelo).filter(Objects::nonNull).findFirst()
                .or(() -> fotos.stream().map(EvidenciaPonto::getIdModelo).filter(Objects::nonNull).findFirst())
                .orElse(null);
        String municipio = obra.getIdMunicipio() == null ? null
                : municipioApi.buscarPorIdResponse(obra.getIdMunicipio()).map(MunicipioResponse::nome).orElse(null);
        return new CampoObrasResponses.ObraCampo(obra.getId(), obra.getNumero(), obra.getTitulo(), obra.getEndereco(),
                obra.getReferencia(), obra.getLatitude(), obra.getLongitude(), municipio, projeto,
                planejamento.map(PlanejamentoObra::getRotacoes).map(Map::copyOf).orElse(Map.of()),
                pontos.stream().map(p -> new CampoObrasResponses.PontoCampo(p.getId(), p.getNumero(), p.getPagina(), p.getX(), p.getY(),
                        p.getTipo() != null ? p.getTipo().name() : null, p.getTipoExecucao() != null ? p.getTipoExecucao().name() : null,
                        p.isTemPoda(), p.isTemAterramento())).toList(),
                vaos.stream().map(v -> new CampoObrasResponses.VaoCampo(v.getId(), v.getIdPontoA(), v.getIdPontoB(), v.getMetragem())).toList(),
                idModelo,
                fotos.stream().filter(f -> !f.reprovada()).map(f -> new CampoObrasResponses.FotoCampo(f.getId(), f.getIdLocal(), f.getIdPonto(), f.getIdVao(),
                        f.getIdModelo(), f.getIdItem(), f.getEtapa() != null ? f.getEtapa().name() : null)).toList(),
                pendenciasFoto(obra.getId(), pontos, fotos, fichas, idModelo),
                itensProgramaveis(obra.getId(), locais, Optional.empty()).itens(),
                visitaPrevia(obra.getId()));
    }

    private CampoObrasResponses.VisitaCampo visitaPrevia(UUID idObra) {
        return visitaRepository.findByIdObraAndAtivoTrueOrderByDataVisitaDescDataCriacaoDesc(idObra).stream().findFirst()
                .map(v -> new CampoObrasResponses.VisitaCampo(v.getDataVisita(), v.getResponsavel(), v.getObservacoes(),
                        v.getRespostas() == null ? List.of() : v.getRespostas().itens().stream()
                                .map(PacoteCampoObras::pontoDeAtencao).filter(Objects::nonNull).toList()))
                .orElse(null);
    }

    /** "Há poda?" + "Sim" vira "Há poda? Sim"; "Zona" + "Rural" vira "Zona: Rural". */
    private static String rotulo(String enunciado) {
        String e = enunciado == null ? "" : enunciado.trim();
        return e.endsWith("?") ? e + " " : e + ": ";
    }

    /** Texto livre preenchido ou escolha diferente da esperada pelo modelo vira um ponto de atenção para a equipe. */
    static String pontoDeAtencao(RespostasChecklist.Item item) {
        if (item.naoSeAplica()) return null;
        if (item.tipo() == EstruturaChecklist.TipoPergunta.TEXTO && item.valor() != null && !item.valor().isBlank()) {
            return rotulo(item.enunciado()) + item.valor().trim();
        }
        List<String> sel = item.selecionadas() == null ? List.of() : item.selecionadas();
        if (item.opcaoConforme() != null && !sel.isEmpty() && !sel.contains(item.opcaoConforme())) {
            return rotulo(item.enunciado()) + String.join(", ", sel);
        }
        return null;
    }

    private record Programaveis(List<CampoObrasResponses.ItemCampo> itens, int emOutra) {
    }

    /** Itens da obra que a equipe pode executar fora da programação: pendentes, ou já na avulsa dela hoje. */
    private Programaveis itensProgramaveis(UUID idObra, Map<UUID, String> locais, Optional<Programacao> avulsa) {
        List<CampoObrasResponses.ItemCampo> itens = new ArrayList<>();
        int emOutra = 0;
        for (KitAplicado kit : kitRepository.listarComItens(idObra)) {
            if (!kit.isAtivo()) {
                continue;
            }
            for (ItemPlanejado item : kit.getItensAtivos()) {
                boolean naAvulsa = avulsa.map(p -> p.contem(item.getId())).orElse(false);
                if (!item.programavel() && !naAvulsa) {
                    if (item.getStatus() == StatusItemPlanejado.PROGRAMADO) {
                        emOutra++;
                    }
                    continue;
                }
                UUID local = kit.getIdPonto() != null ? kit.getIdPonto() : kit.getIdVao();
                itens.add(new CampoObrasResponses.ItemCampo(item.getId(), kit.getIdPonto(), kit.getIdVao(), locais.get(local),
                        item.getTipo(), item.getIdMaterial(), item.getCodigo(), item.getDescricao(), item.getUnidade(),
                        kit.getCodigoKit(), item.getQuantidadePrevista(), item.getQuantidadeExecutada(), item.getStatus()));
            }
        }
        return new Programaveis(itens, emOutra);
    }

    /**
     * Fotos obrigatórias do modelo que faltam nos pontos já executados (algum item com execução). Foto faltando não
     * bloqueia nada: vira pendência visível para a equipe e para o web.
     */
    public List<CampoObrasResponses.PendenciaFoto> pendenciasFoto(UUID idObra) {
        List<PontoPlanejamento> pontos = pontoRepository.findByIdObraAndAtivoTrueOrderByPaginaAscNumeroAsc(idObra);
        List<EvidenciaPonto> fotos = evidenciaRepository.findByIdObraAndAtivoTrueOrderByDataCriacaoAsc(idObra);
        List<FichaAsBuilt> fichas = fichaRepository.findByIdObraAndAtivoTrue(idObra);
        UUID idModelo = fichas.stream().map(FichaAsBuilt::getIdModelo).filter(Objects::nonNull).findFirst()
                .or(() -> fotos.stream().map(EvidenciaPonto::getIdModelo).filter(Objects::nonNull).findFirst())
                .orElse(null);
        return pendenciasFoto(idObra, pontos, fotos, fichas, idModelo);
    }

    private List<CampoObrasResponses.PendenciaFoto> pendenciasFoto(UUID idObra, List<PontoPlanejamento> pontos,
                                                                   List<EvidenciaPonto> fotos, List<FichaAsBuilt> fichas,
                                                                   UUID idModeloObra) {
        Set<UUID> executados = new java.util.HashSet<>();
        for (Programacao p : programacaoRepository.listarDaObraComItens(idObra)) {
            for (ProgramacaoItem v : p.getItensAtivos()) {
                ItemPlanejado item = v.getItemPlanejado();
                KitAplicado kit = item.getKitAplicado();
                if (item.temExecucao() && kit.getIdPonto() != null) {
                    executados.add(kit.getIdPonto());
                }
            }
        }
        Map<UUID, UUID> modeloDoPonto = new HashMap<>();
        fichas.forEach(f -> modeloDoPonto.put(f.getIdPonto(), f.getIdModelo()));
        Map<UUID, ModeloChecklistObra> modelos = new HashMap<>();
        List<CampoObrasResponses.PendenciaFoto> pendencias = new ArrayList<>();
        for (PontoPlanejamento ponto : pontos) {
            if (!executados.contains(ponto.getId())) {
                continue;
            }
            UUID idModelo = modeloDoPonto.getOrDefault(ponto.getId(), idModeloObra);
            if (idModelo == null) {
                continue;
            }
            ModeloChecklistObra modelo = modelos.computeIfAbsent(idModelo, id -> modeloRepository.findById(id).orElse(null));
            if (modelo == null) {
                continue;
            }
            Set<String> respondidos = fotos.stream().filter(f -> ponto.getId().equals(f.getIdPonto()) && f.getIdItem() != null && !f.reprovada())
                    .map(EvidenciaPonto::getIdItem).collect(Collectors.toSet());
            for (EstruturaChecklist.ItemEvidencia item : modelo.getEstrutura().evidencias()) {
                if (item.obrigatoria() && !respondidos.contains(item.id())) {
                    String motivo = fotos.stream()
                            .filter(f -> ponto.getId().equals(f.getIdPonto()) && item.id().equals(f.getIdItem()) && f.reprovada())
                            .reduce((a, b) -> b)
                            .map(f -> f.getInconformidade().rotulo() + (f.getMotivoReprovacao() != null ? ": " + f.getMotivoReprovacao() : ""))
                            .orElse(null);
                    pendencias.add(new CampoObrasResponses.PendenciaFoto(ponto.getId(), ponto.getNumero(), item.id(), item.titulo(), motivo));
                }
            }
        }
        return pendencias;
    }

    private Optional<AnexoObra> projetoMestre(UUID idObra) {
        return planejamentoRepository.findByIdObraAndAtivoTrue(idObra)
                .map(PlanejamentoObra::getIdAnexoMestre)
                .flatMap(idAnexo -> anexoRepository.findByIdAndObraIdAndAtivoTrue(idAnexo, idObra));
    }

    private static CampoObrasResponses.ProgramacaoCampo programacaoCampo(Programacao p, Obra obra, Map<UUID, String> locais, LocalDate hoje) {
        List<CampoObrasResponses.ItemCampo> itens = p.getItensAtivos().stream().map(v -> {
            ItemPlanejado item = v.getItemPlanejado();
            KitAplicado kit = item.getKitAplicado();
            UUID local = kit.getIdPonto() != null ? kit.getIdPonto() : kit.getIdVao();
            return new CampoObrasResponses.ItemCampo(item.getId(), kit.getIdPonto(), kit.getIdVao(), locais.get(local),
                    item.getTipo(), item.getIdMaterial(), item.getCodigo(), item.getDescricao(), item.getUnidade(),
                    kit.getCodigoKit(), v.getQuantidade(), item.getQuantidadeExecutada(), item.getStatus());
        }).toList();
        return new CampoObrasResponses.ProgramacaoCampo(p.getId(), p.getNumero(), p.getIdObra(), obra != null ? obra.getNumero() : null,
                p.getDataInicio(), p.getDataFim(), p.getDescricao(), p.getTurno(), p.isLinhaViva(), p.isDesligamento(),
                p.getHoraDesligamentoInicio(), p.getHoraDesligamentoFim(), p.getNumeroManobra(), p.isFinalizaObra(),
                p.getSituacaoIntervencao(), p.getObservacao(), p.situacaoEm(hoje), p.getVersao(), itens, p.isAvulsa());
    }

    static CampoObrasResponses.ModeloApr modeloApr() {
        Map<String, CampoObrasResponses.Sugestao> sugestoes = new LinkedHashMap<>();
        sugestoes.put("SEMPRE", new CampoObrasResponses.Sugestao(List.of("Queda de materiais ou ferramentas"),
                List.of("Sinalização e isolamento da área", "EPI e EPC")));
        sugestoes.put("DESLIGAMENTO", new CampoObrasResponses.Sugestao(List.of("Choque elétrico", "Arco elétrico"),
                List.of("Desenergização", "Bloqueio e aterramento")));
        sugestoes.put("LINHA_VIVA", new CampoObrasResponses.Sugestao(List.of("Choque elétrico", "Arco elétrico", "Queda de altura"),
                List.of("Linha viva", "Inspeção de escada e cinto")));
        sugestoes.put("PODA", new CampoObrasResponses.Sugestao(List.of("Queda de altura", "Queda de materiais ou ferramentas", "Animais peçonhentos"),
                List.of("Inspeção de escada e cinto")));
        sugestoes.put("ATERRAMENTO", new CampoObrasResponses.Sugestao(List.of("Choque elétrico", "Escavação"),
                List.of("Bloqueio e aterramento")));
        // Implantar ou retirar poste: içamento com guindauto, cava e trabalho em altura.
        sugestoes.put("POSTE", new CampoObrasResponses.Sugestao(List.of("Movimentação de carga", "Escavação", "Queda de altura"),
                List.of("Plano de içamento", "Sinalização e isolamento da área", "Inspeção de escada e cinto")));
        // Visita prévia apontou fluxo de veículos ou interdição da via.
        sugestoes.put("TRAFEGO", new CampoObrasResponses.Sugestao(List.of("Tráfego de veículos"),
                List.of("Sinalização e isolamento da área")));
        return new CampoObrasResponses.ModeloApr(RISCOS, MEDIDAS, VERIFICACOES, sugestoes);
    }

    private List<CampoObrasResponses.ModeloFoto> modelosFoto() {
        return modeloRepository.findAll().stream()
                .filter(m -> m.isAtivo() && m.getFinalidade() == ModeloChecklistObra.Finalidade.AS_BUILT
                        && !m.getEstrutura().evidencias().isEmpty())
                .map(m -> new CampoObrasResponses.ModeloFoto(m.getId(), m.getTitulo(), m.getEstrutura().evidencias().stream()
                        .map(i -> new CampoObrasResponses.ItemFoto(i.id(), i.titulo(), i.obrigatoria(), i.etapa() != null ? i.etapa().name() : null)).toList()))
                .toList();
    }

    private static String textoAviso(EventoProgramacao e, UUID equipe) {
        String alvo = "Programação #" + e.getNumeroProgramacao() + (e.getNumeroObra() != null ? " da obra " + e.getNumeroObra() : "");
        return switch (e.getTipo()) {
            case CRIADA -> alvo + " entrou na agenda.";
            case EDITADA -> alvo + " foi alterada" + (e.getObservacao() != null ? ": " + e.getObservacao() : ".");
            case REPROGRAMADA -> equipe.equals(e.getIdEquipeDestino())
                    ? alvo + " foi reprogramada" + periodo(e) + "."
                    : alvo + " passou para outra equipe.";
            case CANCELADA -> alvo + " foi cancelada" + (e.getObservacao() != null ? ": " + e.getObservacao() : ".");
            case EXCLUIDA -> alvo + " saiu da agenda.";
        };
    }

    private static String periodo(EventoProgramacao e) {
        if (e.getInicioNovo() == null) {
            return "";
        }
        java.time.format.DateTimeFormatter f = java.time.format.DateTimeFormatter.ofPattern("dd/MM");
        return " para " + e.getInicioNovo().format(f) + (e.getFimNovo() != null && !e.getFimNovo().equals(e.getInicioNovo())
                ? " a " + e.getFimNovo().format(f) : "");
    }
}
