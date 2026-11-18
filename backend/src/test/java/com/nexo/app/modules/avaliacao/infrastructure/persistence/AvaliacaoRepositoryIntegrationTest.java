package com.nexo.app.modules.avaliacao.infrastructure.persistence;

import com.nexo.app.modules.avaliacao.infrastructure.persistence.AvaliacaoRepository.Campanha;
import com.nexo.app.modules.avaliacao.infrastructure.persistence.AvaliacaoRepository.Participacao;
import com.nexo.app.modules.avaliacao.infrastructure.persistence.AvaliacaoRepository.Resposta;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class AvaliacaoRepositoryIntegrationTest {

    @Autowired AvaliacaoRepository repository;
    @Autowired JdbcTemplate jdbc;

    private final OffsetDateTime agora = OffsetDateTime.now(ZoneOffset.UTC);
    private final LocalDate hoje = LocalDate.now();

    @BeforeEach
    void criarTabelasEquivalentesNoH2() {
        // Testes rodam em H2 com Flyway desligado: as mesmas tabelas da V250.
        jdbc.execute("DROP TABLE IF EXISTS avaliacao_respostas");
        jdbc.execute("DROP TABLE IF EXISTS avaliacao_participacoes");
        jdbc.execute("DROP TABLE IF EXISTS avaliacao_campanhas");
        jdbc.execute("""
                CREATE TABLE avaliacao_campanhas (
                    id UUID PRIMARY KEY, titulo VARCHAR(120) NOT NULL,
                    inicio TIMESTAMP WITH TIME ZONE NOT NULL, fim TIMESTAMP WITH TIME ZONE NOT NULL,
                    encerrada_em TIMESTAMP WITH TIME ZONE,
                    data_criacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL)""");
        jdbc.execute("""
                CREATE TABLE avaliacao_participacoes (
                    id_campanha UUID NOT NULL, id_usuario UUID NOT NULL, situacao VARCHAR(20) NOT NULL,
                    adiada_ate TIMESTAMP WITH TIME ZONE, adiamentos INTEGER DEFAULT 0 NOT NULL,
                    data_situacao DATE NOT NULL, PRIMARY KEY (id_campanha, id_usuario))""");
        jdbc.execute("""
                CREATE TABLE avaliacao_respostas (
                    id UUID PRIMARY KEY, id_campanha UUID NOT NULL, id_usuario UUID, origem VARCHAR(10) NOT NULL,
                    estrelas SMALLINT NOT NULL, facilidade VARCHAR(10), problemas VARCHAR(200) DEFAULT '' NOT NULL,
                    problema_detalhe VARCHAR(1000), sugestao VARCHAR(2000), versao_app VARCHAR(60),
                    respondida_em DATE NOT NULL)""");
    }

    private Campanha campanha(OffsetDateTime inicio, OffsetDateTime fim) {
        Campanha c = new Campanha(UUID.randomUUID(), "Avaliação", inicio, fim, null);
        repository.inserirCampanha(c);
        return c;
    }

    @Test
    void encontraSoACampanhaAbertaEDeixaDeEncontrarAoEncerrar() {
        campanha(agora.minusDays(60), agora.minusDays(30));
        Campanha aberta = campanha(agora.minusDays(1), agora.plusDays(29));

        assertThat(repository.buscarAberta(agora)).map(Campanha::id).contains(aberta.id());

        repository.encerrarCampanha(aberta.id(), agora);
        assertThat(repository.buscarAberta(agora)).isEmpty();
        assertThat(repository.listarCampanhas()).hasSize(2);
    }

    @Test
    void participacaoCriaESubstitui() {
        Campanha c = campanha(agora.minusDays(1), agora.plusDays(1));
        UUID usuario = UUID.randomUUID();

        repository.salvarParticipacao(c.id(), usuario, new Participacao("ADIADA", agora.plusDays(3), 1), hoje);
        repository.salvarParticipacao(c.id(), usuario, new Participacao("ADIADA", agora.plusDays(6), 2), hoje);

        Participacao p = repository.buscarParticipacao(c.id(), usuario).orElseThrow();
        assertThat(p.adiamentos()).isEqualTo(2);
        assertThat(repository.contarParticipacoes(c.id(), "ADIADA")).isEqualTo(1);
    }

    @Test
    void marcarRespondidaSoFuncionaUmaVez() {
        Campanha c = campanha(agora.minusDays(1), agora.plusDays(1));
        UUID adiou = UUID.randomUUID();
        UUID novo = UUID.randomUUID();
        repository.salvarParticipacao(c.id(), adiou, new Participacao("ADIADA", agora.plusDays(3), 1), hoje);

        assertThat(repository.marcarRespondida(c.id(), adiou, hoje)).isTrue();
        assertThat(repository.marcarRespondida(c.id(), adiou, hoje)).isFalse();
        assertThat(repository.marcarRespondida(c.id(), novo, hoje)).isTrue();
        assertThat(repository.marcarRespondida(c.id(), novo, hoje)).isFalse();
        assertThat(repository.buscarParticipacao(c.id(), adiou).orElseThrow().adiadaAte()).isNull();
    }

    @Test
    void respostaIdaEVoltaComProblemasEFiltroDeOrigem() {
        Campanha c = campanha(agora.minusDays(1), agora.plusDays(1));
        repository.inserirResposta(new Resposta(UUID.randomUUID(), c.id(), null, "CAMPO", 4, "FACIL",
                List.of("LENTIDAO", "LOGIN"), null, "Mais filtros", "main-X.js", hoje));
        repository.inserirResposta(new Resposta(UUID.randomUUID(), c.id(), UUID.randomUUID(), "WEB", 2, null,
                List.of(), "Trava no login", null, null, hoje));

        List<Resposta> campo = repository.listarRespostas(c.id(), "CAMPO");
        assertThat(campo).singleElement().satisfies(r -> {
            assertThat(r.idUsuario()).isNull();
            assertThat(r.problemas()).containsExactly("LENTIDAO", "LOGIN");
            assertThat(r.sugestao()).isEqualTo("Mais filtros");
        });
        assertThat(repository.listarRespostas(c.id(), null)).hasSize(2);
        assertThat(repository.listarRespostas(c.id(), "WEB").get(0).problemas()).isEmpty();
        assertThat(repository.contarRespostas(c.id())).isEqualTo(2);
    }

    @Test
    void migracaoNaoTemColunaQueLigueRespostaAParticipacaoNemHoraNaResposta() throws IOException {
        String sql = new ClassPathResource("db/migration/V260__Avaliacao_App.sql")
                .getContentAsString(StandardCharsets.UTF_8);
        String respostas = sql.substring(sql.indexOf("CREATE TABLE avaliacao_respostas"));
        respostas = respostas.substring(0, respostas.indexOf(");"));

        assertThat(respostas).doesNotContain("usuario_criacao", "data_criacao", "TIMESTAMP", "id_participacao");
        assertThat(sql).contains("'avaliacao:read'", "'avaliacao:manage'");
    }
}
