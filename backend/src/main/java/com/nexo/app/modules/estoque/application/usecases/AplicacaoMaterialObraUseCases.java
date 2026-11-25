package com.nexo.app.modules.estoque.application.usecases;

import com.nexo.app.modules.estoque.application.services.AlocacaoObraService;
import com.nexo.app.modules.estoque.application.services.DebitoSaldoService;
import com.nexo.app.modules.estoque.domain.CondicaoMaterial;
import com.nexo.app.modules.estoque.domain.Estoque;
import com.nexo.app.modules.estoque.domain.Material;
import com.nexo.app.modules.estoque.domain.MovimentacaoEstoque;
import com.nexo.app.modules.estoque.domain.MovimentacaoEstoque.TipoMovimentacao;
import com.nexo.app.modules.estoque.domain.Saldo;
import com.nexo.app.modules.estoque.infrastructure.persistence.EstoqueRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.MaterialRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.MovimentacaoEstoqueRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.SaldoRepository;
import com.nexo.app.modules.obras.ObraApi;
import com.nexo.app.shared.domain.events.ApontamentoEstornadoEvent;
import com.nexo.app.shared.domain.events.ItemExecutadoEvent;
import com.nexo.app.shared.infrastructure.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

import static com.nexo.app.shared.infrastructure.config.CacheNames.SALDOS;

