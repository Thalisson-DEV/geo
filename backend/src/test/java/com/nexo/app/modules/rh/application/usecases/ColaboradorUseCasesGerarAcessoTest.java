package com.nexo.app.modules.rh.application.usecases;

import com.nexo.app.modules.iam.ValidacaoNovoAcessoApi;
import com.nexo.app.modules.iam.application.dto.UsuarioRequest;
import com.nexo.app.modules.iam.domain.TipoUsuario;
import com.nexo.app.modules.rh.application.dto.VincularAcessoRequest;
import com.nexo.app.modules.rh.application.mappers.ColaboradorMapper;
import com.nexo.app.modules.rh.domain.Colaborador;
import com.nexo.app.modules.rh.infrastructure.persistence.BaseOperacionalRepository;
import com.nexo.app.modules.rh.infrastructure.persistence.ColaboradorRepository;
import com.nexo.app.modules.rh.infrastructure.persistence.FuncaoRepository;
import com.nexo.app.modules.rh.infrastructure.persistence.ProcessoNegocioRepository;
import com.nexo.app.shared.domain.events.AcessoColaboradorSolicitadoEvent;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ColaboradorUseCasesGerarAcessoTest {

    private static final UUID ID_COLABORADOR = UUID.randomUUID();
    private static final UUID ID_PERFIL = UUID.randomUUID();

    @Mock ColaboradorRepository repository;
    @Mock ProcessoNegocioRepository processoRepository;
    @Mock BaseOperacionalRepository baseRepository;
    @Mock FuncaoRepository funcaoRepository;
    @Mock ColaboradorMapper mapper;
    @Mock ValidacaoNovoAcessoApi validacaoNovoAcesso;
    @Mock ApplicationEventPublisher eventPublisher;
    @InjectMocks ColaboradorUseCases useCases;

    private final VincularAcessoRequest request = new VincularAcessoRequest(ID_COLABORADOR,
            new UsuarioRequest("USR000001", null, null, "segredo", ID_PERFIL, null, TipoUsuario.CAMPO));

    @BeforeEach
    void colaboradorSemAcesso() {
        when(repository.findById(ID_COLABORADOR)).thenReturn(Optional.of(mock(Colaborador.class)));
    }

    @Test
    @DisplayName("login recusado volta para quem pediu e nenhum evento é publicado")
    void recusaAntesDePublicar() {
        doThrow(new InvarianteVioladaException("Já existe um usuário com este login"))
                .when(validacaoNovoAcesso).validar("USR000001", null, ID_PERFIL);

        assertThatThrownBy(() -> useCases.gerarAcesso(request))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("login");
        verify(eventPublisher, never()).publishEvent(any(Object.class));
    }

    @Test
    @DisplayName("acesso válido segue pelo evento")
    void publicaQuandoValido() {
        useCases.gerarAcesso(request);

        verify(eventPublisher).publishEvent(any(AcessoColaboradorSolicitadoEvent.class));
    }
}
