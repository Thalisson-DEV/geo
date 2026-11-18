package com.nexo.app.modules.obras.application.usecases;

import com.nexo.app.modules.obras.application.dto.DocumentacaoTecnicaRequests;
import com.nexo.app.modules.obras.application.dto.DocumentacaoTecnicaResponses;
import com.nexo.app.modules.obras.domain.DocumentoAsBuilt;
import com.nexo.app.modules.obras.domain.EquipamentoObra;
import com.nexo.app.modules.obras.domain.EstruturaChecklist;
import com.nexo.app.modules.obras.domain.EvidenciaPonto;
import com.nexo.app.modules.obras.domain.FichaAsBuilt;
import com.nexo.app.modules.obras.domain.ModeloChecklistObra;
import com.nexo.app.modules.obras.domain.Obra;
import com.nexo.app.modules.obras.domain.PontoPlanejamento;
import com.nexo.app.modules.obras.domain.RespostasChecklist;
import com.nexo.app.modules.obras.domain.VisitaPreviaObra;
import com.nexo.app.modules.obras.infrastructure.persistence.DocumentoAsBuiltRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.EquipamentoObraRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.EvidenciaPontoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.EvidenciaVisitaPreviaRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.FichaAsBuiltRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.ItemPlanejadoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.ObraRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.PlanejamentoObraRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.PontoPlanejamentoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.VisitaPreviaObraRepository;
import com.nexo.app.modules.obras.domain.EvidenciaVisitaPrevia;
import com.nexo.app.modules.rh.ColaboradorApi;
import com.nexo.app.modules.rh.ResumoColaborador;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Visita prévia, fichas As Built, fotos do book e equipamentos da obra, lançados pelo web e pelo app, com os mesmos
 * comandos. A geração do documento As Built roda em segundo plano ({@link GeracaoAsBuiltService}).
 */
@Service
@RequiredArgsConstructor
public class DocumentacaoTecnicaUseCases {

    private static final int MINUTOS_PARA_DESISTIR_DA_GERACAO = 15;

    private final ObraRepository obraRepository;
    private final PontoPlanejamentoRepository pontoRepository;
    private final ItemPlanejadoRepository itemRepository;
    private final PlanejamentoObraRepository planejamentoRepository;
    private final VisitaPreviaObraRepository visitaRepository;
    private final FichaAsBuiltRepository fichaRepository;
    private final DocumentoAsBuiltRepository documentoRepository;
    private final EquipamentoObraRepository equipamentoRepository;
    private final EvidenciaPontoRepository evidenciaRepository;
    private final ModeloChecklistObraUseCases modeloUseCases;
    private final GeracaoAsBuiltService geracaoService;
    private final DocumentoTecnicoPdf documentoPdf;
    private final EvidenciaVisitaPreviaRepository evidenciaVisitaRepository;
    private final EvidenciaVisitaPreviaUseCases evidenciaVisitaUseCases;
    private final ColaboradorApi colaboradorApi;

