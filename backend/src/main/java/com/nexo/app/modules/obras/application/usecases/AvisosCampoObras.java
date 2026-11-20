package com.nexo.app.modules.obras.application.usecases;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nexo.app.modules.obras.application.dto.CampoObrasRequests;
import com.nexo.app.modules.obras.domain.AssinaturaPush;
import com.nexo.app.modules.obras.domain.EventoProgramacao;
import com.nexo.app.modules.obras.infrastructure.persistence.AssinaturaPushRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.EventoProgramacaoRepository;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.infrastructure.push.WebPushService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Avisos de mudança na agenda da equipe por Web Push, com o app instalado. O mesmo aviso chega sempre pelo pacote ao
 * abrir o app; o push só antecipa.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AvisosCampoObras {

    /** Uma programação mudou e as equipes envolvidas devem ser avisadas. */
    public record ProgramacaoAlterada(UUID idEvento) {
    }

    private final AssinaturaPushRepository assinaturas;
    private final EventoProgramacaoRepository eventos;
    private final CampoObrasUseCases campo;
    private final WebPushService push;
    private final ObjectMapper mapper;
    private final ObjectProvider<AvisosCampoObras> proprio;

    public String chavePublica() {
        return push.chavePublica();
    }

    @Transactional
    public void assinar(CampoObrasRequests.AssinaturaPush pedido, UUID usuario) {
        if (usuario == null) {
            throw new InvarianteVioladaException("Usuário autenticado não identificado.");
        }
        UUID equipe = campo.equipeDoUsuario(usuario).orElse(null);
        AssinaturaPush assinatura = assinaturas.findByEndpoint(pedido.endpoint())
                .map(a -> {
                    a.renovar(usuario, equipe, pedido.p256dh(), pedido.auth());
                    return a;
                })
                .orElseGet(() -> new AssinaturaPush(usuario, equipe, pedido.endpoint(), pedido.p256dh(), pedido.auth()));
        assinaturas.save(assinatura);
    }

    @Transactional
    public void cancelar(String endpoint, UUID usuario) {
        assinaturas.findByEndpoint(endpoint)
                .filter(a -> a.getIdUsuario().equals(usuario))
                .ifPresent(a -> {
                    a.desativar();
                    assinaturas.save(a);
                });
    }

    /** Depois de gravada a mudança; o envio corre fora da requisição do web. */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void aoAlterarProgramacao(ProgramacaoAlterada alterada) {
        if (!push.ligado()) {
            return;
        }
        Thread.startVirtualThread(() -> {
            try {
                proprio.getObject().avisar(alterada.idEvento());
            } catch (RuntimeException e) {
                log.warn("Falha ao avisar as equipes da mudança {}: {}", alterada.idEvento(), e.getMessage());
            }
        });
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void avisar(UUID idEvento) {
        EventoProgramacao evento = eventos.findById(idEvento).orElse(null);
        if (evento == null) {
            return;
        }
        Set<UUID> equipes = new LinkedHashSet<>();
        if (evento.getIdEquipeOrigem() != null) {
            equipes.add(evento.getIdEquipeOrigem());
        }
        if (evento.getIdEquipeDestino() != null) {
            equipes.add(evento.getIdEquipeDestino());
        }
        if (equipes.isEmpty()) {
            return;
        }
        String payload = payload(evento);
        for (AssinaturaPush assinatura : assinaturas.findByIdEquipeInAndAtivoTrue(equipes)) {
            switch (push.enviar(assinatura.getEndpoint(), assinatura.getP256dh(), assinatura.getAuth(), payload)) {
                case ENVIADO -> assinatura.registrarEntrega();
                case EXPIRADA -> assinatura.desativar();
                case FALHOU -> assinatura.registrarFalha();
                case DESLIGADO -> {
                }
            }
            assinaturas.save(assinatura);
        }
    }

    /** No formato que o service worker do Angular mostra sozinho como notificação. */
    String payload(EventoProgramacao e) {
        String titulo = switch (e.getTipo()) {
            case CRIADA -> "Nova obra na agenda";
            case EDITADA -> "Programação alterada";
            case REPROGRAMADA -> "Programação reprogramada";
            case CANCELADA -> "Programação cancelada";
            case EXCLUIDA -> "Programação retirada";
        };
        String corpo = "Programação #" + e.getNumeroProgramacao() + (e.getNumeroObra() != null ? " — obra " + e.getNumeroObra() : "")
                + ". Abra o app para atualizar a agenda.";
        Map<String, Object> notificacao = Map.of(
                "title", titulo,
                "body", corpo,
                "tag", "programacao-" + e.getIdProgramacao(),
                "data", Map.of("onActionClick", Map.of("default", Map.of("operation", "navigateLastFocusedOrOpen", "url", "/hoje"))));
        try {
            return mapper.writeValueAsString(Map.of("notification", notificacao));
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException(ex);
        }
    }
}
