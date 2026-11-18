package com.nexo.app.modules.avaliacao.infrastructure.persistence;

import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Persistência da avaliação do aplicativo.
 *
 * <p>JDBC direto, sem JPA, de propósito: a entidade JPA passaria pelo
 * {@code AuditListener}, que grava o login de quem criou a linha — e isso, numa resposta
 * anônima, desfaria o anonimato. Aqui só vai para o banco o que está escrito no INSERT.</p>
 *
 * @author <b>Thalisson</b>
 */
@Repository
@RequiredArgsConstructor
public class AvaliacaoRepository {

    private final JdbcTemplate jdbc;

    public record Campanha(UUID id, String titulo, OffsetDateTime inicio, OffsetDateTime fim,
                           OffsetDateTime encerradaEm) {

        public boolean abertaEm(OffsetDateTime instante) {
            return encerradaEm == null && !instante.isBefore(inicio) && instante.isBefore(fim);
        }
    }

    public record Participacao(String situacao, OffsetDateTime adiadaAte, int adiamentos) {
    }

    public record Resposta(UUID id, UUID idCampanha, UUID idUsuario, String origem, int estrelas,
                           String facilidade, List<String> problemas, String problemaDetalhe,
                           String sugestao, String versaoApp, LocalDate respondidaEm) {
    }

    // ── Campanhas ────────────────────────────────────────────────────────────

    private static final String COLUNAS_CAMPANHA = "id, titulo, inicio, fim, encerrada_em";

    /** A campanha aberta agora; havendo mais de uma, a que começou por último. */
    public Optional<Campanha> buscarAberta(OffsetDateTime agora) {
        return jdbc.query("SELECT " + COLUNAS_CAMPANHA + " FROM avaliacao_campanhas "
                        + "WHERE encerrada_em IS NULL AND inicio <= ? AND fim > ? ORDER BY inicio DESC",
                        (rs, i) -> campanha(rs), ts(agora), ts(agora))
                .stream().findFirst();
    }

    public Optional<Campanha> buscarCampanha(UUID id) {
        return jdbc.query("SELECT " + COLUNAS_CAMPANHA + " FROM avaliacao_campanhas WHERE id = ?",
                (rs, i) -> campanha(rs), id).stream().findFirst();
    }

    public List<Campanha> listarCampanhas() {
        return jdbc.query("SELECT " + COLUNAS_CAMPANHA + " FROM avaliacao_campanhas ORDER BY inicio DESC",
                (rs, i) -> campanha(rs));
    }

    public void inserirCampanha(Campanha c) {
        jdbc.update("INSERT INTO avaliacao_campanhas (id, titulo, inicio, fim) VALUES (?, ?, ?, ?)",
                c.id(), c.titulo(), ts(c.inicio()), ts(c.fim()));
    }

    public void encerrarCampanha(UUID id, OffsetDateTime quando) {
        jdbc.update("UPDATE avaliacao_campanhas SET encerrada_em = ? WHERE id = ? AND encerrada_em IS NULL",
                ts(quando), id);
    }

