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
import java.util.Collection;
import java.util.List;
import java.util.UUID;

/**
 * Leituras agregadas dos relatórios gerenciais da frota. Só consulta: os fatos já estão nas
 * tabelas da frota e cada método devolve linhas por veículo (e por mês, quando a série pede).
 * Os intervalos de instante são {@code [inicio, fim)}; os de data, fechados.
 *
 * <p>JDBC direto, como {@link AnaliseTelemetriaRepository}: agregações com intervalos e
 * sobreposições que não cabem numa Specification.</p>
 */
@Repository
@RequiredArgsConstructor
public class RelatorioGerencialFrotaRepository {

    static final String FUSO = "America/Sao_Paulo";

    private final NamedParameterJdbcTemplate jdbc;

    // ── Registros ──────────────────────────────────────────────────────────────────

    public record Ficha(UUID idVeiculo, String placa, UUID idBase, UUID idTipo, String tipo, String situacao,
                        String regime, BigDecimal custoMensalLocacao, LocalDate inicioLocacao, LocalDate fimLocacao,
                        BigDecimal consumoReferenciaKmL, String unidadeMedicao) {
    }

    /** Valor de uma categoria de custo por veículo e mês ({@code mes} = primeiro dia). */
    public record CustoMes(UUID idVeiculo, LocalDate mes, String categoria, BigDecimal valor) {
    }

    public record OsConcluida(UUID id, Long numero, UUID idVeiculo, String tipoManutencao, String origem, String causa,
                              String oficina, BigDecimal valor, OffsetDateTime inicioReal, OffsetDateTime fimReal,
                              OffsetDateTime paradoDesde, OffsetDateTime liberadoEm, boolean veiculoParado) {
    }

    public record OsAberta(UUID id, Long numero, UUID idVeiculo, String placa, String situacao, String criticidade,
                           String tipoManutencao, OffsetDateTime abertaEm, OffsetDateTime previsaoTermino,
                           boolean veiculoParado, OffsetDateTime paradoDesde, String descricao) {
    }

    public record HorasParado(UUID idVeiculo, double horas) {
    }

    public record Retrabalho(UUID idOs, Long numero, UUID idVeiculo, String item, Long numeroAnterior, int dias) {
    }

    public record Km(UUID idVeiculo, long km) {
    }

    public record KmMes(UUID idVeiculo, LocalDate mes, long km) {
    }

    public record CombustivelVeiculo(UUID idVeiculo, LocalDate mes, BigDecimal litros, BigDecimal valorCombustivel,
                                     BigDecimal valorTotal, long abastecimentos) {
    }

    public record CombustivelProduto(String produto, String categoria, BigDecimal quantidade, BigDecimal valor) {
    }

    public record CombustivelPosto(UUID idPosto, String posto, long abastecimentos, BigDecimal litros, BigDecimal valor) {
    }

    public record Contagem(String chave, long total) {
    }

    public record DespesaTipo(UUID idVeiculo, String tipo, BigDecimal valor) {
    }

    /** Veículo coberto por uma apólice: a vigência rateia o valor; a cobertura diz quais dias são do veículo. */
    public record Cobertura(UUID idApolice, String numero, BigDecimal valor, LocalDate vigenciaInicio,
                            LocalDate vigenciaFim, LocalDate coberturaInicio, LocalDate coberturaFim, UUID idVeiculo,
                            int veiculosCobertos) {
    }

    public record ApoliceVencendo(UUID id, String numero, UUID idSeguradora, LocalDate fim, int veiculos) {
    }

    public record SinistroLinha(UUID id, Long numero, UUID idVeiculo, String tipo, String situacao, UUID idCondutor,
                                Boolean culpaCondutor, BigDecimal franquia, OffsetDateTime ocorridoEm) {
    }

    public record EventoConducao(UUID idVeiculo, UUID idColaborador, String motorista, String tipo, long total) {
    }

    public record TelemetriaVeiculo(UUID idVeiculo, long minutosLigadoParado, double kmForaExpediente, double kmTelemetria) {
    }

    public record ChecklistVeiculo(UUID idVeiculo, long diasUteisComChecklist, long checklists) {
    }

