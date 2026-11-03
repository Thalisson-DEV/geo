package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.FonteTelemetria;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Série de posições dos rastreadores, base do km calibrado e do consumo pela telemetria.
 *
 * <p>JDBC direto, como {@code TelemetriaMobileRepository}: é dado bruto de sensor, de alto
 * volume e só inserção. Passar pelo {@code AuditListener} geraria uma linha de auditoria por
 * posição. A mesma posição relida não duplica ({@code (id_rastreador, lido_em)} é único).</p>
 */
@Repository
@RequiredArgsConstructor
public class PosicaoTelemetriaRepository {

    private final JdbcTemplate jdbc;

    /** Ponto da série: odômetro em metros e horímetro em horas, quando o provedor informa. */
    public record Ponto(OffsetDateTime lidoEm, Double latitude, Double longitude, Double velocidadeKmh, Boolean ignicao,
                        Long odometroMetros, Double horimetroHoras) {
    }

    public void inserir(UUID idRastreador, FonteTelemetria.Leitura l) {
        jdbc.update("""
                        INSERT INTO frota_telemetria_posicoes
                            (id_rastreador, lido_em, latitude, longitude, velocidade_kmh, ignicao, odometro_metros, horimetro_horas)
                        SELECT ?, ?, ?, ?, ?, ?, ?, ?
                        WHERE NOT EXISTS (SELECT 1 FROM frota_telemetria_posicoes WHERE id_rastreador = ? AND lido_em = ?)
                        """,
                ps -> {
                    Timestamp lidoEm = Timestamp.from(l.lidoEm().toInstant());
                    ps.setObject(1, idRastreador);
                    ps.setTimestamp(2, lidoEm);
                    setDouble(ps, 3, l.latitude());
                    setDouble(ps, 4, l.longitude());
                    if (l.velocidadeKmh() == null || l.velocidadeKmh() < 0) ps.setNull(5, Types.NUMERIC);
                    else ps.setBigDecimal(5, BigDecimal.valueOf(Math.min(l.velocidadeKmh(), 99999.0)).setScale(1, RoundingMode.HALF_UP));
                    if (l.ignicao() == null) ps.setNull(6, Types.BOOLEAN);
                    else ps.setBoolean(6, l.ignicao());
                    if (l.odometroMetros() == null) ps.setNull(7, Types.BIGINT);
                    else ps.setLong(7, l.odometroMetros());
                    if (l.horimetroHoras() == null) ps.setNull(8, Types.NUMERIC);
                    else ps.setBigDecimal(8, BigDecimal.valueOf(l.horimetroHoras()).setScale(1, RoundingMode.HALF_UP));
                    ps.setObject(9, idRastreador);
                    ps.setTimestamp(10, lidoEm);
                });
    }

    /**
     * Ponto com odômetro (ou horímetro) no instante: o último até ele, dentro da tolerância; sem
     * isso, o primeiro depois dele, também dentro da tolerância.
     */
    public Optional<Ponto> pontoEm(Collection<UUID> idsRastreador, OffsetDateTime instante, Duration tolerancia,
                                   boolean horimetro) {
        if (idsRastreador.isEmpty()) {
            return Optional.empty();
        }
        String coluna = horimetro ? "horimetro_horas" : "odometro_metros";
        String ids = String.join(",", idsRastreador.stream().map(id -> "?").toList());
        Object[] antes = parametros(idsRastreador, instante.minus(tolerancia), instante);
        var anterior = jdbc.query("SELECT * FROM frota_telemetria_posicoes WHERE id_rastreador IN (" + ids + ") AND "
                + coluna + " IS NOT NULL AND lido_em >= ? AND lido_em <= ? ORDER BY lido_em DESC LIMIT 1", this::ponto, antes);
        if (!anterior.isEmpty()) {
            return Optional.of(anterior.get(0));
        }
        Object[] depois = parametros(idsRastreador, instante, instante.plus(tolerancia));
        var posterior = jdbc.query("SELECT * FROM frota_telemetria_posicoes WHERE id_rastreador IN (" + ids + ") AND "
                + coluna + " IS NOT NULL AND lido_em > ? AND lido_em <= ? ORDER BY lido_em ASC LIMIT 1", this::ponto, depois);
        return posterior.stream().findFirst();
    }

    /** Pontos do período, em ordem, para desenhar o trajeto (no máximo {@code limite}). */
    public List<Ponto> trajeto(Collection<UUID> idsRastreador, OffsetDateTime de, OffsetDateTime ate, int limite) {
        if (idsRastreador.isEmpty()) {
            return List.of();
        }
        String ids = String.join(",", idsRastreador.stream().map(id -> "?").toList());
        Object[] p = parametros(idsRastreador, de, ate);
        Object[] comLimite = Arrays.copyOf(p, p.length + 1);
        comLimite[p.length] = limite;
        return jdbc.query("SELECT * FROM frota_telemetria_posicoes WHERE id_rastreador IN (" + ids
                + ") AND lido_em >= ? AND lido_em <= ? AND latitude IS NOT NULL ORDER BY lido_em ASC LIMIT ?", this::ponto, comLimite);
    }

    /** Retenção (LGPD): apaga as posições lidas antes do limite. */
    public int apagarAntesDe(OffsetDateTime limite) {
        return jdbc.update("DELETE FROM frota_telemetria_posicoes WHERE lido_em < ?", Timestamp.from(limite.toInstant()));
    }

    private static Object[] parametros(Collection<UUID> ids, OffsetDateTime de, OffsetDateTime ate) {
        Object[] p = new Object[ids.size() + 2];
        int i = 0;
        for (UUID id : ids) p[i++] = id;
        p[i++] = Timestamp.from(de.toInstant());
        p[i] = Timestamp.from(ate.toInstant());
        return p;
    }

    private Ponto ponto(ResultSet rs, int linha) throws SQLException {
        BigDecimal velocidade = rs.getBigDecimal("velocidade_kmh");
        BigDecimal horimetro = rs.getBigDecimal("horimetro_horas");
        long odometro = rs.getLong("odometro_metros");
        boolean semOdometro = rs.wasNull();
        boolean ignicao = rs.getBoolean("ignicao");
        boolean semIgnicao = rs.wasNull();
        double lat = rs.getDouble("latitude");
        boolean semLat = rs.wasNull();
        double lng = rs.getDouble("longitude");
        boolean semLng = rs.wasNull();
        return new Ponto(rs.getTimestamp("lido_em").toInstant().atOffset(ZoneOffset.UTC),
                semLat ? null : lat, semLng ? null : lng,
                velocidade == null ? null : velocidade.doubleValue(),
                semIgnicao ? null : ignicao,
                semOdometro ? null : odometro,
                horimetro == null ? null : horimetro.doubleValue());
    }

    private static void setDouble(PreparedStatement ps, int i, Double v) throws SQLException {
        if (v == null || v.isNaN()) ps.setNull(i, Types.DOUBLE);
        else ps.setDouble(i, v);
    }
}
