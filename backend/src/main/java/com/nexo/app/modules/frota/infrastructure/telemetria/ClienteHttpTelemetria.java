package com.nexo.app.modules.frota.infrastructure.telemetria;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nexo.app.modules.frota.application.TelemetriaFrotaProperties;
import com.nexo.app.modules.frota.domain.FonteTelemetria.FalhaTelemetria;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Duration;

/**
 * GET em JSON para os provedores de telemetria, com as falhas traduzidas para uma mensagem que
 * vai para a tela. Em 429 espera o {@code Retry-After} (até 30 s) e tenta uma vez.
 */
@Component
public class ClienteHttpTelemetria {

    private static final long ESPERA_MAXIMA_429_MS = 30_000;

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final Duration timeout;

    public ClienteHttpTelemetria(ObjectMapper objectMapper, TelemetriaFrotaProperties properties) {
        this.objectMapper = objectMapper;
        this.timeout = properties.getTimeout();
        this.httpClient = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(timeout)
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
    }

    /**
     * @param autorizacao valor do cabeçalho {@code Authorization}
     * @param variavel    variável de ambiente da chave, citada na mensagem de chave recusada
     */
    public JsonNode get(URI uri, String autorizacao, String variavel) {
        HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(timeout)
                .header("Authorization", autorizacao)
                .header("Accept", "application/json")
                .GET()
                .build();
        HttpResponse<String> resposta = enviar(request);
        if (resposta.statusCode() == 429) {
            esperar(resposta);
            resposta = enviar(request);
        }
        int status = resposta.statusCode();
        if (status == 401 || status == 403) {
            throw new FalhaTelemetria("O provedor recusou a chave (HTTP " + status + "). Confira a variável " + variavel
                    + " e se o endereço do servidor está liberado no provedor.");
        }
        if (status == 429) {
            throw new FalhaTelemetria("O provedor limitou as chamadas (HTTP 429). A próxima rodada tenta de novo.");
        }
        if (status >= 400) {
            throw new FalhaTelemetria("O provedor respondeu com erro (HTTP " + status + ")" + trecho(resposta.body()));
        }
        try {
            String corpo = resposta.body();
            return corpo == null || corpo.isBlank() ? objectMapper.nullNode() : objectMapper.readTree(corpo);
        } catch (IOException e) {
            throw new FalhaTelemetria("O provedor respondeu num formato inesperado.", e);
        }
    }

    private HttpResponse<String> enviar(HttpRequest request) {
        try {
            return httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (HttpTimeoutException e) {
            throw new FalhaTelemetria("O provedor não respondeu em " + timeout.toSeconds() + " s.", e);
        } catch (IOException e) {
            throw new FalhaTelemetria("Não foi possível conectar ao provedor: " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new FalhaTelemetria("A sincronização foi interrompida.", e);
        }
    }

    private static void esperar(HttpResponse<String> resposta) {
        long espera = resposta.headers().firstValue("Retry-After").map(v -> {
            try {
                return Long.parseLong(v.trim()) * 1000;
            } catch (NumberFormatException e) {
                return 1000L;
            }
        }).orElse(1000L);
        try {
            Thread.sleep(Math.min(Math.max(espera, 0), ESPERA_MAXIMA_429_MS));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private static String trecho(String corpo) {
        if (corpo == null || corpo.isBlank()) {
            return ".";
        }
        String limpo = corpo.replaceAll("\\s+", " ").trim();
        return ": " + (limpo.length() > 200 ? limpo.substring(0, 200) + "…" : limpo);
    }
}
