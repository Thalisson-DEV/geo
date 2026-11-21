package com.nexo.app.shared.domain.events;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * A equipe de Obras lançou uma ocorrência pelo app: o que atrapalhou o dia ou, no caso mais urgente, que o serviço da
 * obra não tem condição de ser feito. Até aqui o escritório só sabia disso abrindo a lista de turnos; com o evento, quem
 * programa e o supervisor da obra são avisados assim que o registro chega ao servidor, a tempo de reprogramar.
 *
 * <p>Dois gatilhos, para que cada um tenha a própria regra e prioridade: {@code obras.campo.sem_condicao} quando a
 * ocorrência impede a execução, {@code obras.campo.ocorrencia} nos demais casos.</p>
 */
public record ObrasOcorrenciaCampoEvent(
        UUID idOcorrencia,
        UUID idTurno,
        UUID idObra,
        String numeroObra,
        String tituloObra,
        String equipe,
        String tipoRotulo,
        String descricao,
        boolean impedeExecucao,
        UUID idUsuarioSupervisor,
        UUID idAutor
) implements EventoNotificavel {

    public static final String GATILHO_OCORRENCIA = "obras.campo.ocorrencia";
    public static final String GATILHO_SEM_CONDICAO = "obras.campo.sem_condicao";

    /** O texto chega ao sininho e ao e-mail: o resto fica no turno, a um toque. */
    private static final int LIMITE_DESCRICAO = 280;

    @Override
    public String chaveGatilho() {
        return impedeExecucao ? GATILHO_SEM_CONDICAO : GATILHO_OCORRENCIA;
    }

    @Override
    public UUID idReferencia() {
        return idOcorrencia;
    }

    @Override
    public Map<String, Object> contexto() {
        Map<String, Object> contexto = new HashMap<>();
        contexto.put("numeroObra", numeroObra != null ? numeroObra : "sem obra");
        contexto.put("tituloObra", tituloObra);
        contexto.put("equipe", equipe);
        contexto.put("tipoRotulo", tipoRotulo);
        contexto.put("descricao", resumir(descricao));
        contexto.put("impedeExecucao", impedeExecucao);
        contexto.put("idTurno", idTurno);
        contexto.put("idObra", idObra);
        contexto.put("link", "/obras/turnos/" + idTurno);
        return contexto;
    }

    @Override
    public Map<String, Set<UUID>> papeis() {
        if (idUsuarioSupervisor == null || idUsuarioSupervisor.equals(idAutor)) {
            return Map.of();
        }
        return Map.of("supervisor", Set.of(idUsuarioSupervisor));
    }

    private static String resumir(String texto) {
        if (texto == null) {
            return "";
        }
        String limpo = texto.strip();
        return limpo.length() <= LIMITE_DESCRICAO ? limpo : limpo.substring(0, LIMITE_DESCRICAO - 1).stripTrailing() + "…";
    }
}
