package com.nexo.app.shared.infrastructure.web;

import jakarta.servlet.http.HttpServletRequest;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.regex.Pattern;

/**
 * IP de quem fez a requisição, confiando nos headers de encaminhamento só quando eles vêm
 * de um proxy da própria infraestrutura.
 *
 * <p>Em produção o caminho é: cliente → borda do Railway → nginx do frontend ou do mobile
 * (rede privada) → backend (rede privada, sem domínio público). A borda grava o IP do
 * cliente em {@code X-Real-IP}, e o nginx o repassa. Quem chama não controla esse valor,
 * enquanto o primeiro item do {@code X-Forwarded-For} é exatamente o que o cliente mandar,
 * por isso nunca é lido.</p>
 *
 * <p>Regras, nesta ordem:</p>
 * <ol>
 *   <li>Se o par TCP não é um endereço privado (loopback, rede privada, CGNAT, link-local
 *       ou IPv6 ULA), os headers são ignorados e vale o par TCP.</li>
 *   <li>{@code X-Real-IP}, quando é um IP literal e público.</li>
 *   <li>{@code X-Forwarded-For} lido da direita para a esquerda, pulando os proxies privados:
 *       o primeiro endereço público é o que o último proxy confiável viu.</li>
 *   <li>O par TCP.</li>
 * </ol>
 *
 * <p>Nada aqui faz consulta de DNS: só IPs literais são interpretados.</p>
 */
public final class ClienteIp {

    static final String X_REAL_IP = "X-Real-IP";
    static final String X_FORWARDED_FOR = "X-Forwarded-For";

    private static final int TAMANHO_MAXIMO = 45;
    private static final Pattern IPV4 = Pattern.compile("^(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})$");
    private static final Pattern IPV6 = Pattern.compile("^[0-9a-fA-F:.]+$");

    private ClienteIp() {
    }

    public static String de(HttpServletRequest request) {
        String par = request.getRemoteAddr();
        InetAddress parTcp = literal(par);
        if (parTcp == null || !proxyConfiavel(parTcp)) {
            return par;
        }

        InetAddress real = literal(request.getHeader(X_REAL_IP));
        if (real != null && !proxyConfiavel(real)) {
            return real.getHostAddress();
        }

        String encaminhado = request.getHeader(X_FORWARDED_FOR);
        if (encaminhado != null && !encaminhado.isBlank()) {
            String[] saltos = encaminhado.split(",");
            for (int i = saltos.length - 1; i >= 0; i--) {
                InetAddress salto = literal(saltos[i]);
                if (salto == null) {
                    // Valor que não é IP no meio da cadeia: daqui para a esquerda é texto do cliente.
                    break;
                }
                if (!proxyConfiavel(salto)) {
                    return salto.getHostAddress();
                }
            }
        }
        return par;
    }

    /** Endereços que só existem dentro da infraestrutura (e no ambiente local). */
    static boolean proxyConfiavel(InetAddress endereco) {
        if (endereco.isLoopbackAddress() || endereco.isSiteLocalAddress()
                || endereco.isLinkLocalAddress() || endereco.isAnyLocalAddress()) {
            return true;
        }
        byte[] bytes = endereco.getAddress();
        if (bytes.length == 4) {
            // 100.64.0.0/10 (CGNAT), faixa usada por redes internas de provedores.
            return (bytes[0] & 0xFF) == 100 && (bytes[1] & 0xC0) == 64;
        }
        // fc00::/7 (IPv6 ULA): a rede privada do Railway usa fd12::/16.
        return (bytes[0] & 0xFE) == 0xFC;
    }

    /** Interpreta só IPs literais; qualquer outra coisa volta nula, sem consultar DNS. */
    static InetAddress literal(String valor) {
        if (valor == null) {
            return null;
        }
        String ip = valor.strip();
        if (ip.startsWith("[") && ip.endsWith("]")) {
            ip = ip.substring(1, ip.length() - 1);
        }
        if (ip.isEmpty() || ip.length() > TAMANHO_MAXIMO) {
            return null;
        }
        var ipv4 = IPV4.matcher(ip);
        if (ipv4.matches()) {
            for (int g = 1; g <= 4; g++) {
                if (Integer.parseInt(ipv4.group(g)) > 255) {
                    return null;
                }
            }
        } else if (!ip.contains(":") || !IPV6.matcher(ip).matches()) {
            return null;
        }
        try {
            return InetAddress.getByName(ip);
        } catch (UnknownHostException e) {
            return null;
        }
    }
}
