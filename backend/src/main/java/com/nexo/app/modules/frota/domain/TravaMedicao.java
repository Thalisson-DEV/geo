package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.exception.InvarianteVioladaException;

import java.text.NumberFormat;
import java.util.Locale;

/**
 * Trava dos lançamentos de campo (checklist e abastecimento): o valor do painel nunca é menor
 * que a referência (última leitura válida) nem passa dela em mais que o limite de salto. Evita
 * o "5 milhões de km" de quem digita a casa decimal do painel e trava as revisões.
 *
 * @param referencia último valor aceito no painel em uso; nulo quando o veículo não tem leitura
 * @param limite     salto máximo sobre a referência; nulo quando não há trava de salto
 */
public record TravaMedicao(UnidadeMedicao unidade, Long referencia, Integer limite) {

    public TravaMedicao {
        if (unidade == null) {
            unidade = UnidadeMedicao.KM;
        }
    }

    /** Maior valor aceito; nulo quando não há limite. */
    public Long maximo() {
        return referencia == null || limite == null ? null : referencia + limite;
    }

    public boolean aceita(long valor) {
        if (referencia == null) return true;
        if (valor < referencia) return false;
        return maximo() == null || valor <= maximo();
    }

    /** Recusa o valor fora da trava com o intervalo aceito na mensagem. */
    public void exigir(long valor) {
        if (aceita(valor)) return;
        String sufixo = unidade.sufixo();
        String intervalo = maximo() == null
                ? "a partir de " + numero(referencia) + " " + sufixo
                : "entre " + numero(referencia) + " e " + numero(maximo()) + " " + sufixo;
        String motivo = valor < referencia
                ? unidade.rotulo() + " menor que o último registrado (" + numero(referencia) + " " + sufixo + ")."
                : unidade.rotulo() + " " + numero(valor) + " " + sufixo + " passa o último registrado em mais de "
                        + numero(limite) + " " + sufixo + ". Confira se não sobrou uma casa decimal do painel.";
        throw new InvarianteVioladaException(motivo + " Informe um valor " + intervalo + ".");
    }

    /** A referência sobe para {@code outra} quando ela é maior (ex.: o KM do pedido no realizado). */
    public TravaMedicao comReferenciaMinima(Long outra) {
        if (outra == null || (referencia != null && referencia >= outra)) return this;
        return new TravaMedicao(unidade, outra, limite);
    }

    private static String numero(long valor) {
        return NumberFormat.getIntegerInstance(Locale.of("pt", "BR")).format(valor);
    }
}
