package com.nexo.app.modules.obras.application.usecases;

import com.nexo.app.modules.obras.application.dto.BookObraResponses;
import com.nexo.app.modules.obras.application.dto.BookObraResponses.Destino;
import com.nexo.app.modules.obras.application.dto.BookObraResponses.ItemAuditoria;
import com.nexo.app.modules.obras.application.dto.BookObraResponses.Pendencia;
import com.nexo.app.modules.obras.application.dto.BookObraResponses.Severidade;
import com.nexo.app.modules.obras.application.dto.BookObraResponses.Situacao;
import com.nexo.app.modules.obras.application.dto.BookObraResponses.StatusAuditoria;
import com.nexo.app.modules.obras.application.dto.BookObraResponses.UltimaVersao;
import com.nexo.app.modules.obras.domain.AnexoObra;
import com.nexo.app.modules.obras.domain.DocumentoAsBuilt;
import com.nexo.app.modules.obras.domain.EquipamentoObra;
import com.nexo.app.modules.obras.domain.EstruturaChecklist;
import com.nexo.app.modules.obras.domain.EvidenciaPonto;
import com.nexo.app.modules.obras.domain.FichaAsBuilt;
import com.nexo.app.modules.obras.domain.ItemPlanejado;
import com.nexo.app.modules.obras.domain.KitAplicado;
import com.nexo.app.modules.obras.domain.ModeloChecklistObra;
import com.nexo.app.modules.obras.domain.PlanejamentoObra;
import com.nexo.app.modules.obras.domain.PontoPlanejamento;
import com.nexo.app.modules.obras.domain.TipoAnexoObra;
import com.nexo.app.modules.obras.domain.TipoItemKit;
import com.nexo.app.modules.obras.domain.VaoPlanejamento;
import com.nexo.app.modules.obras.domain.VisitaPreviaObra;
import com.nexo.app.modules.obras.infrastructure.persistence.BookObraRepository;
import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Book de obras e entrega documental: quanto da documentação está pronto, o que falta e quem mexeu por último, o
 * comparativo previsto x realizado de cada ponto e a visão da carteira. Só leitura; o mesmo cálculo serve a uma obra e
 * a todas, a partir de consultas em lote.
 */
@Service
@RequiredArgsConstructor
public class BookObraUseCases {

    private static final UUID NENHUMA = new UUID(0, 0);
    private static final DateTimeFormatter DATA = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final int PONTOS_NO_DETALHE = 8;
    private static final Locale PT_BR = Locale.of("pt", "BR");

    private final BookObraRepository repository;
    private final ModeloChecklistObraUseCases modeloUseCases;

    /** Tudo o que se sabe da documentação de uma obra, já agrupado. */
    private record Retrato(UUID id, String numero, String titulo, String status, boolean statusConcluido,
                           List<PontoPlanejamento> pontos, Set<UUID> executados, Map<UUID, FichaAsBuilt> fichas,
                           Map<UUID, List<EvidenciaPonto>> evidencias, List<VisitaPreviaObra> visitas, PlanejamentoObra planejamento,
                           List<AnexoObra> anexos, List<DocumentoAsBuilt> documentos, List<EquipamentoObra> equipamentos,
                           Map<UUID, ModeloChecklistObra> modelos, List<TipoAnexoObra> exigidos) {

        List<EvidenciaPonto> evidenciasDoPonto(UUID idPonto) {
            return evidencias.getOrDefault(idPonto, List.of());
        }

        ModeloChecklistObra modeloDoPonto(UUID idPonto) {
            FichaAsBuilt ficha = fichas.get(idPonto);
            UUID idModelo = ficha != null ? ficha.getIdModelo()
                    : evidenciasDoPonto(idPonto).stream().map(EvidenciaPonto::getIdModelo).filter(Objects::nonNull).findFirst().orElse(null);
            return idModelo == null ? null : modelos.get(idModelo);
        }

        /** Títulos dos itens de foto obrigatórios do modelo que o ponto ainda não tem. */
        List<String> fotosFaltando(UUID idPonto) {
            ModeloChecklistObra modelo = modeloDoPonto(idPonto);
            if (modelo == null) {
                return List.of();
            }
            Set<String> respondidos = evidenciasDoPonto(idPonto).stream().map(EvidenciaPonto::getIdItem).filter(Objects::nonNull).collect(Collectors.toSet());
            return modelo.getEstrutura().evidencias().stream()
                    .filter(item -> item.obrigatoria() && !respondidos.contains(item.id()))
                    .map(EstruturaChecklist.ItemEvidencia::titulo)
                    .toList();
        }

        int obrigatoriosDoPonto(UUID idPonto) {
            ModeloChecklistObra modelo = modeloDoPonto(idPonto);
            return modelo == null ? 0 : (int) modelo.getEstrutura().evidencias().stream().filter(EstruturaChecklist.ItemEvidencia::obrigatoria).count();
        }

        boolean fotosCompletas(UUID idPonto) {
            return !DocumentacaoTecnicaUseCases.faltaEvidencia(modeloDoPonto(idPonto), evidenciasDoPonto(idPonto));
        }
    }

    /** O que o cálculo devolve de uma obra, usado pelo painel e pela linha da carteira. */
    private record Avaliacao(Retrato retrato, BookObraResponses.Indicadores indicadores, List<ItemAuditoria> auditoria,
                             List<Pendencia> pendencias, Situacao situacao, int percentual, UltimaVersao asBuilt, UltimaVersao book) {
    }

