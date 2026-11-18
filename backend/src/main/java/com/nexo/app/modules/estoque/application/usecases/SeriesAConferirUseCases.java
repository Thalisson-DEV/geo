package com.nexo.app.modules.estoque.application.usecases;

import com.nexo.app.modules.estoque.application.dto.ConciliarSerieAplicadaRequest;
import com.nexo.app.modules.estoque.application.dto.SeriesAConferirResponse;
import com.nexo.app.modules.estoque.application.dto.SeriesAConferirResponse.AplicacaoForaDoSaldo;
import com.nexo.app.modules.estoque.application.dto.SeriesAConferirResponse.MaterialAConferir;
import com.nexo.app.modules.estoque.domain.*;
import com.nexo.app.modules.estoque.infrastructure.persistence.*;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.*;
import java.util.stream.Collectors;

import static com.nexo.app.shared.infrastructure.config.CacheNames.SALDOS;

/**
 * Conferência das séries de uma equipe: a aplicação em campo nunca é recusada e, quando a
 * série aplicada não está no caminhão (digitação errada, carga inicial incompleta), a
 * quantidade baixa e a série que estava no caminhão continua lá. O almoxarifado diz qual
 * série do caminhão era a aplicada (ela sai da equipe) ou que nenhuma corresponde.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SeriesAConferirUseCases {

    /** Diferença máxima (caracteres) para sugerir uma série do caminhão como a aplicada. */
    private static final int DISTANCIA_MAXIMA_SUGESTAO = 2;

    private final EstoqueRepository estoqueRepository;
    private final SaldoRepository saldoRepository;
    private final SaldoSerieRepository serieRepository;
    private final MovimentacaoEstoqueRepository movimentacaoRepository;
    private final ConciliacaoSerieAplicadaRepository conciliacaoRepository;

    @Transactional(readOnly = true)
    public SeriesAConferirResponse listar(UUID idEstoque) {
        Estoque estoque = buscarEstoque(idEstoque);
        if (estoque.getIdEquipe() == null) {
            return new SeriesAConferirResponse(idEstoque, List.of());
        }

        Map<UUID, List<MovimentacaoEstoque>> aplicadasPorMaterial = movimentacaoRepository
                .aplicacoesDeSeriesForaDoEstoque(idEstoque).stream()
                .collect(Collectors.groupingBy(m -> m.getMaterial().getId(), LinkedHashMap::new, Collectors.toList()));
        if (aplicadasPorMaterial.isEmpty()) {
            return new SeriesAConferirResponse(idEstoque, List.of());
        }

        Map<UUID, List<String>> seriesPorMaterial = serieRepository
                .findAllByEstoqueIdAndCondicaoAndAtivoTrueOrderByNumSerieAsc(idEstoque, CondicaoMaterial.NOVO).stream()
                .collect(Collectors.groupingBy(s -> s.getMaterial().getId(),
                        Collectors.mapping(SaldoSerie::getNumSerie, Collectors.toList())));

        List<MaterialAConferir> materiais = new ArrayList<>();
        aplicadasPorMaterial.forEach((idMaterial, aplicadas) -> {
            Material material = aplicadas.getFirst().getMaterial();
            List<String> disponiveis = seriesPorMaterial.getOrDefault(idMaterial, List.of());
            BigDecimal quantidade = quantidadeNova(idEstoque, idMaterial);
            int sobrando = seriesSobrando(disponiveis.size(), quantidade);
            // Sem série a mais no caminhão não há o que conciliar (o saldo negativo já é avisado).
            if (sobrando <= 0) return;
            materiais.add(new MaterialAConferir(
                    idMaterial, material.getCodigo(), material.getDescricao(), quantidade,
                    disponiveis.size(), sobrando,
                    aplicadas.stream()
                            .map(a -> new AplicacaoForaDoSaldo(a.getId(), a.getNumSerie(), a.getDataHora(),
                                    sugerir(a.getNumSerie(), disponiveis)))
                            .toList(),
                    disponiveis));
        });
        materiais.sort(Comparator.comparing(MaterialAConferir::seriesSobrando).reversed()
                .thenComparing(MaterialAConferir::codigo));
        return new SeriesAConferirResponse(idEstoque, materiais);
    }

    @Transactional
    @CacheEvict(value = SALDOS, allEntries = true)
    public SeriesAConferirResponse conciliar(UUID idEstoque, ConciliarSerieAplicadaRequest request, UUID idUsuario) {
        buscarEstoque(idEstoque);
        MovimentacaoEstoque aplicacao = movimentacaoRepository.findById(request.idMovimentacaoAplicacao())
                .orElseThrow(() -> new RecursoNaoEncontradoException("Aplicação não encontrada."));
        if (aplicacao.getTipo() != MovimentacaoEstoque.TipoMovimentacao.APLICACAO || !aplicacao.isAtivo()
                || aplicacao.getEstoqueOrigem() == null || !aplicacao.getEstoqueOrigem().getId().equals(idEstoque)
                || aplicacao.getNumSerie() == null) {
            throw new InvarianteVioladaException("Esta aplicação não é de uma série deste estoque.");
        }
        if (conciliacaoRepository.existsByAplicacaoIdAndAtivoTrue(aplicacao.getId())) {
            throw new InvarianteVioladaException("A série " + aplicacao.getNumSerie() + " já foi conferida.");
        }
        Material material = aplicacao.getMaterial();
        if (movimentacaoRepository.existsByEstoqueDestinoIdAndMaterialIdAndNumSerieAndAtivoTrue(
                idEstoque, material.getId(), aplicacao.getNumSerie())) {
            throw new InvarianteVioladaException("A série " + aplicacao.getNumSerie()
                    + " já entrou no estoque da equipe e foi acertada.");
        }

        String numSerieDoEstoque = request.numSerieDoEstoque() == null ? "" : request.numSerieDoEstoque().trim();
        if (numSerieDoEstoque.isEmpty()) {
            conciliacaoRepository.save(ConciliacaoSerieAplicada.semCorrespondente(aplicacao, idUsuario));
            return listar(idEstoque);
        }

        SaldoSerie serie = serieRepository.findWithLockByEstoqueIdAndMaterialIdAndNumSerieAndCondicaoAndAtivoTrue(
                        idEstoque, material.getId(), numSerieDoEstoque, CondicaoMaterial.NOVO)
                .orElseThrow(() -> new InvarianteVioladaException(
                        "A série " + numSerieDoEstoque + " não está no estoque da equipe."));
        int seriesNoEstoque = (int) serieRepository
                .findAllByEstoqueIdAndCondicaoAndAtivoTrueOrderByNumSerieAsc(idEstoque, CondicaoMaterial.NOVO).stream()
                .filter(s -> s.getMaterial().getId().equals(material.getId()))
                .count();
        if (seriesSobrando(seriesNoEstoque, quantidadeNova(idEstoque, material.getId())) <= 0) {
            throw new InvarianteVioladaException(
                    "As séries de " + material.getCodigo() + " já batem com o saldo da equipe: nenhuma pode sair.");
        }

        conciliacaoRepository.save(ConciliacaoSerieAplicada.comSerieDoEstoque(aplicacao, serie, idUsuario));
        // Aplicação é fato consumado: reserva da série não impede a saída.
        serie.liberarReservas();
        serie.desativar();
        serieRepository.save(serie);
        log.info("Série {} saiu do estoque {}: era a série {} aplicada em campo.",
                numSerieDoEstoque, idEstoque, aplicacao.getNumSerie());
        return listar(idEstoque);
    }

    private Estoque buscarEstoque(UUID idEstoque) {
        return estoqueRepository.findById(idEstoque)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Estoque não encontrado."));
    }

    private BigDecimal quantidadeNova(UUID idEstoque, UUID idMaterial) {
        return saldoRepository.findByEstoqueIdAndMaterialIdAndCondicao(idEstoque, idMaterial, CondicaoMaterial.NOVO)
                .map(Saldo::getQuantidade)
                .orElse(BigDecimal.ZERO);
    }

    /** Séries além do saldo; com saldo negativo, todas as séries do caminhão estão sobrando. */
    static int seriesSobrando(int series, BigDecimal quantidade) {
        int saldo = quantidade == null ? 0 : Math.max(quantidade.intValue(), 0);
        return series - saldo;
    }

    /** A série do caminhão mais parecida com a aplicada, se a diferença for de até dois caracteres. */
    static String sugerir(String aplicada, List<String> disponiveis) {
        if (aplicada == null || disponiveis.isEmpty()) return null;
        String alvo = aplicada.trim().toUpperCase(Locale.ROOT);
        String melhor = null;
        int menor = Integer.MAX_VALUE;
        boolean empate = false;
        for (String candidata : disponiveis) {
            int d = distancia(alvo, candidata.trim().toUpperCase(Locale.ROOT));
            if (d < menor) {
                menor = d;
                melhor = candidata;
                empate = false;
            } else if (d == menor) {
                empate = true;
            }
        }
        // Duas séries igualmente parecidas: não há como sugerir uma delas.
        return menor <= DISTANCIA_MAXIMA_SUGESTAO && !empate ? melhor : null;
    }

    /** Distância de edição (Levenshtein). */
    static int distancia(String a, String b) {
        int[] anterior = new int[b.length() + 1];
        int[] atual = new int[b.length() + 1];
        for (int j = 0; j <= b.length(); j++) anterior[j] = j;
        for (int i = 1; i <= a.length(); i++) {
            atual[0] = i;
            for (int j = 1; j <= b.length(); j++) {
                int custo = a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1;
                atual[j] = Math.min(Math.min(atual[j - 1] + 1, anterior[j] + 1), anterior[j - 1] + custo);
            }
            int[] troca = anterior;
            anterior = atual;
            atual = troca;
        }
        return anterior[b.length()];
    }
}
