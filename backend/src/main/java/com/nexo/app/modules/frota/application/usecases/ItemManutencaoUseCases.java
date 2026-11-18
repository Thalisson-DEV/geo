package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.application.dto.ItemManutencaoFilter;
import com.nexo.app.modules.frota.application.dto.ItemManutencaoRequest;
import com.nexo.app.modules.frota.application.dto.ItemManutencaoResponse;
import com.nexo.app.modules.frota.domain.ItemManutencao;
import com.nexo.app.modules.frota.infrastructure.persistence.CatalogoFrotaSpecification;
import com.nexo.app.modules.frota.infrastructure.persistence.ItemManutencaoRepository;
import com.nexo.app.shared.application.dto.PageResponse;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import com.nexo.app.shared.infrastructure.persistence.SpecificationUtils;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.CacheConfig;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Catálogo de itens de manutenção: a unidade de serviço da OS e da repetição. */
@Service
@RequiredArgsConstructor
@CacheConfig(cacheNames = "frota_itens_manutencao")
public class ItemManutencaoUseCases {

    private final ItemManutencaoRepository repository;

    @Transactional
    @CacheEvict(allEntries = true)
    public ItemManutencaoResponse criar(ItemManutencaoRequest request) {
        if (repository.existsByNomeIgnoreCase(request.nome().trim())) {
            throw new InvarianteVioladaException("Já existe um item de manutenção com este nome.");
        }
        var item = new ItemManutencao(request.nome(), request.natureza(), request.descricao(), request.diasRepeticao());
        item.definirTipo(request.tipo());
        return toResponse(repository.save(item));
    }

    @Transactional
    @CacheEvict(allEntries = true)
    public ItemManutencaoResponse atualizar(UUID id, ItemManutencaoRequest request) {
        var item = buscarEntidade(id);
        if (repository.existsByNomeIgnoreCaseAndIdNot(request.nome().trim(), id)) {
            throw new InvarianteVioladaException("Já existe um item de manutenção com este nome.");
        }
        item.atualizar(request.nome(), request.natureza(), request.descricao(), request.diasRepeticao());
        item.definirTipo(request.tipo());
        return toResponse(repository.save(item));
    }

    @Transactional
    @CacheEvict(allEntries = true)
    public void desativar(UUID id) {
        var item = buscarEntidade(id);
        item.desativar();
        repository.save(item);
    }

    @Transactional
    @CacheEvict(allEntries = true)
    public void ativar(UUID id) {
        var item = buscarEntidade(id);
        item.ativar();
        repository.save(item);
    }

    @Transactional(readOnly = true)
    public ItemManutencaoResponse buscarPorId(UUID id) {
        return toResponse(buscarEntidade(id));
    }

    @Transactional(readOnly = true)
    @Cacheable(key = "#pageable.pageNumber + '-' + #pageable.pageSize + '-' + #pageable.sort + '-' + (#filtro != null ? #filtro.hashCode() : 'sem-filtro')")
    public PageResponse<ItemManutencaoResponse> listar(ItemManutencaoFilter filtro, Pageable pageable) {
        Specification<ItemManutencao> spec = CatalogoFrotaSpecification.of(
                filtro == null ? null : filtro.busca(), filtro == null ? null : filtro.ativo());
        if (filtro != null && !filtro.naturezas().isEmpty()) {
            spec = spec.and((root, query, cb) -> {
                var predicates = new ArrayList<Predicate>();
                SpecificationUtils.filtrarPor(filtro.naturezas(), predicates, root.get("natureza"));
                return cb.and(predicates.toArray(new Predicate[0]));
            });
        }
        if (filtro != null && filtro.tipo() != null) {
            spec = spec.and((root, query, cb) -> cb.equal(root.get("tipo"), filtro.tipo()));
        }
        return PageResponse.fromPage(repository.findAll(spec, pageable).map(ItemManutencaoUseCases::toResponse));
    }

    /** Itens na ordem informada, sem repetição. Recusa id inexistente. */
    List<ItemManutencao> buscarEntidades(Collection<UUID> ids) {
        var unicos = new LinkedHashSet<>(ids);
        Map<UUID, ItemManutencao> encontrados = repository.findAllById(unicos).stream()
                .collect(Collectors.toMap(ItemManutencao::getId, Function.identity()));
        if (encontrados.size() != unicos.size()) {
            throw new RecursoNaoEncontradoException("Item de manutenção não encontrado.");
        }
        return unicos.stream().map(encontrados::get).toList();
    }

    ItemManutencao buscarEntidade(UUID id) {
        return repository.findById(id)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Item de manutenção não encontrado."));
    }

    static ItemManutencaoResponse toResponse(ItemManutencao item) {
        return new ItemManutencaoResponse(item.getId(), item.getNome(), item.getNatureza(),
                item.getNatureza().getRotulo(), item.getDescricao(), item.getDiasRepeticao(), item.getTipo(),
                item.getTipo().getRotulo(), item.isAtivo());
    }
}
