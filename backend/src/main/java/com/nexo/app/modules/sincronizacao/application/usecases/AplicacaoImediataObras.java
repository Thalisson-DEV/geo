package com.nexo.app.modules.sincronizacao.application.usecases;

import com.nexo.app.modules.obras.CampoObrasApi;
import com.nexo.app.modules.sincronizacao.domain.TipoOperacaoSincronizacao;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.UUID;

/**
 * Aplica no módulo de Obras, em transação própria, o registro de campo que acabou de chegar: a recusa não desfaz o
 * registro durável, que vira caso no backoffice com o motivo.
 */
@Service
@RequiredArgsConstructor
public class AplicacaoImediataObras {

    private final CampoObrasApi campoObras;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public CampoObrasApi.Aplicado aplicar(TipoOperacaoSincronizacao tipo, Map<String, Object> payload, UUID ator,
                                          CampoObrasApi.Arquivo arquivo) {
        return campoObras.aplicar(comando(tipo), payload, ator, arquivo);
    }

    static CampoObrasApi.Comando comando(TipoOperacaoSincronizacao tipo) {
        if (!tipo.deObras()) {
            throw new IllegalArgumentException("Tipo sem adaptador de Obras: " + tipo);
        }
        return CampoObrasApi.Comando.valueOf(tipo.name().substring("OBRA_".length()));
    }
}
