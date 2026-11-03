package com.nexo.app.shared.domain.events;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Sinistro registrado para um veículo da frota. Gatilho {@code frota.sinistro_registrado}.
 *
 * @param tipo       rótulo do tipo, ex.: "Colisão sem vítima"
 * @param tipoCodigo código do tipo, ex.: {@code COLISAO_SEM_VITIMA}, para as condições da regra
 * @param ocorridoEm data e hora já formatadas, ex.: "27/10/2026 14:05"
 * @param condutor   nome de quem dirigia, ou "não identificado"
 */
public record FrotaSinistroRegistradoEvent(
        UUID idSinistro,
        long numero,
        String tipo,
        String tipoCodigo,
        String placa,
        String base,
        String ocorridoEm,
        String local,
        String condutor,
        String descricao,
        String link
) implements EventoNotificavel {

    public static final String CHAVE_GATILHO = "frota.sinistro_registrado";

    @Override
    public String chaveGatilho() {
        return CHAVE_GATILHO;
    }

    @Override
    public UUID idReferencia() {
        return idSinistro;
    }

    @Override
    public Map<String, Object> contexto() {
        Map<String, Object> contexto = new HashMap<>();
        contexto.put("numero", numero);
        contexto.put("tipo", tipo);
        contexto.put("tipoCodigo", tipoCodigo);
        contexto.put("placa", placa);
        contexto.put("base", base);
        contexto.put("ocorridoEm", ocorridoEm);
        contexto.put("local", local);
        // Pronto para a frase: " em Av. Paralela" ou vazio.
        contexto.put("localTexto", local == null || local.isBlank() ? "" : " em " + local);
        contexto.put("condutor", condutor);
        contexto.put("descricao", descricao);
        contexto.put("link", link);
        return contexto;
    }

    @Override
    public Map<String, Set<UUID>> papeis() {
        return Map.of();
    }
}