    @Transactional(readOnly = true)
    public BookObraResponses.Painel painel(UUID idObra) {
        Avaliacao a = carregar(false, List.of(idObra)).stream().findFirst().map(this::avaliar)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Obra não encontrada com o ID: " + idObra));
        Retrato r = a.retrato();
        return new BookObraResponses.Painel(r.id(), r.numero(), r.titulo(), r.status(), a.situacao(), a.percentual(), a.indicadores(),
                a.pendencias(), a.auditoria(), a.asBuilt(), a.book(), DocumentacaoTecnicaUseCases.documentosVisiveis(r.documentos()));
    }

    @Transactional(readOnly = true)
    public BookObraResponses.Consolidado consolidado() {
        List<Avaliacao> avaliacoes = carregar(true, List.of()).stream().map(this::avaliar).toList();
        List<BookObraResponses.ResumoObra> linhas = avaliacoes.stream().map(a -> {
            Retrato r = a.retrato();
            BookObraResponses.Indicadores i = a.indicadores();
            return new BookObraResponses.ResumoObra(r.id(), r.numero(), r.titulo(), r.status(), r.statusConcluido(), a.situacao(), a.percentual(),
                    i.pontosExecutados(), i.fichasCompletas(), i.pontosComFotosCompletas(), i.fotos(),
                    (int) a.pendencias().stream().filter(p -> p.severidade() == Severidade.BLOQUEIO).count(),
                    (int) a.pendencias().stream().filter(p -> p.severidade() == Severidade.AVISO).count(),
                    a.pendencias().isEmpty() ? null : a.pendencias().getFirst().titulo(), a.asBuilt(), a.book(), i.ultimaAtividade());
        }).toList();
        List<Avaliacao> comExecucao = avaliacoes.stream().filter(a -> a.situacao() != Situacao.SEM_EXECUCAO).toList();
        BookObraResponses.Totais totais = new BookObraResponses.Totais(
                avaliacoes.size(),
                contar(avaliacoes, Situacao.PRONTA),
                contar(avaliacoes, Situacao.PENDENTE),
                contar(avaliacoes, Situacao.BLOQUEADA),
                contar(avaliacoes, Situacao.SEM_EXECUCAO),
                avaliacoes.stream().mapToInt(a -> a.indicadores().fotos()).sum(),
                avaliacoes.stream().mapToInt(a -> a.indicadores().fichasCompletas()).sum(),
                avaliacoes.stream().mapToInt(a -> a.indicadores().pontosExecutados()).sum(),
                comExecucao.isEmpty() ? 0 : (int) Math.round(comExecucao.stream().mapToInt(Avaliacao::percentual).average().orElse(0)),
                (int) avaliacoes.stream().filter(a -> a.asBuilt() != null && a.asBuilt().status() == DocumentoAsBuilt.Status.CONCLUIDO && !a.asBuilt().atualizada()).count());
        return new BookObraResponses.Consolidado(totais, linhas);
    }

    private static int contar(List<Avaliacao> avaliacoes, Situacao situacao) {
        return (int) avaliacoes.stream().filter(a -> a.situacao() == situacao).count();
    }

    // ---------------------------------------------------------------- Carga

    private List<Retrato> carregar(boolean todas, Collection<UUID> ids) {
        List<Object[]> obras = repository.obras(todas, todas ? List.of(NENHUMA) : ids);
        if (obras.isEmpty()) {
            return List.of();
        }
        List<UUID> idsObras = obras.stream().map(o -> (UUID) o[0]).toList();
        Map<UUID, List<PontoPlanejamento>> pontos = repository.pontos(idsObras).stream().collect(Collectors.groupingBy(PontoPlanejamento::getIdObra));
        Map<UUID, Set<UUID>> executados = new HashMap<>();
        repository.pontosExecutados(idsObras).forEach(linha -> executados.computeIfAbsent((UUID) linha[0], k -> new HashSet<>()).add((UUID) linha[1]));
        List<FichaAsBuilt> fichas = repository.fichas(idsObras);
        List<EvidenciaPonto> evidencias = repository.evidencias(idsObras);
        Map<UUID, List<VisitaPreviaObra>> visitas = repository.visitas(idsObras).stream().collect(Collectors.groupingBy(VisitaPreviaObra::getIdObra));
        Map<UUID, PlanejamentoObra> planejamentos = repository.planejamentos(idsObras).stream()
                .collect(Collectors.toMap(PlanejamentoObra::getIdObra, Function.identity(), (a, b) -> a));
        Map<UUID, List<AnexoObra>> anexos = repository.anexos(idsObras).stream().collect(Collectors.groupingBy(a -> a.getObra().getId()));
        Map<UUID, List<DocumentoAsBuilt>> documentos = repository.documentos(idsObras).stream().collect(Collectors.groupingBy(DocumentoAsBuilt::getIdObra));
        Map<UUID, List<EquipamentoObra>> equipamentos = repository.equipamentos(idsObras).stream().collect(Collectors.groupingBy(EquipamentoObra::getIdObra));
        List<TipoAnexoObra> exigidos = repository.tiposExigidosNaEntrega();
        Set<UUID> idsModelos = Stream.concat(fichas.stream().map(FichaAsBuilt::getIdModelo), evidencias.stream().map(EvidenciaPonto::getIdModelo))
                .filter(Objects::nonNull).collect(Collectors.toSet());
        Map<UUID, ModeloChecklistObra> modelos = idsModelos.isEmpty() ? Map.of() : modeloUseCases.buscarEntidades(idsModelos).stream()
                .collect(Collectors.toMap(ModeloChecklistObra::getId, Function.identity(), (a, b) -> a));
        Map<UUID, Map<UUID, FichaAsBuilt>> fichasPorObra = fichas.stream().collect(Collectors.groupingBy(FichaAsBuilt::getIdObra,
                Collectors.toMap(FichaAsBuilt::getIdPonto, Function.identity(), (a, b) -> a)));
        Map<UUID, Map<UUID, List<EvidenciaPonto>>> evidenciasPorObra = evidencias.stream().collect(Collectors.groupingBy(EvidenciaPonto::getIdObra,
                Collectors.groupingBy(EvidenciaPonto::getIdPonto)));

        return obras.stream()
                .sorted(Comparator.comparing(o -> (String) o[1]))
                .map(o -> {
                    UUID id = (UUID) o[0];
                    return new Retrato(id, (String) o[1], (String) o[2], (String) o[3], Boolean.TRUE.equals(o[4]),
                            pontos.getOrDefault(id, List.of()), executados.getOrDefault(id, Set.of()), fichasPorObra.getOrDefault(id, Map.of()),
                            evidenciasPorObra.getOrDefault(id, Map.of()), visitas.getOrDefault(id, List.of()), planejamentos.get(id),
                            anexos.getOrDefault(id, List.of()), documentos.getOrDefault(id, List.of()), equipamentos.getOrDefault(id, List.of()),
                            modelos, exigidos);
                })
                .toList();
    }