    public record DocumentoVencendo(UUID id, UUID idVeiculo, String tipo, String descricao, LocalDate vencimento) {
    }

    public record CnhVencendo(UUID idCondutor, UUID idColaborador, String categoria, LocalDate validade) {
    }

    public record VinculoAtual(UUID idVeiculo, UUID idColaborador) {
    }

    // ── Consultas ──────────────────────────────────────────────────────────────────

    public List<Ficha> fichas() {
        return jdbc.query("""
                SELECT f.id_veiculo, f.placa, f.id_base_operacional, f.id_tipo_veiculo, t.nome AS tipo, f.situacao,
                       f.regime, f.custo_mensal_locacao, f.inicio_locacao, f.fim_locacao, f.consumo_referencia_km_l,
                       f.unidade_medicao
                FROM frota_fichas_veiculo f
                LEFT JOIN frota_tipos_veiculo t ON t.id = f.id_tipo_veiculo
                WHERE f.ativo = true
                ORDER BY f.placa
                """, new MapSqlParameterSource(), (rs, i) -> new Ficha(uuid(rs, "id_veiculo"), rs.getString("placa"),
                uuid(rs, "id_base_operacional"), uuid(rs, "id_tipo_veiculo"), rs.getString("tipo"), rs.getString("situacao"),
                rs.getString("regime"), rs.getBigDecimal("custo_mensal_locacao"), data(rs, "inicio_locacao"),
                data(rs, "fim_locacao"), rs.getBigDecimal("consumo_referencia_km_l"), rs.getString("unidade_medicao")));
    }

    /** OS concluídas, despesas (menos as reprovadas) e franquias, por veículo, mês e categoria. */
    public List<CustoMes> custosPorMes(Collection<UUID> veiculos, OffsetDateTime inicio, OffsetDateTime fim,
                                       boolean os, boolean despesas, boolean franquias) {
        if (veiculos.isEmpty() || !(os || despesas || franquias)) return List.of();
        StringBuilder sql = new StringBuilder("SELECT * FROM (");
        String uniao = "";
        if (os) {
            sql.append("""
                    SELECT id_veiculo, date_trunc('month', fim_real AT TIME ZONE :fuso)::date AS mes, 'MANUTENCAO' AS categoria,
                           COALESCE(SUM(valor_total), 0) AS valor
                    FROM frota_ordens_servico
                    WHERE ativo = true AND situacao = 'CONCLUIDA' AND id_veiculo IN (:veiculos)
                      AND fim_real >= :inicio AND fim_real < :fim
                    GROUP BY 1, 2
                    """);
            uniao = " UNION ALL ";
        }
        if (despesas) {
            sql.append(uniao).append("""
                    SELECT id_veiculo, date_trunc('month', data)::date AS mes, 'DESPESAS' AS categoria, COALESCE(SUM(valor), 0) AS valor
                    FROM frota_despesas
                    WHERE ativo = true AND COALESCE(situacao_pagamento, '') <> 'REPROVADO' AND id_veiculo IN (:veiculos)
                      AND data >= (:inicio AT TIME ZONE :fuso)::date AND data < (:fim AT TIME ZONE :fuso)::date
                    GROUP BY 1, 2
                    """);
            uniao = " UNION ALL ";
        }
        if (franquias) {
            sql.append(uniao).append("""
                    SELECT id_veiculo, date_trunc('month', ocorrido_em AT TIME ZONE :fuso)::date AS mes, 'FRANQUIAS' AS categoria,
                           COALESCE(SUM(franquia_paga), 0) AS valor
                    FROM frota_sinistros
                    WHERE ativo = true AND COALESCE(situacao, '') <> 'CANCELADO' AND id_veiculo IN (:veiculos)
                      AND ocorrido_em >= :inicio AND ocorrido_em < :fim AND franquia_paga IS NOT NULL
                    GROUP BY 1, 2
                    """);
        }
        sql.append(") c");
        return jdbc.query(sql.toString(), periodo(veiculos, inicio, fim), (rs, i) -> new CustoMes(uuid(rs, "id_veiculo"),
                data(rs, "mes"), rs.getString("categoria"), rs.getBigDecimal("valor")));
    }

