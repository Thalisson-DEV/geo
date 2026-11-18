package com.nexo.app.modules.iam.application.usecases;

import com.nexo.app.modules.iam.infrastructure.persistence.PerfilAcessoRepository;
import com.nexo.app.modules.iam.infrastructure.persistence.UsuarioRepository;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ValidacaoNovoAcessoServiceTest {

    private static final UUID PERFIL = UUID.randomUUID();

    @Mock UsuarioRepository usuarios;
    @Mock PerfilAcessoRepository perfis;
    @InjectMocks ValidacaoNovoAcessoService service;

    @Test
    @DisplayName("aceita login e e-mail livres com perfil existente")
    void aceitaAcessoValido() {
        when(usuarios.existsByLoginIgnoreCase("USR000001")).thenReturn(false);
        when(usuarios.existsByEmailIgnoreCase("ze@exemplo.com.br")).thenReturn(false);
        when(perfis.existsById(PERFIL)).thenReturn(true);

        assertThatCode(() -> service.validar("USR000001", "ze@exemplo.com.br", PERFIL)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("recusa login já usado")
    void recusaLoginRepetido() {
        when(usuarios.existsByLoginIgnoreCase("USR000001")).thenReturn(true);

        assertThatThrownBy(() -> service.validar("USR000001", null, PERFIL))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("login");
    }

    @Test
    @DisplayName("recusa e-mail já usado")
    void recusaEmailRepetido() {
        when(usuarios.existsByLoginIgnoreCase("USR000001")).thenReturn(false);
        when(usuarios.existsByEmailIgnoreCase("ze@exemplo.com.br")).thenReturn(true);

        assertThatThrownBy(() -> service.validar("USR000001", "ze@exemplo.com.br", PERFIL))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("e-mail");
    }

    @Test
    @DisplayName("recusa perfil inexistente")
    void recusaPerfilInexistente() {
        when(usuarios.existsByLoginIgnoreCase("USR000001")).thenReturn(false);
        when(perfis.existsById(PERFIL)).thenReturn(false);

        assertThatThrownBy(() -> service.validar("USR000001", null, PERFIL))
                .isInstanceOf(RecursoNaoEncontradoException.class);
    }
}