    // ---------------------------------------------------------------- Cálculo

    private Avaliacao avaliar(Retrato r) {
        List<PontoPlanejamento> executados = r.pontos().stream().filter(p -> r.executados().contains(p.getId())).toList();
        List<EvidenciaPonto> todas = r.evidencias().values().stream().flatMap(List::stream).toList();
        List<PontoPlanejamento> semFicha = executados.stream().filter(p -> !r.fichas().containsKey(p.getId())).toList();
        List<PontoPlanejamento> fichaIncompleta = executados.stream()
                .filter(p -> r.fichas().containsKey(p.getId()) && !r.fichas().get(p.getId()).isCompleta()).toList();
        List<PontoPlanejamento> semFoto = executados.stream().filter(p -> r.evidenciasDoPonto(p.getId()).isEmpty()).toList();
        List<PontoPlanejamento> fotoFaltando = executados.stream().filter(p -> !r.fotosCompletas(p.getId())).toList();
        int fichasCompletas = executados.size() - semFicha.size() - fichaIncompleta.size();
        int pontosComFotosCompletas = executados.size() - fotoFaltando.size();
        String idMestre = r.planejamento() != null && r.planejamento().getIdAnexoMestre() != null ? r.planejamento().getIdAnexoMestre().toString() : null;

        OffsetDateTime ultimaAlteracaoDocumental = maisRecente(Stream.of(
                r.fichas().values().stream().map(BookObraUseCases::alteradoEm),
                todas.stream().map(BookObraUseCases::alteradoEm),
                r.equipamentos().stream().map(BookObraUseCases::alteradoEm)).flatMap(Function.identity()));
        OffsetDateTime ultimaAtividade = maisRecente(Stream.of(
                Stream.of(ultimaAlteracaoDocumental),
                r.visitas().stream().map(BookObraUseCases::alteradoEm),
                r.anexos().stream().map(BookObraUseCases::alteradoEm),
                r.documentos().stream().map(BaseEntity::getDataCriacao)).flatMap(Function.identity()));

        BookObraResponses.Indicadores indicadores = new BookObraResponses.Indicadores(
                r.pontos().size(),
                executados.size(),
                (int) r.pontos().stream().filter(p -> !r.evidenciasDoPonto(p.getId()).isEmpty()).count(),
                semFoto.size(),
                pontosComFotosCompletas,
                todas.size(),
                (int) todas.stream().filter(e -> e.getEtapa() == EvidenciaPonto.Etapa.ANTES).count(),
                (int) todas.stream().filter(e -> e.getEtapa() == EvidenciaPonto.Etapa.DURANTE).count(),
                (int) todas.stream().filter(e -> e.getEtapa() == EvidenciaPonto.Etapa.DEPOIS).count(),
                (int) todas.stream().filter(e -> e.getEtapa() == null).count(),
                (int) todas.stream().filter(e -> e.getLatitude() != null).count(),
                executados.stream().mapToInt(p -> r.obrigatoriosDoPonto(p.getId())).sum(),
                executados.stream().mapToInt(p -> r.fotosFaltando(p.getId()).size()).sum(),
                fichasCompletas,
                fichaIncompleta.size(),
                semFicha.size(),
                r.equipamentos().size(),
                r.visitas().size(),
                idMestre != null,
                ultimaAtividade);

        List<ItemAuditoria> auditoria = new ArrayList<>();
        List<Pendencia> pendencias = new ArrayList<>();

        // Pré-vistoria
        if (r.visitas().isEmpty()) {
            auditoria.add(new ItemAuditoria("VISITA_PREVIA", "Pré-vistoria registrada", "Visita ao local antes da obra, com o checklist do modelo.",
                    StatusAuditoria.PENDENTE, true, false, 0, "Nenhuma pré-vistoria registrada.", null, null, Destino.PONTOS));
            pendencias.add(new Pendencia("VISITA_PREVIA", Severidade.AVISO, "Pré-vistoria não registrada", "Registre a visita prévia da obra.", List.of(), Destino.PONTOS));
        } else {
            VisitaPreviaObra ultima = r.visitas().getFirst();
            auditoria.add(new ItemAuditoria("VISITA_PREVIA", "Pré-vistoria registrada", "Visita ao local antes da obra, com o checklist do modelo.",
                    StatusAuditoria.OK, true, false, 100,
                    (r.visitas().size() == 1 ? "1 visita" : r.visitas().size() + " visitas") + " · última em " + ultima.getDataVisita().format(DATA),
                    ultima.getResponsavel(), ultima.getDataCriacao(), Destino.PONTOS));
        }

        // Projeto mestre
        if (idMestre == null) {
            auditoria.add(new ItemAuditoria("PROJETO_MESTRE", "Projeto mestre definido", "Projeto que dá as folhas do As Built, marcado no planejamento.",
                    StatusAuditoria.PENDENTE, true, true, 0, "Anexe o projeto e defina-o como mestre no planejamento.", null, null, Destino.ANEXOS));
            if (!executados.isEmpty()) {
                pendencias.add(new Pendencia("PROJETO_MESTRE", Severidade.BLOQUEIO, "Sem projeto mestre",
                        "O As Built é montado sobre as folhas do projeto mestre.", List.of(), Destino.ANEXOS));
            }
        } else {
            AnexoObra mestre = r.anexos().stream().filter(a -> a.getId().toString().equals(idMestre)).findFirst().orElse(null);
            auditoria.add(new ItemAuditoria("PROJETO_MESTRE", "Projeto mestre definido", "Projeto que dá as folhas do As Built, marcado no planejamento.",
                    StatusAuditoria.OK, true, true, 100, mestre != null ? mestre.getNomeArquivo() : "Projeto definido no planejamento.",
                    mestre != null ? mestre.getUsuarioCriacao() : null, mestre != null ? mestre.getDataCriacao() : null, Destino.ANEXOS));
        }

        // Fichas
        FichaAsBuilt ultimaFicha = r.fichas().values().stream().max(Comparator.comparing(BookObraUseCases::alteradoEm)).orElse(null);
        List<String> pontosSemFichaCompleta = Stream.concat(semFicha.stream(), fichaIncompleta.stream())
                .sorted(Comparator.comparing(PontoPlanejamento::getPagina).thenComparing(PontoPlanejamento::getNumero))
                .map(PontoPlanejamento::getNumero).toList();
        if (executados.isEmpty()) {
            auditoria.add(new ItemAuditoria("FICHAS", "Fichas As Built completas", "Uma ficha completa para cada ponto executado.",
                    StatusAuditoria.PENDENTE, true, true, 0, "Nenhum ponto executado ainda.", null, null, Destino.PONTOS));
        } else {
            boolean ok = pontosSemFichaCompleta.isEmpty();
            auditoria.add(new ItemAuditoria("FICHAS", "Fichas As Built completas", "Uma ficha completa para cada ponto executado.",
                    ok ? StatusAuditoria.OK : StatusAuditoria.PENDENTE, true, true, percentual(fichasCompletas, executados.size()),
                    fichasCompletas + " de " + executados.size() + (ok ? " completas" : " completas · pendentes: " + resumir(pontosSemFichaCompleta)),
                    ultimaFicha != null ? autor(ultimaFicha) : null, ultimaFicha != null ? alteradoEm(ultimaFicha) : null, Destino.PONTOS));
            if (!ok) {
                String titulo = pontosSemFichaCompleta.size() == 1 ? "1 ficha As Built pendente" : pontosSemFichaCompleta.size() + " fichas As Built pendentes";
                String detalhe = (semFicha.isEmpty() ? "" : semFicha.size() + " sem ficha")
                        + (!semFicha.isEmpty() && !fichaIncompleta.isEmpty() ? " e " : "")
                        + (fichaIncompleta.isEmpty() ? "" : fichaIncompleta.size() + " incompletas") + ". Impedem a geração do As Built.";
                pendencias.add(new Pendencia("FICHAS", Severidade.BLOQUEIO, titulo, detalhe, pontosSemFichaCompleta, Destino.PONTOS));
            }
        }

        // Fotos obrigatórias
        EvidenciaPonto ultimaFoto = todas.stream().max(Comparator.comparing(BaseEntity::getDataCriacao)).orElse(null);
        List<String> pontosComFotoFaltando = fotoFaltando.stream().map(PontoPlanejamento::getNumero).toList();
        if (executados.isEmpty()) {
            auditoria.add(new ItemAuditoria("FOTOS", "Fotos obrigatórias do book", "Itens de foto obrigatórios do modelo em cada ponto executado.",
                    StatusAuditoria.PENDENTE, true, false, 0,
                    todas.isEmpty() ? "Nenhuma foto lançada." : quantas(todas.size()) + " lançadas antes da execução.",
                    ultimaFoto != null ? ultimaFoto.getUsuarioCriacao() : null, ultimaFoto != null ? ultimaFoto.getDataCriacao() : null, Destino.GALERIA));
        } else {
            boolean ok = pontosComFotoFaltando.isEmpty();
            auditoria.add(new ItemAuditoria("FOTOS", "Fotos obrigatórias do book", "Itens de foto obrigatórios do modelo em cada ponto executado.",
                    ok ? StatusAuditoria.OK : StatusAuditoria.ALERTA, true, false, percentual(pontosComFotosCompletas, executados.size()),
                    pontosComFotosCompletas + " de " + executados.size() + " pontos completos · " + quantas(todas.size())
                            + (ok ? "" : " · faltando em " + resumir(pontosComFotoFaltando)),
                    ultimaFoto != null ? ultimaFoto.getUsuarioCriacao() : null, ultimaFoto != null ? ultimaFoto.getDataCriacao() : null, Destino.GALERIA));
            if (!ok) {
                String titulo = pontosComFotoFaltando.size() == 1 ? "1 ponto com foto faltando" : pontosComFotoFaltando.size() + " pontos com foto faltando";
                String detalhe = (semFoto.isEmpty() ? "" : (semFoto.size() == 1 ? "1 ponto executado sem nenhuma foto. " : semFoto.size() + " pontos executados sem nenhuma foto. "))
                        + "Falta de foto não impede gerar, mas o documento sai incompleto.";
                pendencias.add(new Pendencia("FOTOS", Severidade.AVISO, titulo, detalhe, pontosComFotoFaltando, Destino.GALERIA));
            }
        }

        // Equipamentos
        Map<UUID, PontoPlanejamento> pontosPorId = r.pontos().stream().collect(Collectors.toMap(PontoPlanejamento::getId, Function.identity(), (a, b) -> a));
        List<EquipamentoObra> equipamentos = r.equipamentos().stream().filter(e -> pontosPorId.containsKey(e.getIdPonto())).toList();
        if (equipamentos.isEmpty()) {
            auditoria.add(new ItemAuditoria("EQUIPAMENTOS", "Equipamentos documentados", "Religadores e reguladores com execução e fotos no book.",
                    StatusAuditoria.NAO_SE_APLICA, false, false, 100, "Nenhum religador ou regulador marcado nesta obra.", null, null, Destino.PONTOS));
        } else {
            List<String> semDocumentacao = equipamentos.stream()
                    .filter(e -> !r.executados().contains(e.getIdPonto()) || r.evidenciasDoPonto(e.getIdPonto()).isEmpty())
                    .map(e -> pontosPorId.get(e.getIdPonto()).getNumero()).toList();
            EquipamentoObra ultimo = equipamentos.stream().max(Comparator.comparing(BookObraUseCases::alteradoEm)).orElseThrow();
            auditoria.add(new ItemAuditoria("EQUIPAMENTOS", "Equipamentos documentados", "Religadores e reguladores com execução e fotos no book.",
                    semDocumentacao.isEmpty() ? StatusAuditoria.OK : StatusAuditoria.ALERTA, false, false,
                    percentual(equipamentos.size() - semDocumentacao.size(), equipamentos.size()),
                    equipamentos.size() + (equipamentos.size() == 1 ? " equipamento" : " equipamentos")
                            + (semDocumentacao.isEmpty() ? " com execução e fotos" : " · sem execução ou foto: " + resumir(semDocumentacao)),
                    autor(ultimo), alteradoEm(ultimo), Destino.PONTOS));
            if (!semDocumentacao.isEmpty()) {
                pendencias.add(new Pendencia("EQUIPAMENTOS", Severidade.AVISO, "Equipamento sem execução ou foto",
                        "Confira os pontos com religador ou regulador.", semDocumentacao, Destino.PONTOS));
            }
        }

        // Anexos exigidos na entrega
        for (TipoAnexoObra tipo : r.exigidos()) {
            AnexoObra anexo = r.anexos().stream().filter(a -> a.getTipoAnexo().getId().equals(tipo.getId())).findFirst().orElse(null);
            String nome = nomeLegivel(tipo.getNome());
            auditoria.add(new ItemAuditoria("ANEXO_" + tipo.getId(), nome, tipo.getDescricao() != null ? tipo.getDescricao() : "Documento exigido na entrega da obra.",
                    anexo != null ? StatusAuditoria.OK : StatusAuditoria.PENDENTE, true, false, anexo != null ? 100 : 0,
                    anexo != null ? anexo.getNomeArquivo() : "Nenhum anexo deste tipo.",
                    anexo != null ? anexo.getUsuarioCriacao() : null, anexo != null ? anexo.getDataCriacao() : null, Destino.ANEXOS));
            if (anexo == null) {
                pendencias.add(new Pendencia("ANEXO_" + tipo.getId(), Severidade.AVISO, "Falta anexo: " + nome.toLowerCase(PT_BR),
                        "Exigido na entrega da obra.", List.of(), Destino.ANEXOS));
            }
        }

        // Documentos gerados
        UltimaVersao asBuilt = ultimaVersao(r.documentos(), DocumentoAsBuilt.Tipo.AS_BUILT, ultimaAlteracaoDocumental);
        UltimaVersao book = ultimaVersao(r.documentos(), DocumentoAsBuilt.Tipo.BOOK, ultimaAlteracaoDocumental);
        auditoria.add(itemDoDocumento("AS_BUILT", "As Built gerado e em dia", "Plantas com o executado, fichas e fotos, na versão mais recente.",
                ultimaConcluida(r.documentos(), DocumentoAsBuilt.Tipo.AS_BUILT), asBuilt, ultimaAlteracaoDocumental, pendencias, "As Built"));
        auditoria.add(itemDoDocumento("BOOK", "Book fotográfico gerado e em dia", "Capa, sumário e as fotos de cada ponto, por etapa.",
                ultimaConcluida(r.documentos(), DocumentoAsBuilt.Tipo.BOOK), book, ultimaAlteracaoDocumental, pendencias, "Book"));

        List<ItemAuditoria> contam = auditoria.stream().filter(i -> i.obrigatorio() && i.status() != StatusAuditoria.NAO_SE_APLICA).toList();
        int pronto = contam.isEmpty() ? 0 : (int) Math.round(contam.stream().mapToInt(ItemAuditoria::progresso).average().orElse(0));
        Situacao situacao;
        if (executados.isEmpty()) {
            situacao = Situacao.SEM_EXECUCAO;
        } else if (auditoria.stream().anyMatch(i -> i.bloqueiaAsBuilt() && i.status() != StatusAuditoria.OK)) {
            situacao = Situacao.BLOQUEADA;
        } else if (contam.stream().allMatch(i -> i.status() == StatusAuditoria.OK)) {
            situacao = Situacao.PRONTA;
            pronto = 100;
        } else {
            situacao = Situacao.PENDENTE;
        }
        if (situacao == Situacao.SEM_EXECUCAO) {
            // Sem execução, o que falta é esperado: não vira pendência na carteira.
            pendencias.removeIf(p -> p.severidade() == Severidade.BLOQUEIO);
        }
        pendencias.sort(Comparator.comparing(Pendencia::severidade));
        return new Avaliacao(r, indicadores, auditoria, pendencias, situacao, pronto, asBuilt, book);
    }

