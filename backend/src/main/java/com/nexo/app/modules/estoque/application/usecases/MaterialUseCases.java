package com.nexo.app.modules.estoque.application.usecases;

import com.nexo.app.modules.estoque.application.dto.MaterialFilter;
import com.nexo.app.modules.estoque.application.dto.MaterialRequest;
import com.nexo.app.modules.estoque.MaterialResponse;
import com.nexo.app.modules.estoque.application.mappers.MaterialMapper;
import com.nexo.app.modules.estoque.domain.AvaliacaoMaterial;
import com.nexo.app.modules.estoque.domain.CentroInvestimento;
import com.nexo.app.modules.estoque.domain.Material;
import com.nexo.app.modules.estoque.infrastructure.persistence.AvaliacaoMaterialRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.CentroInvestimentoRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.MaterialRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.MaterialSpecification;
import com.nexo.app.modules.rh.ProcessoNegocioApi;
import com.nexo.app.modules.rh.ProcessoNegocioResponse;
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

import static com.nexo.app.shared.infrastructure.config.CacheNames.MATERIAIS;

@Service
@RequiredArgsConstructor
@CacheConfig(cacheNames = MATERIAIS)
public class MaterialUseCases {

    private final MaterialRepository repository;
    private final AvaliacaoMaterialRepository avaliacaoRepository;
    private final CentroInvestimentoRepository centroInvestimentoRepository;
    private final ProcessoNegocioApi processoApi;
    private final MaterialMapper mapper;
    private final com.nexo.app.modules.estoque.infrastructure.persistence.MovimentacaoEstoqueRepository movimentacaoRepository;

    @Transactional
    @CacheEvict(allEntries = true)
    public MaterialResponse criar(MaterialRequest request) {
        validarUnicidade(request.codigo());

        AvaliacaoMaterial avaliacao = request.idAvaliacaoTecnica() != null ?
                avaliacaoRepository.findById(request.idAvaliacaoTecnica())
                        .orElseThrow(() -> new RecursoNaoEncontradoException("Avaliação técnica não encontrada")) : null;

        CentroInvestimento centro = request.idCentroInvestimento() != null ?
                centroInvestimentoRepository.findById(request.idCentroInvestimento())
                        .orElseThrow(() -> new RecursoNaoEncontradoException("Centro de investimento não encontrado")) : null;

        ProcessoNegocioResponse processo = resolverProcesso(request.idProcesso());

        Material entity = new Material(
                request.codigo(),
                request.descricao(),
                request.unidadeMedida(),
                request.suprMatrFlag(),
                avaliacao,
                centro,
                request.detalhaSerie(),
                processo.id()
        );
        if (request.equivalencias() != null) {
            entity.definirEquivalencias(equivalencias(request));
        }

        return mapearResposta(repository.save(entity));
    }

    @Transactional
    @CacheEvict(allEntries = true)
    public MaterialResponse atualizar(UUID id, MaterialRequest request) {
        Material entity = repository.findById(id)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Material não encontrado"));

        AvaliacaoMaterial avaliacao = request.idAvaliacaoTecnica() != null ?
                avaliacaoRepository.findById(request.idAvaliacaoTecnica())
                        .orElseThrow(() -> new RecursoNaoEncontradoException("Avaliação técnica não encontrada")) : null;

        CentroInvestimento centro = request.idCentroInvestimento() != null ?
                centroInvestimentoRepository.findById(request.idCentroInvestimento())
                        .orElseThrow(() -> new RecursoNaoEncontradoException("Centro de investimento não encontrado")) : null;

        ProcessoNegocioResponse processo = resolverProcesso(request.idProcesso());

        exigirUnidadeSemHistorico(entity, request.unidadeMedida());
        entity.atualizar(request.codigo(), request.descricao(), request.unidadeMedida(), request.suprMatrFlag(), request.detalhaSerie());
        if (request.equivalencias() != null) {
            entity.definirEquivalencias(equivalencias(request));
        }
        entity.vincularAvaliacao(avaliacao);
        entity.vincularCentroInvestimento(centro);
        entity.vincularProcesso(processo.id());

        return mapearResposta(repository.save(entity));
    }

