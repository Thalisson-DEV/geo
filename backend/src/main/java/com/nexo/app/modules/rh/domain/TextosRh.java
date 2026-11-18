package com.nexo.app.modules.rh.domain;

import com.nexo.app.shared.domain.exception.InvarianteVioladaException;

/** Normalização de texto livre das medidas disciplinares e seus catálogos. */
final class TextosRh {

    private TextosRh() {
    }

    static String obrigatorio(String valor, String mensagem, int max) {
        if (valor == null || valor.isBlank()) {
            throw new InvarianteVioladaException(mensagem);
        }
        return limitar(valor.trim(), max);
    }

    static String opcional(String valor, int max) {
        if (valor == null || valor.isBlank()) return null;
        return limitar(valor.trim(), max);
    }

    private static String limitar(String valor, int max) {
        if (valor.length() > max) {
            throw new InvarianteVioladaException("O texto deve ter no máximo " + max + " caracteres.");
        }
        return valor;
    }
}
