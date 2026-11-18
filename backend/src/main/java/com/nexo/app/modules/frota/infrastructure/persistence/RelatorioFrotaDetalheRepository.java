package com.nexo.app.modules.frota.infrastructure.persistence;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

/**
 * Registros de origem dos dashboards da frota: as OS, abastecimentos, lançamentos de custo,
 * documentos e pendências que compõem cada número. Só consulta; intervalos de instante são
 * {@code [inicio, fim)}.
 */
@Repository
@RequiredArgsConstructor
public class RelatorioFrotaDetalheRepository {

    static final String FUSO = "America/Sao_Paulo";

    private final NamedParameterJdbcTemplate jdbc;

    // ── Registros ──────────────────────────────────────────────────────────────────

    public record Lancamento(String categoria, UUID id, Long numero, OffsetDateTime data, UUID idVeiculo, String descricao,
                             String contraparte, BigDecimal valor) {
    }

    public record Os(UUID id, Long numero, UUID idVeiculo, String tipoManutencao, String origem, String causa,
                     String criticidade, String tipoOficina, String oficina, BigDecimal valor, BigDecimal valorPecas,
                     BigDecimal valorServicos, OffsetDateTime abertaEm, OffsetDateTime inicioReal, OffsetDateTime fimReal,
                     boolean veiculoParado, OffsetDateTime paradoDesde, OffsetDateTime liberadoEm,
                     OffsetDateTime finalizadaEm, String descricao) {
    }

    public record OsAberta(UUID id, Long numero, UUID idVeiculo, String placa, String situacao, String tipoManutencao,
                           String origem, String criticidade, String tipoOficina, String oficina, OffsetDateTime abertaEm,
                           OffsetDateTime agendadaPara, OffsetDateTime previsaoTermino, boolean veiculoParado,
                           OffsetDateTime paradoDesde, String descricao) {
    }

    public record ItemOs(UUID idOs, String item, String tipo, boolean retrabalho) {
    }

    public record PecaOs(UUID idOs, String descricao, String origem, BigDecimal quantidade, String unidade, BigDecimal valor) {
    }

    public record ServicoOs(UUID idOs, String descricao, String mecanico, BigDecimal valor) {
    }

    public record Abastecimento(UUID id, OffsetDateTime realizadoEm, UUID idVeiculo, UUID idPosto, String posto,
                                UUID idCondutor, String origem, BigDecimal litros, BigDecimal valorCombustivel,
                                BigDecimal valorTotal, String produtos, BigDecimal medicao, BigDecimal kmDesdeAnterior,
                                BigDecimal horasAprovacao, List<String> alertas) {
    }

    public record Documento(UUID id, UUID idVeiculo, String tipo, String descricao, LocalDate vencimento, boolean comArquivo) {
    }

    public record Condutor(UUID id, UUID idColaborador, String categoria, LocalDate validade) {
    }

    public record Vinculo(UUID idColaborador, UUID idVeiculo, String placa) {
    }

    public record Pendencia(UUID id, UUID idChecklist, UUID idVeiculo, String item, String grupo, OffsetDateTime abertaEm,
                            String comentario, UUID idOrdemServico) {
    }

    // ── Custos ─────────────────────────────────────────────────────────────────────