    private static ItemAuditoria itemDoDocumento(String codigo, String titulo, String descricao, DocumentoAsBuilt concluida, UltimaVersao ultima,
                                                 OffsetDateTime ultimaAlteracao, List<Pendencia> pendencias, String nome) {
        if (concluida == null) {
            String detalhe = ultima != null && ultima.status() == DocumentoAsBuilt.Status.PROCESSANDO
                    ? "Versão " + ultima.numeroVersao() + " sendo gerada." : "Nenhuma versão gerada.";
            pendencias.add(new Pendencia(codigo, Severidade.AVISO, nome + " ainda não gerado", "Gere a primeira versão na aba Entrega.", List.of(), Destino.ENTREGA));
            return new ItemAuditoria(codigo, titulo, descricao, StatusAuditoria.PENDENTE, true, false, 0, detalhe, null, null, Destino.ENTREGA);
        }
        boolean emDia = ultimaAlteracao == null || !concluida.getDataCriacao().isBefore(ultimaAlteracao);
        String base = "Versão " + concluida.getNumeroVersao() + " de " + concluida.getDataCriacao().format(DATA);
        if (!emDia) {
            pendencias.add(new Pendencia(codigo, Severidade.AVISO, nome + " desatualizado",
                    "Houve alterações em fichas, fotos ou equipamentos depois da versão " + concluida.getNumeroVersao() + ".", List.of(), Destino.ENTREGA));
            return new ItemAuditoria(codigo, titulo, descricao, StatusAuditoria.ALERTA, true, false, 50,
                    base + " · alterações depois, em " + ultimaAlteracao.format(DATA), concluida.getUsuarioCriacao(), concluida.getDataCriacao(), Destino.ENTREGA);
        }
        return new ItemAuditoria(codigo, titulo, descricao, StatusAuditoria.OK, true, false, 100, base, concluida.getUsuarioCriacao(),
                concluida.getDataCriacao(), Destino.ENTREGA);
    }

