package com.nexo.app.modules.frota.infrastructure.persistence;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

/**
 * Resumos derivados da série de posições: por dia e veículo, por turno (com as notas) e por
 * abastecimento, mais a posição aprendida de cada posto.
 *
 * <p>JDBC direto, como {@link PosicaoTelemetriaRepository}: são linhas calculadas pelo servidor,
 * recalculáveis a qualquer momento e sem auditoria. Cada gravação substitui a anterior.</p>
 */
@Repository
@RequiredArgsConstructor
public class AnaliseTelemetriaRepository {

    private static final String FUSO = "America/Sao_Paulo";

    private final JdbcTemplate jdbc;

    public record Dia(UUID idVeiculo, LocalDate dia, UUID idRastreador, double km, int minutosMovimento,
                      int minutosLigadoParado, double kmForaExpediente, int minutosForaExpediente,
                      OffsetDateTime primeiraPartida, OffsetDateTime ultimaParada, int pontos) {
    }

    public record Turno(UUID idTurno, UUID idVeiculo, UUID idEquipe, UUID idBaseOperacional, OffsetDateTime inicio,
                        OffsetDateTime fim, boolean comTelemetria, double km, int minutosMovimento,
                        int minutosParadoServico, int minutosParadoBase, int minutosParadoSemServico,
                        int minutosLigadoParado, OffsetDateTime saidaBaseEm, OffsetDateTime chegadaBaseEm, int notas,
                        BigDecimal valorFaturado, int notasNoLocal, int notasForaLocal, int notasSemDado) {
    }

    public record NotaTurno(UUID idExecucao, UUID idTurno, OffsetDateTime lancadoEm, String situacao,
                            Integer distanciaMetros, Double latitudeNota, Double longitudeNota, Double latitudeVeiculo,
                            Double longitudeVeiculo, BigDecimal valor) {
    }

    public record AbastecimentoAnalisado(UUID idAbastecimento, UUID idVeiculo, UUID idPosto, OffsetDateTime realizadoEm,
                                         String situacao, Double latitude, Double longitude, Double velocidadeKmh,
                                         Integer distanciaPostoMetros) {
    }

    public record PostoLocalizado(UUID idPosto, double latitude, double longitude, int amostras, int dispersaoMetros) {
    }

    /** Veículo e dia (São Paulo) com posições de um rastreador vinculado. */
    public record VeiculoDia(UUID idVeiculo, LocalDate dia) {
    }

    // ── Dias ───────────────────────────────────────────────────────────────────────

    /**
     * Veículos e dias com posição desde {@code desde} ainda sem resumo, do mais antigo ao mais novo.
     * Os dias de hoje e de ontem o job recalcula sempre; aqui entra o histórico e o rastreador
     * vinculado depois.
     */
    public List<VeiculoDia> diasSemResumo(OffsetDateTime desde, OffsetDateTime ate, int limite) {
        return jdbc.query("""
                        SELECT x.id_veiculo, x.dia FROM (
                            SELECT DISTINCT r.id_veiculo, (p.lido_em AT TIME ZONE '%s')::date AS dia
                            FROM frota_telemetria_posicoes p
                            JOIN frota_telemetria_rastreadores r ON r.id = p.id_rastreador
                            WHERE r.id_veiculo IS NOT NULL AND r.ativo AND p.lido_em >= ? AND p.lido_em < ?
                        ) x
                        WHERE NOT EXISTS (SELECT 1 FROM frota_telemetria_dias d WHERE d.id_veiculo = x.id_veiculo AND d.dia = x.dia)
                        ORDER BY x.dia LIMIT ?
                        """.formatted(FUSO),
                (rs, i) -> new VeiculoDia(rs.getObject("id_veiculo", UUID.class), rs.getDate("dia").toLocalDate()),
                ts(desde), ts(ate), limite);
    }