    public List<OsConcluida> osConcluidas(Collection<UUID> veiculos, OffsetDateTime inicio, OffsetDateTime fim) {
        if (veiculos.isEmpty()) return List.of();
        return jdbc.query("""
                SELECT id, numero, id_veiculo, tipo_manutencao, origem, causa,
                       COALESCE(NULLIF(TRIM(oficina_nome), ''), CASE tipo_oficina WHEN 'INTERNA' THEN 'Oficina interna' ELSE 'Oficina externa' END) AS oficina,
                       COALESCE(valor_total, 0) AS valor, inicio_real, fim_real, parado_desde, liberado_em, veiculo_parado
                FROM frota_ordens_servico
                WHERE ativo = true AND situacao = 'CONCLUIDA' AND id_veiculo IN (:veiculos)
                  AND fim_real >= :inicio AND fim_real < :fim
                """, periodo(veiculos, inicio, fim), (rs, i) -> new OsConcluida(uuid(rs, "id"), longo(rs, "numero"),
                uuid(rs, "id_veiculo"), rs.getString("tipo_manutencao"), rs.getString("origem"), rs.getString("causa"),
                rs.getString("oficina"), rs.getBigDecimal("valor"), instante(rs, "inicio_real"), instante(rs, "fim_real"),
                instante(rs, "parado_desde"), instante(rs, "liberado_em"), rs.getBoolean("veiculo_parado")));
    }

    public List<OsAberta> osAbertas(Collection<UUID> veiculos) {
        if (veiculos.isEmpty()) return List.of();
        return jdbc.query("""
                SELECT id, numero, id_veiculo, placa, situacao, criticidade, tipo_manutencao, aberta_em, previsao_termino,
                       veiculo_parado AND liberado_em IS NULL AS parado, parado_desde, descricao
                FROM frota_ordens_servico
                WHERE ativo = true AND situacao IN ('PENDENTE', 'AGENDADA', 'EM_ANDAMENTO') AND id_veiculo IN (:veiculos)
                ORDER BY aberta_em
                """, new MapSqlParameterSource("veiculos", veiculos), (rs, i) -> new OsAberta(uuid(rs, "id"),
                longo(rs, "numero"), uuid(rs, "id_veiculo"), rs.getString("placa"), rs.getString("situacao"),
                rs.getString("criticidade"), rs.getString("tipo_manutencao"), instante(rs, "aberta_em"),
                instante(rs, "previsao_termino"), rs.getBoolean("parado"), instante(rs, "parado_desde"),
                rs.getString("descricao")));
    }

    /** Horas de veículo parado por OS dentro de {@code [inicio, fim)}; parada sem liberação vai até {@code agora}. */
    public List<HorasParado> horasParado(Collection<UUID> veiculos, OffsetDateTime inicio, OffsetDateTime fim,
                                         OffsetDateTime agora) {
        if (veiculos.isEmpty()) return List.of();
        var params = periodo(veiculos, inicio, fim).addValue("agora", agora);
        return jdbc.query("""
                SELECT id_veiculo,
                       SUM(GREATEST(0, EXTRACT(EPOCH FROM
                           LEAST(COALESCE(liberado_em, CASE WHEN situacao = 'CANCELADA' THEN cancelada_em END, :agora), :fim)
                           - GREATEST(parado_desde, :inicio))) / 3600.0) AS horas
                FROM frota_ordens_servico
                WHERE ativo = true AND veiculo_parado = true AND parado_desde IS NOT NULL AND id_veiculo IN (:veiculos)
                  AND parado_desde < :fim
                  AND COALESCE(liberado_em, CASE WHEN situacao = 'CANCELADA' THEN cancelada_em END, :agora) > :inicio
                GROUP BY id_veiculo
                """, params, (rs, i) -> new HorasParado(uuid(rs, "id_veiculo"), rs.getDouble("horas")));
    }

