package com.nexo.app.modules.frota.domain;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

/**
 * Porta para um provedor de telemetria (Ubicaly, Zuq). Os adaptadores normalizam as respostas:
 * odômetro em metros, horímetro em horas, velocidade em km/h e instantes com fuso.
 *
 * <p>Falhas de rede, autenticação ou resposta inesperada sobem como {@link FalhaTelemetria},
 * com uma mensagem que pode ir para a tela.</p>
 */
public interface FonteTelemetria {

    ProvedorTelemetria provedor();

    /** Há chave para chamar o provedor. Sem chave, nada é chamado. */
    boolean configurada();

    /** Todos os veículos da conta, com o último estado conhecido. */
    List<VeiculoProvedor> veiculos();

    /**
     * Eventos de condução por veículo do provedor, de {@code desde} (por veículo) até {@code ate}.
     *
     * @param desdePorVeiculo id externo do veículo → início da janela daquele veículo
     */
    EventosLidos eventos(Map<String, OffsetDateTime> desdePorVeiculo, OffsetDateTime ate);

    /**
     * Todas as posições gravadas pelo rastreador no período, na resolução do provedor (bem mais
     * densa que a leitura do tempo real a cada 2 minutos). Serve para desenhar o trajeto pela via.
     *
     * @param idExterno id do veículo no provedor
     * @param placa     placa como o provedor conhece
     * @return as leituras em ordem de tempo, ou {@code null} quando o provedor não tem histórico
     */
    default List<Leitura> historico(String idExterno, String placa, OffsetDateTime de, OffsetDateTime ate) {
        return null;
    }

    /**
     * @param cpf      só dígitos, quando o provedor informa
     * @param cnh      número da CNH, só dígitos, quando o provedor informa
     */
    record Motorista(String idExterno, String nome, String cpf, String cnh) {
    }

    record Leitura(OffsetDateTime lidoEm, Double latitude, Double longitude, Double velocidadeKmh, Boolean ignicao,
                   Long odometroMetros, Double horimetroHoras, Motorista motorista) {
    }

    record VeiculoProvedor(String idExterno, String placa, String nome, Leitura leitura) {
    }

    record EventoProvedor(String idExterno, String idExternoVeiculo, String placa, TipoEventoTelemetria tipo,
                          OffsetDateTime ocorridoEm, Double latitude, Double longitude, String endereco,
                          Double velocidadeKmh, Double limiteKmh, Integer duracaoSegundos, String descricao,
                          Motorista motorista) {
    }

    /**
     * @param lidosAte por veículo, até onde a janela foi lida por completo (o próximo pedido
     *                 começa daí); veículo fora do mapa mantém a janela anterior
     */
    record EventosLidos(List<EventoProvedor> eventos, Map<String, OffsetDateTime> lidosAte) {
    }

    /** Falha ao falar com o provedor; a mensagem é mostrada na situação da telemetria. */
    class FalhaTelemetria extends RuntimeException {
        public FalhaTelemetria(String mensagem) {
            super(mensagem);
        }

        public FalhaTelemetria(String mensagem, Throwable causa) {
            super(mensagem, causa);
        }
    }
}