    @Transactional(readOnly = true)
    public DocumentacaoTecnicaResponses.Documentacao consultar(UUID idObra) {
        buscarObra(idObra);
        List<PontoPlanejamento> pontos = pontoRepository.findByIdObraAndAtivoTrueOrderByPaginaAscNumeroAsc(idObra);
        Set<UUID> executados = Set.copyOf(itemRepository.pontosComExecucao(idObra));
        Map<UUID, FichaAsBuilt> fichas = fichaRepository.findByIdObraAndAtivoTrue(idObra).stream()
                .collect(Collectors.toMap(FichaAsBuilt::getIdPonto, Function.identity()));
        Map<UUID, PontoPlanejamento> porId = pontos.stream().collect(Collectors.toMap(PontoPlanejamento::getId, Function.identity()));

        List<PontoPlanejamento> daFicha = pontos.stream().filter(p -> executados.contains(p.getId())).toList();
        List<String> pendentes = pontosPendentes(daFicha, fichas);
        List<DocumentoAsBuilt> documentos = documentoRepository.findByIdObraAndAtivoTrueOrderByDataCriacaoDesc(idObra);
        List<VisitaPreviaObra> visitas = visitaRepository.findByIdObraAndAtivoTrueOrderByDataVisitaDescDataCriacaoDesc(idObra);
        Map<UUID, List<EvidenciaPonto>> evidencias = evidenciaRepository.findByIdObraAndAtivoTrueOrderByDataCriacaoAsc(idObra).stream()
                .collect(Collectors.groupingBy(EvidenciaPonto::getIdPonto));
        Map<UUID, UUID> idsDosModelos = pontos.stream()
                .map(p -> Map.entry(p.getId(), java.util.Optional.ofNullable(idModeloDoPonto(fichas.get(p.getId()), evidencias.get(p.getId())))))
                .filter(e -> e.getValue().isPresent())
                .collect(Collectors.toMap(Map.Entry::getKey, e -> e.getValue().get()));
        Map<UUID, ModeloChecklistObra> modelos = modeloUseCases.buscarEntidades(Set.copyOf(idsDosModelos.values())).stream()
                .collect(Collectors.toMap(ModeloChecklistObra::getId, Function.identity()));
        Map<UUID, ModeloChecklistObra> modeloDoPonto = idsDosModelos.entrySet().stream()
                .collect(Collectors.toMap(Map.Entry::getKey, e -> modelos.get(e.getValue())));

        Map<UUID, List<EvidenciaVisitaPrevia>> evidenciasDasVisitas = visitas.isEmpty() ? Map.of()
                : evidenciaVisitaRepository.findByIdVisitaInAndAtivoTrueOrderByDataCriacaoAsc(visitas.stream().map(VisitaPreviaObra::getId).toList()).stream()
                        .collect(Collectors.groupingBy(EvidenciaVisitaPrevia::getIdVisita));
        return new DocumentacaoTecnicaResponses.Documentacao(!visitas.isEmpty(),
                visitas.stream().map(v -> paraVisita(v, evidenciasDasVisitas.getOrDefault(v.getId(), List.of()))).toList(),
                planejamentoRepository.findByIdObraAndAtivoTrue(idObra).map(p -> p.getIdAnexoMestre() != null).orElse(false),
                pontos.stream().map(p -> paraPonto(p, executados.contains(p.getId()), fichas.get(p.getId()), modeloDoPonto.get(p.getId()),
                        evidencias.getOrDefault(p.getId(), List.of()))).toList(),
                new DocumentacaoTecnicaResponses.ResumoAsBuilt(daFicha.size(), daFicha.size() - pendentes.size(), pendentes,
                        daFicha.stream()
                                .filter(p -> faltaEvidencia(modeloDoPonto.get(p.getId()), evidencias.getOrDefault(p.getId(), List.of())))
                                .map(PontoPlanejamento::getNumero)
                                .toList()),
                documentosVisiveis(documentos),
                equipamentoRepository.findByIdObraAndAtivoTrue(idObra).stream()
                        .filter(e -> porId.containsKey(e.getIdPonto()))
                        .map(e -> new DocumentacaoTecnicaResponses.Equipamento(e.getId(), e.getIdPonto(), porId.get(e.getIdPonto()).getNumero(),
                                porId.get(e.getIdPonto()).getPagina(), e.getTipo(), e.isTrafoAuxiliar(), e.getObservacao()))
                        .sorted(Comparator.comparing(DocumentacaoTecnicaResponses.Equipamento::pagina).thenComparing(DocumentacaoTecnicaResponses.Equipamento::numeroPonto))
                        .toList());
    }

    @Transactional
    public DocumentacaoTecnicaResponses.Visita registrarVisita(UUID idObra, DocumentacaoTecnicaRequests.Visita request) {
        buscarObra(idObra);
        ModeloChecklistObra modelo = modeloUseCases.buscarEntidade(request.idModelo());
        return paraVisita(visitaRepository.save(new VisitaPreviaObra(idObra, modelo, request.dataVisita(), responsavel(request, null), request.observacoes(),
                RespostasChecklist.de(modelo.getEstrutura(), request.respostas()))), List.of());
    }

    @Transactional
    public DocumentacaoTecnicaResponses.Visita alterarVisita(UUID idObra, UUID idVisita, DocumentacaoTecnicaRequests.Visita request) {
        VisitaPreviaObra visita = buscarVisita(idObra, idVisita);
        ModeloChecklistObra modelo = modeloUseCases.buscarEntidade(request.idModelo());
        visita.informar(modelo, request.dataVisita(), responsavel(request, visita), request.observacoes(), RespostasChecklist.de(modelo.getEstrutura(), request.respostas()));
        return paraVisita(visitaRepository.save(visita), evidenciaVisitaRepository.findByIdVisitaAndAtivoTrueOrderByDataCriacaoAsc(idVisita));
    }

