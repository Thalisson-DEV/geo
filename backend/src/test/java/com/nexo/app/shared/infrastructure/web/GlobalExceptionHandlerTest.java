package com.nexo.app.shared.infrastructure.web;

import com.nexo.app.shared.infrastructure.ratelimit.DecisaoRateLimit;
import com.nexo.app.shared.infrastructure.ratelimit.PoliticaRateLimit;
import com.nexo.app.shared.infrastructure.ratelimit.RateLimitExcedidoException;
import com.nexo.app.shared.domain.exception.ConflitoVersaoException;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.PreenchimentoInvalidoException;
import org.junit.jupiter.api.Test;
import org.springframework.security.authorization.AuthorizationDeniedException;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void rateLimitRetornaRfc7807429ERetryAfter() {
        var decisao = new DecisaoRateLimit(PoliticaRateLimit.LOOKUP, DecisaoRateLimit.Resultado.BLOQUEADA,
                300, java.time.Duration.ofMinutes(1), 3);
        var response = handler.handleRateLimitExcedido(new RateLimitExcedidoException(decisao));

        org.assertj.core.api.Assertions.assertThat(response.getStatusCode().value()).isEqualTo(429);
        org.assertj.core.api.Assertions.assertThat(response.getHeaders().getFirst("Retry-After")).isEqualTo("3");
        org.assertj.core.api.Assertions.assertThat(response.getHeaders().getFirst("RateLimit-Policy"))
                .isEqualTo("\"lookup\";q=300;w=60");
        org.assertj.core.api.Assertions.assertThat(response.getHeaders().getFirst("RateLimit"))
                .isEqualTo("\"lookup\";r=0;t=3");
        org.assertj.core.api.Assertions.assertThat(response.getBody().getProperties())
                .containsEntry("retryAfter", 3L)
                .containsEntry("code", "RATE_LIMIT");
        org.assertj.core.api.Assertions.assertThat(response.getBody().getDetail())
                .isEqualTo("Muitas buscas em pouco tempo. Tente de novo em 3 segundos.");
    }

    @Test
    void tempoDeEsperaEmLinguagemDePessoa() {
        org.assertj.core.api.Assertions.assertThat(GlobalExceptionHandler.tempoDeEspera(1)).isEqualTo("1 segundo");
        org.assertj.core.api.Assertions.assertThat(GlobalExceptionHandler.tempoDeEspera(59)).isEqualTo("59 segundos");
        org.assertj.core.api.Assertions.assertThat(GlobalExceptionHandler.tempoDeEspera(60)).isEqualTo("1 minuto");
        org.assertj.core.api.Assertions.assertThat(GlobalExceptionHandler.tempoDeEspera(61)).isEqualTo("2 minutos");
    }

    @Test
    void expoeErrosTecnicosPorCampoComCodigoEstavel() {
        var problem = handler.handlePreenchimentoInvalidoException(
                new PreenchimentoInvalidoException(Map.of("ocorrencia", "A ocorrencia e obrigatoria.")));

        assertThat(problem.getProperties()).containsEntry("code", "OCORRENCIA_OBRIGATORIA");
        assertThat(problem.getProperties().get("fieldErrors").toString())
                .contains("OCORRENCIA_OBRIGATORIA");
    }

    @Test
    void retornaConflitoParaVersaoObsoleta() {
        var problem = handler.handleInvarianteVioladaException(
                new InvarianteVioladaException("A versao da solicitacao esta desatualizada."));

        assertThat(problem.getStatus()).isEqualTo(409);
        assertThat(problem.getProperties()).containsEntry("code", "VERSAO_DESATUALIZADA");
    }

    @Test
    void retornaVersoesEstruturadasParaRecarregarRecurso() {
        var problem = handler.handleConflitoVersaoException(new ConflitoVersaoException(
                ConflitoVersaoException.Recurso.SOLICITACAO, 3L, 4L));

        assertThat(problem.getStatus()).isEqualTo(409);
        assertThat(problem.getProperties())
                .containsEntry("code", "VERSAO_DESATUALIZADA")
                .containsEntry("recurso", "SOLICITACAO")
                .containsEntry("versaoEsperada", 3L)
                .containsEntry("versaoAtual", 4L);
    }

    @Test
    void retornaConflitoPreservandoErrosPorFilhoQuandoVersaoEstaObsoleta() {
        var problem = handler.handlePreenchimentoInvalidoException(
                new PreenchimentoInvalidoException(Map.of(
                        "versoesFilhos[77777777-7777-7777-7777-777777777771]",
                        "A versao do filho esta desatualizada.")));

        assertThat(problem.getStatus()).isEqualTo(409);
        assertThat(problem.getProperties()).containsEntry("code", "VERSAO_DESATUALIZADA");
        assertThat(problem.getProperties().get("fieldErrors").toString())
                .contains("VERSAO_DESATUALIZADA")
                .contains("versoesFilhos");
    }

    @Test
    void retornaForbiddenParaAutoridadeAusente() {
        var problem = handler.handleAuthorizationDeniedException(new AuthorizationDeniedException("negado"));

        assertThat(problem.getStatus()).isEqualTo(403);
    }

    @Test
    void preenchimentoInvalidoExpoeErrorsNoFormatoDoContrato() {
        var problem = handler.handlePreenchimentoInvalidoException(
                new PreenchimentoInvalidoException(Map.of("ocorrencia", "A ocorrencia e obrigatoria.")));

        assertThat(problem.getProperties().get("errors").toString())
                .contains("field=ocorrencia")
                .contains("message=A ocorrencia e obrigatoria.")
                .contains("code=OCORRENCIA_OBRIGATORIA");
    }

    @Test
    void estadoInvalidoERegraDeNegocioSao422ComCodigo() {
        var estado = handler.handleIllegalState(new IllegalStateException("Turno já encerrado."));
        assertThat(estado.getStatus()).isEqualTo(422);
        assertThat(estado.getProperties()).containsEntry("code", "ESTADO_INVALIDO");

        var regra = handler.handleValidationException(new jakarta.validation.ValidationException("Fora do prazo."));
        assertThat(regra.getStatus()).isEqualTo(422);
        assertThat(regra.getProperties()).containsEntry("code", "REGRA_NEGOCIO_VIOLADA");
    }

    @Test
    void ordenacaoPorCampoInexistenteE400() {
        var ex = new org.springframework.data.core.PropertyReferenceException(
                "campoQueNaoExiste", org.springframework.data.core.TypeInformation.of(Object.class), java.util.List.of());
        var problem = handler.handlePropertyReference(ex);
        assertThat(problem.getStatus()).isEqualTo(400);
        assertThat(problem.getProperties()).containsEntry("code", "ORDENACAO_INVALIDA");
    }
}