    /** Fatos de custo do período, um por registro: OS concluídas, despesas, abastecimentos e franquias. */
    public List<Lancamento> lancamentos(Collection<UUID> veiculos, OffsetDateTime inicio, OffsetDateTime fim, boolean os,
                                        boolean despesas, boolean abastecimentos, boolean franquias) {
        if (veiculos.isEmpty() || !(os || despesas || abastecimentos || franquias)) return List.of();
        StringBuilder sql = new StringBuilder("SELECT * FROM (");
        String uniao = "";
        if (os) {
            sql.append("""
                    SELECT 'MANUTENCAO' AS categoria, o.id, o.numero, o.fim_real AS data, o.id_veiculo,
                           LEFT(o.descricao, 160) AS descricao,
                           COALESCE(NULLIF(TRIM(o.oficina_nome), ''), CASE o.tipo_oficina WHEN 'INTERNA' THEN 'Oficina interna' ELSE 'Oficina externa' END) AS contraparte,
                           COALESCE(o.valor_total, 0) AS valor
                    FROM frota_ordens_servico o
                    WHERE o.ativo = true AND o.situacao = 'CONCLUIDA' AND o.id_veiculo IN (:veiculos)
                      AND o.fim_real >= :inicio AND o.fim_real < :fim AND COALESCE(o.valor_total, 0) <> 0
                    """);
            uniao = " UNION ALL ";
        }
        if (despesas) {
            sql.append(uniao).append("""
                    SELECT 'DESPESAS', d.id, NULL::bigint, (d.data::timestamp AT TIME ZONE :fuso), d.id_veiculo,
                           t.nome || COALESCE(' · ' || NULLIF(TRIM(d.descricao), ''), ''), d.fornecedor_nome, d.valor
                    FROM frota_despesas d
                    JOIN frota_tipos_despesa t ON t.id = d.id_tipo
                    WHERE d.ativo = true AND COALESCE(d.situacao_pagamento, '') <> 'REPROVADO' AND d.id_veiculo IN (:veiculos)
                      AND d.data >= (:inicio AT TIME ZONE :fuso)::date AND d.data < (:fim AT TIME ZONE :fuso)::date
                    """);
            uniao = " UNION ALL ";
        }
        if (abastecimentos) {
            sql.append(uniao).append("""
                    SELECT 'COMBUSTIVEL', a.id, NULL::bigint, a.realizado_em, a.id_veiculo, 'Abastecimento', po.nome,
                           COALESCE((SELECT SUM(i.valor_total) FROM frota_abastecimento_itens i
                                     WHERE i.id_abastecimento = a.id AND i.ativo = true), 0)
                    FROM frota_abastecimentos a
                    JOIN frota_postos po ON po.id = a.id_posto
                    WHERE a.ativo = true AND a.situacao = 'REALIZADA' AND a.id_veiculo IN (:veiculos)
                      AND a.realizado_em >= :inicio AND a.realizado_em < :fim
                    """);
            uniao = " UNION ALL ";
        }
        if (franquias) {
            sql.append(uniao).append("""
                    SELECT 'FRANQUIAS', s.id, s.numero, s.ocorrido_em, s.id_veiculo, 'Franquia do sinistro', NULL, s.franquia_paga
                    FROM frota_sinistros s
                    WHERE s.ativo = true AND COALESCE(s.situacao, '') <> 'CANCELADO' AND s.id_veiculo IN (:veiculos)
                      AND s.ocorrido_em >= :inicio AND s.ocorrido_em < :fim AND COALESCE(s.franquia_paga, 0) <> 0
                    """);
        }
        sql.append(") l ORDER BY valor DESC");
        return jdbc.query(sql.toString(), periodo(veiculos, inicio, fim), (rs, i) -> new Lancamento(rs.getString("categoria"),
                uuid(rs, "id"), longo(rs, "numero"), instante(rs, "data"), uuid(rs, "id_veiculo"), rs.getString("descricao"),
                rs.getString("contraparte"), rs.getBigDecimal("valor")));
    }

    // ── Manutenção ─────────────────────────────────────────────────────────────────

    public List<Os> osConcluidas(Collection<UUID> veiculos, OffsetDateTime inicio, OffsetDateTime fim) {
        if (veiculos.isEmpty()) return List.of();
        return jdbc.query("""
                SELECT o.id, o.numero, o.id_veiculo, o.tipo_manutencao, o.origem, o.causa, o.criticidade, o.tipo_oficina,
                       COALESCE(NULLIF(TRIM(o.oficina_nome), ''), CASE o.tipo_oficina WHEN 'INTERNA' THEN 'Oficina interna' ELSE 'Oficina externa' END) AS oficina,
                       COALESCE(o.valor_total, 0) AS valor,
                       COALESCE((SELECT SUM(p.subtotal) FROM frota_os_pecas p WHERE p.id_ordem_servico = o.id AND p.ativo = true), 0) AS pecas,
                       COALESCE((SELECT SUM(s.subtotal) FROM frota_os_servicos s WHERE s.id_ordem_servico = o.id AND s.ativo = true), 0) AS servicos,
                       o.aberta_em, o.inicio_real, o.fim_real, o.veiculo_parado, o.parado_desde, o.liberado_em, o.finalizada_em,
                       LEFT(o.descricao, 300) AS descricao
                FROM frota_ordens_servico o
                WHERE o.ativo = true AND o.situacao = 'CONCLUIDA' AND o.id_veiculo IN (:veiculos)
                  AND o.fim_real >= :inicio AND o.fim_real < :fim
                ORDER BY o.fim_real DESC
                """, periodo(veiculos, inicio, fim), (rs, i) -> new Os(uuid(rs, "id"), longo(rs, "numero"),
                uuid(rs, "id_veiculo"), rs.getString("tipo_manutencao"), rs.getString("origem"), rs.getString("causa"),
                rs.getString("criticidade"), rs.getString("tipo_oficina"), rs.getString("oficina"), rs.getBigDecimal("valor"),
                rs.getBigDecimal("pecas"), rs.getBigDecimal("servicos"), instante(rs, "aberta_em"), instante(rs, "inicio_real"),
                instante(rs, "fim_real"), rs.getBoolean("veiculo_parado"), instante(rs, "parado_desde"),
                instante(rs, "liberado_em"), instante(rs, "finalizada_em"), rs.getString("descricao")));
    }

