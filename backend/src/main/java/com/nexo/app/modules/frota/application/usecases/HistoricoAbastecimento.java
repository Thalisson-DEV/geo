package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.domain.Abastecimento;
import com.nexo.app.modules.frota.domain.AnaliseAbastecimento;
import com.nexo.app.modules.frota.domain.FichaVeiculo;
import com.nexo.app.modules.frota.domain.FotoAbastecimento;
import com.nexo.app.modules.frota.domain.TipoFotoAbastecimento;
import com.nexo.app.modules.frota.infrastructure.persistence.AbastecimentoRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;
import java.util.Set;

/**
 * Reúne o histórico do veículo para a {@link AnaliseAbastecimento}: intervalos entre
 * abastecimentos, rendimento dos tanques cheios, preço médio da base e fotos repetidas.
 */
@Component
@RequiredArgsConstructor
class HistoricoAbastecimento {

    private static final int DIAS_PRECO_MEDIO = 30;

    private final AbastecimentoRepository repository;

    List<AnaliseAbastecimento.Alerta> solicitacao(Abastecimento a, FichaVeiculo ficha, Long medicaoAnterior) {
        var anteriores = repository.realizadosAntes(a.getIdVeiculo(), a.getSolicitadoEm());
        Long horasDesde = anteriores.isEmpty() ? null : horas(anteriores.getFirst().getRealizadoEm(), a.getSolicitadoEm());
        return AnaliseAbastecimento.analisarSolicitacao(new AnaliseAbastecimento.DadosSolicitacao(
                ficha.getUnidadeMedicao(), a.getMedicaoSolicitacao(), medicao(medicaoAnterior),
                intervaloMediano(anteriores), horasDesde, repetidas(a, Set.of(TipoFotoAbastecimento.PAINEL_ANTES))));
    }

    List<AnaliseAbastecimento.Alerta> realizado(Abastecimento a, FichaVeiculo ficha, Long medicaoAnterior) {
        var fotosRepetidas = repetidas(a, Set.of(TipoFotoAbastecimento.PAINEL_DEPOIS, TipoFotoAbastecimento.CUPOM));
        var item = a.itemCombustivelEntregue().orElse(null);
        if (item == null) {
            return AnaliseAbastecimento.analisarRealizado(new AnaliseAbastecimento.DadosRealizado(ficha.getUnidadeMedicao(),
                    a.getMedicaoRealizado(), medicao(medicaoAnterior), ficha.getCapacidadeTanqueLitros(), null, null, null, null,
                    List.of(), null, null, null, null, fotosRepetidas));
        }
        // Do mais antigo para o mais recente: rendimento de cada tanque cheio e litros parciais desde o último.
        var anteriores = new ArrayList<>(repository.realizadosAntes(a.getIdVeiculo(), a.getRealizadoEm()));
        Collections.reverse(anteriores);
        var rendimentos = new ArrayList<BigDecimal>();
        BigDecimal medicaoUltimoCheio = null;
        BigDecimal litros = BigDecimal.ZERO;
        for (var anterior : anteriores) {
            var combustivel = anterior.itemCombustivelEntregue().orElse(null);
            if (combustivel == null) continue;
            litros = litros.add(combustivel.getQuantidade());
            if (Boolean.TRUE.equals(combustivel.getTanqueCheio())) {
                if (medicaoUltimoCheio != null) {
                    var r = AnaliseAbastecimento.rendimento(ficha.getUnidadeMedicao(), anterior.getMedicaoRealizado().subtract(medicaoUltimoCheio), litros);
                    if (r != null) rendimentos.add(r);
                }
                medicaoUltimoCheio = anterior.getMedicaoRealizado();
                litros = BigDecimal.ZERO;
            }
        }
        Collections.reverse(rendimentos);
        BigDecimal precoMedio = a.getIdBaseOperacional() == null ? null : repository.precoMedio(a.getIdBaseOperacional(),
                item.getProduto().getId(), a.getRealizadoEm().minusDays(DIAS_PRECO_MEDIO), a.getId());
        return AnaliseAbastecimento.analisarRealizado(new AnaliseAbastecimento.DadosRealizado(ficha.getUnidadeMedicao(),
                a.getMedicaoRealizado(), medicao(medicaoAnterior), ficha.getCapacidadeTanqueLitros(), item.getQuantidade(),
                item.getTanqueCheio(), medicaoUltimoCheio, litros, rendimentos, ficha.getConsumoReferenciaKmL(),
                item.getProduto().getNome(), item.getValorUnitario(), precoMedio, fotosRepetidas));
    }

    private int repetidas(Abastecimento a, Set<TipoFotoAbastecimento> tipos) {
        var hashes = a.getFotos().stream().filter(f -> tipos.contains(f.getTipo()))
                .map(FotoAbastecimento::getHashArquivo).filter(Objects::nonNull).toList();
        return hashes.isEmpty() || a.getId() == null ? 0 : (int) repository.fotosRepetidas(hashes, a.getId());
    }

    /** Mediana das horas entre abastecimentos consecutivos; nula sem histórico suficiente. */
    private static Long intervaloMediano(List<Abastecimento> recentesPrimeiro) {
        var intervalos = new ArrayList<Long>();
        for (int i = 0; i + 1 < recentesPrimeiro.size(); i++) {
            intervalos.add(horas(recentesPrimeiro.get(i + 1).getRealizadoEm(), recentesPrimeiro.get(i).getRealizadoEm()));
        }
        if (intervalos.size() < AnaliseAbastecimento.MINIMO_HISTORICO) {
            return null;
        }
        Collections.sort(intervalos);
        return intervalos.get(intervalos.size() / 2);
    }

    private static long horas(OffsetDateTime de, OffsetDateTime ate) {
        return Duration.between(de, ate).toHours();
    }

    private static BigDecimal medicao(Long valor) {
        return valor == null ? null : BigDecimal.valueOf(valor);
    }
}
