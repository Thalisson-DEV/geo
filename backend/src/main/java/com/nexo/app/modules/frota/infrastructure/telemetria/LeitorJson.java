package com.nexo.app.modules.frota.infrastructure.telemetria;

import com.fasterxml.jackson.databind.JsonNode;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;

/** Leitura tolerante dos JSON dos provedores: campo ausente, nulo ou de outro tipo vira nulo. */
final class LeitorJson {

    private static final ZoneId BRASILIA = ZoneId.of("America/Sao_Paulo");

    private LeitorJson() {
    }

    static String texto(JsonNode no, String campo) {
        JsonNode v = no == null ? null : no.get(campo);
        if (v == null || v.isNull() || v.isContainerNode()) {
            return null;
        }
        String t = v.asText().trim();
        return t.isEmpty() ? null : t;
    }

    static Long inteiro(JsonNode no, String campo) {
        JsonNode v = no == null ? null : no.get(campo);
        if (v == null || v.isNull()) {
            return null;
        }
        if (v.isNumber()) {
            return v.asLong();
        }
        try {
            return Long.parseLong(v.asText().trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    static Double decimal(JsonNode no, String campo) {
        JsonNode v = no == null ? null : no.get(campo);
        return decimal(v);
    }

    static Double decimal(JsonNode v) {
        if (v == null || v.isNull()) {
            return null;
        }
        if (v.isNumber()) {
            return v.asDouble();
        }
        try {
            return Double.parseDouble(v.asText().trim().replace(',', '.'));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    static Boolean logico(JsonNode no, String campo) {
        JsonNode v = no == null ? null : no.get(campo);
        return v == null || v.isNull() ? null : v.asBoolean();
    }

    /** Milissegundos desde 1970 (UTC); 0 ou negativo = sem dado. */
    static OffsetDateTime instanteMs(Long ms) {
        return ms == null || ms <= 0 ? null : Instant.ofEpochMilli(ms).atOffset(ZoneOffset.UTC);
    }

    /** ISO com ou sem fuso; sem fuso, vale o horário de Brasília. */
    static OffsetDateTime instanteIso(String texto) {
        if (texto == null) {
            return null;
        }
        try {
            return OffsetDateTime.parse(texto);
        } catch (DateTimeParseException e) {
            try {
                return Instant.parse(texto).atOffset(ZoneOffset.UTC);
            } catch (DateTimeParseException e2) {
                try {
                    return LocalDateTime.parse(texto).atZone(BRASILIA).toOffsetDateTime();
                } catch (DateTimeParseException e3) {
                    return null;
                }
            }
        }
    }

    static String digitos(String texto) {
        if (texto == null) {
            return null;
        }
        String d = texto.replaceAll("\\D", "");
        return d.isEmpty() ? null : d;
    }

    /** Lista do corpo: o próprio array ou o campo {@code content} das respostas paginadas. */
    static JsonNode itens(JsonNode corpo) {
        if (corpo == null || corpo.isNull()) {
            return com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.arrayNode();
        }
        if (corpo.isArray()) {
            return corpo;
        }
        JsonNode content = corpo.get("content");
        return content != null && content.isArray() ? content
                : com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.arrayNode();
    }
}
