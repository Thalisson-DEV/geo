package com.nexo.app.modules.assistente.application;

import com.nexo.app.modules.assistente.domain.OrigemConversa;
import com.nexo.app.modules.assistente.domain.StatusMensagemAssistente;
import com.nexo.app.modules.assistente.infrastructure.persistence.ConversaAssistenteRepository;
import com.nexo.app.modules.notificacao.AvisoAutomacao;
import com.nexo.app.modules.notificacao.NotificacaoApi;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Avisa no sino quando uma resposta demorada da Bússola termina: análises longas rodam no servidor e a pessoa
 * pode sair da tela. Respostas curtas não avisam (a pessoa ainda está olhando), nem as das conexões de IA externas.
 */
@Component
public class AvisoRespostaPronta {

    static final Duration MINIMO = Duration.ofSeconds(90);
    private static final Logger LOGGER = LoggerFactory.getLogger(AvisoRespostaPronta.class);

    private final ConversaAssistenteRepository conversas;
    private final ObjectProvider<NotificacaoApi> notificacoes;

    public AvisoRespostaPronta(ConversaAssistenteRepository conversas, ObjectProvider<NotificacaoApi> notificacoes) {
        this.conversas = conversas;
        this.notificacoes = notificacoes;
    }

    public void avisar(UUID conversaId, UUID usuarioId, UUID mensagemId, StatusMensagemAssistente status, long duracaoMs) {
        if (!deveAvisar(status, duracaoMs)) return;
        NotificacaoApi api = notificacoes.getIfAvailable();
        if (api == null) return;
        try {
            conversas.findById(conversaId).filter(conversa -> conversa.getOrigem() != OrigemConversa.MCP).ifPresent(conversa -> {
                boolean concluida = status == StatusMensagemAssistente.CONCLUIDA;
                api.publicarAviso(new AvisoAutomacao(Set.of(usuarioId), null, mensagemId, "OPERACIONAL", "NORMAL",
                        concluida ? "A Bússola terminou sua análise" : "A Bússola não conseguiu concluir a análise",
                        "\"" + conversa.getTitulo() + "\" " + (concluida ? "está pronta para você ver."
                                : "parou antes do fim. Abra a conversa para tentar de novo."),
                        "/bussola/" + conversaId, Map.of(), "copiloto-resposta:" + mensagemId, false, null));
            });
        } catch (RuntimeException exception) {
            LOGGER.warn("Aviso de resposta pronta {} não enviado: {}", mensagemId, exception.getMessage());
        }
    }

    static boolean deveAvisar(StatusMensagemAssistente status, long duracaoMs) {
        return duracaoMs >= MINIMO.toMillis()
                && (status == StatusMensagemAssistente.CONCLUIDA || status == StatusMensagemAssistente.FALHOU);
    }
}
