package com.nexo.app.modules.estoque.application.usecases;

import com.nexo.app.modules.estoque.application.dto.EstoqueObraRequests;
import com.nexo.app.modules.estoque.application.dto.EstoqueObraResponses;
import com.nexo.app.modules.estoque.domain.Estoque;
import com.nexo.app.modules.estoque.domain.TipoEstoque;
import com.nexo.app.modules.estoque.infrastructure.persistence.EstoqueRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.SaldoRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.TipoEstoqueRepository;
import com.nexo.app.modules.rh.BaseOperacionalApi;
import com.nexo.app.modules.rh.BaseOperacionalResponse;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static com.nexo.app.shared.infrastructure.config.CacheNames.SALDOS;

/** Canteiros: locais perto das obras onde as equipes deixam material. São estoques do tipo CANTEIRO. */
@Service
@RequiredArgsConstructor
public class CanteiroUseCases {

    private final EstoqueRepository estoqueRepository;
    private final TipoEstoqueRepository tipoEstoqueRepository;
    private final SaldoRepository saldoRepository;
    private final BaseOperacionalApi baseOperacionalApi;

    @Transactional(readOnly = true)
    public List<EstoqueObraResponses.Canteiro> listar(boolean incluirInativos) {
        List<Estoque> canteiros = estoqueRepository.findAllByTipoEstoqueNomeOrderByNomeIdentificadorAsc(Estoque.TIPO_CANTEIRO).stream()
                .filter(c -> incluirInativos || c.isAtivo())
                .toList();
        Map<UUID, BaseOperacionalResponse> bases = baseOperacionalApi.buscarPorIdsResponse(
                canteiros.stream().map(Estoque::getIdBaseOperacional).filter(java.util.Objects::nonNull).distinct().toList());
        return canteiros.stream().map(c -> resposta(c, bases.get(c.getIdBaseOperacional()))).toList();
    }

    @Transactional
    @CacheEvict(value = SALDOS, allEntries = true)
    public EstoqueObraResponses.Canteiro criar(EstoqueObraRequests.Canteiro request) {
        exigirBase(request.idBaseOperacional());
        exigirNomeLivre(request.nome(), null);
        TipoEstoque tipo = tipoEstoqueRepository.findByNomeIgnoreCase(Estoque.TIPO_CANTEIRO)
                .filter(TipoEstoque::isAtivo)
                .orElseThrow(() -> new InvarianteVioladaException("O tipo de estoque CANTEIRO não está ativo."));
        Estoque canteiro = new Estoque(request.nome(), tipo);
        canteiro.definirLocalCanteiro(request.idBaseOperacional(), request.referencia(), request.latitude(), request.longitude());
        Estoque salvo = estoqueRepository.save(canteiro);
        return resposta(salvo, baseOperacionalApi.buscarPorIdResponse(salvo.getIdBaseOperacional()).orElse(null));
    }

    @Transactional
    @CacheEvict(value = SALDOS, allEntries = true)
    public EstoqueObraResponses.Canteiro editar(UUID id, EstoqueObraRequests.Canteiro request) {
        Estoque canteiro = buscar(id);
        exigirBase(request.idBaseOperacional());
        exigirNomeLivre(request.nome(), id);
        canteiro.atualizarNome(request.nome());
        canteiro.definirLocalCanteiro(request.idBaseOperacional(), request.referencia(), request.latitude(), request.longitude());
        Estoque salvo = estoqueRepository.save(canteiro);
        return resposta(salvo, baseOperacionalApi.buscarPorIdResponse(salvo.getIdBaseOperacional()).orElse(null));
    }

    @Transactional
    @CacheEvict(value = SALDOS, allEntries = true)
    public void desativar(UUID id) {
        Estoque canteiro = buscar(id);
        if (saldoRepository.existsSaldoPositivoByEstoqueId(id)) {
            throw new InvarianteVioladaException("O canteiro ainda tem material. Devolva ou leve o material antes de desativar.");
        }
        canteiro.desativar();
        estoqueRepository.save(canteiro);
    }

    private Estoque buscar(UUID id) {
        Estoque canteiro = estoqueRepository.findById(id)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Canteiro não encontrado."));
        if (!canteiro.isTipoCanteiro()) {
            throw new RecursoNaoEncontradoException("Canteiro não encontrado.");
        }
        return canteiro;
    }

    private void exigirBase(UUID idBase) {
        if (!baseOperacionalApi.existeBase(idBase)) {
            throw new InvarianteVioladaException("Escolha uma base operacional ativa.");
        }
    }

    private void exigirNomeLivre(String nome, UUID idAtual) {
        estoqueRepository.findByNomeIdentificadorIgnoreCase(nome.trim())
                .filter(e -> !e.getId().equals(idAtual))
                .ifPresent(e -> {
                    throw new InvarianteVioladaException("Já existe um estoque com o nome " + e.getNomeIdentificador() + ".");
                });
    }

    private EstoqueObraResponses.Canteiro resposta(Estoque c, BaseOperacionalResponse base) {
        long materiais = saldoRepository.findDiferentesDeZeroByEstoqueId(c.getId()).stream()
                .filter(s -> s.getQuantidade().signum() > 0).count();
        return new EstoqueObraResponses.Canteiro(c.getId(), c.getNomeIdentificador(), c.getIdBaseOperacional(),
                base == null ? null : base.nome(), c.getReferencia(), c.getLatitude(), c.getLongitude(), materiais, c.isAtivo());
    }
}
