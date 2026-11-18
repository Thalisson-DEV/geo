package com.nexo.app.modules.estoque.application.services;

import com.nexo.app.modules.estoque.domain.CondicaoMaterial;
import com.nexo.app.modules.estoque.domain.SaldoSerie;
import com.nexo.app.modules.estoque.infrastructure.persistence.ConciliacaoSerieAplicadaRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.MovimentacaoEstoqueRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.SaldoSerieRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;

/**
 * A aplicação em campo nunca é recusada: a equipe pode aplicar uma série que ainda não chegou
 * ao caminhão (a entrega é registrada depois). Nesse caso a quantidade já baixou na aplicação
 * e, quando a série chega, ela chega já aplicada: sai da equipe na hora, sem mexer na quantidade.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class ConciliacaoSerieAplicadaService {

    private final MovimentacaoEstoqueRepository movimentacaoRepository;
    private final ConciliacaoSerieAplicadaRepository conciliacaoRepository;
    private final SaldoSerieRepository serieRepository;

    /**
     * Chamar logo depois que a série entra no estoque (transferida ou criada).
     *
     * @param instanteDaOperacao início da operação que trouxe a série; entradas a partir dele
     *                           (a própria chegada) não contam como entrada anterior.
     * @return {@code true} se a série chegou já aplicada e saiu da equipe.
     */
    public boolean conciliarChegada(SaldoSerie serie, OffsetDateTime instanteDaOperacao) {
        if (serie == null || !serie.isAtivo() || serie.getCondicao() != CondicaoMaterial.NOVO
                || serie.getEstoque().getIdEquipe() == null) {
            return false;
        }
        var idEstoque = serie.getEstoque().getId();
        var idMaterial = serie.getMaterial().getId();
        String numSerie = serie.getNumSerie();

        long aplicacoes = movimentacaoRepository.contarAplicacoesDaSerie(idEstoque, idMaterial, numSerie);
        if (aplicacoes == 0) {
            return false;
        }
        // O banco guarda microssegundos: em nanossegundos, a própria operação contaria como anterior.
        long entradasAnteriores = movimentacaoRepository.contarEntradasDaSerieAntesDe(
                idEstoque, idMaterial, numSerie, instanteDaOperacao.truncatedTo(ChronoUnit.MICROS));
        long casadas = conciliacaoRepository.contarCasadas(idEstoque, idMaterial, numSerie);
        if (aplicacoes <= entradasAnteriores + casadas) {
            return false;
        }

        serie.liberarReservas();
        serie.desativar();
        serieRepository.save(serie);
        log.info("Série {} chegou ao estoque {} já aplicada pela equipe; saiu do saldo serial.",
                numSerie, serie.getEstoque().getNomeIdentificador());
        return true;
    }
}
