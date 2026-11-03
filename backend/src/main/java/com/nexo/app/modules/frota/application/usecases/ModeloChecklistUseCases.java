package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.application.dto.ModeloChecklistFilter;
import com.nexo.app.modules.frota.application.dto.ModeloChecklistRequest;
import com.nexo.app.modules.frota.application.dto.ModeloChecklistResponse;
import com.nexo.app.modules.frota.application.dto.ModeloChecklistResumoResponse;
import com.nexo.app.modules.frota.application.dto.ModelosVeiculoChecklistResponse;
import com.nexo.app.modules.frota.application.mappers.ChecklistFrotaMapper;
import com.nexo.app.modules.frota.domain.AcoplamentoImplemento;
import com.nexo.app.modules.frota.domain.ModeloChecklist;
import com.nexo.app.modules.frota.domain.ResolucaoModeloChecklist;
import com.nexo.app.modules.frota.domain.TipoImplemento;
import com.nexo.app.modules.frota.domain.TipoVeiculo;
import com.nexo.app.modules.frota.infrastructure.persistence.AcoplamentoImplementoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.FichaVeiculoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.ModeloChecklistRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.ModeloChecklistSpecification;
import com.nexo.app.modules.frota.infrastructure.persistence.TipoImplementoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.TipoVeiculoRepository;
import com.nexo.app.shared.application.dto.PageResponse;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/** Configuração dos modelos de checklist e resolução do modelo de cada veículo. */
@Service
@RequiredArgsConstructor
public class ModeloChecklistUseCases {

    private final ModeloChecklistRepository repository;
    private final TipoVeiculoRepository tiposVeiculo;
    private final TipoImplementoRepository tiposImplemento;
    private final FichaVeiculoRepository fichas;
    private final AcoplamentoImplementoRepository acoplamentos;
    private final ChecklistFrotaMapper mapper;

    @Transactional
    public ModeloChecklistResponse criar(ModeloChecklistRequest request) {
        if (repository.existsByNomeIgnoreCase(request.nome().trim())) {
            throw new InvarianteVioladaException("Já existe um modelo de checklist com este nome.");
        }
        validarTipos(request);
        var modelo = repository.save(new ModeloChecklist(mapper.toDados(request)));
        return detalhar(modelo);
    }

    @Transactional
    public ModeloChecklistResponse atualizar(UUID id, ModeloChecklistRequest request) {
        var modelo = buscarEntidade(id);
        if (repository.existsByNomeIgnoreCaseAndIdNot(request.nome().trim(), id)) {
            throw new InvarianteVioladaException("Já existe um modelo de checklist com este nome.");
        }
        validarTipos(request);
        modelo.atualizar(mapper.toDados(request));
        return detalhar(repository.save(modelo));
    }

    @Transactional
    public void desativar(UUID id) {
        var modelo = buscarEntidade(id);
        modelo.desativar();
        repository.save(modelo);
    }

    @Transactional
    public void ativar(UUID id) {
        var modelo = buscarEntidade(id);
        modelo.ativar();
        repository.save(modelo);
    }

    @Transactional(readOnly = true)
    public ModeloChecklistResponse buscarPorId(UUID id) {
        return detalhar(buscarEntidade(id));
    }

    @Transactional(readOnly = true)
    public PageResponse<ModeloChecklistResumoResponse> listar(ModeloChecklistFilter filtro, Pageable pageable) {
        var pagina = repository.findAll(ModeloChecklistSpecification.of(filtro), pageable);
        var nomes = nomesTipos(pagina.getContent());
        return PageResponse.fromPage(pagina.map(m -> mapper.toResumo(m, nomes)));
    }