    /** Instante da posição mais antiga guardada; nulo sem nenhuma (os turnos de antes não têm o que cruzar). */
    public OffsetDateTime primeiraPosicao() {
        Timestamp t = jdbc.queryForObject("SELECT min(lido_em) FROM frota_telemetria_posicoes", Timestamp.class);
        return t == null ? null : t.toInstant().atOffset(ZoneOffset.UTC);
    }

    /** Veículos com posição de um rastreador vinculado no intervalo. */
    public List<UUID> veiculosComPosicao(OffsetDateTime de, OffsetDateTime ate) {
        return jdbc.queryForList("""
                        SELECT DISTINCT r.id_veiculo FROM frota_telemetria_posicoes p
                        JOIN frota_telemetria_rastreadores r ON r.id = p.id_rastreador
                        WHERE r.id_veiculo IS NOT NULL AND r.ativo AND p.lido_em >= ? AND p.lido_em < ?
                        """, UUID.class, ts(de), ts(ate));
    }

    /** Rastreador do veículo que mais transmitiu no intervalo (com dois equipamentos, os pontos não se misturam). */
    public UUID rastreadorPrincipal(Collection<UUID> idsRastreador, OffsetDateTime de, OffsetDateTime ate) {
        if (idsRastreador.isEmpty()) return null;
        var params = new ArrayList<Object>(idsRastreador);
        params.add(ts(de));
        params.add(ts(ate));
        var ids = jdbc.queryForList("SELECT id_rastreador FROM frota_telemetria_posicoes WHERE id_rastreador IN ("
                        + marcadores(idsRastreador.size()) + ") AND lido_em >= ? AND lido_em < ? "
                        + "GROUP BY id_rastreador ORDER BY count(*) DESC LIMIT 1",
                UUID.class, params.toArray());
        return ids.isEmpty() ? null : ids.get(0);
    }

    public void gravarDia(Dia d) {
        jdbc.update("""
                        INSERT INTO frota_telemetria_dias (id_veiculo, dia, id_rastreador, km, minutos_movimento, minutos_ligado_parado,
                            km_fora_expediente, minutos_fora_expediente, primeira_partida, ultima_parada, pontos, calculado_em)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                        ON CONFLICT (id_veiculo, dia) DO UPDATE SET id_rastreador = EXCLUDED.id_rastreador, km = EXCLUDED.km,
                            minutos_movimento = EXCLUDED.minutos_movimento, minutos_ligado_parado = EXCLUDED.minutos_ligado_parado,
                            km_fora_expediente = EXCLUDED.km_fora_expediente, minutos_fora_expediente = EXCLUDED.minutos_fora_expediente,
                            primeira_partida = EXCLUDED.primeira_partida, ultima_parada = EXCLUDED.ultima_parada,
                            pontos = EXCLUDED.pontos, calculado_em = CURRENT_TIMESTAMP
                        """,
                d.idVeiculo(), Date.valueOf(d.dia()), d.idRastreador(), km(d.km()), d.minutosMovimento(), d.minutosLigadoParado(),
                km(d.kmForaExpediente()), d.minutosForaExpediente(), ts(d.primeiraPartida()), ts(d.ultimaParada()), d.pontos());
    }

    public List<Dia> listarDias(LocalDate de, LocalDate ate) {
        return jdbc.query("SELECT * FROM frota_telemetria_dias WHERE dia >= ? AND dia <= ? ORDER BY dia",
                this::dia, Date.valueOf(de), Date.valueOf(ate));
    }

    /** Primeiro dia com resumo de cada veículo: antes dele não havia rastreador para medir o uso. */
    public Map<UUID, LocalDate> primeiroDiaPorVeiculo() {
        var mapa = new HashMap<UUID, LocalDate>();
        jdbc.query("SELECT id_veiculo, min(dia) AS dia FROM frota_telemetria_dias GROUP BY id_veiculo",
                (RowCallbackHandler) rs -> mapa.put(rs.getObject("id_veiculo", UUID.class),
                        rs.getDate("dia").toLocalDate()));
        return mapa;
    }

