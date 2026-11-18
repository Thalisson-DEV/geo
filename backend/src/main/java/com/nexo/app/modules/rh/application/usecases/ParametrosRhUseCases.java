package com.nexo.app.modules.rh.application.usecases;

import com.nexo.app.modules.rh.application.dto.ParametrosRhRequest;
import com.nexo.app.modules.rh.application.dto.ParametrosRhResponse;
import com.nexo.app.modules.rh.application.mappers.MedidaDisciplinarCatalogoMapper;
import com.nexo.app.modules.rh.domain.ParametrosRh;
import com.nexo.app.modules.rh.infrastructure.persistence.ParametrosRhRepository;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Parâmetros do RH (janela de reincidência e prazo de imediatidade). */
@Service
@RequiredArgsConstructor
public class ParametrosRhUseCases {

    private final ParametrosRhRepository repository;
    private final MedidaDisciplinarCatalogoMapper mapper;

    @Transactional(readOnly = true)
    public ParametrosRhResponse buscar() {
        return mapper.toResponse(entidade());
    }

    @Transactional
    public ParametrosRhResponse atualizar(ParametrosRhRequest r) {
        var parametros = entidade();
        parametros.atualizar(r.janelaReincidenciaMeses(), r.diasImediatidade());
        return mapper.toResponse(repository.save(parametros));
    }

    ParametrosRh entidade() {
        return repository.findById(ParametrosRh.ID_UNICO)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Parâmetros do RH não encontrados."));
    }
}
