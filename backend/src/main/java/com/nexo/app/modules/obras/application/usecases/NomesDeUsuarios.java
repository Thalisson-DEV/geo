package com.nexo.app.modules.obras.application.usecases;

import com.nexo.app.modules.iam.UsuarioApi;
import com.nexo.app.modules.rh.ColaboradorApi;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * Nome da pessoa a partir do login gravado na auditoria ({@code usuario_criacao}): o documento técnico diz quem tirou a
 * foto ou emitiu o documento, não o login. O nome vem do colaborador vinculado ao usuário; sem colaborador (usuário de
 * sistema, usuário desativado), fica o login.
 */
@Component
@RequiredArgsConstructor
class NomesDeUsuarios {

    private final UsuarioApi usuarioApi;
    private final ColaboradorApi colaboradorApi;

    /** Login (como veio) → nome para exibir. Uma consulta de logins e uma por usuário encontrado. */
    Map<String, String> porLogin(Collection<String> logins) {
        Map<String, String> nomes = new HashMap<>();
        var distintos = logins.stream().filter(Objects::nonNull).filter(l -> !l.isBlank()).distinct().toList();
        if (distintos.isEmpty()) {
            return nomes;
        }
        Map<String, UUID> ids = usuarioApi.buscarIdsAtivosPorLogins(distintos);
        for (String login : distintos) {
            UUID id = ids.get(login.toUpperCase(Locale.ROOT));
            String nome = id != null ? colaboradorApi.buscarNomeCompletoPorUsuario(id).filter(n -> !n.isBlank()).orElse(null) : null;
            nomes.put(login, nome != null ? nome : login);
        }
        return nomes;
    }

    String deLogin(String login) {
        return login == null ? null : porLogin(java.util.List.of(login)).getOrDefault(login, login);
    }
}
