package com.nexo.app.modules.avaliacao.application.usecases;

import com.nexo.app.modules.avaliacao.application.dto.AvaliacaoDtos.Facilidade;
import com.nexo.app.modules.avaliacao.application.dto.AvaliacaoDtos.Origem;
import com.nexo.app.modules.avaliacao.application.dto.AvaliacaoDtos.Problema;
import com.nexo.app.modules.avaliacao.application.dto.AvaliacaoDtos.RespostaRequest;
import com.nexo.app.modules.avaliacao.infrastructure.persistence.AvaliacaoRepository;
import com.nexo.app.modules.avaliacao.infrastructure.persistence.AvaliacaoRepository.Campanha;
import com.nexo.app.modules.avaliacao.infrastructure.persistence.AvaliacaoRepository.Participacao;
import com.nexo.app.modules.avaliacao.infrastructure.persistence.AvaliacaoRepository.Resposta;
import com.nexo.app.modules.iam.UsuarioApi;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AvaliacaoUseCasesTest {

    private static final Instant AGORA = Instant.parse("2026-11-20T15:00:00Z");
    private static final OffsetDateTime AGORA_ODT = AGORA.atOffset(ZoneOffset.UTC);
    private static final UUID USUARIO = UUID.randomUUID();

    private AvaliacaoRepository repository;
    private UsuarioApi usuarioApi;
    private AvaliacaoUseCases useCases;
    private Campanha campanha;

    @BeforeEach
    void setUp() {
        repository = mock(AvaliacaoRepository.class);
        usuarioApi = mock(UsuarioApi.class);
        useCases = new AvaliacaoUseCases(repository, usuarioApi, Clock.fixed(AGORA, ZoneOffset.UTC));
        campanha = new Campanha(UUID.randomUUID(), "Avaliação do GEO", AGORA_ODT.minusDays(2),
                AGORA_ODT.plusDays(28), null);
        when(repository.buscarAberta(any())).thenReturn(Optional.of(campanha));
        when(repository.buscarCampanha(campanha.id())).thenReturn(Optional.of(campanha));
    }

    private void participacao(Participacao p) {
        when(repository.buscarParticipacao(campanha.id(), USUARIO)).thenReturn(Optional.ofNullable(p));
    }

    private static RespostaRequest resposta(boolean anonima) {
        return new RespostaRequest(Origem.CAMPO, 4, Facilidade.FACIL,
                List.of(Problema.LENTIDAO, Problema.LENTIDAO, Problema.LOGIN), "  ", " Mais filtros ", anonima, "main-ABC.js");
    }

    // ── Convite ──────────────────────────────────────────────────────────────

    @Test
    void semPesquisaNoArNaoHaConvite() {
        when(repository.buscarAberta(any())).thenReturn(Optional.empty());
        assertThat(useCases.convite(USUARIO)).isEmpty();
    }

    @Test
    void quemNuncaViuEhConvidado() {
        participacao(null);
        var convite = useCases.convite(USUARIO).orElseThrow();
        assertThat(convite.convidar()).isTrue();
        assertThat(convite.jaRespondeu()).isFalse();
        assertThat(convite.ultimaVez()).isFalse();
    }

    @Test
    void adiadoSoVoltaDepoisDoPrazo() {
        participacao(new Participacao("ADIADA", AGORA_ODT.plusHours(1), 1));
        assertThat(useCases.convite(USUARIO).orElseThrow().convidar()).isFalse();

        participacao(new Participacao("ADIADA", AGORA_ODT.minusMinutes(1), 1));
        assertThat(useCases.convite(USUARIO).orElseThrow().convidar()).isTrue();
    }

    @Test
    void depoisDoMaximoDeAdiamentosAAparicaoEhAUltima() {
        participacao(new Participacao("ADIADA", AGORA_ODT.minusMinutes(1), AvaliacaoUseCases.MAX_ADIAMENTOS));
        assertThat(useCases.convite(USUARIO).orElseThrow().ultimaVez()).isTrue();
    }

    @Test
    void quemRespondeuOuRecusouNaoEhMaisConvidado() {
        participacao(new Participacao("RESPONDIDA", null, 0));
        var respondida = useCases.convite(USUARIO).orElseThrow();
        assertThat(respondida.convidar()).isFalse();
        assertThat(respondida.jaRespondeu()).isTrue();

        participacao(new Participacao("RECUSADA", null, 3));
        assertThat(useCases.convite(USUARIO).orElseThrow().convidar()).isFalse();
    }

    // ── Resposta ─────────────────────────────────────────────────────────────

    @Test
    void respostaAnonimaNaoGravaOUsuarioEGuardaSoAData() {
        when(repository.marcarRespondida(eq(campanha.id()), eq(USUARIO), any())).thenReturn(true);

        useCases.responder(campanha.id(), USUARIO, resposta(true));

        ArgumentCaptor<Resposta> captor = ArgumentCaptor.forClass(Resposta.class);
        verify(repository).inserirResposta(captor.capture());
        Resposta gravada = captor.getValue();
        assertThat(gravada.idUsuario()).isNull();
        assertThat(gravada.respondidaEm()).isEqualTo(LocalDate.of(2026, 11, 20));
        assertThat(gravada.problemas()).containsExactly("LENTIDAO", "LOGIN");
        assertThat(gravada.problemaDetalhe()).isNull();
        assertThat(gravada.sugestao()).isEqualTo("Mais filtros");
    }

    @Test
    void respostaIdentificadaGravaOUsuario() {
        when(repository.marcarRespondida(eq(campanha.id()), eq(USUARIO), any())).thenReturn(true);
        useCases.responder(campanha.id(), USUARIO, resposta(false));

        ArgumentCaptor<Resposta> captor = ArgumentCaptor.forClass(Resposta.class);
        verify(repository).inserirResposta(captor.capture());
        assertThat(captor.getValue().idUsuario()).isEqualTo(USUARIO);
    }

    @Test
    void segundaRespostaNaMesmaPesquisaEhRecusada() {
        when(repository.marcarRespondida(eq(campanha.id()), eq(USUARIO), any())).thenReturn(false);

        assertThatThrownBy(() -> useCases.responder(campanha.id(), USUARIO, resposta(false)))
                .isInstanceOf(InvarianteVioladaException.class);
        verify(repository, never()).inserirResposta(any());
    }

    @Test
    void pesquisaEncerradaNaoAceitaResposta() {
        Campanha encerrada = new Campanha(campanha.id(), "x", campanha.inicio(), campanha.fim(), AGORA_ODT.minusHours(1));
        when(repository.buscarCampanha(campanha.id())).thenReturn(Optional.of(encerrada));

        assertThatThrownBy(() -> useCases.responder(campanha.id(), USUARIO, resposta(false)))
                .isInstanceOf(InvarianteVioladaException.class);
        verify(repository, never()).marcarRespondida(any(), any(), any());
    }

    // ── Adiar e recusar ──────────────────────────────────────────────────────

    @Test
    void adiarSomaUmEEscondePorTresDias() {
        participacao(new Participacao("ADIADA", AGORA_ODT.minusDays(1), 1));
        useCases.adiar(campanha.id(), USUARIO);

        ArgumentCaptor<Participacao> captor = ArgumentCaptor.forClass(Participacao.class);
        verify(repository).salvarParticipacao(eq(campanha.id()), eq(USUARIO), captor.capture(), any());
        assertThat(captor.getValue().adiamentos()).isEqualTo(2);
        assertThat(captor.getValue().adiadaAte()).isEqualTo(AGORA_ODT.plusDays(3));
    }

    @Test
    void adiarDepoisDeResponderNaoMudaNada() {
        participacao(new Participacao("RESPONDIDA", null, 0));
        useCases.adiar(campanha.id(), USUARIO);
        verify(repository, never()).salvarParticipacao(any(), any(), any(), any());
    }

    @Test
    void recusarNaoApagaUmaRespostaJaDada() {
        participacao(new Participacao("RESPONDIDA", null, 0));
        useCases.recusar(campanha.id(), USUARIO);
        verify(repository, never()).salvarParticipacao(any(), any(), any(), any());
    }

    // ── Painel ───────────────────────────────────────────────────────────────

    @Test
    void resumoContaEstrelasProblemasEAnonimas() {
        when(repository.listarRespostas(campanha.id(), null)).thenReturn(List.of(
                new Resposta(UUID.randomUUID(), campanha.id(), null, "CAMPO", 5, "FACIL", List.of("LENTIDAO"),
                        null, "boa", null, LocalDate.now()),
                new Resposta(UUID.randomUUID(), campanha.id(), USUARIO, "WEB", 2, "DIFICIL",
                        List.of("LENTIDAO", "LOGIN"), "trava", null, null, LocalDate.now())));
        when(repository.contarParticipacoes(campanha.id(), "ADIADA")).thenReturn(4L);
        when(repository.contarParticipacoes(campanha.id(), "RECUSADA")).thenReturn(1L);

        var resumo = useCases.resumo(campanha.id(), null);

        assertThat(resumo.respostas()).isEqualTo(2);
        assertThat(resumo.mediaEstrelas()).isEqualTo(3.5);
        assertThat(resumo.porEstrelas()).containsEntry(5, 1L).containsEntry(2, 1L).containsEntry(1, 0L);
        assertThat(resumo.porProblema()).containsEntry("LENTIDAO", 2L).containsEntry("LOGIN", 1L);
        assertThat(resumo.porOrigem()).containsEntry("WEB", 1L).containsEntry("CAMPO", 1L);
        assertThat(resumo.anonimas()).isEqualTo(1);
        assertThat(resumo.comSugestao()).isEqualTo(1);
        assertThat(resumo.adiaram()).isEqualTo(4);
        assertThat(resumo.recusaram()).isEqualTo(1);
    }

    @Test
    void listaNomeiaSoQuemNaoFoiAnonimo() {
        when(repository.listarRespostas(campanha.id(), "WEB")).thenReturn(List.of(
                new Resposta(UUID.randomUUID(), campanha.id(), null, "WEB", 5, null, List.of(), null, null, null,
                        LocalDate.now()),
                new Resposta(UUID.randomUUID(), campanha.id(), USUARIO, "WEB", 3, null, List.of(), null, null, null,
                        LocalDate.now())));
        when(usuarioApi.buscarLoginsPorIds(any())).thenReturn(Map.of(USUARIO, "USR123456"));

        var itens = useCases.listarRespostas(campanha.id(), Origem.WEB);

        assertThat(itens).extracting("autor").containsExactly(null, "USR123456");
    }

    @Test
    void listaSemIdentificadosNaoConsultaUsuarios() {
        when(repository.listarRespostas(eq(campanha.id()), anyString())).thenReturn(List.of());
        useCases.listarRespostas(campanha.id(), Origem.CAMPO);
        verify(usuarioApi, never()).buscarLoginsPorIds(any());
    }
}