    public List<Dia> listarDiasDosVeiculos(Collection<UUID> idsVeiculo, LocalDate de, LocalDate ate) {
        if (idsVeiculo.isEmpty()) return List.of();
        var params = new ArrayList<Object>(idsVeiculo);
        params.add(Date.valueOf(de));
        params.add(Date.valueOf(ate));
        return jdbc.query("SELECT * FROM frota_telemetria_dias WHERE id_veiculo IN (" + marcadores(idsVeiculo.size())
                + ") AND dia >= ? AND dia <= ? ORDER BY dia", this::dia, params.toArray());
    }

    public List<Dia> listarDiasDoVeiculo(UUID idVeiculo, LocalDate de, LocalDate ate) {
        return jdbc.query("SELECT * FROM frota_telemetria_dias WHERE id_veiculo = ? AND dia >= ? AND dia <= ? ORDER BY dia",
                this::dia, idVeiculo, Date.valueOf(de), Date.valueOf(ate));
    }

    // ── Turnos ─────────────────────────────────────────────────────────────────────

    /** Dos turnos informados, os que já têm resumo. */
    public Set<UUID> turnosResumidos(Collection<UUID> idsTurno) {
        if (idsTurno.isEmpty()) return Set.of();
        return Set.copyOf(jdbc.queryForList("SELECT id_turno FROM frota_telemetria_turnos WHERE id_turno IN ("
                + marcadores(idsTurno.size()) + ")", UUID.class, idsTurno.toArray()));
    }

    public void gravarTurno(Turno t, List<NotaTurno> notas) {
        jdbc.update("""
                        INSERT INTO frota_telemetria_turnos (id_turno, id_veiculo, id_equipe, id_base_operacional, inicio, fim,
                            com_telemetria, km, minutos_movimento, minutos_parado_servico, minutos_parado_base,
                            minutos_parado_sem_servico, minutos_ligado_parado, saida_base_em, chegada_base_em, notas,
                            valor_faturado, notas_no_local, notas_fora_local, notas_sem_dado, calculado_em)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                        ON CONFLICT (id_turno) DO UPDATE SET id_veiculo = EXCLUDED.id_veiculo, id_equipe = EXCLUDED.id_equipe,
                            id_base_operacional = EXCLUDED.id_base_operacional, inicio = EXCLUDED.inicio, fim = EXCLUDED.fim,
                            com_telemetria = EXCLUDED.com_telemetria, km = EXCLUDED.km,
                            minutos_movimento = EXCLUDED.minutos_movimento, minutos_parado_servico = EXCLUDED.minutos_parado_servico,
                            minutos_parado_base = EXCLUDED.minutos_parado_base,
                            minutos_parado_sem_servico = EXCLUDED.minutos_parado_sem_servico,
                            minutos_ligado_parado = EXCLUDED.minutos_ligado_parado, saida_base_em = EXCLUDED.saida_base_em,
                            chegada_base_em = EXCLUDED.chegada_base_em, notas = EXCLUDED.notas,
                            valor_faturado = EXCLUDED.valor_faturado, notas_no_local = EXCLUDED.notas_no_local,
                            notas_fora_local = EXCLUDED.notas_fora_local, notas_sem_dado = EXCLUDED.notas_sem_dado,
                            calculado_em = CURRENT_TIMESTAMP
                        """,
                t.idTurno(), t.idVeiculo(), t.idEquipe(), t.idBaseOperacional(), ts(t.inicio()), ts(t.fim()), t.comTelemetria(),
                km(t.km()), t.minutosMovimento(), t.minutosParadoServico(), t.minutosParadoBase(), t.minutosParadoSemServico(),
                t.minutosLigadoParado(), ts(t.saidaBaseEm()), ts(t.chegadaBaseEm()), t.notas(), t.valorFaturado(),
                t.notasNoLocal(), t.notasForaLocal(), t.notasSemDado());
        jdbc.update("DELETE FROM frota_telemetria_turno_notas WHERE id_turno = ?", t.idTurno());
        // Uma nota trocada de turno sai do anterior: a chave é a execução.
        jdbc.batchUpdate("""
                        INSERT INTO frota_telemetria_turno_notas (id_execucao, id_turno, lancado_em, situacao, distancia_metros,
                            latitude_nota, longitude_nota, latitude_veiculo, longitude_veiculo, valor)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT (id_execucao) DO UPDATE SET id_turno = EXCLUDED.id_turno, lancado_em = EXCLUDED.lancado_em,
                            situacao = EXCLUDED.situacao, distancia_metros = EXCLUDED.distancia_metros,
                            latitude_nota = EXCLUDED.latitude_nota, longitude_nota = EXCLUDED.longitude_nota,
                            latitude_veiculo = EXCLUDED.latitude_veiculo, longitude_veiculo = EXCLUDED.longitude_veiculo,
                            valor = EXCLUDED.valor
                        """,
                notas.stream().map(n -> new Object[]{n.idExecucao(), n.idTurno(), ts(n.lancadoEm()), n.situacao(),
                        n.distanciaMetros(), n.latitudeNota(), n.longitudeNota(), n.latitudeVeiculo(), n.longitudeVeiculo(),
                        n.valor()}).toList());
    }

