package com.nexo.app.modules.frota.infrastructure.ia;

import com.nexo.app.modules.frota.domain.AnaliseFotoAbastecimento;
import org.springframework.stereotype.Component;

/** Sem modelo de visão configurado: nada é analisado e nenhum alerta de IA é gerado. */
@Component
public class AnaliseFotoAbastecimentoDesligada implements AnaliseFotoAbastecimento {

    @Override
    public Analise analisar(byte[] foto, String contentType, Contexto contexto) {
        return new Analise(Resultado.NAO_ANALISADO, null);
    }
}
