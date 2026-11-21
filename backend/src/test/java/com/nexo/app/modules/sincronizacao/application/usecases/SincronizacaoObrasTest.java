package com.nexo.app.modules.sincronizacao.application.usecases;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.nexo.app.modules.iam.infrastructure.persistence.UsuarioRepository;
import com.nexo.app.modules.notificacao.application.usecases.PublicadorNotificacoes;
import com.nexo.app.modules.obras.CampoObrasApi;
import com.nexo.app.modules.sincronizacao.application.dto.SincronizacaoDtos.OperacaoRequest;
import com.nexo.app.modules.sincronizacao.domain.CasoSincronizacao;
import com.nexo.app.modules.sincronizacao.domain.StatusOperacaoSincronizacao;
import com.nexo.app.modules.sincronizacao.domain.TipoOperacaoSincronizacao;
import com.nexo.app.modules.sincronizacao.infrastructure.persistence.*;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/** Registro de Obras no envio durável: aplicado na hora; só a recusa vira caso com o motivo. */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SincronizacaoObrasTest {

    @Mock OperacaoSincronizacaoRepository operacoes;
    @Mock CasoSincronizacaoRepository casos;
    @Mock VersaoCasoSincronizacaoRepository versoes;
    @Mock AnexoSincronizacaoRepository anexos;
    @Mock UsuarioRepository usuarios;
    @Mock PublicadorNotificacoes publicador;
    @Mock SincronizacaoReplayExecutor replay;
    @Mock SincronizacaoFalhaService falhas;
    @Mock DiagnosticoCasoSincronizacao diagnostico;
    @Mock ReferenciasCasoSincronizacao referencias;
    @Mock AplicacaoImediataObras aplicacao;

    private SincronizacaoUseCases useCases;
    private final UUID usuario = UUID.randomUUID();

    @BeforeEach
    void preparar() {
        useCases = new SincronizacaoUseCases(operacoes, casos, versoes, anexos, new ObjectMapper().registerModule(new JavaTimeModule()),
                usuarios, publicador, replay, falhas, diagnostico, referencias, aplicacao);
        when(operacoes.findByIdOperacaoLocalAndIdUsuarioOrigem(any(), any())).thenReturn(Optional.empty());
        when(casos.save(any())).thenAnswer(i -> i.getArgument(0));
        when(usuarios.buscarIdsAtivosComPermissao(any())).thenReturn(List.of());
    }

    private OperacaoRequest pedido() {
        return new OperacaoRequest(UUID.randomUUID(), UUID.randomUUID(), TipoOperacaoSincronizacao.OBRA_APONTAMENTO,
                OffsetDateTime.now(), Map.of("idProgramacao", UUID.randomUUID().toString()), List.of(), null);
    }

    @Test
    void aplicadoNaHoraNaoAbreCaso() {
        UUID gravado = UUID.randomUUID();
        when(aplicacao.aplicar(eq(TipoOperacaoSincronizacao.OBRA_APONTAMENTO), any(), eq(usuario), any()))
                .thenReturn(new CampoObrasApi.Aplicado(List.of(gravado), false));

        var r = useCases.receber(pedido(), usuario);

        assertThat(r.status()).isEqualTo(StatusOperacaoSincronizacao.RESOLVIDO);
        assertThat(r.backofficeInformado()).isFalse();
        assertThat(r.idsRegistros()).containsExactly(gravado);
        verify(casos, never()).save(any());
    }

    @Test
    void recusaViraCasoComOMotivoParaOApp() {
        when(aplicacao.aplicar(any(), any(), any(), any()))
                .thenThrow(new InvarianteVioladaException("Não é possível apontar a programação #12: ela foi cancelada ou excluída."));

        var r = useCases.receber(pedido(), usuario);

        assertThat(r.status()).isEqualTo(StatusOperacaoSincronizacao.EM_TRATAMENTO);
        assertThat(r.backofficeInformado()).isTrue();
        assertThat(r.motivo()).contains("cancelada");
        verify(casos).save(any(CasoSincronizacao.class));
    }

    @Test
    void diagnosticoDeObrasOrientaQuemTrata() {
        var d = DiagnosticoCasoSincronizacao.obras("conclua a apr do dia antes de apontar a execução.", "x");
        assertThat(d.codigo()).isEqualTo("OBRA_SEM_APR");
        assertThat(DiagnosticoCasoSincronizacao.obras("ela foi cancelada ou excluída", "x").codigo()).isEqualTo("OBRA_PROGRAMACAO_ALTERADA");
        assertThat(DiagnosticoCasoSincronizacao.obras("qualquer outra coisa", "x")).isNull();
        assertThat(AplicacaoImediataObras.comando(TipoOperacaoSincronizacao.OBRA_APR_CONCLUSAO)).isEqualTo(CampoObrasApi.Comando.APR_CONCLUSAO);
    }
}
