package com.nexo.app.modules.obras.application.usecases;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Predicate;
import java.util.function.ToDoubleFunction;

/**
 * Sequência da rede para numerar os pontos de uma leitura: começa no poste existente de onde a rede nova sai (ou numa
 * ponta) e segue pelos vãos, preferindo continuar pela rede nova antes de voltar para a existente. Pontos soltos entram
 * por último, na ordem de leitura da folha.
 */
final class OrdemRede {

    /** Ligação entre dois pontos (um vão). */
    record Ligacao<P>(P a, P b) {
    }

    private OrdemRede() {
    }

    /**
     * @param novo     o ponto entra na rede (poste novo ou trocado)
     * @param x        posição para desempate: vizinho mais perto primeiro, leitura de cima para baixo
     * @return ordem de cada ponto, a partir de 1
     */
    static <P> Map<P, Integer> ordenar(List<P> pontos, List<Ligacao<P>> ligacoes, Predicate<P> novo,
                                       ToDoubleFunction<P> x, ToDoubleFunction<P> y) {
        Map<P, List<P>> vizinhos = new LinkedHashMap<>();
        for (Ligacao<P> l : ligacoes) {
            vizinhos.computeIfAbsent(l.a(), k -> new ArrayList<>()).add(l.b());
            vizinhos.computeIfAbsent(l.b(), k -> new ArrayList<>()).add(l.a());
        }
        List<P> inicios = new ArrayList<>(pontos);
        inicios.sort(Comparator.<P>comparingInt(p -> {
                    List<P> viz = vizinhos.getOrDefault(p, List.of());
                    if (!novo.test(p) && viz.stream().anyMatch(novo)) {
                        return 0;
                    }
                    return viz.size() == 1 ? 1 : 2;
                })
                .thenComparingDouble(y)
                .thenComparingDouble(x));
        Map<P, Integer> ordem = new LinkedHashMap<>();
        for (P inicio : inicios) {
            percorrer(inicio, vizinhos, ordem, novo, x, y);
        }
        return ordem;
    }

    private static <P> void percorrer(P atual, Map<P, List<P>> vizinhos, Map<P, Integer> ordem, Predicate<P> novo,
                                      ToDoubleFunction<P> x, ToDoubleFunction<P> y) {
        if (ordem.containsKey(atual)) {
            return;
        }
        ordem.put(atual, ordem.size() + 1);
        List<P> proximos = new ArrayList<>(vizinhos.getOrDefault(atual, List.of()));
        proximos.sort(Comparator.<P>comparingInt(p -> novo.test(p) ? 0 : 1)
                .thenComparingDouble(p -> Math.hypot(x.applyAsDouble(p) - x.applyAsDouble(atual),
                        y.applyAsDouble(p) - y.applyAsDouble(atual))));
        proximos.forEach(p -> percorrer(p, vizinhos, ordem, novo, x, y));
    }
}
