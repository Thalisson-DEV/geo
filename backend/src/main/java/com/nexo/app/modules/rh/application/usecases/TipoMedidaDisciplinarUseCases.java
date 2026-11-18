package com.nexo.app.modules.rh.application.usecases;

import com.nexo.app.modules.rh.application.dto.TipoMedidaDisciplinarRequest;
import com.nexo.app.modules.rh.application.dto.TipoMedidaDisciplinarResponse;
import com.nexo.app.modules.rh.application.mappers.MedidaDisciplinarCatalogoMapper;
import com.nexo.app.modules.rh.domain.TipoMedidaDisciplinar;
import com.nexo.app.modules.rh.infrastructure.persistence.TipoMedidaDisciplinarRepository;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.CacheConfig;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/** Catálogo de tipos de medida disciplinar, com a gravidade e se exige período. */
@Service
@RequiredArgsConstructor
@CacheConfig(cacheNames = "rh_tipos_medida_disciplinar")
public class TipoMedidaDisciplinarUseCases {

    private final TipoMedidaDisciplinarRepository repository;
    private final MedidaDisciplinarCatalogoMapper mapper;

    @Transactional(readOnly = true)
    @Cacheable(key = "#apenasAtivos")
    public List<TipoMedidaDisciplinarResponse> listar(boolean apenasAtivos) {
        return mapper.toTipos(repository.findAllByOrderByGravidadeAscNomeAsc().stream()
                .filter(t -> !apenasAtivos || t.isAtivo()).toList());
    }

    @Transactional
    @CacheEvict(allEntries = true)
    public TipoMedidaDisciplinarResponse criar(TipoMedidaDisciplinarRequest r) {
        if (repository.existsByNomeIgnoreCase(r.nome().trim())) {
            throw new InvarianteVioladaException("Já existe um tipo de medida com este nome.");
        }
        return mapper.toResponse(repository.save(new TipoMedidaDisciplinar(r.nome(), r.gravidade(), r.exigePeriodo())));
    }

    @Transactional
    @CacheEvict(allEntries = true)
    public TipoMedidaDisciplinarResponse atualizar(UUID id, TipoMedidaDisciplinarRequest r) {
        var tipo = buscarEntidade(id);
        if (repository.existsByNomeIgnoreCaseAndIdNot(r.nome().trim(), id)) {
            throw new InvarianteVioladaException("Já existe um tipo de medida com este nome.");
        }
        tipo.atualizar(r.nome(), r.gravidade(), r.exigePeriodo());
        return mapper.toResponse(repository.save(tipo));
    }

    @Transactional
    @CacheEvict(allEntries = true)
    public void desativar(UUID id) {
        var tipo = buscarEntidade(id);
        tipo.desativar();
        repository.save(tipo);
    }

    @Transactional
    @CacheEvict(allEntries = true)
    public void ativar(UUID id) {
        var tipo = buscarEntidade(id);
        tipo.ativar();
        repository.save(tipo);
    }

    TipoMedidaDisciplinar buscarEntidade(UUID id) {
        return repository.findById(id).orElseThrow(() -> new RecursoNaoEncontradoException("Tipo de medida não encontrado."));
    }

    /** Tipo ativo de menor gravidade acima da informada; vazio quando já está no topo. */
    java.util.Optional<TipoMedidaDisciplinar> acimaDe(int gravidade) {
        return repository.findAllByOrderByGravidadeAscNomeAsc().stream()
                .filter(TipoMedidaDisciplinar::isAtivo)
                .filter(t -> t.getGravidade() > gravidade)
                .findFirst();
    }
}
