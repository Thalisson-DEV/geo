package com.nexo.app.modules.frota.application;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * Telemetria da frota (prefixo {@code geo.frota.telemetria}). As chaves dos provedores vêm só das
 * variáveis de ambiente ({@code UBICALY_API_KEY}, {@code ZUQ_API_TOKEN}); sem chave, o provedor
 * fica "Não configurado" e nada é chamado.
 */
@Getter
@Setter
@ConfigurationProperties(prefix = "geo.frota.telemetria")
public class TelemetriaFrotaProperties {

    private Provedor ubicaly = new Provedor("https://panel.ubicaly.com");
    private Provedor zuq = new Provedor("https://app.zuq.com.br");
    /**
     * Grava o km estimado pela telemetria no livro-razão do odômetro. Desligado: a gestão da frota
     * usa só o km de painel (checklist e abastecimento); o odômetro do rastreador deriva com o tempo
     * e gerava inconsistências falsas na conferência de KM.
     */
    private boolean registrarKm = false;
    /** Intervalo mínimo entre duas leituras de km da telemetria no livro-razão, por veículo. */
    private Duration intervaloLeitura = Duration.ofHours(6);
    /** Veículo parado grava posição no máximo nesse intervalo (andando, grava a cada leitura). */
    private Duration intervaloPosicaoParado = Duration.ofMinutes(30);
    /** Quanto tempo uma rotina pode falhar antes do aviso {@code frota.telemetria_falha}. */
    private Duration toleranciaFalha = Duration.ofHours(1);
    /** Posições mais antigas que isso são apagadas (LGPD, ADR 0001 seção 7). */
    private int retencaoPosicoesDias = 180;
    /** Janela dos eventos no primeiro pedido de um rastreador (sem cursor). */
    private Duration janelaInicialEventos = Duration.ofHours(24);
    private Duration timeout = Duration.ofSeconds(10);

    @Getter
    @Setter
    public static class Provedor {
        private String baseUrl;
        private String chave = "";

        public Provedor() {
        }

        Provedor(String baseUrl) {
            this.baseUrl = baseUrl;
        }

        public boolean configurado() {
            return chave != null && !chave.isBlank() && baseUrl != null && !baseUrl.isBlank();
        }
    }
}
