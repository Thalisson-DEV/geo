package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.application.dto.PlanoPreventivoFilter;
import com.nexo.app.modules.frota.application.dto.PlanoPreventivoRequest;
import com.nexo.app.modules.frota.application.dto.PlanoPreventivoResponse;
import com.nexo.app.modules.frota.domain.ItemManutencao;
import com.nexo.app.modules.frota.domain.PlanoPreventivo;
import com.nexo.app.modules.frota.domain.TipoImplemento;
import com.nexo.app.modules.frota.domain.TipoVeiculo;
import com.nexo.app.modules.frota.infrastructure.persistence.ControlePreventivoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.FichaVeiculoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.PlanoPreventivoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.TipoImplementoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.TipoVeiculoRepository;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Cadastro dos planos preventivos. Salvar, ativar ou desativar um plano sincroniza os
 * controles da frota inteira: o acompanhamento já mostra os veículos que ele passou a cobrir.
 */
@Service
@RequiredArgsConstructor
public class PlanoPreventivoUseCases {

    private final PlanoPreventivoRepository repository;
    private final ControlePreventivoRepository controles;
    private final TipoVeiculoRepository tiposVeiculo;
    private final TipoImplementoRepository tiposImplemento;
    private final ItemManutencaoUseCases itens;
    private final SincronizacaoPreventiva sincronizacao;
    private final FichaVeiculoRepository fichas;

    @Transactional(readOnly = true)
    public List<PlanoPreventivoResponse> listar(PlanoPreventivoFilter filtro) {
        String busca = filtro == null || filtro.busca() == null || filtro.busca().isBlank() ? null
                : filtro.busca().trim().toLowerCase(Locale.ROOT);
        var planos = repository.findAllByOrderByNomeAsc().stream()
                .filter(p -> filtro == null || filtro.ativo() == null || p.isAtivo() == filtro.ativo())
                .filter(p -> busca == null || p.getNome().toLowerCase(Locale.ROOT).contains(busca))
                .sorted(Comparator.comparing((PlanoPreventivo p) -> !p.isAtivo())
                        .thenComparing(p -> p.getNome().toLowerCase(Locale.ROOT)))
                .toList();
        return montar(planos);
    }

    @Transactional(readOnly = true)
    public PlanoPreventivoResponse buscarPorId(UUID id) {
        return montar(List.of(buscarEntidade(id))).get(0);
    }

    @Transactional
    public PlanoPreventivoResponse criar(PlanoPreventivoRequest request) {
        if (repository.existsByNomeIgnoreCase(request.nome().trim())) {
            throw new InvarianteVioladaException("Já existe um plano preventivo com este nome.");
        }
        validarTipos(request);
        var plano = repository.saveAndFlush(new PlanoPreventivo(dados(request)));
        sincronizacao.sincronizar(null);
        return buscarPorId(plano.getId());
    }

    @Transactional
    public PlanoPreventivoResponse atualizar(UUID id, PlanoPreventivoRequest request) {
        var plano = buscarEntidade(id);
        if (repository.existsByNomeIgnoreCaseAndIdNot(request.nome().trim(), id)) {
            throw new InvarianteVioladaException("Já existe um plano preventivo com este nome.");
        }
        validarTipos(request);
        plano.atualizar(dados(request));
        repository.saveAndFlush(plano);
        sincronizacao.sincronizar(null);
        return buscarPorId(id);
    }

    @Transactional
    public void desativar(UUID id) {
        var plano = buscarEntidade(id);
        plano.desativar();
        repository.saveAndFlush(plano);
        sincronizacao.sincronizar(null);
    }

    @Transactional
    public void ativar(UUID id) {
        var plano = buscarEntidade(id);
        plano.ativar();
        repository.saveAndFlush(plano);
        sincronizacao.sincronizar(null);
    }

    PlanoPreventivo buscarEntidade(UUID id) {
        return repository.findById(id)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Plano preventivo não encontrado."));
    }

    private PlanoPreventivo.Dados dados(PlanoPreventivoRequest request) {
        List<ItemManutencao> itensPlano = itens.buscarEntidades(request.idsItem());
        return new PlanoPreventivo.Dados(request.nome(), request.descricao(), request.idsTiposVeiculo(),
                request.idsTiposImplemento(), request.intervaloKm(), request.intervaloHoras(), request.intervaloDias(),
                request.antecedenciaKm(), request.antecedenciaHoras(), request.antecedenciaDias(), request.criticidade(),
                request.abrirOsAutomaticamente(), itensPlano, request.tarefas(), request.idsVeiculos());
    }