    private static DocumentoAsBuilt ultimaConcluida(List<DocumentoAsBuilt> documentos, DocumentoAsBuilt.Tipo tipo) {
        return documentos.stream().filter(d -> d.getTipo() == tipo && d.isConcluido()).max(Comparator.comparing(BaseEntity::getDataCriacao)).orElse(null);
    }

    /** A última versão que conta (gerada ou em geração) e se está em dia com a documentação. */
    private static UltimaVersao ultimaVersao(List<DocumentoAsBuilt> documentos, DocumentoAsBuilt.Tipo tipo, OffsetDateTime ultimaAlteracao) {
        return documentos.stream()
                .filter(d -> d.getTipo() == tipo && d.getStatus() != DocumentoAsBuilt.Status.ERRO)
                .max(Comparator.comparing(BaseEntity::getDataCriacao))
                .map(d -> new UltimaVersao(d.getId(), d.getNumeroVersao(), d.getStatus(), d.getDataCriacao(), d.getUsuarioCriacao(), d.getIdAnexo(),
                        d.isConcluido() && (ultimaAlteracao == null || !d.getDataCriacao().isBefore(ultimaAlteracao))))
                .orElse(null);
    }

    // ---------------------------------------------------------------- Previsto x realizado

    @Transactional(readOnly = true)
    public BookObraResponses.Comparativo comparativo(UUID idObra) {
        Retrato r = carregar(false, List.of(idObra)).stream().findFirst()
                .orElseThrow(() -> new RecursoNaoEncontradoException("Obra não encontrada com o ID: " + idObra));
        List<ItemPlanejado> itens = repository.itensPlanejados(idObra);
        Map<UUID, List<ItemPlanejado>> porPonto = new LinkedHashMap<>();
        Map<UUID, List<ItemPlanejado>> porVao = new LinkedHashMap<>();
        for (ItemPlanejado item : itens) {
            KitAplicado kit = item.getKitAplicado();
            if (kit.getIdPonto() != null) {
                porPonto.computeIfAbsent(kit.getIdPonto(), k -> new ArrayList<>()).add(item);
            } else if (kit.getIdVao() != null) {
                porVao.computeIfAbsent(kit.getIdVao(), k -> new ArrayList<>()).add(item);
            }
        }
        Map<UUID, EquipamentoObra> equipamentos = r.equipamentos().stream().collect(Collectors.toMap(EquipamentoObra::getIdPonto, Function.identity(), (a, b) -> a));
        Map<UUID, PontoPlanejamento> pontosPorId = r.pontos().stream().collect(Collectors.toMap(PontoPlanejamento::getId, Function.identity(), (a, b) -> a));

        List<BookObraResponses.GrupoComparativo> grupos = new ArrayList<>();
        for (PontoPlanejamento ponto : r.pontos()) {
            List<ItemPlanejado> doPonto = porPonto.getOrDefault(ponto.getId(), List.of());
            List<EvidenciaPonto> fotos = r.evidenciasDoPonto(ponto.getId());
            EquipamentoObra equipamento = equipamentos.get(ponto.getId());
            if (doPonto.isEmpty() && fotos.isEmpty() && equipamento == null) {
                continue;
            }
            List<BookObraResponses.ItemComparativo> comparados = doPonto.stream().map(BookObraUseCases::comparar).toList();
            boolean executado = r.executados().contains(ponto.getId());
            FichaAsBuilt ficha = r.fichas().get(ponto.getId());
            List<String> documentais = new ArrayList<>();
            if (executado && ficha == null) {
                documentais.add("Executado sem ficha As Built");
            } else if (executado && !ficha.isCompleta()) {
                int faltam = ficha.getRespostas().pendencias().size();
                documentais.add("Ficha As Built incompleta (" + (faltam == 1 ? "falta 1 resposta" : "faltam " + faltam + " respostas") + ")");
            }
            if (executado && fotos.isEmpty()) {
                documentais.add("Executado sem fotos no book");
            } else if (executado && !r.fotosFaltando(ponto.getId()).isEmpty()) {
                documentais.add("Falta foto: " + String.join(", ", r.fotosFaltando(ponto.getId())));
            }
            if (equipamento != null && !executado) {
                documentais.add("Equipamento marcado em ponto sem execução");
            }
            grupos.add(grupo(ponto.getId().toString(), ponto.getId(), "Ponto " + ponto.getNumero(), false, ponto.getPagina(), executado,
                    situacaoDaFicha(ficha, executado), fotos.size(), equipamento != null ? DocumentoTecnicoPdf.descreverEquipamento(equipamento) : null,
                    documentais, comparados));
        }
        Map<UUID, VaoPlanejamento> vaos = repository.vaos(List.of(idObra)).stream().collect(Collectors.toMap(VaoPlanejamento::getId, Function.identity(), (a, b) -> a));
        porVao.forEach((idVao, doVao) -> {
            VaoPlanejamento vao = vaos.get(idVao);
            if (vao == null) {
                return;
            }
            PontoPlanejamento a = pontosPorId.get(vao.getIdPontoA());
            PontoPlanejamento b = pontosPorId.get(vao.getIdPontoB());
            String rotulo = "Vão " + (a != null ? a.getNumero() : "?") + " – " + (b != null ? b.getNumero() : "?");
            List<BookObraResponses.ItemComparativo> comparados = doVao.stream().map(BookObraUseCases::comparar).toList();
            boolean executado = comparados.stream().anyMatch(i -> i.executado().signum() > 0 || i.situacao() == BookObraResponses.SituacaoItem.EXECUTADO_ANTES);
            grupos.add(grupo(idVao.toString(), null, rotulo, true, a != null ? a.getPagina() : 0, executado, null, 0, null, List.of(), comparados));
        });
        grupos.sort(Comparator.comparingInt(BookObraResponses.GrupoComparativo::pagina).thenComparing(BookObraResponses.GrupoComparativo::vao)
                .thenComparing(BookObraResponses.GrupoComparativo::rotulo));

        List<BookObraResponses.ItemComparativo> todos = grupos.stream().flatMap(g -> g.itens().stream()).toList();
        List<BookObraResponses.ItemComparativo> servicos = todos.stream().filter(i -> i.tipo() == TipoItemKit.SERVICO).toList();
        int servicosConcluidos = (int) servicos.stream().filter(i -> i.situacao() == BookObraResponses.SituacaoItem.OK
                || i.situacao() == BookObraResponses.SituacaoItem.ACIMA || i.situacao() == BookObraResponses.SituacaoItem.EXECUTADO_ANTES).count();
        BookObraResponses.ResumoComparativo resumo = new BookObraResponses.ResumoComparativo(
                grupos.size(),
                contarGrupos(grupos, BookObraResponses.SituacaoGrupo.CONFORME),
                contarGrupos(grupos, BookObraResponses.SituacaoGrupo.DIVERGENTE),
                contarGrupos(grupos, BookObraResponses.SituacaoGrupo.EM_EXECUCAO),
                contarGrupos(grupos, BookObraResponses.SituacaoGrupo.NAO_INICIADO),
                todos.size(),
                contarItens(todos, BookObraResponses.SituacaoItem.OK) + contarItens(todos, BookObraResponses.SituacaoItem.EXECUTADO_ANTES),
                contarItens(todos, BookObraResponses.SituacaoItem.ABAIXO),
                contarItens(todos, BookObraResponses.SituacaoItem.ACIMA),
                contarItens(todos, BookObraResponses.SituacaoItem.NAO_EXECUTADO),
                servicos.size(), servicosConcluidos, percentual(servicosConcluidos, servicos.size()));
        return new BookObraResponses.Comparativo(resumo, grupos);
    }

