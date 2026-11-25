package com.nexo.app.modules.listas;

import java.util.List;
import java.util.Map;

/** Porta pública das listas configuráveis para os outros módulos. */
public interface ListasApi {

    /** Opções ativas, na ordem do cadastro, para montar escolhas (web e app). */
    List<Opcao> ativas(ListaConfiguravel lista);

    /** Rótulo de cada código, inclusive dos desativados, para mostrar registros antigos. */
    Map<String, String> rotulos(ListaConfiguravel lista);

    /** Rótulo do código; sem cadastro, o próprio código. */
    String rotulo(ListaConfiguravel lista, String codigo);

    /**
     * Confere que o código existe e está ativo na lista; devolve o código como gravado no cadastro.
     *
     * @throws com.nexo.app.shared.domain.exception.InvarianteVioladaException se não existir ou estiver desativado
     */
    String exigirAtiva(ListaConfiguravel lista, String codigo);

    /**
     * Confere só que o código existe na lista, mesmo desativado: registro feito no app sem sinal pode chegar depois de
     * a opção ser desativada e não deve ser perdido.
     */
    String exigirExistente(ListaConfiguravel lista, String codigo);

    /** Como {@link #exigirAtiva(ListaConfiguravel, String)}, conferindo também que a opção vale no contexto informado. */
    String exigirAtiva(ListaConfiguravel lista, String codigo, String contexto);

    /** {@code contextos}: onde a opção vale; vazio, vale em todos. */
    record Opcao(String codigo, String rotulo, List<String> contextos) {

        public boolean valeEm(String contexto) {
            return contextos == null || contextos.isEmpty() || contextos.contains(contexto);
        }
    }
}
