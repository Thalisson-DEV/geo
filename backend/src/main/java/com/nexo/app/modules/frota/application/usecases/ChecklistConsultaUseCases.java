package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.application.dto.ArquivoFotoChecklist;
import com.nexo.app.modules.frota.application.dto.ChecklistAppItemResponse;
import com.nexo.app.modules.frota.application.dto.ChecklistDetalheResponse;
import com.nexo.app.modules.frota.application.dto.ChecklistFilter;
import com.nexo.app.modules.frota.application.dto.ChecklistResumoResponse;
import com.nexo.app.modules.frota.application.dto.VeiculoSemChecklistResponse;
import com.nexo.app.modules.frota.domain.Checklist;
import com.nexo.app.modules.frota.domain.FichaVeiculo;
import com.nexo.app.modules.frota.domain.FotoRecebimentoChecklist;
import com.nexo.app.modules.frota.domain.OrdemServico;
import com.nexo.app.modules.frota.domain.PendenciaChecklist;
import com.nexo.app.modules.frota.domain.RespostaChecklist;
import com.nexo.app.modules.frota.domain.SituacaoOperacional;
import com.nexo.app.modules.frota.domain.TipoFotoChecklist;
import com.nexo.app.modules.frota.domain.VinculoCondutor;
import com.nexo.app.modules.frota.infrastructure.persistence.ChecklistRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.ChecklistSpecification;
import com.nexo.app.modules.frota.infrastructure.persistence.FichaVeiculoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.LeituraOdometroRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.LiberacaoCnhRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.ModeloChecklistRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.OrdemServicoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.PendenciaChecklistRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.VinculoCondutorRepository;
import com.nexo.app.shared.application.dto.PageResponse;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import com.nexo.app.shared.infrastructure.security.SecurityUtils;
import com.nexo.app.shared.infrastructure.storage.ObjectStorageService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.IntStream;
import java.util.stream.Collectors;

/** Consultas do checklist: lista, detalhe com fotos e veículos sem checklist no dia (web) e os do app. */
@Service
@RequiredArgsConstructor
public class ChecklistConsultaUseCases {

    private static final DateTimeFormatter HORA = DateTimeFormatter.ofPattern("HH:mm");

    private final ChecklistRepository repository;
    private final ModeloChecklistRepository modelos;
    private final PendenciaChecklistRepository pendencias;
    private final OrdemServicoRepository ordens;
    private final LiberacaoCnhRepository liberacoes;
    private final FichaVeiculoRepository fichas;
    private final LeituraOdometroRepository leituras;
    private final VinculoCondutorRepository vinculoRepository;
    private final VinculoCondutorUseCases vinculos;
    private final ReferenciasFrota referencias;
    private final ObjectStorageService objectStorage;
    private final HistoricoChecklist historico;

    @Transactional(readOnly = true)
    public PageResponse<ChecklistResumoResponse> listar(ChecklistFilter filtro, Pageable pageable) {
        var pagina = repository.findAll(ChecklistSpecification.of(filtro), pageable);
        return PageResponse.fromPage(new PageImpl<>(resumos(pagina.getContent()), pageable, pagina.getTotalElements()));
    }

    /** App: os checklists que a pessoa preencheu nos últimos {@code dias}, em qualquer aparelho. */
    @Transactional(readOnly = true)
    public List<ChecklistAppItemResponse> meusNoApp(int dias) {
        var usuario = SecurityUtils.getUsuarioLogadoId();
        if (usuario == null) {
            return List.of();
        }
        var desde = OffsetDateTime.now().minusDays(Math.clamp(dias, 1, 90));
        return itensApp(repository.findTop50ByIdUsuarioPreenchimentoAndPreenchidoEmGreaterThanEqualAndAtivoTrueOrderByPreenchidoEmDesc(usuario, desde));
    }

    /** App: os últimos checklists do veículo, de qualquer pessoa (ver como o veículo foi entregue). */
    @Transactional(readOnly = true)
    public List<ChecklistAppItemResponse> doVeiculoNoApp(UUID idVeiculo) {
        return itensApp(repository.findTop20ByIdVeiculoAndAtivoTrueOrderByPreenchidoEmDesc(idVeiculo));
    }