    /** Modelos que o veículo usa hoje, pelo tipo da ficha e pelos implementos acoplados. */
    @Transactional(readOnly = true)
    public ModelosVeiculoChecklistResponse modelosDoVeiculo(UUID idVeiculo) {
        var modelos = repository.findAllByAtivoTrue();
        var resolucao = resolver(modelos, List.of(idVeiculo)).get(idVeiculo);
        var nomes = nomesTipos(modelos);
        return new ModelosVeiculoChecklistResponse(
                idVeiculo,
                resolucao.principais().stream().map(m -> mapper.toResumo(m, nomes)).toList(),
                resolucao.adicionais().stream().map(m -> mapper.toResumo(m, nomes)).toList(),
                resolucao.exigeEscolha());
    }

    /** Resolução para vários veículos de uma vez (catálogo do app). */
    Map<UUID, ResolucaoModeloChecklist> resolver(Collection<ModeloChecklist> modelos, Collection<UUID> idsVeiculo) {
        var tipoPorVeiculo = new HashMap<UUID, UUID>();
        fichas.findAllByIdVeiculoIn(idsVeiculo).forEach(f ->
                tipoPorVeiculo.put(f.getIdVeiculo(), f.getTipoVeiculo() == null ? null : f.getTipoVeiculo().getId()));
        Map<UUID, Set<UUID>> implementosPorVeiculo = acoplamentos.findAllByIdVeiculoInAndFimIsNullAndAtivoTrue(idsVeiculo).stream()
                .collect(Collectors.groupingBy(AcoplamentoImplemento::getIdVeiculo,
                        Collectors.mapping(a -> a.getImplemento().getTipoImplemento().getId(), Collectors.toSet())));
        var resultado = new HashMap<UUID, ResolucaoModeloChecklist>();
        for (var idVeiculo : idsVeiculo) {
            resultado.put(idVeiculo, ResolucaoModeloChecklist.resolver(modelos, tipoPorVeiculo.get(idVeiculo),
                    implementosPorVeiculo.getOrDefault(idVeiculo, Set.of())));
        }
        return resultado;
    }

    ModeloChecklist buscarEntidade(UUID id) {
        return repository.findById(id)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Modelo de checklist não encontrado."));
    }

    private ModeloChecklistResponse detalhar(ModeloChecklist modelo) {
        return mapper.toResponse(modelo, nomesTipos(List.of(modelo)));
    }

    private void validarTipos(ModeloChecklistRequest request) {
        var idsVeiculo = request.idsTiposVeiculo() == null ? Set.<UUID>of() : request.idsTiposVeiculo();
        var encontradosVeiculo = tiposVeiculo.findAllById(idsVeiculo);
        if (encontradosVeiculo.size() != idsVeiculo.size() || encontradosVeiculo.stream().anyMatch(t -> !t.isAtivo())) {
            throw new InvarianteVioladaException("Algum tipo de veículo informado não existe ou está desativado.");
        }
        var idsImplemento = request.idsTiposImplemento() == null ? Set.<UUID>of() : request.idsTiposImplemento();
        var encontradosImplemento = tiposImplemento.findAllById(idsImplemento);
        if (encontradosImplemento.size() != idsImplemento.size() || encontradosImplemento.stream().anyMatch(t -> !t.isAtivo())) {
            throw new InvarianteVioladaException("Algum tipo de implemento informado não existe ou está desativado.");
        }
    }

    Map<UUID, String> nomesTipos(Collection<ModeloChecklist> modelos) {
        var idsVeiculo = new HashSet<UUID>();
        var idsImplemento = new HashSet<UUID>();
        modelos.forEach(m -> {
            idsVeiculo.addAll(m.getIdsTiposVeiculo());
            idsImplemento.addAll(m.getIdsTiposImplemento());
        });
        var nomes = new HashMap<UUID, String>();
        tiposVeiculo.findAllById(idsVeiculo).forEach((TipoVeiculo t) -> nomes.put(t.getId(), t.getNome()));
        tiposImplemento.findAllById(idsImplemento).forEach((TipoImplemento t) -> nomes.put(t.getId(), t.getNome()));
        return nomes;
    }
}
