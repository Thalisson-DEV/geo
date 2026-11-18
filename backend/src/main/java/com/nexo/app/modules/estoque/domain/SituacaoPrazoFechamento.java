package com.nexo.app.modules.estoque.domain;

import com.nexo.app.shared.domain.HorasUteis;

import java.time.OffsetDateTime;

/** Sinalização do prazo em curso (ou do último prazo, quando cumprido). */
public enum SituacaoPrazoFechamento {
    NO_PRAZO,
    VENCE_EM_BREVE,
    ATRASADO,
    CUMPRIDO,
    CUMPRIDO_COM_ATRASO;

    /** Abaixo disso o prazo "vence em breve". */
    public static final int HORAS_UTEIS_ALERTA = 12;
    public static final int HORAS_UTEIS_PRAZO = 48;

    public static SituacaoPrazoFechamento emCurso(OffsetDateTime limite, OffsetDateTime agora) {
        if (limite == null) {
            return null;
        }
        if (agora.isAfter(limite)) {
            return ATRASADO;
        }
        return limite.isBefore(HorasUteis.somar(agora, HORAS_UTEIS_ALERTA)) ? VENCE_EM_BREVE : NO_PRAZO;
    }

    public static SituacaoPrazoFechamento cumprido(OffsetDateTime limite, OffsetDateTime cumpridoEm) {
        if (limite == null || cumpridoEm == null) {
            return null;
        }
        return cumpridoEm.isAfter(limite) ? CUMPRIDO_COM_ATRASO : CUMPRIDO;
    }
}