    public List<OsAberta> osAbertas(Collection<UUID> veiculos) {
        if (veiculos.isEmpty()) return List.of();
        return jdbc.query("""
                SELECT o.id, o.numero, o.id_veiculo, o.placa, o.situacao, o.tipo_manutencao, o.origem, o.criticidade, o.tipo_oficina,
                       COALESCE(NULLIF(TRIM(o.oficina_nome), ''), CASE o.tipo_oficina WHEN 'INTERNA' THEN 'Oficina interna' ELSE 'Oficina externa' END) AS oficina,
                       o.aberta_em, o.agendada_para, o.previsao_termino, o.veiculo_parado AND o.liberado_em IS NULL AS parado,
                       o.parado_desde, LEFT(o.descricao, 300) AS descricao
                FROM frota_ordens_servico o
                WHERE o.ativo = true AND o.situacao IN ('PENDENTE', 'AGENDADA', 'EM_ANDAMENTO') AND o.id_veiculo IN (:veiculos)
                ORDER BY o.aberta_em
                """, new MapSqlParameterSource("veiculos", veiculos), (rs, i) -> new OsAberta(uuid(rs, "id"),
                longo(rs, "numero"), uuid(rs, "id_veiculo"), rs.getString("placa"), rs.getString("situacao"),
                rs.getString("tipo_manutencao"), rs.getString("origem"), rs.getString("criticidade"),
                rs.getString("tipo_oficina"), rs.getString("oficina"), instante(rs, "aberta_em"),
                instante(rs, "agendada_para"), instante(rs, "previsao_termino"), rs.getBoolean("parado"),
                instante(rs, "parado_desde"), rs.getString("descricao")));
    }

    /** Itens de manutenção das OS concluídas no período; {@code retrabalho} quando repetiu em até {@code dias}. */
    public List<ItemOs> itens(Collection<UUID> veiculos, OffsetDateTime inicio, OffsetDateTime fim, int dias) {
        if (veiculos.isEmpty()) return List.of();
        return jdbc.query("""
                SELECT i.id_ordem_servico, im.nome, im.tipo,
                       (i.id_os_anterior IS NOT NULL AND i.dias_desde_anterior <= :dias AND o.tipo_manutencao = 'CORRETIVA') AS retrabalho
                FROM frota_os_itens i
                JOIN frota_ordens_servico o ON o.id = i.id_ordem_servico
                JOIN frota_itens_manutencao im ON im.id = i.id_item_manutencao
                WHERE i.ativo = true AND o.ativo = true AND o.situacao = 'CONCLUIDA' AND o.id_veiculo IN (:veiculos)
                  AND o.fim_real >= :inicio AND o.fim_real < :fim
                """, periodo(veiculos, inicio, fim).addValue("dias", dias), (rs, i) -> new ItemOs(uuid(rs, "id_ordem_servico"),
                rs.getString("nome"), rs.getString("tipo"), rs.getBoolean("retrabalho")));
    }

    public List<PecaOs> pecas(Collection<UUID> veiculos, OffsetDateTime inicio, OffsetDateTime fim) {
        if (veiculos.isEmpty()) return List.of();
        return jdbc.query("""
                SELECT p.id_ordem_servico, p.descricao, p.origem, p.quantidade, p.unidade, p.subtotal
                FROM frota_os_pecas p
                JOIN frota_ordens_servico o ON o.id = p.id_ordem_servico
                WHERE p.ativo = true AND o.ativo = true AND o.situacao = 'CONCLUIDA' AND o.id_veiculo IN (:veiculos)
                  AND o.fim_real >= :inicio AND o.fim_real < :fim
                """, periodo(veiculos, inicio, fim), (rs, i) -> new PecaOs(uuid(rs, "id_ordem_servico"),
                rs.getString("descricao"), rs.getString("origem"), rs.getBigDecimal("quantidade"), rs.getString("unidade"),
                rs.getBigDecimal("subtotal")));
    }