    /** Itens de corretivas concluídas no período que repetiram no mesmo veículo em até {@code dias}. */
    public List<Retrabalho> retrabalhos(Collection<UUID> veiculos, OffsetDateTime inicio, OffsetDateTime fim, int dias) {
        if (veiculos.isEmpty()) return List.of();
        var params = periodo(veiculos, inicio, fim).addValue("dias", dias);
        return jdbc.query("""
                SELECT o.id, o.numero, o.id_veiculo, im.nome AS item, i.numero_os_anterior, i.dias_desde_anterior
                FROM frota_os_itens i
                JOIN frota_ordens_servico o ON o.id = i.id_ordem_servico
                JOIN frota_itens_manutencao im ON im.id = i.id_item_manutencao
                WHERE i.ativo = true AND o.ativo = true AND o.situacao = 'CONCLUIDA' AND o.tipo_manutencao = 'CORRETIVA'
                  AND o.id_veiculo IN (:veiculos) AND o.fim_real >= :inicio AND o.fim_real < :fim
                  AND i.id_os_anterior IS NOT NULL AND i.dias_desde_anterior <= :dias
                ORDER BY o.fim_real DESC
                """, params, (rs, i) -> new Retrabalho(uuid(rs, "id"), longo(rs, "numero"), uuid(rs, "id_veiculo"),
                rs.getString("item"), longo(rs, "numero_os_anterior"), rs.getInt("dias_desde_anterior")));
    }

    /**
     * Km rodado por veículo e mês: a maior medição válida do mês menos a maior antes dele (ou a menor
     * do próprio mês, no primeiro registro). Só medição em km; a troca de painel entra pelo deslocamento.
     */
    public List<KmMes> kmPorMes(Collection<UUID> veiculos, OffsetDateTime inicio, OffsetDateTime fim) {
        if (veiculos.isEmpty()) return List.of();
        return jdbc.query("""
                WITH l AS (
                    SELECT id_veiculo, lido_em, km + COALESCE(deslocamento, 0) AS acumulado
                    FROM frota_leituras_odometro
                    WHERE ativo = true AND situacao = 'VALIDA' AND COALESCE(unidade, 'KM') = 'KM'
                      AND id_veiculo IN (:veiculos) AND lido_em < :fim
                ), m AS (
                    SELECT id_veiculo, date_trunc('month', lido_em AT TIME ZONE :fuso)::date AS mes,
                           MAX(acumulado) AS maior, MIN(acumulado) AS menor, MIN(lido_em) AS primeira
                    FROM l WHERE lido_em >= :inicio
                    GROUP BY 1, 2
                )
                SELECT m.id_veiculo, m.mes,
                       GREATEST(0, m.maior - COALESCE((SELECT MAX(l.acumulado) FROM l
                                                        WHERE l.id_veiculo = m.id_veiculo AND l.lido_em < m.primeira), m.menor)) AS km
                FROM m
                """, periodo(veiculos, inicio, fim), (rs, i) -> new KmMes(uuid(rs, "id_veiculo"), data(rs, "mes"),
                rs.getLong("km")));
    }

    public List<CombustivelVeiculo> combustivelPorMes(Collection<UUID> veiculos, OffsetDateTime inicio, OffsetDateTime fim) {
        if (veiculos.isEmpty()) return List.of();
        return jdbc.query("""
                SELECT a.id_veiculo, date_trunc('month', a.realizado_em AT TIME ZONE :fuso)::date AS mes,
                       COALESCE(SUM(i.quantidade) FILTER (WHERE p.categoria = 'COMBUSTIVEL'), 0) AS litros,
                       COALESCE(SUM(i.valor_total) FILTER (WHERE p.categoria = 'COMBUSTIVEL'), 0) AS valor_combustivel,
                       COALESCE(SUM(i.valor_total), 0) AS valor_total,
                       COUNT(DISTINCT a.id) AS abastecimentos
                FROM frota_abastecimentos a
                JOIN frota_abastecimento_itens i ON i.id_abastecimento = a.id AND i.ativo = true
                LEFT JOIN frota_produtos_abastecimento p ON p.id = COALESCE(i.id_produto, i.id_produto_pedido)
                WHERE a.ativo = true AND a.situacao = 'REALIZADA' AND a.id_veiculo IN (:veiculos)
                  AND a.realizado_em >= :inicio AND a.realizado_em < :fim
                GROUP BY 1, 2
                """, periodo(veiculos, inicio, fim), (rs, i) -> new CombustivelVeiculo(uuid(rs, "id_veiculo"),
                data(rs, "mes"), rs.getBigDecimal("litros"), rs.getBigDecimal("valor_combustivel"),
                rs.getBigDecimal("valor_total"), rs.getLong("abastecimentos")));
    }

