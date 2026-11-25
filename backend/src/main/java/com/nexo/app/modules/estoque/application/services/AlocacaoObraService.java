package com.nexo.app.modules.estoque.application.services;

import com.nexo.app.modules.estoque.domain.AlocacaoObra;
import com.nexo.app.modules.estoque.domain.CondicaoMaterial;
import com.nexo.app.modules.estoque.domain.Estoque;
import com.nexo.app.modules.estoque.domain.Material;
import com.nexo.app.modules.estoque.domain.Saldo;
import com.nexo.app.modules.estoque.infrastructure.persistence.AlocacaoObraRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.SaldoRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * Mantém a parte de cada local (caminhão, canteiro) que é de cada obra. Roda sempre dentro da transação de quem
 * movimenta o saldo físico, para o físico e a alocação andarem juntos.
 */
@Service
@RequiredArgsConstructor
@Transactional(propagation = Propagation.MANDATORY)
public class AlocacaoObraService {

    private final AlocacaoObraRepository repository;
    private final SaldoRepository saldoRepository;

    /** De onde saiu cada parte de um consumo. {@code idObra} nulo é material livre; {@code semSaldo} é o que faltou. */
    public record Parcela(UUID idObra, BigDecimal quantidade, boolean semSaldo) {
    }

    public void alocar(Estoque local, Material material, CondicaoMaterial condicao, UUID idObra, BigDecimal quantidade) {
        if (idObra == null || !local.guardaMaterialPorObra() || quantidade.signum() <= 0) {
            return;
        }
        AlocacaoObra alocacao = repository.buscarComLock(local.getId(), material.getId(), condicao(condicao), idObra)
                .orElseGet(() -> new AlocacaoObra(local, material, condicao(condicao), idObra));
        alocacao.alocar(quantidade);
        repository.save(alocacao);
    }

    /** Tira até {@code quantidade} da obra no local; devolve quanto estava alocado e saiu. */
    public BigDecimal liberar(Estoque local, Material material, CondicaoMaterial condicao, UUID idObra, BigDecimal quantidade) {
        if (idObra == null || !local.guardaMaterialPorObra() || quantidade.signum() <= 0) {
            return BigDecimal.ZERO;
        }
        return repository.buscarComLock(local.getId(), material.getId(), condicao(condicao), idObra)
                .map(alocacao -> {
                    BigDecimal saiu = alocacao.liberar(quantidade);
                    repository.save(alocacao);
                    return saiu;
                })
                .orElse(BigDecimal.ZERO);
    }

    /** O material de uma obra foi de um local a outro: a obra vai junto. */
    public void acompanharTransferencia(Estoque origem, Estoque destino, Material material, CondicaoMaterial condicao,
                                        UUID idObra, BigDecimal quantidade) {
        if (idObra == null) {
            return;
        }
        if (origem != null) {
            liberar(origem, material, condicao, idObra, quantidade);
        }
        if (destino != null) {
            alocar(destino, material, condicao, idObra, quantidade);
        }
    }

    /**
     * Decide de onde sai um consumo da obra no local, ANTES de baixar o físico: primeiro o que é da própria obra,
     * depois o livre, depois o de outras obras (maior saldo primeiro). O que não couber em nada sai "sem saldo".
     * As alocações já ficam baixadas; quem chama baixa o físico e registra o rastro de cada parcela.
     */
    public List<Parcela> consumir(Estoque local, Material material, CondicaoMaterial condicao, UUID idObra, BigDecimal quantidade) {
        CondicaoMaterial cond = condicao(condicao);
        List<Parcela> parcelas = new ArrayList<>();
        if (!local.guardaMaterialPorObra()) {
            parcelas.add(new Parcela(idObra, quantidade, false));
            return parcelas;
        }
        List<AlocacaoObra> alocacoes = repository.listarDoMaterialComLock(local.getId(), material.getId(), cond);
        BigDecimal fisico = saldoRepository.findByEstoqueIdAndMaterialIdAndCondicao(local.getId(), material.getId(), cond)
                .map(Saldo::getQuantidade).orElse(BigDecimal.ZERO);
        BigDecimal alocadoTotal = alocacoes.stream().map(AlocacaoObra::getQuantidade).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal livre = fisico.subtract(alocadoTotal).max(BigDecimal.ZERO);
        BigDecimal falta = quantidade;

        for (AlocacaoObra alocacao : alocacoes) {
            if (falta.signum() > 0 && Objects.equals(alocacao.getIdObra(), idObra)) {
                BigDecimal saiu = alocacao.liberar(falta);
                repository.save(alocacao);
                if (saiu.signum() > 0) {
                    parcelas.add(new Parcela(idObra, saiu, false));
                    falta = falta.subtract(saiu);
                }
            }
        }
        if (falta.signum() > 0 && livre.signum() > 0) {
            BigDecimal saiu = falta.min(livre);
            parcelas.add(new Parcela(null, saiu, false));
            falta = falta.subtract(saiu);
        }
        for (AlocacaoObra alocacao : alocacoes) {
            if (falta.signum() > 0 && !Objects.equals(alocacao.getIdObra(), idObra) && alocacao.getQuantidade().signum() > 0) {
                BigDecimal saiu = alocacao.liberar(falta);
                repository.save(alocacao);
                parcelas.add(new Parcela(alocacao.getIdObra(), saiu, false));
                falta = falta.subtract(saiu);
            }
        }
        if (falta.signum() > 0) {
            parcelas.add(new Parcela(idObra, falta, true));
        }
        return parcelas;
    }

    private static CondicaoMaterial condicao(CondicaoMaterial condicao) {
        return Objects.requireNonNullElse(condicao, CondicaoMaterial.NOVO);
    }
}
