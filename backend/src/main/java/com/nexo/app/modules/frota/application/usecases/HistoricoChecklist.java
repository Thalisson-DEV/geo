package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.application.dto.HistoricoItemChecklistResponse;
import com.nexo.app.modules.frota.domain.HistoricoItemChecklist;
import com.nexo.app.modules.frota.infrastructure.persistence.RespostaChecklistRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Histórico das perguntas de um checklist no mesmo veículo (desde quando o item vem com problema). */
@Component
@RequiredArgsConstructor
class HistoricoChecklist {

    private final RespostaChecklistRepository respostas;

    /** Por pergunta, o histórico até o instante do checklist analisado. */
    Map<UUID, HistoricoItemChecklistResponse> porPergunta(UUID idVeiculo, Collection<UUID> idsPergunta, OffsetDateTime ate) {
        if (idsPergunta.isEmpty()) return Map.of();
        var ocorrencias = new HashMap<UUID, List<HistoricoItemChecklist.Ocorrencia>>();
        for (var o : respostas.historico(idVeiculo, idsPergunta, ate)) {
            ocorrencias.computeIfAbsent(o.getIdPergunta(), k -> new ArrayList<>())
                    .add(new HistoricoItemChecklist.Ocorrencia(o.getPreenchidoEm(), Boolean.TRUE.equals(o.getProblema())));
        }
        var resultado = new HashMap<UUID, HistoricoItemChecklistResponse>();
        ocorrencias.forEach((idPergunta, lista) -> {
            var h = HistoricoItemChecklist.calcular(lista);
            resultado.put(idPergunta, new HistoricoItemChecklistResponse(h.problemaDesde(), h.diasComProblema(ate),
                    h.checklistsSeguidos(), h.vezes30Dias(), h.ultimoOkEm()));
        });
        return resultado;
    }
}