    public List<CombustivelProduto> combustivelPorProduto(Collection<UUID> veiculos, OffsetDateTime inicio, OffsetDateTime fim) {
        if (veiculos.isEmpty()) return List.of();
        return jdbc.query("""
                SELECT COALESCE(p.nome, 'Sem produto') AS produto, COALESCE(p.categoria, 'OUTRO') AS categoria,
                       COALESCE(SUM(i.quantidade), 0) AS quantidade, COALESCE(SUM(i.valor_total), 0) AS valor
                FROM frota_abastecimentos a
                JOIN frota_abastecimento_itens i ON i.id_abastecimento = a.id AND i.ativo = true
                LEFT JOIN frota_produtos_abastecimento p ON p.id = COALESCE(i.id_produto, i.id_produto_pedido)
                WHERE a.ativo = true AND a.situacao = 'REALIZADA' AND a.id_veiculo IN (:veiculos)
                  AND a.realizado_em >= :inicio AND a.realizado_em < :fim
                GROUP BY 1, 2
                ORDER BY valor DESC
                """, periodo(veiculos, inicio, fim), (rs, i) -> new CombustivelProduto(rs.getString("produto"),
                rs.getString("categoria"), rs.getBigDecimal("quantidade"), rs.getBigDecimal("valor")));
    }

    public List<CombustivelPosto> combustivelPorPosto(Collection<UUID> veiculos, OffsetDateTime inicio, OffsetDateTime fim) {
        if (veiculos.isEmpty()) return List.of();
        return jdbc.query("""
                SELECT po.id, po.nome, COUNT(DISTINCT a.id) AS abastecimentos,
                       COALESCE(SUM(i.quantidade) FILTER (WHERE p.categoria = 'COMBUSTIVEL'), 0) AS litros,
                       COALESCE(SUM(i.valor_total) FILTER (WHERE p.categoria = 'COMBUSTIVEL'), 0) AS valor
                FROM frota_abastecimentos a
                JOIN frota_postos po ON po.id = a.id_posto
                JOIN frota_abastecimento_itens i ON i.id_abastecimento = a.id AND i.ativo = true
                LEFT JOIN frota_produtos_abastecimento p ON p.id = COALESCE(i.id_produto, i.id_produto_pedido)
                WHERE a.ativo = true AND a.situacao = 'REALIZADA' AND a.id_veiculo IN (:veiculos)
                  AND a.realizado_em >= :inicio AND a.realizado_em < :fim
                GROUP BY 1, 2
                ORDER BY valor DESC
                """, periodo(veiculos, inicio, fim), (rs, i) -> new CombustivelPosto(uuid(rs, "id"), rs.getString("nome"),
                rs.getLong("abastecimentos"), rs.getBigDecimal("litros"), rs.getBigDecimal("valor")));
    }

    public List<Contagem> alertasAbastecimento(Collection<UUID> veiculos, OffsetDateTime inicio, OffsetDateTime fim) {
        if (veiculos.isEmpty()) return List.of();
        return jdbc.query("""
                SELECT al.tipo, COUNT(*) AS total
                FROM frota_abastecimento_alertas al
                JOIN frota_abastecimentos a ON a.id = al.id_abastecimento
                WHERE al.ativo = true AND a.ativo = true AND a.id_veiculo IN (:veiculos)
                  AND a.solicitado_em >= :inicio AND a.solicitado_em < :fim
                GROUP BY 1 ORDER BY 2 DESC
                """, periodo(veiculos, inicio, fim), (rs, i) -> new Contagem(rs.getString("tipo"), rs.getLong("total")));
    }

