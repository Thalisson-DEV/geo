package com.nexo.app.modules.frota.domain;

import java.text.NumberFormat;
import java.util.Locale;

/** Números inteiros no formato brasileiro (ex.: 10.000) para mensagens e textos da frota. */
public final class Medidas {

    private static final Locale PT_BR = Locale.of("pt", "BR");

    private Medidas() {
    }

    /** NumberFormat não é thread-safe: um por chamada. */
    public static String formatar(long valor) {
        return NumberFormat.getIntegerInstance(PT_BR).format(valor);
    }

    /** Valor com o sufixo da unidade, ex.: "10.000 km" ou "250 h". */
    public static String formatar(long valor, UnidadeMedicao unidade) {
        return formatar(valor) + " " + unidade.sufixo();
    }
}
