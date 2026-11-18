package com.nexo.app.modules.iam.application.usecases;

import com.nexo.app.modules.iam.ValidacaoNovoAcessoApi;
import com.nexo.app.modules.iam.infrastructure.persistence.PerfilAcessoRepository;
import com.nexo.app.modules.iam.infrastructure.persistence.UsuarioRepository;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ValidacaoNovoAcessoService implements ValidacaoNovoAcessoApi {

    private final UsuarioRepository usuarios;
    private final PerfilAcessoRepository perfis;

    @Override
    @Transactional(readOnly = true)
    public void validar(String login, String email, UUID idPerfil) {
        if (login != null && usuarios.existsByLoginIgnoreCase(login)) {
            throw new InvarianteVioladaException("Já existe um usuário com este login");
        }
        if (email != null && usuarios.existsByEmailIgnoreCase(email)) {
            throw new InvarianteVioladaException("Já existe um usuário com este e-mail");
        }
        if (!perfis.existsById(idPerfil)) {
            throw new RecursoNaoEncontradoException("Perfil de acesso não encontrado");
        }
    }
}
