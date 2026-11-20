package com.nexo.app.modules.execucao.application.usecases;

import com.nexo.app.modules.execucao.application.dto.NumeroDaNota;
import com.nexo.app.modules.execucao.infrastructure.persistence.ExecucaoComercialRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/** Números das notas a partir das execuções, em lotes para não estourar o IN do banco. */
@Service
@RequiredArgsConstructor
public class NumeroNotaUseCases {

    static final int LOTE = 1_000;

    private final ExecucaoComercialRepository repository;

    @Transactional(readOnly = true)
    public Map<UUID, String> numeros(Collection<UUID> execucoes) {
        List<UUID> ids = new ArrayList<>(new LinkedHashSet<>(execucoes.stream().filter(Objects::nonNull).toList()));
        Map<UUID, String> numeros = new HashMap<>();
        for (int inicio = 0; inicio < ids.size(); inicio += LOTE) {
            for (NumeroDaNota nota : repository.buscarNumeros(ids.subList(inicio, Math.min(ids.size(), inicio + LOTE)))) {
                if (nota.numero() != null && !nota.numero().isBlank()) numeros.put(nota.execucaoId(), nota.numero());
            }
        }
        return numeros;
    }
}
