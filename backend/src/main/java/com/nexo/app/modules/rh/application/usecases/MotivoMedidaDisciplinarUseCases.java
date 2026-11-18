package com.nexo.app.modules.rh.application.usecases;

import com.nexo.app.modules.rh.application.dto.MotivoMedidaDisciplinarRequest;
import com.nexo.app.modules.rh.application.dto.MotivoMedidaDisciplinarResponse;
import com.nexo.app.modules.rh.application.mappers.MedidaDisciplinarCatalogoMapper;
import com.nexo.app.modules.rh.domain.MotivoMedidaDisciplinar;
import com.nexo.app.modules.rh.infrastructure.persistence.MotivoMedidaDisciplinarRepository;
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

/** Catálogo de motivos de medida disciplinar. */
@Service
@RequiredArgsConstructor
@CacheConfig(cacheNames = "rh_motivos_medida_disciplinar")
public class MotivoMedidaDisciplinarUseCases {

    private final MotivoMedidaDisciplinarRepository repository;
    private final MedidaDisciplinarCatalogoMapper mapper;

    @Transactional(readOnly = true)
    @Cacheable(key = "#apenasAtivos")
    public List<MotivoMedidaDisciplinarResponse> listar(boolean apenasAtivos) {
        return mapper.toMotivos(repository.findAllByOrderByNomeAsc().stream()
                .filter(m -> !apenasAtivos || m.isAtivo()).toList());
    }

    @Transactional
    @CacheEvict(allEntries = true)
    public MotivoMedidaDisciplinarResponse criar(MotivoMedidaDisciplinarRequest r) {
        if (repository.existsByNomeIgnoreCase(r.nome().trim())) {
            throw new InvarianteVioladaException("Já existe um motivo com este nome.");
        }
        return mapper.toResponse(repository.save(new MotivoMedidaDisciplinar(r.nome())));
    }

    @Transactional
    @CacheEvict(allEntries = true)
    public MotivoMedidaDisciplinarResponse atualizar(UUID id, MotivoMedidaDisciplinarRequest r) {
        var motivo = buscarEntidade(id);
        if (repository.existsByNomeIgnoreCaseAndIdNot(r.nome().trim(), id)) {
            throw new InvarianteVioladaException("Já existe um motivo com este nome.");
        }
        motivo.renomear(r.nome());
        return mapper.toResponse(repository.save(motivo));
    }

    @Transactional
    @CacheEvict(allEntries = true)
    public void desativar(UUID id) {
        var motivo = buscarEntidade(id);
        motivo.desativar();
        repository.save(motivo);
    }

    @Transactional
    @CacheEvict(allEntries = true)
    public void ativar(UUID id) {
        var motivo = buscarEntidade(id);
        motivo.ativar();
        repository.save(motivo);
    }

    MotivoMedidaDisciplinar buscarEntidade(UUID id) {
        return repository.findById(id).orElseThrow(() -> new RecursoNaoEncontradoException("Motivo não encontrado."));
    }
}
