package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.Locale;

/**
 * Chave de um registro no sistema de onde ele foi importado (ex.: {@code EXP} + id lá).
 * Única por tabela, para que a importação possa rodar de novo sem duplicar.
 */
@Embeddable
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ReferenciaExterna {

    @Column(name = "sistema_origem", length = 20, updatable = false)
    private String sistemaOrigem;

    @Column(name = "id_externo", length = 80, updatable = false)
    private String idExterno;

    public static ReferenciaExterna de(String sistemaOrigem, String idExterno) {
        var referencia = new ReferenciaExterna();
        referencia.sistemaOrigem = Textos.obrigatorio(sistemaOrigem, "sistema de origem", 20).toUpperCase(Locale.ROOT);
        referencia.idExterno = Textos.obrigatorio(idExterno, "id no sistema de origem", 80);
        return referencia;
    }

    static void exigirVazia(ReferenciaExterna atual) {
        if (atual != null && atual.idExterno != null) {
            throw new InvarianteVioladaException("O registro já tem origem externa ("
                    + atual.sistemaOrigem + " " + atual.idExterno + ").");
        }
    }
}
