package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.financeiro.FinanceiroApi;
import com.nexo.app.modules.frota.application.dto.PostoAbastecimentoFilter;
import com.nexo.app.modules.frota.application.dto.PostoAbastecimentoRequest;
import com.nexo.app.modules.frota.application.dto.PostoAbastecimentoResponse;
import com.nexo.app.modules.frota.application.mappers.AbastecimentoCadastroMapper;
import com.nexo.app.modules.frota.domain.PostoAbastecimento;
import com.nexo.app.modules.frota.infrastructure.persistence.PostoAbastecimentoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.PostoAbastecimentoSpecification;
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

import java.util.List;
import java.util.UUID;

/** Postos externos do abastecimento. */
@Service
@RequiredArgsConstructor
@CacheConfig(cacheNames = "frota_postos")
public class PostoAbastecimentoUseCases {

    private final PostoAbastecimentoRepository repository;
    private final AbastecimentoCadastroMapper mapper;
    private final ReferenciasFrota referencias;
    private final FinanceiroApi financeiro;

    @Transactional
    @CacheEvict(allEntries = true)
    public PostoAbastecimentoResponse criar(PostoAbastecimentoRequest request) {
        if (repository.existsByNomeIgnoreCaseAndAtivoTrue(request.nome().trim())) {
            throw new InvarianteVioladaException("Já existe um posto com este nome.");
        }
        validarReferencias(request);
        return responder(repository.save(new PostoAbastecimento(dados(request))));
    }

    @Transactional
    @CacheEvict(allEntries = true)
    public PostoAbastecimentoResponse atualizar(UUID id, PostoAbastecimentoRequest request) {
        var posto = buscarEntidade(id);
        if (repository.existsByNomeIgnoreCaseAndAtivoTrueAndIdNot(request.nome().trim(), id)) {
            throw new InvarianteVioladaException("Já existe um posto com este nome.");
        }
        validarReferencias(request);
        posto.atualizar(dados(request));
        return responder(repository.save(posto));
    }

    @Transactional
    @CacheEvict(allEntries = true)
    public void desativar(UUID id) {
        var posto = buscarEntidade(id);
        posto.desativar();
        repository.save(posto);
    }

    @Transactional
    @CacheEvict(allEntries = true)
    public void ativar(UUID id) {
        var posto = buscarEntidade(id);
        posto.ativar();
        repository.save(posto);
    }

    @Transactional(readOnly = true)
    public PostoAbastecimentoResponse buscarPorId(UUID id) {
        return responder(buscarEntidade(id));
    }

    @Transactional(readOnly = true)
    @Cacheable(key = "#pageable.pageNumber + '-' + #pageable.pageSize + '-' + #pageable.sort + '-' + (#filtro != null ? #filtro.hashCode() : 'sem-filtro')")
    public PageResponse<PostoAbastecimentoResponse> listar(PostoAbastecimentoFilter filtro, Pageable pageable) {
        var pagina = repository.findAll(PostoAbastecimentoSpecification.of(filtro), pageable);
        var bases = referencias.nomesBases(pagina.map(PostoAbastecimento::getIdBaseOperacional).toList());
        var fornecedores = financeiro.nomesFornecedores(pagina.map(PostoAbastecimento::getIdFornecedor).stream()
                .filter(java.util.Objects::nonNull).toList());
        return PageResponse.fromPage(pagina.map(p -> mapper.toResponse(p, bases, fornecedores)));
    }

    PostoAbastecimento buscarEntidade(UUID id) {
        return repository.findById(id).orElseThrow(() -> new RecursoNaoEncontradoException("Posto não encontrado."));
    }

    private PostoAbastecimentoResponse responder(PostoAbastecimento posto) {
        var bases = referencias.nomesBases(java.util.Collections.singletonList(posto.getIdBaseOperacional()));
        var fornecedores = posto.getIdFornecedor() == null
                ? java.util.Map.<UUID, String>of()
                : financeiro.nomesFornecedores(List.of(posto.getIdFornecedor()));
        return mapper.toResponse(posto, bases, fornecedores);
    }

    private void validarReferencias(PostoAbastecimentoRequest request) {
        if (request.idBaseOperacional() != null && !referencias.baseExiste(request.idBaseOperacional())) {
            throw new InvarianteVioladaException("A base operacional informada não existe.");
        }
        if (request.idFornecedor() != null && !financeiro.nomesFornecedores(List.of(request.idFornecedor())).containsKey(request.idFornecedor())) {
            throw new InvarianteVioladaException("O fornecedor informado não existe no financeiro.");
        }
    }

    private static PostoAbastecimento.Dados dados(PostoAbastecimentoRequest request) {
        return new PostoAbastecimento.Dados(request.nome(), request.cnpj(), request.idBaseOperacional(), request.whatsapp(),
                request.idFornecedor(), request.observacao());
    }
}