    private static BookObraResponses.GrupoComparativo grupo(String chave, UUID idPonto, String rotulo, boolean vao, int pagina, boolean executado,
                                                            String ficha, int fotos, String equipamento, List<String> documentais,
                                                            List<BookObraResponses.ItemComparativo> itens) {
        long abaixo = itens.stream().filter(i -> i.situacao() == BookObraResponses.SituacaoItem.ABAIXO).count();
        long acima = itens.stream().filter(i -> i.situacao() == BookObraResponses.SituacaoItem.ACIMA).count();
        long naoExecutados = itens.stream().filter(i -> i.situacao() == BookObraResponses.SituacaoItem.NAO_EXECUTADO).count();
        List<String> divergencias = new ArrayList<>(documentais);
        if (executado && acima > 0) {
            divergencias.add(acima == 1 ? "1 item acima do previsto" : acima + " itens acima do previsto");
        }
        if (executado && abaixo > 0) {
            divergencias.add(abaixo == 1 ? "1 item abaixo do previsto" : abaixo + " itens abaixo do previsto");
        }
        if (executado && naoExecutados > 0) {
            divergencias.add(naoExecutados == 1 ? "1 item previsto ainda não executado" : naoExecutados + " itens previstos ainda não executados");
        }
        BookObraResponses.SituacaoGrupo situacao;
        if (!executado) {
            situacao = documentais.isEmpty() ? BookObraResponses.SituacaoGrupo.NAO_INICIADO : BookObraResponses.SituacaoGrupo.DIVERGENTE;
        } else if (acima > 0 || !documentais.isEmpty()) {
            situacao = BookObraResponses.SituacaoGrupo.DIVERGENTE;
        } else if (abaixo > 0 || naoExecutados > 0) {
            situacao = BookObraResponses.SituacaoGrupo.EM_EXECUCAO;
        } else {
            situacao = BookObraResponses.SituacaoGrupo.CONFORME;
        }
        return new BookObraResponses.GrupoComparativo(chave, idPonto, rotulo, vao, pagina, executado, ficha, fotos, equipamento, situacao, divergencias, itens);
    }