    /** Resumos gravados dos turnos informados. */
    public List<Turno> listarTurnosPorIds(Collection<UUID> idsTurno) {
        if (idsTurno.isEmpty()) return List.of();
        return jdbc.query("SELECT * FROM frota_telemetria_turnos WHERE id_turno IN (" + marcadores(idsTurno.size()) + ")",
                this::turno, idsTurno.toArray());
    }

    /** Turnos resumidos que começaram em {@code [de, ate)}. */
    public List<Turno> listarTurnos(OffsetDateTime de, OffsetDateTime ate) {
        return jdbc.query("SELECT * FROM frota_telemetria_turnos WHERE inicio >= ? AND inicio < ? ORDER BY inicio DESC",
                this::turno, ts(de), ts(ate));
    }

    public List<NotaTurno> listarNotasPorSituacao(OffsetDateTime de, OffsetDateTime ate, String situacao) {
        return jdbc.query("SELECT * FROM frota_telemetria_turno_notas WHERE lancado_em >= ? AND lancado_em < ? AND situacao = ? "
                + "ORDER BY lancado_em DESC", this::notaTurno, ts(de), ts(ate), situacao);
    }

    // ── Abastecimentos e postos ────────────────────────────────────────────────────

    public record AbastecimentoRealizado(UUID id, UUID idVeiculo, UUID idPosto, OffsetDateTime realizadoEm) {
    }

    /** Abastecimentos realizados em {@code [de, ate)}. */
    public List<AbastecimentoRealizado> realizados(OffsetDateTime de, OffsetDateTime ate) {
        return jdbc.query("SELECT id, id_veiculo, id_posto, realizado_em FROM frota_abastecimentos "
                        + "WHERE ativo AND situacao = 'REALIZADA' AND realizado_em >= ? AND realizado_em < ? ORDER BY realizado_em",
                (rs, i) -> new AbastecimentoRealizado(rs.getObject("id", UUID.class), rs.getObject("id_veiculo", UUID.class),
                        rs.getObject("id_posto", UUID.class), odt(rs, "realizado_em")), ts(de), ts(ate));
    }

