package com.nexo.app.modules.obras.application.usecases;

import com.nexo.app.modules.obras.application.dto.TipoDeObraFilter;
import com.nexo.app.modules.obras.application.dto.TipoDeObraRequest;
import com.nexo.app.modules.obras.application.dto.TipoDeObraResponse;
import com.nexo.app.modules.obras.application.mappers.TipoDeObraMapper;
import com.nexo.app.modules.obras.domain.TipoDeObra;
import com.nexo.app.modules.obras.domain.TipoObra;
import com.nexo.app.modules.obras.infrastructure.persistence.TipoDeObraRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.TipoDeObraSpecification;
import com.nexo.app.shared.application.dto.PageResponse;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import com.nexo.app.shared.infrastructure.config.CacheNames;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.CacheConfig;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@CacheConfig(cacheNames = CacheNames.OBRAS_TIPOS_OBRA)
public class TipoDeObraUseCases {

    /** Código do tipo usado quando a obra não informa nenhum (importações antigas, integrações). */
    public static final String CODIGO_PADRAO = "COMUM";

    private final TipoDeObraRepository repository;
    private final TipoDeObraMapper mapper;

    @Transactional
    @CacheEvict(allEntries = true)
    public TipoDeObraResponse criar(TipoDeObraRequest request) {
        TipoDeObra tipo = new TipoDeObra(request.nome(), request.descricao(), request.controleExecucao(),
                Boolean.TRUE.equals(request.subtipo()));
        if (repository.existsByNomeIgnoreCase(tipo.getNome()) || repository.existsByCodigo(tipo.getCodigo())) {
            throw new InvarianteVioladaException("Já existe um tipo de obra com esse nome.");
        }
        return mapper.toResponse(repository.save(tipo));
    }

    @Transactional
    @CacheEvict(allEntries = true)
    public TipoDeObraResponse atualizar(UUID id, TipoDeObraRequest request) {
        TipoDeObra tipo = buscarEntidade(id);
        if (repository.existsByNomeIgnoreCaseAndIdNot(request.nome().trim(), id)) {
            throw new InvarianteVioladaException("Já existe outro tipo de obra com esse nome.");
        }
        tipo.atualizar(request.nome(), request.descricao(), request.controleExecucao(), Boolean.TRUE.equals(request.subtipo()));
        return mapper.toResponse(repository.save(tipo));
    }

    @Transactional(readOnly = true)
    public TipoDeObraResponse buscarPorId(UUID id) {
        return mapper.toResponse(buscarEntidade(id));
    }

    @Transactional(readOnly = true)
    public PageResponse<TipoDeObraResponse> listar(TipoDeObraFilter filter, Pageable pageable) {
        Page<TipoDeObra> page = repository.findAll(TipoDeObraSpecification.filterBy(filter), pageable);
        return PageResponse.fromPage(page.map(mapper::toResponse));
    }

    @Transactional(readOnly = true)
    @Cacheable(key = "'todos-ativos'")
    public List<TipoDeObraResponse> listarTodosAtivos() {
        return mapper.toResponseList(repository.findAll(
                (root, query, cb) -> cb.isTrue(root.get("ativo")),
                Sort.by(Sort.Order.asc("subtipo"), Sort.Order.asc("nome"))));
    }

    @Transactional
    @CacheEvict(allEntries = true)
    public void desativar(UUID id) {
        TipoDeObra tipo = buscarEntidade(id);
        tipo.desativar();
        repository.save(tipo);
    }

    @Transactional
    @CacheEvict(allEntries = true)
    public void reativar(UUID id) {
        TipoDeObra tipo = buscarEntidade(id);
        tipo.ativar();
        repository.save(tipo);
    }

    public TipoDeObra buscarEntidade(UUID id) {
        return repository.findById(id)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Tipo de obra não encontrado com o ID: " + id));
    }

    /**
     * Resolve o tipo informado na obra: pelo id do cadastro; sem id, pela classe antiga (OBRA, LPT...)
     * ou pelo nome digitado na importação; sem nada, o tipo comum.
     */
    @Transactional(readOnly = true)
    public TipoDeObra resolver(UUID idTipo, TipoObra classeLegada, String nomeOuCodigo) {
        if (idTipo != null) {
            TipoDeObra tipo = buscarEntidade(idTipo);
            if (!tipo.isAtivo()) {
                throw new InvarianteVioladaException("O tipo de obra " + tipo.getNome() + " está desativado.");
            }
            return tipo;
        }
        if (nomeOuCodigo != null && !nomeOuCodigo.isBlank()) {
            String texto = nomeOuCodigo.trim();
            return repository.findByNomeIgnoreCase(texto)
                    .or(() -> repository.findByCodigo(TipoDeObra.codigoDe(texto.toUpperCase(Locale.ROOT))))
                    .or(() -> "OBRA".equalsIgnoreCase(texto) ? repository.findByCodigo(CODIGO_PADRAO) : java.util.Optional.empty())
                    .orElseThrow(() -> new InvarianteVioladaException("Tipo de obra não encontrado: " + texto + "."));
        }
        String codigo = classeLegada == null || classeLegada == TipoObra.OBRA ? CODIGO_PADRAO : classeLegada.name();
        return repository.findByCodigo(codigo)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Tipo de obra padrão não cadastrado: " + codigo));
    }
}
