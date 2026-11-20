package com.nexo.app.modules.execucao.infrastructure.copiloto;

import com.nexo.app.modules.assistente.application.rastreio.NumerosDeNota;
import com.nexo.app.modules.execucao.application.usecases.NumeroNotaUseCases;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Número da nota nos resultados da Bússola. Vale a mesma permissão de ver as notas na tela. */
@Component
public class NumerosDeNotaCopiloto implements NumerosDeNota {

    private final NumeroNotaUseCases useCases;

    public NumerosDeNotaCopiloto(NumeroNotaUseCases useCases) {
        this.useCases = useCases;
    }

    @Override
    public Set<String> autoridades() {
        return Set.of("execucao:comercial:read");
    }

    @Override
    public Map<UUID, String> numeros(Collection<UUID> execucoes) {
        return useCases.numeros(execucoes);
    }
}