    public List<DespesaTipo> despesasPorTipo(Collection<UUID> veiculos, OffsetDateTime inicio, OffsetDateTime fim) {
        if (veiculos.isEmpty()) return List.of();
        return jdbc.query("""
                SELECT d.id_veiculo, t.nome AS tipo, COALESCE(SUM(d.valor), 0) AS valor
                FROM frota_despesas d
                JOIN frota_tipos_despesa t ON t.id = d.id_tipo
                WHERE d.ativo = true AND COALESCE(d.situacao_pagamento, '') <> 'REPROVADO' AND d.id_veiculo IN (:veiculos)
                  AND d.data >= (:inicio AT TIME ZONE :fuso)::date AND d.data < (:fim AT TIME ZONE :fuso)::date
                GROUP BY 1, 2
                """, periodo(veiculos, inicio, fim), (rs, i) -> new DespesaTipo(uuid(rs, "id_veiculo"), rs.getString("tipo"),
                rs.getBigDecimal("valor")));
    }

    /** Despesas e parcelas de seguro com solicitação de pagamento ainda sem decisão. */
    public BigDecimal aguardandoFinanceiro(Collection<UUID> veiculos, boolean despesas, boolean seguros) {
        if (veiculos.isEmpty() || !(despesas || seguros)) return BigDecimal.ZERO;
        BigDecimal total = BigDecimal.ZERO;
        var params = new MapSqlParameterSource("veiculos", veiculos);
        if (despesas) {
            total = total.add(jdbc.queryForObject("""
                    SELECT COALESCE(SUM(valor), 0) FROM frota_despesas
                    WHERE ativo = true AND situacao_pagamento = 'SOLICITADO' AND id_veiculo IN (:veiculos)
                    """, params, BigDecimal.class));
        }
        if (seguros) {
            total = total.add(jdbc.queryForObject("""
                    SELECT COALESCE(SUM(p.valor), 0) FROM frota_apolice_parcelas p
                    WHERE p.ativo = true AND p.situacao_pagamento = 'SOLICITADO'
                      AND EXISTS (SELECT 1 FROM frota_apolice_veiculos av
                                  WHERE av.id_apolice = p.id_apolice AND av.ativo = true AND av.id_veiculo IN (:veiculos))
                    """, params, BigDecimal.class));
        }
        return total;
    }

    /** Coberturas de apólice (veículo × apólice) que tocam o intervalo de datas. */
    public List<Cobertura> coberturas(LocalDate de, LocalDate ate) {
        var params = new MapSqlParameterSource("de", de).addValue("ate", ate);
        return jdbc.query("""
                SELECT a.id, a.numero, a.valor, GREATEST(a.vigencia_inicio, av.inicio) AS inicio,
                       LEAST(a.vigencia_fim, COALESCE(av.fim, a.vigencia_fim)) AS fim, av.id_veiculo,
                       (SELECT COUNT(*) FROM frota_apolice_veiculos x WHERE x.id_apolice = a.id AND x.ativo = true) AS cobertos,
                       a.vigencia_inicio, a.vigencia_fim
                FROM frota_apolices a
                JOIN frota_apolice_veiculos av ON av.id_apolice = a.id AND av.ativo = true
                WHERE a.ativo = true AND a.vigencia_inicio <= :ate AND a.vigencia_fim >= :de
                  AND av.inicio <= :ate AND (av.fim IS NULL OR av.fim >= :de)
                """, params, (rs, i) -> new Cobertura(uuid(rs, "id"), rs.getString("numero"),
                rs.getBigDecimal("valor") == null ? BigDecimal.ZERO : rs.getBigDecimal("valor"),
                data(rs, "vigencia_inicio"), data(rs, "vigencia_fim"), data(rs, "inicio"), data(rs, "fim"),
                uuid(rs, "id_veiculo"), rs.getInt("cobertos")));
    }