    /**
     * O nome vem do cadastro do colaborador. Escolhido agora, ele precisa estar ativo; o que já era o responsável continua
     * valendo mesmo desligado, para a correção de um registro antigo não travar. Sem colaborador, só registro antigo com nome.
     */
    private VisitaPreviaObra.Responsavel responsavel(DocumentacaoTecnicaRequests.Visita request, VisitaPreviaObra atual) {
        if (request.idColaborador() == null) {
            if (atual == null || atual.getIdColaborador() != null) {
                throw new InvarianteVioladaException("Escolha o colaborador responsável pela visita.");
            }
            String nome = request.responsavel() != null && !request.responsavel().isBlank() ? request.responsavel() : atual.getResponsavel();
            return new VisitaPreviaObra.Responsavel(null, nome);
        }
        ResumoColaborador pessoa = colaboradorApi.buscarResumosPorIds(Set.of(request.idColaborador())).get(request.idColaborador());
        if (pessoa == null) {
            throw new RecursoNaoEncontradoException("Colaborador não encontrado.");
        }
        boolean mesmo = atual != null && request.idColaborador().equals(atual.getIdColaborador());
        if (!pessoa.ativo() && !mesmo) {
            throw new InvarianteVioladaException("O colaborador " + pessoa.nomeCompleto() + " está inativo.");
        }
        return new VisitaPreviaObra.Responsavel(pessoa.id(), mesmo && !pessoa.ativo() ? atual.getResponsavel() : pessoa.nomeCompleto());
    }

    @Transactional
    public void removerVisita(UUID idObra, UUID idVisita) {
        VisitaPreviaObra visita = buscarVisita(idObra, idVisita);
        visita.desativar();
        visitaRepository.save(visita);
    }

    @Transactional(readOnly = true)
    public byte[] pdfDaVisita(UUID idObra, UUID idVisita) {
        VisitaPreviaObra visita = buscarVisita(idObra, idVisita);
        return documentoPdf.visita(buscarObra(idObra), visita, evidenciaVisitaUseCases.paraDocumento(visita));
    }

    @Transactional
    public void preencherFicha(UUID idObra, UUID idPonto, DocumentacaoTecnicaRequests.Ficha request) {
        PontoPlanejamento ponto = buscarPonto(idObra, idPonto);
        if (!itemRepository.pontosComExecucao(idObra).contains(idPonto)) {
            throw new InvarianteVioladaException("O ponto " + ponto.getNumero() + " ainda não tem execução.");
        }
        evidenciaRepository.findFirstByIdPontoAndIdModeloIsNotNullAndAtivoTrue(idPonto)
                .filter(evidencia -> !evidencia.getIdModelo().equals(request.idModelo()))
                .ifPresent(evidencia -> {
                    throw new InvarianteVioladaException("Este ponto já tem fotos lançadas em outro modelo.");
                });
        ModeloChecklistObra modelo = modeloUseCases.buscarEntidade(request.idModelo());
        RespostasChecklist respostas = RespostasChecklist.de(modelo.getEstrutura(), request.respostas());
        FichaAsBuilt ficha = fichaRepository.findByIdPontoAndAtivoTrue(idPonto)
                .map(existente -> {
                    existente.preencher(modelo, respostas);
                    return existente;
                })
                .orElseGet(() -> new FichaAsBuilt(idObra, idPonto, modelo, respostas));
        fichaRepository.save(ficha);
    }

    /** Ficha incompleta não entra no documento: sem todas prontas, a geração é recusada com a lista de pontos. */
    @Transactional
    public DocumentacaoTecnicaResponses.Documento gerarAsBuilt(UUID idObra) {
        buscarObra(idObra);
        if (planejamentoRepository.findByIdObraAndAtivoTrue(idObra).map(p -> p.getIdAnexoMestre() == null).orElse(true)) {
            throw new InvarianteVioladaException("Anexe o projeto mestre da obra antes de gerar o As Built.");
        }
        Set<UUID> executados = Set.copyOf(itemRepository.pontosComExecucao(idObra));
        List<PontoPlanejamento> daFicha = pontoRepository.findByIdObraAndAtivoTrueOrderByPaginaAscNumeroAsc(idObra).stream()
                .filter(p -> executados.contains(p.getId())).toList();
        if (daFicha.isEmpty()) {
            throw new InvarianteVioladaException("A obra ainda não tem ponto com execução.");
        }
        List<String> pendentes = pontosPendentes(daFicha, fichaRepository.findByIdObraAndAtivoTrue(idObra).stream()
                .collect(Collectors.toMap(FichaAsBuilt::getIdPonto, Function.identity())));
        if (!pendentes.isEmpty()) {
            throw new InvarianteVioladaException("Complete as fichas dos pontos " + String.join(", ", pendentes) + " antes de gerar o As Built.");
        }
        return iniciarGeracao(idObra, DocumentoAsBuilt.Tipo.AS_BUILT);
    }