    /** Valor de todos os itens e litros de combustível de cada abastecimento informado (a chave do gasto é o abastecimento). */
    public Map<UUID, Gasto> valoresPorAbastecimento(Collection<UUID> ids) {
        if (ids.isEmpty()) return Map.of();
        var linhas = jdbc.query("""
                        SELECT i.id_abastecimento AS id_veiculo, COALESCE(sum(i.valor_total), 0) AS valor,
                               COALESCE(sum(CASE WHEN p.categoria = 'COMBUSTIVEL' THEN i.quantidade END), 0) AS litros
                        FROM frota_abastecimento_itens i LEFT JOIN frota_produtos_abastecimento p ON p.id = i.id_produto
                        WHERE i.id_abastecimento IN (%s) GROUP BY i.id_abastecimento
                        """.formatted(marcadores(ids.size())), this::gasto, ids.toArray());
        return linhas.stream().collect(Collectors.toMap(Gasto::idVeiculo, g -> g));
    }

    public Set<UUID> abastecimentosAnalisados(Collection<UUID> ids) {
        if (ids.isEmpty()) return Set.of();
        return Set.copyOf(jdbc.queryForList("SELECT id_abastecimento FROM frota_telemetria_abastecimentos WHERE id_abastecimento IN ("
                + marcadores(ids.size()) + ")", UUID.class, ids.toArray()));
    }

    public void gravarAbastecimentos(List<AbastecimentoAnalisado> lista) {
        jdbc.batchUpdate("""
                        INSERT INTO frota_telemetria_abastecimentos (id_abastecimento, id_veiculo, id_posto, realizado_em, situacao,
                            latitude, longitude, velocidade_kmh, distancia_posto_metros, calculado_em)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                        ON CONFLICT (id_abastecimento) DO UPDATE SET id_veiculo = EXCLUDED.id_veiculo, id_posto = EXCLUDED.id_posto,
                            realizado_em = EXCLUDED.realizado_em, situacao = EXCLUDED.situacao, latitude = EXCLUDED.latitude,
                            longitude = EXCLUDED.longitude, velocidade_kmh = EXCLUDED.velocidade_kmh,
                            distancia_posto_metros = EXCLUDED.distancia_posto_metros, calculado_em = CURRENT_TIMESTAMP
                        """,
                lista.stream().map(a -> new Object[]{a.idAbastecimento(), a.idVeiculo(), a.idPosto(), ts(a.realizadoEm()),
                        a.situacao(), a.latitude(), a.longitude(),
                        a.velocidadeKmh() == null ? null : BigDecimal.valueOf(a.velocidadeKmh()).setScale(1, RoundingMode.HALF_UP),
                        a.distanciaPostoMetros()}).toList());
    }

    public Optional<AbastecimentoAnalisado> buscarAbastecimento(UUID idAbastecimento) {
        return jdbc.query("SELECT * FROM frota_telemetria_abastecimentos WHERE id_abastecimento = ?", this::abastecimento,
                idAbastecimento).stream().findFirst();
    }

    /** Abastecimentos analisados realizados em {@code [de, ate)}, do mais recente ao mais antigo. */
    public List<AbastecimentoAnalisado> listarAbastecimentos(OffsetDateTime de, OffsetDateTime ate) {
        return jdbc.query("SELECT * FROM frota_telemetria_abastecimentos WHERE realizado_em >= ? AND realizado_em < ? "
                + "ORDER BY realizado_em DESC", this::abastecimento, ts(de), ts(ate));
    }

    /** Todas as análises com posição desde {@code desde}: as amostras de onde cada posto fica. */
    public List<AbastecimentoAnalisado> listarAbastecimentosComPosicao(OffsetDateTime desde) {
        return jdbc.query("SELECT * FROM frota_telemetria_abastecimentos WHERE realizado_em >= ? AND latitude IS NOT NULL",
                this::abastecimento, ts(desde));
    }

    public void substituirPostos(List<PostoLocalizado> postos) {
        jdbc.update("DELETE FROM frota_telemetria_postos");
        jdbc.batchUpdate("INSERT INTO frota_telemetria_postos (id_posto, latitude, longitude, amostras, dispersao_metros) "
                        + "VALUES (?, ?, ?, ?, ?)",
                postos.stream().map(p -> new Object[]{p.idPosto(), p.latitude(), p.longitude(), p.amostras(), p.dispersaoMetros()})
                        .toList());
    }