    private static BookObraResponses.ItemComparativo comparar(ItemPlanejado item) {
        KitAplicado kit = item.getKitAplicado();
        BigDecimal previsto = item.getQuantidadePrevista();
        BigDecimal executado = item.getQuantidadeExecutada() != null ? item.getQuantidadeExecutada() : BigDecimal.ZERO;
        BookObraResponses.SituacaoItem situacao;
        if (kit.isExecutadoAntes()) {
            situacao = BookObraResponses.SituacaoItem.EXECUTADO_ANTES;
            executado = previsto;
        } else if (executado.signum() == 0) {
            situacao = BookObraResponses.SituacaoItem.NAO_EXECUTADO;
        } else {
            int comparacao = executado.compareTo(previsto);
            situacao = comparacao < 0 ? BookObraResponses.SituacaoItem.ABAIXO
                    : comparacao > 0 ? BookObraResponses.SituacaoItem.ACIMA : BookObraResponses.SituacaoItem.OK;
        }
        int percentual = previsto.signum() == 0 ? 0 : executado.multiply(BigDecimal.valueOf(100)).divide(previsto, 0, RoundingMode.HALF_UP).intValue();
        return new BookObraResponses.ItemComparativo(item.getId(), item.getTipo(), item.getCodigo(), item.getDescricao(), kit.getCodigoKit(),
                item.getOperacao(), item.getUnidade(), previsto.stripTrailingZeros(), executado.stripTrailingZeros(),
                executado.subtract(previsto).stripTrailingZeros(), percentual, item.getStatus(), situacao);
    }