    @Transactional(readOnly = true)
    public ChecklistDetalheResponse detalhar(UUID id) {
        var checklist = buscar(id);
        var porResposta = pendencias.findAllByIdChecklist(id).stream()
                .collect(Collectors.toMap(p -> p.getResposta().getId(), Function.identity()));
        Map<UUID, Long> numeros = ordens.findAllById(porResposta.values().stream().map(PendenciaChecklist::getIdOrdemServico)
                        .filter(Objects::nonNull).distinct().toList()).stream()
                .collect(Collectors.toMap(OrdemServico::getId, OrdemServico::getNumero));
        var decisores = referencias.nomesPessoas(porResposta.values().stream().map(PendenciaChecklist::getIdUsuarioDecisao)
                .filter(Objects::nonNull).distinct().toList());
        var historicos = historico.porPergunta(checklist.getIdVeiculo(), checklist.problemas().stream()
                .map(r -> r.getPergunta().getId()).toList(), checklist.getPreenchidoEm());
        var respostas = checklist.getRespostas().stream().map(r -> {
            var pendencia = porResposta.get(r.getId());
            return new ChecklistDetalheResponse.Resposta(
                    r.getId(),
                    r.getGrupo(),
                    r.getPerguntaTexto(),
                    r.getTipoResposta(),
                    r.getConforme(),
                    textoResposta(r),
                    r.getComentario(),
                    r.isProblema(),
                    checklist.getFotos().stream()
                            .filter(f -> f.getResposta() != null && f.getResposta().getId().equals(r.getId()))
                            .map(PendenciaChecklistUseCases::foto).toList(),
                    pendencia == null ? null : pendencia.getId(),
                    pendencia == null ? null : pendencia.getSituacao(),
                    pendencia == null || pendencia.getIdOrdemServico() == null ? null : numeros.get(pendencia.getIdOrdemServico()),
                    pendencia == null ? null : pendencia.getIdOrdemServico(),
                    r.isProblema() ? historicos.get(r.getPergunta().getId()) : null,
                    pendencia == null ? null : pendencia.getDecididaEm(),
                    pendencia == null || pendencia.getIdUsuarioDecisao() == null ? null : decisores.get(pendencia.getIdUsuarioDecisao()),
                    pendencia == null ? null : pendencia.getJustificativa());
        }).toList();
        // Na ordem do modelo (frente, traseira, laterais, painel), não na ordem em que chegaram.
        Map<UUID, Integer> ordem = modelos.findById(checklist.getIdModelo())
                .map(m -> m.getFotosRecebimento().stream().collect(Collectors.toMap(FotoRecebimentoChecklist::getId, FotoRecebimentoChecklist::getOrdem)))
                .orElse(Map.of());
        var recebimento = checklist.getFotos().stream()
                .filter(f -> f.getTipo() == TipoFotoChecklist.RECEBIMENTO)
                .sorted(Comparator.comparing(f -> ordem.getOrDefault(f.getIdFotoRecebimento(), Integer.MAX_VALUE)))
                .map(PendenciaChecklistUseCases::foto).toList();
        var justificativa = checklist.getIdLiberacaoCnh() == null ? null
                : liberacoes.findById(checklist.getIdLiberacaoCnh()).map(l -> l.getJustificativa()).orElse(null);
        return new ChecklistDetalheResponse(resumos(List.of(checklist)).getFirst(), checklist.getComentario(),
                checklist.isAssinado(), justificativa, respostas, recebimento);
    }

    @Transactional(readOnly = true)
    public ArquivoFotoChecklist baixarFoto(UUID idChecklist, UUID idFoto) {
        var foto = buscar(idChecklist).getFotos().stream()
                .filter(f -> f.getId().equals(idFoto))
                .findFirst()
                .orElseThrow(() -> new RecursoNaoEncontradoException("Foto não encontrada neste checklist."));
        if (!foto.isRecebida()) {
            throw new RecursoNaoEncontradoException("A foto ainda não chegou do celular de quem preencheu.");
        }
        var objeto = objectStorage.baixar(foto.getArquivoChave());
        return new ArquivoFotoChecklist(foto.getArquivoNome(), foto.getArquivoContentType(), foto.getArquivoTamanhoBytes(),
                objeto.conteudo());
    }

    @Transactional(readOnly = true)
    public List<VeiculoSemChecklistResponse> semChecklistHoje(Collection<UUID> idsBase) {
        return semChecklist(LocalDate.now(LiberacaoCnhUseCases.FUSO), idsBase);
    }

