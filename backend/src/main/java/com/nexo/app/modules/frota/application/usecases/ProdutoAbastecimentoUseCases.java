package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.application.dto.ProdutoAbastecimentoFilter;
import com.nexo.app.modules.frota.application.dto.ProdutoAbastecimentoRequest;
import com.nexo.app.modules.frota.application.dto.ProdutoAbastecimentoResponse;
import com.nexo.app.modules.frota.application.mappers.AbastecimentoCadastroMapper;
import com.nexo.app.modules.frota.domain.ProdutoAbastecimento;
import com.nexo.app.modules.frota.infrastructure.persistence.ProdutoAbastecimentoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.ProdutoAbastecimentoSpecification;
import com.nexo.app.shared.application.dto.PageResponse;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.CacheConfig;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/** Produtos do abastecimento: combustíveis, ARLA, óleos e fluidos. */
@Service
@RequiredArgsConstructor
@CacheConfig(cacheNames = "frota_produtos_abastecimento")
public class ProdutoAbastecimentoUseCases {

    private final ProdutoAbastecimentoRepository repository;
    private final AbastecimentoCadastroMapper mapper;

    @Transactional
    @CacheEvict(allEntries = true)
    public ProdutoAbastecimentoResponse criar(ProdutoAbastecimentoRequest request) {
        if (repository.existsByNomeIgnoreCaseAndAtivoTrue(request.nome().trim())) {
            throw new InvarianteVioladaException("Já existe um produto com este nome.");
        }
        return mapper.toResponse(repository.save(new ProdutoAbastecimento(dados(request))));
    }

    @Transactional
    @CacheEvict(allEntries = true)
    public ProdutoAbastecimentoResponse atualizar(UUID id, ProdutoAbastecimentoRequest request) {
        var produto = buscarEntidade(id);
        if (repository.existsByNomeIgnoreCaseAndAtivoTrueAndIdNot(request.nome().trim(), id)) {
            throw new InvarianteVioladaException("Já existe um produto com este nome.");
        }
        produto.atualizar(dados(request));
        return mapper.toResponse(repository.save(produto));
    }

    @Transactional
    @CacheEvict(allEntries = true)
    public void desativar(UUID id) {
        var produto = buscarEntidade(id);
        produto.desativar();
        repository.save(produto);
    }

    @Transactional
    @CacheEvict(allEntries = true)
    public void ativar(UUID id) {
        var produto = buscarEntidade(id);
        produto.ativar();
        repository.save(produto);
    }

    @Transactional(readOnly = true)
    public ProdutoAbastecimentoResponse buscarPorId(UUID id) {
        return mapper.toResponse(buscarEntidade(id));
    }

    @Transactional(readOnly = true)
    @Cacheable(key = "#pageable.pageNumber + '-' + #pageable.pageSize + '-' + #pageable.sort + '-' + (#filtro != null ? #filtro.hashCode() : 'sem-filtro')")
    public PageResponse<ProdutoAbastecimentoResponse> listar(ProdutoAbastecimentoFilter filtro, Pageable pageable) {
        return PageResponse.fromPage(repository.findAll(ProdutoAbastecimentoSpecification.of(filtro), pageable).map(mapper::toResponse));
    }

    ProdutoAbastecimento buscarEntidade(UUID id) {
        return repository.findById(id).orElseThrow(() -> new RecursoNaoEncontradoException("Produto não encontrado."));
    }

    private static ProdutoAbastecimento.Dados dados(ProdutoAbastecimentoRequest request) {
        return new ProdutoAbastecimento.Dados(request.nome(), request.categoria(), request.unidade(), request.combustivel());
    }
}