    /**
     * Book fotográfico: capa, sumário e as fotos de cada ponto, agrupadas por etapa. Não depende do projeto mestre nem
     * de ficha completa (a ficha pendente só aparece marcada), mas precisa de ao menos uma foto lançada.
     */
    @Transactional
    public DocumentacaoTecnicaResponses.Documento gerarBook(UUID idObra) {
        buscarObra(idObra);
        if (evidenciaRepository.findByIdObraAndAtivoTrueOrderByDataCriacaoAsc(idObra).isEmpty()) {
            throw new InvarianteVioladaException("A obra ainda não tem nenhuma foto no book.");
        }
        return iniciarGeracao(idObra, DocumentoAsBuilt.Tipo.BOOK);
    }

    private DocumentacaoTecnicaResponses.Documento iniciarGeracao(UUID idObra, DocumentoAsBuilt.Tipo tipo) {
        documentoRepository.findByIdObraAndAtivoTrueOrderByDataCriacaoDesc(idObra).stream()
                .filter(d -> d.getTipo() == tipo && d.getStatus() == DocumentoAsBuilt.Status.PROCESSANDO)
                .forEach(this::exigirGeracaoParada);

        DocumentoAsBuilt documento = documentoRepository.save(new DocumentoAsBuilt(idObra, tipo, documentoRepository.ultimaVersao(idObra, tipo) + 1));
        UUID id = documento.getId();
        // Só processa depois do commit: o processamento roda em outra thread e precisa enxergar o registro.
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                geracaoService.processar(id);
            }
        });
        return paraDocumento(documento);
    }

    @Transactional
    public void definirEquipamento(UUID idObra, UUID idPonto, DocumentacaoTecnicaRequests.Equipamento request) {
        buscarPonto(idObra, idPonto);
        EquipamentoObra equipamento = equipamentoRepository.findByIdPontoAndIdObraAndAtivoTrue(idPonto, idObra)
                .map(existente -> {
                    existente.informar(request.tipo(), request.trafoAuxiliar(), request.observacao());
                    return existente;
                })
                .orElseGet(() -> new EquipamentoObra(idObra, idPonto, request.tipo(), request.trafoAuxiliar(), request.observacao()));
        equipamentoRepository.save(equipamento);
    }

    @Transactional
    public void removerEquipamento(UUID idObra, UUID idPonto) {
        EquipamentoObra equipamento = equipamentoRepository.findByIdPontoAndIdObraAndAtivoTrue(idPonto, idObra)
                .orElseThrow(() -> new RecursoNaoEncontradoException("O ponto não está na lista de equipamentos."));
        equipamento.desativar();
        equipamentoRepository.save(equipamento);
    }

    /** Geração que parou sem resposta (o servidor reiniciou, por exemplo) não pode travar a obra. */
    private void exigirGeracaoParada(DocumentoAsBuilt documento) {
        if (documento.getDataCriacao().isAfter(OffsetDateTime.now().minusMinutes(MINUTOS_PARA_DESISTIR_DA_GERACAO))) {
            throw new InvarianteVioladaException("A versão " + documento.getNumeroVersao() + " do " + nomeDoTipo(documento.getTipo()) + " ainda está sendo gerada.");
        }
        documento.falhar("A geração foi interrompida. Gere de novo.");
        documentoRepository.saveAndFlush(documento);
    }

    static String nomeDoTipo(DocumentoAsBuilt.Tipo tipo) {
        return tipo == DocumentoAsBuilt.Tipo.BOOK ? "Book" : "As Built";
    }

    private static List<String> pontosPendentes(List<PontoPlanejamento> pontos, Map<UUID, FichaAsBuilt> fichas) {
        return pontos.stream()
                .filter(p -> !fichas.containsKey(p.getId()) || !fichas.get(p.getId()).isCompleta())
                .map(PontoPlanejamento::getNumero)
                .toList();
    }

    private static UUID idModeloDoPonto(FichaAsBuilt ficha, List<EvidenciaPonto> evidencias) {
        if (ficha != null) {
            return ficha.getIdModelo();
        }
        return evidencias == null ? null : evidencias.stream().map(EvidenciaPonto::getIdModelo).filter(java.util.Objects::nonNull).findFirst().orElse(null);
    }

    /** Falta foto quando o ponto não tem nenhuma ou quando um item obrigatório do modelo ficou sem. */
    public static boolean faltaEvidencia(ModeloChecklistObra modelo, List<EvidenciaPonto> evidencias) {
        if (evidencias.isEmpty()) {
            return true;
        }
        if (modelo == null) {
            return false;
        }
        Set<String> respondidos = evidencias.stream().map(EvidenciaPonto::getIdItem).filter(java.util.Objects::nonNull).collect(Collectors.toSet());
        return modelo.getEstrutura().evidencias().stream().anyMatch(item -> item.obrigatoria() && !respondidos.contains(item.id()));
    }

    private static DocumentacaoTecnicaResponses.Ponto paraPonto(PontoPlanejamento p, boolean executado, FichaAsBuilt ficha, ModeloChecklistObra modelo, List<EvidenciaPonto> evidencias) {
        List<EstruturaChecklist.ItemEvidencia> itens = modelo == null ? List.of() : modelo.getEstrutura().evidencias();
        return new DocumentacaoTecnicaResponses.Ponto(p.getId(), p.getNumero(), p.getPagina(), p.getTipo(), executado, paraFicha(ficha),
                modelo == null ? null : modelo.getId(), modelo == null ? null : modelo.getTitulo(), itens,
                evidencias.stream().map(DocumentacaoTecnicaUseCases::paraEvidencia).toList());
    }

    static DocumentacaoTecnicaResponses.Evidencia paraEvidencia(EvidenciaPonto e) {
        return new DocumentacaoTecnicaResponses.Evidencia(e.getId(), e.getIdItem(), e.getTituloItem(), e.getLegenda(), e.getNomeArquivo(),
                e.getUsuarioCriacao(), e.getDataCriacao(), e.getEtapa(), e.getLatitude(), e.getLongitude(), e.getDataCaptura(), e.getTamanhoBytes());
    }

    /** Tentativa com erro só aparece se for a última do seu tipo: depois de gerar de novo, deixa de interessar. */
    static List<DocumentacaoTecnicaResponses.Documento> documentosVisiveis(List<DocumentoAsBuilt> documentos) {
        Set<DocumentoAsBuilt.Tipo> vistos = java.util.EnumSet.noneOf(DocumentoAsBuilt.Tipo.class);
        List<DocumentacaoTecnicaResponses.Documento> visiveis = new java.util.ArrayList<>();
        for (DocumentoAsBuilt documento : documentos) {
            boolean primeiroDoTipo = vistos.add(documento.getTipo());
            if (primeiroDoTipo || documento.getStatus() != DocumentoAsBuilt.Status.ERRO) {
                visiveis.add(paraDocumento(documento));
            }
        }
        return visiveis;
    }

    private static DocumentacaoTecnicaResponses.Visita paraVisita(VisitaPreviaObra v, List<EvidenciaVisitaPrevia> evidencias) {
        return new DocumentacaoTecnicaResponses.Visita(v.getId(), v.getIdModelo(), v.getTituloModelo(), v.getDataVisita(), v.getIdColaborador(), v.getResponsavel(),
                v.getObservacoes(), v.getRespostas(), v.getRespostas().naoConformidades().size(),
                evidencias.stream().map(EvidenciaVisitaPreviaUseCases::paraResposta).toList(), v.getUsuarioCriacao(), v.getDataCriacao());
    }

    private static DocumentacaoTecnicaResponses.Ficha paraFicha(FichaAsBuilt f) {
        if (f == null) {
            return null;
        }
        return new DocumentacaoTecnicaResponses.Ficha(f.getId(), f.getIdModelo(), f.getTituloModelo(), f.isCompleta(), f.getRespostas().pendencias(), f.getRespostas(),
                f.getUsuarioUltimaAlteracao() != null ? f.getUsuarioUltimaAlteracao() : f.getUsuarioCriacao(),
                f.getDataUltimaAlteracao() != null ? f.getDataUltimaAlteracao() : f.getDataCriacao());
    }

    static DocumentacaoTecnicaResponses.Documento paraDocumento(DocumentoAsBuilt d) {
        return new DocumentacaoTecnicaResponses.Documento(d.getId(), d.getTipo(), d.getNumeroVersao(), d.getStatus(), d.getIdAnexo(), d.getMensagemErro(),
                d.getUsuarioCriacao(), d.getDataCriacao(), d.getTotalPaginas(), d.getTotalFotos());
    }

    private Obra buscarObra(UUID idObra) {
        return obraRepository.findById(idObra).orElseThrow(() -> new RecursoNaoEncontradoException("Obra não encontrada com o ID: " + idObra));
    }

    private PontoPlanejamento buscarPonto(UUID idObra, UUID idPonto) {
        return pontoRepository.findByIdAndIdObraAndAtivoTrue(idPonto, idObra)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Ponto não encontrado nesta obra."));
    }

    private VisitaPreviaObra buscarVisita(UUID idObra, UUID idVisita) {
        return visitaRepository.findByIdAndIdObraAndAtivoTrue(idVisita, idObra)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Visita prévia não encontrada."));
    }
}