    public List<PostoLocalizado> listarPostos() {
        return jdbc.query("SELECT * FROM frota_telemetria_postos", (rs, i) -> new PostoLocalizado(rs.getObject("id_posto", UUID.class),
                rs.getDouble("latitude"), rs.getDouble("longitude"), rs.getInt("amostras"), rs.getInt("dispersao_metros")));
    }

    // ── Custos ─────────────────────────────────────────────────────────────────────

    /** Valor e litros de combustível (a chave depende da consulta: veículo ou abastecimento). */
    public record Gasto(UUID idVeiculo, BigDecimal valor, BigDecimal litros) {
    }

    /** Gasto do veículo num dia (São Paulo). O custo por km soma só os dias em que o veículo já era medido. */
    public record GastoDia(UUID idVeiculo, LocalDate dia, BigDecimal valor, BigDecimal litros) {
    }

    /** Abastecimentos realizados em {@code [de, ate)}: valor de todos os itens e litros de combustível. */
    public List<GastoDia> gastosAbastecimento(OffsetDateTime de, OffsetDateTime ate) {
        return jdbc.query("""
                        SELECT a.id_veiculo, (a.realizado_em AT TIME ZONE '%s')::date AS dia, COALESCE(sum(i.valor_total), 0) AS valor,
                               COALESCE(sum(CASE WHEN p.categoria = 'COMBUSTIVEL' THEN i.quantidade END), 0) AS litros
                        FROM frota_abastecimentos a
                        JOIN frota_abastecimento_itens i ON i.id_abastecimento = a.id
                        LEFT JOIN frota_produtos_abastecimento p ON p.id = i.id_produto
                        WHERE a.ativo AND a.situacao = 'REALIZADA' AND a.realizado_em >= ? AND a.realizado_em < ?
                        GROUP BY 1, 2
                        """.formatted(FUSO), this::gastoDia, ts(de), ts(ate));
    }

    /** OS concluídas em {@code [de, ate)}, pelo valor total. */
    public List<GastoDia> gastosManutencao(OffsetDateTime de, OffsetDateTime ate) {
        return jdbc.query("""
                        SELECT id_veiculo, (fim_real AT TIME ZONE '%s')::date AS dia, COALESCE(sum(valor_total), 0) AS valor, 0 AS litros
                        FROM frota_ordens_servico
                        WHERE ativo AND id_veiculo IS NOT NULL AND situacao = 'CONCLUIDA' AND fim_real >= ? AND fim_real < ?
                        GROUP BY 1, 2
                        """.formatted(FUSO), this::gastoDia, ts(de), ts(ate));
    }

    /** Despesas com data em {@code [de, ate]}, menos as de pagamento reprovado. */
    public List<GastoDia> gastosDespesas(LocalDate de, LocalDate ate) {
        return jdbc.query("""
                        SELECT id_veiculo, data AS dia, COALESCE(sum(valor), 0) AS valor, 0 AS litros FROM frota_despesas
                        WHERE ativo AND data >= ? AND data <= ? AND (situacao_pagamento IS NULL OR situacao_pagamento <> 'REPROVADO')
                        GROUP BY 1, 2
                        """, this::gastoDia, Date.valueOf(de), Date.valueOf(ate));
    }

    private Gasto gasto(ResultSet rs, int i) throws SQLException {
        return new Gasto(rs.getObject("id_veiculo", UUID.class), rs.getBigDecimal("valor"), rs.getBigDecimal("litros"));
    }

    private GastoDia gastoDia(ResultSet rs, int i) throws SQLException {
        return new GastoDia(rs.getObject("id_veiculo", UUID.class), rs.getDate("dia").toLocalDate(), rs.getBigDecimal("valor"),
                rs.getBigDecimal("litros"));
    }