    public List<ApoliceVencendo> apolicesVencendo(LocalDate hoje, LocalDate ate) {
        var params = new MapSqlParameterSource("hoje", hoje).addValue("ate", ate);
        return jdbc.query("""
                SELECT a.id, a.numero, a.id_seguradora, a.vigencia_fim,
                       (SELECT COUNT(*) FROM frota_apolice_veiculos x WHERE x.id_apolice = a.id AND x.ativo = true
                          AND (x.fim IS NULL OR x.fim >= :hoje)) AS veiculos
                FROM frota_apolices a
                WHERE a.ativo = true AND a.vigencia_fim >= :hoje AND a.vigencia_fim <= :ate
                ORDER BY a.vigencia_fim
                """, params, (rs, i) -> new ApoliceVencendo(uuid(rs, "id"), rs.getString("numero"),
                uuid(rs, "id_seguradora"), data(rs, "vigencia_fim"), rs.getInt("veiculos")));
    }

    public List<SinistroLinha> sinistros(Collection<UUID> veiculos, OffsetDateTime inicio, OffsetDateTime fim) {
        if (veiculos.isEmpty()) return List.of();
        return jdbc.query("""
                SELECT id, numero, id_veiculo, tipo, situacao, id_condutor, culpa_condutor, franquia_paga, ocorrido_em
                FROM frota_sinistros
                WHERE ativo = true AND COALESCE(situacao, '') <> 'CANCELADO' AND id_veiculo IN (:veiculos)
                  AND ocorrido_em >= :inicio AND ocorrido_em < :fim
                ORDER BY ocorrido_em DESC
                """, periodo(veiculos, inicio, fim), (rs, i) -> new SinistroLinha(uuid(rs, "id"), longo(rs, "numero"),
                uuid(rs, "id_veiculo"), rs.getString("tipo"), rs.getString("situacao"), uuid(rs, "id_condutor"),
                (Boolean) rs.getObject("culpa_condutor"), rs.getBigDecimal("franquia_paga"), instante(rs, "ocorrido_em")));
    }

    /** Eventos de condução (fora motor ligado parado e desconexão, que não são do condutor). */
    public List<EventoConducao> eventosConducao(Collection<UUID> veiculos, OffsetDateTime inicio, OffsetDateTime fim) {
        if (veiculos.isEmpty()) return List.of();
        return jdbc.query("""
                SELECT id_veiculo, id_colaborador, MAX(motorista_nome) AS motorista, tipo, COUNT(*) AS total
                FROM frota_telemetria_eventos
                WHERE id_veiculo IN (:veiculos) AND ocorrido_em >= :inicio AND ocorrido_em < :fim
                  AND tipo IN ('EXCESSO_VELOCIDADE', 'FRENAGEM_BRUSCA', 'ACELERACAO_BRUSCA', 'CURVA_BRUSCA', 'CONDUCAO_AGRESSIVA')
                GROUP BY id_veiculo, id_colaborador, tipo
                """, periodo(veiculos, inicio, fim), (rs, i) -> new EventoConducao(uuid(rs, "id_veiculo"),
                uuid(rs, "id_colaborador"), rs.getString("motorista"), rs.getString("tipo"), rs.getLong("total")));
    }

    public List<TelemetriaVeiculo> telemetria(Collection<UUID> veiculos, LocalDate de, LocalDate ate) {
        if (veiculos.isEmpty()) return List.of();
        var params = new MapSqlParameterSource("veiculos", veiculos).addValue("de", de).addValue("ate", ate);
        return jdbc.query("""
                SELECT id_veiculo, COALESCE(SUM(minutos_ligado_parado), 0) AS ligado_parado,
                       COALESCE(SUM(km_fora_expediente), 0) AS fora, COALESCE(SUM(km), 0) AS km
                FROM frota_telemetria_dias
                WHERE id_veiculo IN (:veiculos) AND dia >= :de AND dia <= :ate
                GROUP BY id_veiculo
                """, params, (rs, i) -> new TelemetriaVeiculo(uuid(rs, "id_veiculo"), rs.getLong("ligado_parado"),
                rs.getDouble("fora"), rs.getDouble("km")));
    }

