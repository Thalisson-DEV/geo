package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.application.dto.TipoDespesaRequest;
import com.nexo.app.modules.frota.application.dto.TipoDespesaResponse;
import com.nexo.app.modules.frota.domain.TipoDespesa;
import com.nexo.app.modules.frota.infrastructure.persistence.TipoDespesaRepository;
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

/** Catálogo de tipos e subtipos de despesa (configurações da frota). */
@Service
@RequiredArgsConstructor
@CacheConfig(cacheNames = "frota_tipos_despesa")
public class TipoDespesaUseCases {

    private final TipoDespesaRepository repository;

    @Transactional(readOnly = true)
    @Cacheable(key = "#apenasAtivos")
    public List<TipoDespesaResponse> listar(boolean apenasAtivos) {
        return repository.findAllByOrderByOrdemAscNomeAsc().stream()
                .filter(t -> !apenasAtivos || t.isAtivo())
                .map(TipoDespesaUseCases::responder).toList();
    }

    @Transactional
    @CacheEvict(allEntries = true)
    public TipoDespesaResponse criar(TipoDespesaRequest request) {
        if (repository.existsByNomeIgnoreCase(request.nome().trim())) {
            throw new InvarianteVioladaException("Já existe um tipo de despesa com este nome.");
        }
        int ordem = repository.findAll().stream().mapToInt(TipoDespesa::getOrdem).max().orElse(0) + 1;
        return responder(repository.save(new TipoDespesa(request.nome(), ordem, request.subtipos())));
    }

    @Transactional
    @CacheEvict(allEntries = true)
    public TipoDespesaResponse atualizar(UUID id, TipoDespesaRequest request) {
        var tipo = buscarEntidade(id);
        if (repository.existsByNomeIgnoreCaseAndIdNot(request.nome().trim(), id)) {
            throw new InvarianteVioladaException("Já existe um tipo de despesa com este nome.");
        }
        tipo.atualizar(request.nome(), request.subtipos());
        return responder(repository.save(tipo));
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

    TipoDespesa buscarEntidade(UUID id) {
        return repository.findById(id).orElseThrow(() -> new RecursoNaoEncontradoException("Tipo de despesa não encontrado."));
    }

    static TipoDespesaResponse responder(TipoDespesa t) {
        return new TipoDespesaResponse(t.getId(), t.getNome(), t.getCodigo(), t.isAtivo(),
                t.subtiposAtivos().stream().map(s -> new TipoDespesaResponse.Subtipo(s.getId(), s.getNome())).toList());
    }
}
