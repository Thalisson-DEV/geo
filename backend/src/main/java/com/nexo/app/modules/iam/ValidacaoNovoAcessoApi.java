package com.nexo.app.modules.iam;

import java.util.UUID;

/**
 * Confere, antes de pedir a criação de um acesso, o que o IAM recusaria ao criá-lo.
 *
 * <p>A criação em si roda de forma assíncrona, depois de quem pediu já ter recebido a
 * resposta: sem esta conferência, um login repetido só falharia em segundo plano e a tela
 * informaria sucesso. Fica fora do {@link UsuarioApi} porque quem a usa é o RH, do qual o
 * {@code UsuarioUseCases} já depende — injetá-lo de volta fecharia um ciclo de beans.</p>
 */
public interface ValidacaoNovoAcessoApi {

    /**
     * @throws com.nexo.app.shared.domain.exception.InvarianteVioladaException login ou e-mail já em uso
     * @throws com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException perfil inexistente
     */
    void validar(String login, String email, UUID idPerfil);
}