    private void validarTipos(PlanoPreventivoRequest request) {
        var idsVeiculo = request.idsTiposVeiculo() == null ? Set.<UUID>of() : request.idsTiposVeiculo();
        var encontradosVeiculo = tiposVeiculo.findAllById(idsVeiculo);
        if (encontradosVeiculo.size() != idsVeiculo.size()) {
            throw new InvarianteVioladaException("Algum tipo de veículo informado não existe.");
        }
        var idsImplemento = request.idsTiposImplemento() == null ? Set.<UUID>of() : request.idsTiposImplemento();
        var encontradosImplemento = tiposImplemento.findAllById(idsImplemento);
        if (encontradosImplemento.size() != idsImplemento.size()) {
            throw new InvarianteVioladaException("Algum tipo de implemento informado não existe.");
        }
        var placas = request.idsVeiculos() == null ? Set.<UUID>of() : request.idsVeiculos();
        if (!placas.isEmpty() && fichas.findAllByIdVeiculoIn(placas).size() != placas.size()) {
            throw new InvarianteVioladaException("Alguma placa informada não está na frota.");
        }
    }

    private List<PlanoPreventivoResponse> montar(Collection<PlanoPreventivo> planos) {
        var idsVeiculo = new HashSet<UUID>();
        var idsImplemento = new HashSet<UUID>();
        planos.forEach(p -> {
            idsVeiculo.addAll(p.getIdsTiposVeiculo());
            idsImplemento.addAll(p.getIdsTiposImplemento());
        });
        Map<UUID, PlanoPreventivoResponse.Referencia> tipos = new HashMap<>();
        tiposVeiculo.findAllById(idsVeiculo).forEach((TipoVeiculo t) ->
                tipos.put(t.getId(), new PlanoPreventivoResponse.Referencia(t.getId(), t.getNome(), t.isAtivo())));
        tiposImplemento.findAllById(idsImplemento).forEach((TipoImplemento t) ->
                tipos.put(t.getId(), new PlanoPreventivoResponse.Referencia(t.getId(), t.getNome(), t.isAtivo())));
        Comparator<PlanoPreventivoResponse.Referencia> porNome = Comparator.comparing(PlanoPreventivoResponse.Referencia::nome);
        var idsPlacas = new HashSet<UUID>();
        planos.forEach(p -> idsPlacas.addAll(p.getIdsVeiculos()));
        Map<UUID, PlanoPreventivoResponse.Referencia> placas = new HashMap<>();
        if (!idsPlacas.isEmpty()) {
            fichas.findAllByIdVeiculoIn(idsPlacas).forEach(f -> placas.put(f.getIdVeiculo(),
                    new PlanoPreventivoResponse.Referencia(f.getIdVeiculo(), f.getPlaca(), f.isAtivo())));
        }
        return planos.stream().map(p -> new PlanoPreventivoResponse(
                p.getId(), p.getNome(), p.getDescricao(),
                p.getIdsTiposVeiculo().stream().map(tipos::get).filter(java.util.Objects::nonNull).sorted(porNome).toList(),
                p.getIdsTiposImplemento().stream().map(tipos::get).filter(java.util.Objects::nonNull).sorted(porNome).toList(),
                p.getIdsVeiculos().stream().map(placas::get).filter(java.util.Objects::nonNull).sorted(porNome).toList(),
                p.getIntervaloKm(), p.getIntervaloHoras(), p.getIntervaloDias(),
                p.getAntecedenciaKm(), p.getAntecedenciaHoras(), p.getAntecedenciaDias(),
                p.frequenciaDescrita(), p.getCriticidade(), p.getCriticidade().getRotulo(), p.isAbrirOsAutomaticamente(),
                p.getItens().stream().map(i -> new PlanoPreventivoResponse.Referencia(i.getId(), i.getNome(), i.isAtivo())).toList(),
                // Cópia dentro da transação: a coleção do JPA é preguiçosa e a resposta é serializada depois.
                List.copyOf(p.getTarefas()),
                p.isAtivo() ? controles.countByPlanoIdAndAtivoTrue(p.getId()) : 0,
                p.isAtivo())).toList();
    }
}
