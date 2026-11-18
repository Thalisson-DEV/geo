package com.nexo.app.shared.infrastructure.email;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.web.util.HtmlUtils;

/**
 * Ambiente de teste: entrega toda mensagem só aos endereços configurados, com o assunto
 * marcado e os destinatários que receberiam na produção no topo do corpo. Assim dá para
 * conferir quem seria avisado sem mandar nada para as pessoas cadastradas.
 */
final class RedirecionamentoEmailService implements ServicoEmail {

    private final ServicoEmail destino;
    private final Set<String> enderecos;

    RedirecionamentoEmailService(ServicoEmail destino, Set<String> enderecos) {
        this.destino = destino;
        this.enderecos = Set.copyOf(enderecos);
    }

    static Set<String> enderecos(String configurado) {
        if (configurado == null || configurado.isBlank()) return Set.of();
        return Arrays.stream(configurado.split("[,;]"))
                .map(String::trim)
                .filter(e -> e.contains("@"))
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    @Override
    public ResultadoEnvioEmail enviar(MensagemEmail mensagem) {
        String originais = String.join(", ", mensagem.destinatarios());
        String aviso = "Teste da homologação. Na produção, este e-mail iria para: " + originais;
        String html = "<div style=\"margin:0 0 16px;padding:10px 14px;border-radius:8px;background:#fff4e5;"
                + "color:#7a4a00;font:14px/1.4 Arial,sans-serif\">" + HtmlUtils.htmlEscape(aviso) + "</div>"
                + mensagem.html();
        String texto = aviso + "\n\n" + (mensagem.texto() == null ? "" : mensagem.texto());
        return destino.enviar(new MensagemEmail(enderecos, "[Homologação] " + mensagem.assunto(), html, texto,
                mensagem.anexos()));
    }

    @Override
    public ProvedorEmail provedor() {
        return destino.provedor();
    }
}