    @Transactional(readOnly = true)
    @Cacheable(key = "{#filter.toString(), #pageable.pageNumber, #pageable.pageSize, #pageable.sort.toString()}")
    public PageResponse<MaterialResponse> listar(MaterialFilter filter, Pageable pageable) {
        return PageResponse.fromPage(
                repository.findAll(MaterialSpecification.filterBy(filter), pageable)
                        .map(this::mapearResposta)
        );
    }

    @Transactional(readOnly = true)
    @Cacheable(key = "#id")
    public MaterialResponse buscarPorId(UUID id) {
        return repository.findById(id)
                .map(this::mapearResposta)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Material não encontrado"));
    }

    @Transactional
    @CacheEvict(allEntries = true)
    public void ativar(UUID id) {
        Material entity = repository.findById(id)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Material não encontrado"));
        entity.ativar();
        repository.save(entity);
    }

    @Transactional
    @CacheEvict(allEntries = true)
    public void desativar(UUID id) {
        Material entity = repository.findById(id)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Material não encontrado"));
        entity.desativar();
        repository.save(entity);
    }

    private static java.util.List<Material.Equivalencia> equivalencias(MaterialRequest request) {
        return request.equivalencias().stream()
                .map(e -> new Material.Equivalencia(e.unidade(), e.quantidadeUnidade(), e.quantidadeBase()))
                .toList();
    }

    /**
     * Trocar a unidade de um material que já foi movimentado mudaria o sentido de todo o saldo e
     * do histórico. Nesse caso a troca é recusada; a saída é cadastrar uma equivalência.
     */
    private void exigirUnidadeSemHistorico(Material entity, String novaUnidade) {
        String atual = entity.getUnidadeMedida() == null ? "" : entity.getUnidadeMedida();
        String nova = novaUnidade == null ? "" : novaUnidade.trim().toUpperCase();
        if (!atual.equals(nova) && movimentacaoRepository.existsByMaterialId(entity.getId())) {
            throw new InvarianteVioladaException("O material " + entity.getCodigo() + " já tem movimentações em "
                    + (atual.isBlank() ? "UN" : atual) + ". Para usar " + (nova.isBlank() ? "outra unidade" : nova)
                    + ", cadastre uma equivalência em vez de trocar a unidade.");
        }
    }

    private void validarUnicidade(String codigo) {
        if (repository.existsByCodigoIgnoreCase(codigo)) {
            throw new InvarianteVioladaException("Já existe um material com este código");
        }
    }

    private ProcessoNegocioResponse resolverProcesso(UUID idProcesso) {
        if (idProcesso == null) {
            UUID idPadrao = processoApi.buscarIdPorNome("COMERCIAL")
                    .orElseThrow(() -> new RecursoNaoEncontradoException(
                            "Processo de negócio padrão (COMERCIAL) não encontrado"));
            return processoApi.buscarPorIdResponse(idPadrao)
                    .filter(ProcessoNegocioResponse::ativo)
                    .orElseThrow(() -> new RecursoNaoEncontradoException(
                            "Processo de negócio padrão (COMERCIAL) não encontrado ou inativo"));
        }
        return processoApi.buscarPorIdResponse(idProcesso)
                .filter(ProcessoNegocioResponse::ativo)
                .orElseThrow(() -> new RecursoNaoEncontradoException(
                        "Processo de negócio não encontrado ou inativo"));
    }

    private MaterialResponse mapearResposta(Material material) {
        ProcessoNegocioResponse processo = processoApi.buscarPorIdResponse(material.getIdProcesso())
                .orElse(null);
        return mapper.toResponse(material, processo);
    }
}