    public long contarRespostas(UUID idCampanha) {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM avaliacao_respostas WHERE id_campanha = ?",
                Long.class, idCampanha);
        return n == null ? 0 : n;
    }

    // ── Participações ────────────────────────────────────────────────────────

    public Optional<Participacao> buscarParticipacao(UUID idCampanha, UUID idUsuario) {
        return jdbc.query("SELECT situacao, adiada_ate, adiamentos FROM avaliacao_participacoes "
                        + "WHERE id_campanha = ? AND id_usuario = ?",
                (rs, i) -> new Participacao(rs.getString("situacao"), odt(rs.getTimestamp("adiada_ate")),
                        rs.getInt("adiamentos")),
                idCampanha, idUsuario).stream().findFirst();
    }

    /** Grava a participação inteira (cria ou substitui). */
    public void salvarParticipacao(UUID idCampanha, UUID idUsuario, Participacao p, LocalDate hoje) {
        int alteradas = jdbc.update("UPDATE avaliacao_participacoes SET situacao = ?, adiada_ate = ?, "
                        + "adiamentos = ?, data_situacao = ? WHERE id_campanha = ? AND id_usuario = ?",
                p.situacao(), ts(p.adiadaAte()), p.adiamentos(), Date.valueOf(hoje), idCampanha, idUsuario);
        if (alteradas == 0) {
            jdbc.update("INSERT INTO avaliacao_participacoes "
                            + "(id_campanha, id_usuario, situacao, adiada_ate, adiamentos, data_situacao) "
                            + "VALUES (?, ?, ?, ?, ?, ?)",
                    idCampanha, idUsuario, p.situacao(), ts(p.adiadaAte()), p.adiamentos(), Date.valueOf(hoje));
        }
    }

    /**
     * Marca a participação como respondida, uma única vez.
     *
     * <p>Atômico de propósito: dois envios simultâneos (duplo toque, aba e celular ao mesmo
     * tempo) não podem gerar duas respostas. O UPDATE condicional e a chave primária do
     * INSERT garantem que só um dos dois ganhe.</p>
     *
     * @return {@code false} quando o usuário já tinha respondido nesta campanha
     */
    public boolean marcarRespondida(UUID idCampanha, UUID idUsuario, LocalDate hoje) {
        int alteradas = jdbc.update("UPDATE avaliacao_participacoes SET situacao = 'RESPONDIDA', adiada_ate = NULL, "
                        + "data_situacao = ? WHERE id_campanha = ? AND id_usuario = ? AND situacao <> 'RESPONDIDA'",
                Date.valueOf(hoje), idCampanha, idUsuario);
        if (alteradas > 0) {
            return true;
        }
        if (buscarParticipacao(idCampanha, idUsuario).isPresent()) {
            return false;
        }
        try {
            jdbc.update("INSERT INTO avaliacao_participacoes "
                            + "(id_campanha, id_usuario, situacao, adiamentos, data_situacao) "
                            + "VALUES (?, ?, 'RESPONDIDA', 0, ?)",
                    idCampanha, idUsuario, Date.valueOf(hoje));
            return true;
        } catch (DuplicateKeyException corrida) {
            return false;
        }
    }

    public long contarParticipacoes(UUID idCampanha, String situacao) {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM avaliacao_participacoes "
                + "WHERE id_campanha = ? AND situacao = ?", Long.class, idCampanha, situacao);
        return n == null ? 0 : n;
    }

    // ── Respostas ────────────────────────────────────────────────────────────

    public void inserirResposta(Resposta r) {
        jdbc.update("INSERT INTO avaliacao_respostas (id, id_campanha, id_usuario, origem, estrelas, facilidade, "
                        + "problemas, problema_detalhe, sugestao, versao_app, respondida_em) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                r.id(), r.idCampanha(), r.idUsuario(), r.origem(), r.estrelas(), r.facilidade(),
                String.join(",", r.problemas()), r.problemaDetalhe(), r.sugestao(), r.versaoApp(),
                Date.valueOf(r.respondidaEm()));
    }

    /**
     * Respostas da campanha, das mais recentes para as mais antigas.
     *
     * <p>A ordem secundária é o id (aleatório), e não a ordem de gravação: listar na ordem
     * de chegada permitiria parear a enésima resposta do dia com a enésima participação.</p>
     */
    public List<Resposta> listarRespostas(UUID idCampanha, String origem) {
        String sql = "SELECT id, id_campanha, id_usuario, origem, estrelas, facilidade, problemas, problema_detalhe, "
                + "sugestao, versao_app, respondida_em FROM avaliacao_respostas WHERE id_campanha = ?"
                + (origem == null ? "" : " AND origem = ?")
                + " ORDER BY respondida_em DESC, id";
        Object[] params = origem == null ? new Object[]{idCampanha} : new Object[]{idCampanha, origem};
        return jdbc.query(sql, (rs, i) -> resposta(rs), params);
    }

    // ── Mapeamento ───────────────────────────────────────────────────────────

    private static Campanha campanha(ResultSet rs) throws SQLException {
        return new Campanha(rs.getObject("id", UUID.class), rs.getString("titulo"),
                odt(rs.getTimestamp("inicio")), odt(rs.getTimestamp("fim")), odt(rs.getTimestamp("encerrada_em")));
    }

    private static Resposta resposta(ResultSet rs) throws SQLException {
        String problemas = rs.getString("problemas");
        return new Resposta(rs.getObject("id", UUID.class), rs.getObject("id_campanha", UUID.class),
                rs.getObject("id_usuario", UUID.class), rs.getString("origem"), rs.getInt("estrelas"),
                rs.getString("facilidade"),
                problemas == null || problemas.isBlank() ? List.of() : Arrays.asList(problemas.split(",")),
                rs.getString("problema_detalhe"), rs.getString("sugestao"), rs.getString("versao_app"),
                rs.getDate("respondida_em").toLocalDate());
    }

    private static Timestamp ts(OffsetDateTime valor) {
        return valor == null ? null : Timestamp.from(valor.toInstant());
    }

    private static OffsetDateTime odt(Timestamp valor) {
        return valor == null ? null : valor.toInstant().atOffset(ZoneOffset.UTC);
    }
}
