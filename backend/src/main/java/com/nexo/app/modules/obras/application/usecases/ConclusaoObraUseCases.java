package com.nexo.app.modules.obras.application.usecases;

import com.nexo.app.shared.infrastructure.config.CacheNames;
import com.nexo.app.modules.listas.ListaConfiguravel;
import com.nexo.app.modules.listas.ListasApi;
import com.nexo.app.modules.obras.application.dto.CampoObrasResponses;
import com.nexo.app.modules.obras.application.dto.ConclusaoObraResponse;
import com.nexo.app.modules.obras.domain.Obra;
import com.nexo.app.modules.obras.domain.OcorrenciaTurno;
import com.nexo.app.modules.obras.infrastructure.persistence.ItemPlanejadoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.ObraRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.OcorrenciaTurnoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.StatusObraRepository;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Critério de obra concluída. A obra conclui sozinha quando todos os serviços planejados foram executados, não falta
 * foto obrigatória dos pontos executados (quando o modelo de fotos trava) e não há ocorrência aberta de alteração de
 * projeto ou de obra já executada por terceiros. O app grava sem sinal e as fotos chegam depois do lançamento: o
 * servidor aceita o lançamento e reavalia a conclusão quando cada foto chega e quando o escritório resolve a ocorrência.
 * Alteração de projeto resolvida com revisão do planejamento muda os serviços planejados; a conclusão segue o plano vigente.
 */
@Service
@RequiredArgsConstructor
public class ConclusaoObraUseCases {

    static final String STATUS_CONCLUIDA = "CONCLUÍDA";
    private static final ZoneId FUSO = ZoneId.of("America/Sao_Paulo");

    private final ObraRepository obraRepository;
    private final StatusObraRepository statusObraRepository;
    private final ItemPlanejadoRepository itemRepository;
    private final OcorrenciaTurnoRepository ocorrenciaRepository;
    /** Buscado na hora do uso: o pacote do campo depende, por outro caminho, do apontamento que chama esta classe. */
    private final ObjectProvider<PacoteCampoObras> pacote;
    private final ListasApi listasApi;

    @Transactional(readOnly = true)
    public ConclusaoObraResponse consultar(UUID idObra) {
        Obra obra = obraRepository.findById(idObra).orElseThrow(() -> new RecursoNaoEncontradoException("Obra não encontrada."));
        long[] servicos = servicos(idObra);
        Map<String, String> rotulos = listasApi.ativas(ListaConfiguravel.OCORRENCIA_TURNO).stream()
                .collect(Collectors.toMap(ListasApi.Opcao::codigo, ListasApi.Opcao::rotulo, (a, b) -> a));
        List<ConclusaoObraResponse.FotoPendente> fotos = pacote.getObject().pendenciasFotoQueTravam(idObra).stream()
                .map(p -> new ConclusaoObraResponse.FotoPendente(p.idPonto(), p.numeroPonto(), p.titulo(), p.motivoReprovacao()))
                .toList();
        List<ConclusaoObraResponse.OcorrenciaPendente> ocorrencias = ocorrenciasAbertas(idObra).stream()
                .map(o -> new ConclusaoObraResponse.OcorrenciaPendente(o.getId(), o.getTipo(), rotulos.getOrDefault(o.getTipo(), o.getTipo()),
                        o.getDescricao(), o.momento()))
                .toList();
        boolean concluida = obra.getStatusObra() != null && obra.getStatusObra().isConcluida();
        return new ConclusaoObraResponse(concluida, servicos[0], servicos[1], fotos, ocorrencias);
    }

    /** Conclui a obra se nada mais falta. Chamado a cada apontamento, a cada foto recebida e a cada ocorrência resolvida. */
    @Transactional
    @CacheEvict(cacheNames = CacheNames.OBRAS, allEntries = true)
    public void tentarConcluir(UUID idObra, LocalDate data) {
        Obra obra = obraRepository.findById(idObra).orElse(null);
        if (obra == null || obra.getStatusObra() == null || obra.getStatusObra().isConcluida()) {
            return;
        }
        long[] servicos = servicos(idObra);
        if (servicos[0] == 0 || servicos[1] > 0) {
            return;
        }
        if (!ocorrenciasAbertas(idObra).isEmpty() || !pacote.getObject().pendenciasFotoQueTravam(idObra).isEmpty()) {
            return;
        }
        statusObraRepository.findByNomeIgnoreCase(STATUS_CONCLUIDA)
                .filter(status -> status.isAtivo() && status.isConcluida())
                .ifPresent(status -> obra.informarStatusOperacional(status,
                        "Concluída automaticamente: serviços executados, fotos obrigatórias recebidas e sem ocorrência pendente.",
                        data != null ? data : LocalDate.now(FUSO)));
    }

    @Transactional
    @CacheEvict(cacheNames = CacheNames.OBRAS, allEntries = true)
    public ConclusaoObraResponse resolverOcorrencia(UUID idObra, UUID idOcorrencia, String resolucao) {
        OcorrenciaTurno ocorrencia = ocorrenciaRepository.findByIdAndIdObraAndAtivoTrue(idOcorrencia, idObra)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Ocorrência não encontrada nesta obra."));
        var autenticacao = SecurityContextHolder.getContext().getAuthentication();
        ocorrencia.resolver(resolucao, autenticacao != null ? autenticacao.getName() : null);
        ocorrenciaRepository.save(ocorrencia);
        tentarConcluir(idObra, LocalDate.now(FUSO));
        return consultar(idObra);
    }

    private List<OcorrenciaTurno> ocorrenciasAbertas(UUID idObra) {
        return ocorrenciaRepository.findByIdObraAndTipoInAndResolvidaEmIsNullAndAtivoTrueOrderByDataCriacaoAsc(idObra, OcorrenciaTurno.TRAVAM_CONCLUSAO);
    }

    private long[] servicos(UUID idObra) {
        List<Object[]> contagem = itemRepository.contarServicosEAbertos(idObra);
        Object[] linha = contagem.isEmpty() ? null : contagem.get(0);
        long total = linha != null && linha[0] instanceof Number n ? n.longValue() : 0;
        long abertos = linha != null && linha[1] instanceof Number n ? n.longValue() : 0;
        return new long[]{total, abertos};
    }
}
