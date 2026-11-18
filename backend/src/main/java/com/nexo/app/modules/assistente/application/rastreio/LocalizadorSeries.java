package com.nexo.app.modules.assistente.application.rastreio;

import java.util.Collection;
import java.util.List;
import java.util.Set;

/**
 * Localiza as notas em que numeros de serie foram lancados. A busca passa pelo modulo dono do dado, que abre o
 * numero da nota (guardado cifrado) com as mesmas regras da tela.
 */
public interface LocalizadorSeries {

    /** Quem pode consultar: basta possuir uma. */
    Set<String> autoridades();

    /**
     * Para cada serie informada, os lancamentos com aquela serie exata (sem diferenciar maiusculas nem espacos nas
     * pontas). Series sem lancamento exato podem voltar por trecho, marcadas com {@code exata = false}.
     */
    List<SerieEncontrada> localizar(Collection<String> series);
}
