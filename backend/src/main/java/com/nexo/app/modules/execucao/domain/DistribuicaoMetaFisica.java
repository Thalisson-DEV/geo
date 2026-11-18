package com.nexo.app.modules.execucao.domain;

import com.nexo.app.shared.domain.exception.InvarianteVioladaException;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.IntStream;

/**
 * Reparte o total de notas do mês entre os tipos de serviço na proporção do parcial
 * que a Concessionária enviou até uma data.
 *
 * <p>Usa o método dos maiores restos: cada serviço recebe a parte inteira da sua
 * proporção e as notas que sobram vão, uma a uma, para os maiores restos (no empate,
 * para o serviço de maior parcial e, depois, para o que vem primeiro). Assim a soma
 * por serviço fecha exatamente com o total do mês.</p>
 *
 * <p>Ex.: total 626 com parcial 215 / 28 / 12 → 528 / 69 / 29.</p>
 */
public final class DistribuicaoMetaFisica {

    private DistribuicaoMetaFisica() {
    }

    public static List<Integer> distribuir(int total, List<Integer> parciais) {
        if (total <= 0) {
            throw new InvarianteVioladaException("O total do mês deve ser maior que zero.");
        }
        if (parciais == null || parciais.isEmpty()) {
            throw new InvarianteVioladaException("Informe o parcial de ao menos um serviço.");
        }
        long soma = 0;
        for (Integer parcial : parciais) {
            if (parcial == null || parcial < 0) {
                throw new InvarianteVioladaException("Informe o parcial da Concessionária de cada serviço (zero ou mais).");
            }
            soma += parcial;
        }
        if (soma == 0) {
            throw new InvarianteVioladaException("A soma dos parciais precisa ser maior que zero para repartir o total.");
        }

        int n = parciais.size();
        List<Integer> resultado = new ArrayList<>(n);
        long[] restos = new long[n];
        int distribuido = 0;
        for (int i = 0; i < n; i++) {
            long produto = (long) total * parciais.get(i);
            int inteiro = (int) (produto / soma);
            restos[i] = produto % soma;
            resultado.add(inteiro);
            distribuido += inteiro;
        }

        List<Integer> ordem = IntStream.range(0, n).boxed()
                .sorted(Comparator.<Integer>comparingLong(i -> restos[i]).reversed()
                        .thenComparing(Comparator.<Integer>comparingInt(parciais::get).reversed())
                        .thenComparingInt(i -> i))
                .toList();
        int sobra = total - distribuido;
        for (int k = 0; k < sobra; k++) {
            int i = ordem.get(k % n);
            resultado.set(i, resultado.get(i) + 1);
        }
        return resultado;
    }
}