    /** Checklists e dias úteis (segunda a sexta, em São Paulo) com ao menos um checklist. */
    public List<ChecklistVeiculo> checklists(Collection<UUID> veiculos, OffsetDateTime inicio, OffsetDateTime fim) {
        if (veiculos.isEmpty()) return List.of();
        return jdbc.query("""
                SELECT id_veiculo,
                       COUNT(DISTINCT (preenchido_em AT TIME ZONE :fuso)::date)
                           FILTER (WHERE EXTRACT(ISODOW FROM preenchido_em AT TIME ZONE :fuso) <= 5) AS dias,
                       COUNT(*) AS total
                FROM frota_checklists
                WHERE ativo = true AND id_veiculo IN (:veiculos) AND preenchido_em >= :inicio AND preenchido_em < :fim
                GROUP BY id_veiculo
                """, periodo(veiculos, inicio, fim), (rs, i) -> new ChecklistVeiculo(uuid(rs, "id_veiculo"),
                rs.getLong("dias"), rs.getLong("total")));
    }

    public List<Contagem> pendenciasChecklistAbertas(Collection<UUID> veiculos) {
        if (veiculos.isEmpty()) return List.of();
        return jdbc.query("""
                SELECT id_veiculo::text AS chave, COUNT(*) AS total FROM frota_checklist_pendencias
                WHERE ativo = true AND situacao = 'ABERTA' AND id_veiculo IN (:veiculos)
                GROUP BY id_veiculo
                """, new MapSqlParameterSource("veiculos", veiculos), (rs, i) -> new Contagem(rs.getString("chave"),
                rs.getLong("total")));
    }

    /** Último documento de cada tipo por veículo, vencido ou vencendo até {@code ate}. */
    public List<DocumentoVencendo> documentosVencendo(Collection<UUID> veiculos, LocalDate ate) {
        if (veiculos.isEmpty()) return List.of();
        var params = new MapSqlParameterSource("veiculos", veiculos).addValue("ate", ate);
        return jdbc.query("""
                SELECT * FROM (
                    SELECT DISTINCT ON (id_veiculo, tipo) id, id_veiculo, tipo, descricao, data_vencimento
                    FROM frota_documentos
                    WHERE ativo = true AND id_veiculo IN (:veiculos) AND data_vencimento IS NOT NULL
                    ORDER BY id_veiculo, tipo, data_vencimento DESC
                ) d
                WHERE d.data_vencimento <= :ate
                ORDER BY d.data_vencimento
                """, params, (rs, i) -> new DocumentoVencendo(uuid(rs, "id"), uuid(rs, "id_veiculo"), rs.getString("tipo"),
                rs.getString("descricao"), data(rs, "data_vencimento")));
    }

    public List<CnhVencendo> cnhVencendo(LocalDate ate) {
        return jdbc.query("""
                SELECT id, id_colaborador, cnh_categoria, cnh_validade FROM frota_condutores
                WHERE ativo = true AND cnh_validade IS NOT NULL AND cnh_validade <= :ate
                ORDER BY cnh_validade
                """, new MapSqlParameterSource("ate", ate), (rs, i) -> new CnhVencendo(uuid(rs, "id"),
                uuid(rs, "id_colaborador"), rs.getString("cnh_categoria"), data(rs, "cnh_validade")));
    }

    public List<VinculoAtual> vinculosAtuais(Collection<UUID> veiculos) {
        if (veiculos.isEmpty()) return List.of();
        return jdbc.query("""
                SELECT id_veiculo, id_colaborador FROM frota_vinculos_condutor
                WHERE ativo = true AND fim IS NULL AND id_veiculo IN (:veiculos)
                """, new MapSqlParameterSource("veiculos", veiculos), (rs, i) -> new VinculoAtual(uuid(rs, "id_veiculo"),
                uuid(rs, "id_colaborador")));
    }

    // ── Auxiliares ─────────────────────────────────────────────────────────────────

    private static MapSqlParameterSource periodo(Collection<UUID> veiculos, OffsetDateTime inicio, OffsetDateTime fim) {
        return new MapSqlParameterSource("veiculos", veiculos).addValue("inicio", inicio).addValue("fim", fim)
                .addValue("fuso", FUSO);
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