/**
 * O apontamento de um item de material da obra mexe no estoque: instalar baixa do caminhão da equipe e lança como
 * aplicado na obra; retirar põe a sucata no caminhão, carimbada para a obra. Nunca recusa o apontamento — o fato já
 * aconteceu em campo. Quando a equipe usa material que não era da obra, cada parte sai num movimento próprio com a
 * obra de onde veio ({@code idObraOrigem}): é o rastro para o administrativo.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AplicacaoMaterialObraUseCases {

    static final String OBS_SEM_SALDO = "Aplicado sem saldo no caminhão da equipe.";
    private static final UUID SISTEMA = new UUID(0L, 0L);

    private final EstoqueRepository estoqueRepository;
    private final MaterialRepository materialRepository;
    private final SaldoRepository saldoRepository;
    private final MovimentacaoEstoqueRepository movimentacaoRepository;
    private final DebitoSaldoService debitoSaldoService;
    private final AlocacaoObraService alocacao;
    private final EstoqueObraProvisioningService estoqueObraService;
    private final ObraApi obraApi;

    @Transactional
    @CacheEvict(value = SALDOS, allEntries = true)
    public void aoExecutar(ItemExecutadoEvent evento) {
        if (evento.idMaterial() == null || evento.quantidade() == null || evento.quantidade().signum() <= 0) {
            return;
        }
        Optional<Estoque> caminhao = estoqueRepository.findByIdEquipe(evento.idEquipe());
        Optional<Material> material = materialRepository.findById(evento.idMaterial());
        if (caminhao.isEmpty() || material.isEmpty()) {
            log.warn("Apontamento {} sem baixa de estoque: equipe {} sem caminhão ou material {} fora do catálogo.",
                    evento.idApontamento(), evento.idEquipe(), evento.idMaterial());
            return;
        }
        UUID operador = Objects.requireNonNullElse(SecurityUtils.getUsuarioLogadoId(), SISTEMA);
        if (evento.retirada()) {
            retirar(evento, caminhao.get(), material.get(), operador);
        } else {
            instalar(evento, caminhao.get(), material.get(), operador);
        }
    }

    private void instalar(ItemExecutadoEvent evento, Estoque caminhao, Material material, UUID operador) {
        Estoque obra = estoqueDaObra(evento.idObra());
        List<AlocacaoObraService.Parcela> parcelas = alocacao.consumir(
                caminhao, material, CondicaoMaterial.NOVO, evento.idObra(), evento.quantidade());
        debitoSaldoService.debitar(caminhao, material, CondicaoMaterial.NOVO, evento.quantidade());
        if (obra != null) {
            creditar(obra, material, CondicaoMaterial.NOVO, evento.quantidade());
        }
        for (AlocacaoObraService.Parcela parcela : parcelas) {
            movimentacaoRepository.save(MovimentacaoEstoque.criarPorObra(
                    caminhao, obra, material, parcela.quantidade(), TipoMovimentacao.APLICACAO, CondicaoMaterial.NOVO,
                    evento.idObra(), parcela.semSaldo() ? null : parcela.idObra(), evento.idEquipe(), operador,
                    evento.idApontamento(), parcela.semSaldo() ? OBS_SEM_SALDO : null));
        }
    }

    private void retirar(ItemExecutadoEvent evento, Estoque caminhao, Material material, UUID operador) {
        creditar(caminhao, material, CondicaoMaterial.SUCATA, evento.quantidade());
        alocacao.alocar(caminhao, material, CondicaoMaterial.SUCATA, evento.idObra(), evento.quantidade());
        movimentacaoRepository.save(MovimentacaoEstoque.criarPorObra(
                null, caminhao, material, evento.quantidade(), TipoMovimentacao.RETIRADA, CondicaoMaterial.SUCATA,
                evento.idObra(), null, evento.idEquipe(), operador, evento.idApontamento(), null));
    }

    /**
     * Baixa os apontamentos de material que ainda não mexeram no estoque (feitos antes do estoque por obra). Idempotente:
     * apontamento com qualquer movimento já é pulado. Devolve quantos foram baixados agora.
     */
    @Transactional
    @CacheEvict(value = SALDOS, allEntries = true)
    public int reprocessarPendentes() {
        int feitos = 0;
        for (ItemExecutadoEvent evento : obraApi.apontamentosDeMaterialAtivos()) {
            if (movimentacaoRepository.findAllByIdReferenciaOperacaoInOrderByDataHoraAscIdAsc(List.of(evento.idApontamento())).isEmpty()) {
                aoExecutar(evento);
                feitos++;
            }
        }
        return feitos;
    }

    /** Desfaz o que o apontamento fez: cada aplicação volta ao caminhão e à obra de onde veio; a sucata sai. */
    @Transactional
    @CacheEvict(value = SALDOS, allEntries = true)
    public void aoEstornar(ApontamentoEstornadoEvent evento) {
        if (movimentacaoRepository.existsByTipoAndIdReferenciaOperacao(TipoMovimentacao.ESTORNO, evento.idApontamento())) {
            return;
        }
        UUID operador = Objects.requireNonNullElse(SecurityUtils.getUsuarioLogadoId(), SISTEMA);
        List<MovimentacaoEstoque> feitos = movimentacaoRepository.findAllByIdReferenciaOperacaoInOrderByDataHoraAscIdAsc(
                List.of(evento.idApontamento()));
        for (MovimentacaoEstoque feito : feitos) {
            if (feito.getTipo() == TipoMovimentacao.APLICACAO) {
                Estoque caminhao = feito.getEstoqueOrigem();
                Estoque obra = feito.getEstoqueDestino();
                if (obra != null) {
                    debitoSaldoService.debitar(obra, feito.getMaterial(), feito.getCondicao(), feito.getQuantidade());
                }
                creditar(caminhao, feito.getMaterial(), feito.getCondicao(), feito.getQuantidade());
                alocacao.alocar(caminhao, feito.getMaterial(), feito.getCondicao(), feito.getIdObraOrigem(), feito.getQuantidade());
                movimentacaoRepository.save(MovimentacaoEstoque.criarPorObra(
                        obra, caminhao, feito.getMaterial(), feito.getQuantidade(), TipoMovimentacao.ESTORNO,
                        feito.getCondicao(), feito.getIdObra(), feito.getIdObraOrigem(), feito.getIdEquipe(), operador,
                        evento.idApontamento(), OBS_SEM_SALDO.equals(feito.getObservacao())
                                ? OBS_SEM_SALDO + " Estornado." : "Apontamento estornado."));
            } else if (feito.getTipo() == TipoMovimentacao.RETIRADA) {
                Estoque caminhao = feito.getEstoqueDestino();
                alocacao.liberar(caminhao, feito.getMaterial(), feito.getCondicao(), feito.getIdObra(), feito.getQuantidade());
                debitoSaldoService.debitar(caminhao, feito.getMaterial(), feito.getCondicao(), feito.getQuantidade());
                movimentacaoRepository.save(MovimentacaoEstoque.criarPorObra(
                        caminhao, null, feito.getMaterial(), feito.getQuantidade(), TipoMovimentacao.ESTORNO,
                        feito.getCondicao(), feito.getIdObra(), null, feito.getIdEquipe(), operador,
                        evento.idApontamento(), "Apontamento estornado."));
            }
        }
    }

    private Estoque estoqueDaObra(UUID idObra) {
        return obraApi.buscarPorId(idObra)
                .filter(obra -> obra.idBaseOperacional() != null)
                .map(estoqueObraService::resolverOuProvisionar)
                .orElse(null);
    }

    private void creditar(Estoque estoque, Material material, CondicaoMaterial condicao, BigDecimal quantidade) {
        Saldo saldo = saldoRepository.findWithLockByEstoqueIdAndMaterialIdAndCondicao(estoque.getId(), material.getId(), condicao)
                .orElseGet(() -> new Saldo(estoque, material, condicao));
        saldo.adicionarQuantidade(quantidade);
        saldoRepository.save(saldo);
    }
}