    /**
     * Veículos ativos usados no dia (leitura ou vínculo de outra origem que não o checklist)
     * sem checklist no dia, ou com troca de condutor depois do último checklist. Só avisa: não bloqueia nada.
     */
    @Transactional(readOnly = true)
    public List<VeiculoSemChecklistResponse> semChecklist(LocalDate dia, Collection<UUID> idsBase) {
        var inicio = dia.atStartOfDay(LiberacaoCnhUseCases.FUSO).toOffsetDateTime();
        var fim = dia.plusDays(1).atStartOfDay(LiberacaoCnhUseCases.FUSO).toOffsetDateTime();

        Map<UUID, OffsetDateTime> ultimoChecklist = new HashMap<>();
        repository.findAllByPreenchidoEmGreaterThanEqualAndPreenchidoEmLessThanAndAtivoTrue(inicio, fim).stream()
                // Recebimento e devolução não contam como o checklist do dia.
                .filter(c -> c.getFinalidade().temCondutor())
                .forEach(c -> ultimoChecklist.merge(c.getIdVeiculo(), c.getPreenchidoEm(), (a, b) -> a.isAfter(b) ? a : b));
        Map<UUID, OffsetDateTime> ultimaTroca = new HashMap<>();
        vinculoRepository.iniciadosForaDoChecklist(inicio, fim)
                .forEach(v -> ultimaTroca.merge(v.getIdVeiculo(), v.getInicio(), (a, b) -> a.isAfter(b) ? a : b));
        var usados = new HashSet<>(leituras.veiculosComLeituraForaDoChecklist(inicio, fim));
        usados.addAll(ultimaTroca.keySet());

        var fichasUsadas = fichas.findAllByIdVeiculoIn(usados).stream()
                .filter(f -> f.isAtivo() && f.getSituacao() != SituacaoOperacional.BAIXADO)
                .filter(f -> idsBase == null || idsBase.isEmpty() || idsBase.contains(f.getIdBaseOperacional()))
                .toList();
        var bases = referencias.nomesBases(fichasUsadas.stream().map(FichaVeiculo::getIdBaseOperacional).filter(Objects::nonNull).distinct().toList());
        var abertos = vinculos.abertosPorVeiculo(fichasUsadas.stream().map(FichaVeiculo::getIdVeiculo).toList());
        var condutores = referencias.nomesColaboradores(abertos.values().stream().map(VinculoCondutor::getIdColaborador).distinct().toList());

        return fichasUsadas.stream().map(f -> {
            var checklist = ultimoChecklist.get(f.getIdVeiculo());
            var troca = ultimaTroca.get(f.getIdVeiculo());
            String motivo;
            if (checklist == null) {
                motivo = "Usado hoje sem checklist";
            } else if (troca != null && troca.isAfter(checklist)) {
                motivo = "Condutor trocado às " + HORA.format(troca.atZoneSameInstant(LiberacaoCnhUseCases.FUSO)) + " sem checklist";
            } else {
                return null;
            }
            var vinculo = abertos.get(f.getIdVeiculo());
            return new VeiculoSemChecklistResponse(f.getIdVeiculo(), f.getPlaca(), f.getIdBaseOperacional(),
                    f.getIdBaseOperacional() == null ? null : bases.get(f.getIdBaseOperacional()), motivo, checklist,
                    vinculo == null ? null : condutores.get(vinculo.getIdColaborador()));
        }).filter(Objects::nonNull).sorted(Comparator.comparing(VeiculoSemChecklistResponse::placa)).toList();
    }

    private List<ChecklistAppItemResponse> itensApp(List<Checklist> lista) {
        var resumos = resumos(lista);
        return IntStream.range(0, lista.size())
                .mapToObj(i -> new ChecklistAppItemResponse(lista.get(i).getIdAparelho(), resumos.get(i)))
                .toList();
    }

    private Checklist buscar(UUID id) {
        return repository.findById(id).filter(Checklist::isAtivo)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Checklist não encontrado."));
    }

    private List<ChecklistResumoResponse> resumos(List<Checklist> lista) {
        var condutores = referencias.nomesColaboradores(lista.stream().map(Checklist::getIdCondutor)
                .filter(Objects::nonNull).distinct().toList());
        var pessoas = referencias.nomesPessoasUsuarios(lista.stream().map(Checklist::getIdUsuarioPreenchimento).distinct().toList());
        var bases = referencias.nomesBases(lista.stream().map(Checklist::getIdBaseOperacional).filter(Objects::nonNull).distinct().toList());
        return lista.stream().map(c -> new ChecklistResumoResponse(
                c.getId(),
                c.getPreenchidoEm(),
                c.getIdVeiculo(),
                c.getPlaca(),
                c.getIdBaseOperacional() == null ? null : bases.get(c.getIdBaseOperacional()),
                c.getModeloNome(),
                c.getIdCondutor() == null ? null : condutores.get(c.getIdCondutor()),
                pessoas.get(c.getIdUsuarioPreenchimento()),
                c.getMedicao(),
                c.getUnidadeMedicao(),
                c.isPassagemVeiculo(),
                c.problemas().size(),
                (int) c.getFotos().stream().filter(f -> !f.isRecebida()).count(),
                c.getIdLiberacaoCnh() != null,
                c.getFinalidade(),
                c.getFinalidade().getRotulo(),
                c.getCnhMotivo())).toList();
    }

    private static String textoResposta(RespostaChecklist r) {
        return switch (r.getTipoResposta()) {
            case OK_NOK -> Boolean.TRUE.equals(r.getConforme()) ? "OK"
                    : (r.getMotivoTexto() == null ? "Não OK" : "Não OK — " + r.getMotivoTexto());
            case OPCOES, TEXTO -> r.getRespostaTexto();
        };
    }
}