    // ── Mapeamento ─────────────────────────────────────────────────────────────────

    private Dia dia(ResultSet rs, int i) throws SQLException {
        return new Dia(rs.getObject("id_veiculo", UUID.class), rs.getDate("dia").toLocalDate(),
                rs.getObject("id_rastreador", UUID.class), rs.getDouble("km"), rs.getInt("minutos_movimento"),
                rs.getInt("minutos_ligado_parado"), rs.getDouble("km_fora_expediente"), rs.getInt("minutos_fora_expediente"),
                odt(rs, "primeira_partida"), odt(rs, "ultima_parada"), rs.getInt("pontos"));
    }

    private Turno turno(ResultSet rs, int i) throws SQLException {
        return new Turno(rs.getObject("id_turno", UUID.class), rs.getObject("id_veiculo", UUID.class),
                rs.getObject("id_equipe", UUID.class), rs.getObject("id_base_operacional", UUID.class), odt(rs, "inicio"),
                odt(rs, "fim"), rs.getBoolean("com_telemetria"), rs.getDouble("km"), rs.getInt("minutos_movimento"),
                rs.getInt("minutos_parado_servico"), rs.getInt("minutos_parado_base"), rs.getInt("minutos_parado_sem_servico"),
                rs.getInt("minutos_ligado_parado"), odt(rs, "saida_base_em"), odt(rs, "chegada_base_em"), rs.getInt("notas"),
                rs.getBigDecimal("valor_faturado"), rs.getInt("notas_no_local"), rs.getInt("notas_fora_local"),
                rs.getInt("notas_sem_dado"));
    }

    private NotaTurno notaTurno(ResultSet rs, int i) throws SQLException {
        return new NotaTurno(rs.getObject("id_execucao", UUID.class), rs.getObject("id_turno", UUID.class),
                odt(rs, "lancado_em"), rs.getString("situacao"), inteiro(rs, "distancia_metros"),
                decimal(rs, "latitude_nota"), decimal(rs, "longitude_nota"), decimal(rs, "latitude_veiculo"),
                decimal(rs, "longitude_veiculo"), rs.getBigDecimal("valor"));
    }

    private AbastecimentoAnalisado abastecimento(ResultSet rs, int i) throws SQLException {
        BigDecimal velocidade = rs.getBigDecimal("velocidade_kmh");
        return new AbastecimentoAnalisado(rs.getObject("id_abastecimento", UUID.class), rs.getObject("id_veiculo", UUID.class),
                rs.getObject("id_posto", UUID.class), odt(rs, "realizado_em"), rs.getString("situacao"),
                decimal(rs, "latitude"), decimal(rs, "longitude"), velocidade == null ? null : velocidade.doubleValue(),
                inteiro(rs, "distancia_posto_metros"));
    }

    private static OffsetDateTime odt(ResultSet rs, String coluna) throws SQLException {
        Timestamp t = rs.getTimestamp(coluna);
        return t == null ? null : t.toInstant().atOffset(ZoneOffset.UTC);
    }

    private static Double decimal(ResultSet rs, String coluna) throws SQLException {
        double v = rs.getDouble(coluna);
        return rs.wasNull() ? null : v;
    }

    private static Integer inteiro(ResultSet rs, String coluna) throws SQLException {
        int v = rs.getInt(coluna);
        return rs.wasNull() ? null : v;
    }

    private static Timestamp ts(OffsetDateTime instante) {
        return instante == null ? null : Timestamp.from(instante.toInstant());
    }

    private static BigDecimal km(double km) {
        return BigDecimal.valueOf(km).setScale(1, RoundingMode.HALF_UP);
    }

    private static String marcadores(int n) {
        return IntStream.range(0, n).mapToObj(i -> "?").collect(Collectors.joining(","));
    }
}