    private static int contarGrupos(List<BookObraResponses.GrupoComparativo> grupos, BookObraResponses.SituacaoGrupo situacao) {
        return (int) grupos.stream().filter(g -> g.situacao() == situacao).count();
    }

    private static int contarItens(List<BookObraResponses.ItemComparativo> itens, BookObraResponses.SituacaoItem situacao) {
        return (int) itens.stream().filter(i -> i.situacao() == situacao).count();
    }

    // ---------------------------------------------------------------- Auxiliares

    private static String situacaoDaFicha(FichaAsBuilt ficha, boolean executado) {
        if (ficha == null) {
            return executado ? "Sem ficha" : null;
        }
        return ficha.isCompleta() ? "Completa" : "Incompleta";
    }

    private static OffsetDateTime alteradoEm(BaseEntity entidade) {
        return entidade.getDataUltimaAlteracao() != null && entidade.getDataUltimaAlteracao().isAfter(entidade.getDataCriacao())
                ? entidade.getDataUltimaAlteracao() : entidade.getDataCriacao();
    }

    private static String autor(BaseEntity entidade) {
        return entidade.getUsuarioUltimaAlteracao() != null ? entidade.getUsuarioUltimaAlteracao() : entidade.getUsuarioCriacao();
    }

    private static OffsetDateTime maisRecente(Stream<OffsetDateTime> datas) {
        return datas.filter(Objects::nonNull).max(Comparator.naturalOrder()).orElse(null);
    }

    private static int percentual(int parte, int total) {
        return total == 0 ? 0 : (int) Math.floor(parte * 100.0 / total);
    }

    private static String quantas(int fotos) {
        return fotos == 1 ? "1 foto" : fotos + " fotos";
    }

    private static String resumir(List<String> pontos) {
        if (pontos.size() <= PONTOS_NO_DETALHE) {
            return String.join(", ", pontos);
        }
        return String.join(", ", pontos.subList(0, PONTOS_NO_DETALHE)) + " e mais " + (pontos.size() - PONTOS_NO_DETALHE);
    }

    /** "MEMORIAL DESCRITIVO" vira "Memorial descritivo". */
    private static String nomeLegivel(String nome) {
        String minusculo = nome.toLowerCase(PT_BR);
        return minusculo.isEmpty() ? minusculo : Character.toUpperCase(minusculo.charAt(0)) + minusculo.substring(1);
    }
}