    public List<ServicoOs> servicos(Collection<UUID> veiculos, OffsetDateTime inicio, OffsetDateTime fim) {
        if (veiculos.isEmpty()) return List.of();
        return jdbc.query("""
                SELECT s.id_ordem_servico, s.descricao, s.mecanico_nome, s.subtotal
                FROM frota_os_servicos s
                JOIN frota_ordens_servico o ON o.id = s.id_ordem_servico
                WHERE s.ativo = true AND o.ativo = true AND o.situacao = 'CONCLUIDA' AND o.id_veiculo IN (:veiculos)
                  AND o.fim_real >= :inicio AND o.fim_real < :fim
                """, periodo(veiculos, inicio, fim), (rs, i) -> new ServicoOs(uuid(rs, "id_ordem_servico"),
                rs.getString("descricao"), rs.getString("mecanico_nome"), rs.getBigDecimal("subtotal")));
    }

    // ── Combustível ────────────────────────────────────────────────────────────────

    /**
     * Abastecimentos realizados no período, com o km desde o abastecimento anterior do mesmo veículo
     * (pela medição informada, mesmo que o anterior seja de antes do período) e os alertas gerados.
     */
    public List<Abastecimento> abastecimentos(Collection<UUID> veiculos, OffsetDateTime inicio, OffsetDateTime fim) {
        if (veiculos.isEmpty()) return List.of();
        return jdbc.query("""
                WITH h AS (
                    SELECT a.id, a.medicao_realizado,
                           LAG(a.medicao_realizado) OVER (PARTITION BY a.id_veiculo ORDER BY a.realizado_em) AS anterior
                    FROM frota_abastecimentos a
                    WHERE a.ativo = true AND a.situacao = 'REALIZADA' AND a.id_veiculo IN (:veiculos) AND a.realizado_em < :fim
                )
                SELECT a.id, a.realizado_em, a.id_veiculo, a.id_posto, po.nome AS posto, a.id_condutor, a.origem,
                       it.litros, it.valor_combustivel, it.valor_total, it.produtos, a.medicao_realizado,
                       CASE WHEN h.anterior IS NOT NULL AND a.medicao_realizado > h.anterior
                            THEN a.medicao_realizado - h.anterior END AS km_anterior,
                       CASE WHEN a.aprovado_em IS NOT NULL THEN EXTRACT(EPOCH FROM (a.aprovado_em - a.solicitado_em)) / 3600.0 END AS horas_aprovacao,
                       (SELECT string_agg(DISTINCT al.tipo, ',') FROM frota_abastecimento_alertas al
                         WHERE al.id_abastecimento = a.id AND al.ativo = true) AS alertas
                FROM frota_abastecimentos a
                JOIN h ON h.id = a.id
                JOIN frota_postos po ON po.id = a.id_posto
                LEFT JOIN LATERAL (
                    SELECT COALESCE(SUM(i.quantidade) FILTER (WHERE p.categoria = 'COMBUSTIVEL'), 0) AS litros,
                           COALESCE(SUM(i.valor_total) FILTER (WHERE p.categoria = 'COMBUSTIVEL'), 0) AS valor_combustivel,
                           COALESCE(SUM(i.valor_total), 0) AS valor_total,
                           string_agg(DISTINCT p.nome, ', ') AS produtos
                    FROM frota_abastecimento_itens i
                    LEFT JOIN frota_produtos_abastecimento p ON p.id = COALESCE(i.id_produto, i.id_produto_pedido)
                    WHERE i.id_abastecimento = a.id AND i.ativo = true
                ) it ON true
                WHERE a.realizado_em >= :inicio AND a.realizado_em < :fim
                ORDER BY a.realizado_em DESC
                """, periodo(veiculos, inicio, fim), (rs, i) -> new Abastecimento(uuid(rs, "id"), instante(rs, "realizado_em"),
                uuid(rs, "id_veiculo"), uuid(rs, "id_posto"), rs.getString("posto"), uuid(rs, "id_condutor"),
                rs.getString("origem"), rs.getBigDecimal("litros"), rs.getBigDecimal("valor_combustivel"),
                rs.getBigDecimal("valor_total"), rs.getString("produtos"), rs.getBigDecimal("medicao_realizado"),
                rs.getBigDecimal("km_anterior"), rs.getBigDecimal("horas_aprovacao"), lista(rs.getString("alertas"))));
    }

