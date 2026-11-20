package com.nexo.app.modules.assistente.application.rastreio;

import java.util.Collection;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Abre o numero das notas (guardado cifrado) para os resultados da Bússola. O identificador interno da execucao
 * nao diz nada ao gestor; o numero da nota e o que ele procura na tela e nos relatorios da Coelba.
 */
public interface NumerosDeNota {

    /** Quem pode ver o numero: basta possuir uma. */
    Set<String> autoridades();

    /** Numero da nota de cada execucao informada; execucoes inexistentes ficam de fora. */
    Map<UUID, String> numeros(Collection<UUID> execucoes);
}