    // ── Conformidade ───────────────────────────────────────────────────────────────

    /** Documento mais recente de cada tipo por veículo, com vencimento. */
    public List<Documento> documentosAtuais(Collection<UUID> veiculos) {
        if (veiculos.isEmpty()) return List.of();
        return jdbc.query("""
                SELECT DISTINCT ON (id_veiculo, tipo) id, id_veiculo, tipo, descricao, data_vencimento,
                       arquivo_chave IS NOT NULL AS com_arquivo
                FROM frota_documentos
                WHERE ativo = true AND id_veiculo IN (:veiculos) AND data_vencimento IS NOT NULL
                ORDER BY id_veiculo, tipo, data_vencimento DESC
                """, new MapSqlParameterSource("veiculos", veiculos), (rs, i) -> new Documento(uuid(rs, "id"),
                uuid(rs, "id_veiculo"), rs.getString("tipo"), rs.getString("descricao"), data(rs, "data_vencimento"),
                rs.getBoolean("com_arquivo")));
    }

    public List<Condutor> condutores() {
        return jdbc.query("""
                SELECT id, id_colaborador, cnh_categoria, cnh_validade FROM frota_condutores
                WHERE ativo = true
                ORDER BY cnh_validade NULLS FIRST
                """, new MapSqlParameterSource(), (rs, i) -> new Condutor(uuid(rs, "id"), uuid(rs, "id_colaborador"),
                rs.getString("cnh_categoria"), data(rs, "cnh_validade")));
    }

    public List<Vinculo> vinculosAtuais() {
        return jdbc.query("""
                SELECT v.id_colaborador, v.id_veiculo, f.placa
                FROM frota_vinculos_condutor v
                JOIN frota_fichas_veiculo f ON f.id_veiculo = v.id_veiculo
                WHERE v.ativo = true AND v.fim IS NULL
                """, new MapSqlParameterSource(), (rs, i) -> new Vinculo(uuid(rs, "id_colaborador"), uuid(rs, "id_veiculo"),
                rs.getString("placa")));
    }

    public List<Pendencia> pendenciasAbertas(Collection<UUID> veiculos) {
        if (veiculos.isEmpty()) return List.of();
        return jdbc.query("""
                SELECT p.id, p.id_checklist, p.id_veiculo, r.pergunta_texto, r.grupo, c.preenchido_em,
                       COALESCE(NULLIF(TRIM(r.comentario), ''), NULLIF(TRIM(r.motivo_texto), '')) AS comentario, p.id_ordem_servico
                FROM frota_checklist_pendencias p
                JOIN frota_checklist_respostas r ON r.id = p.id_resposta
                JOIN frota_checklists c ON c.id = p.id_checklist
                WHERE p.ativo = true AND p.situacao = 'ABERTA' AND p.id_veiculo IN (:veiculos)
                ORDER BY c.preenchido_em
                """, new MapSqlParameterSource("veiculos", veiculos), (rs, i) -> new Pendencia(uuid(rs, "id"),
                uuid(rs, "id_checklist"), uuid(rs, "id_veiculo"), rs.getString("pergunta_texto"), rs.getString("grupo"),
                instante(rs, "preenchido_em"), rs.getString("comentario"), uuid(rs, "id_ordem_servico")));
    }

    // ── Auxiliares ─────────────────────────────────────────────────────────────────

    private static MapSqlParameterSource periodo(Collection<UUID> veiculos, OffsetDateTime inicio, OffsetDateTime fim) {
        return new MapSqlParameterSource("veiculos", veiculos).addValue("inicio", inicio).addValue("fim", fim)
                .addValue("fuso", FUSO);
    }

    private static List<String> lista(String valor) {
        return valor == null || valor.isBlank() ? List.of() : Arrays.stream(valor.split(",")).map(String::trim).toList();
    }

    private static UUID uuid(ResultSet rs, String coluna) throws SQLException {
        return rs.getObject(coluna, UUID.class);
    }

    private static Long longo(ResultSet rs, String coluna) throws SQLException {
        long v = rs.getLong(coluna);
        return rs.wasNull() ? null : v;
    }

    private static LocalDate data(ResultSet rs, String coluna) throws SQLException {
        var d = rs.getDate(coluna);
        return d == null ? null : d.toLocalDate();
    }

    private static OffsetDateTime instante(ResultSet rs, String coluna) throws SQLException {
        Timestamp t = rs.getTimestamp(coluna);
        return t == null ? null : t.toInstant().atOffset(ZoneOffset.UTC);
    }
}
