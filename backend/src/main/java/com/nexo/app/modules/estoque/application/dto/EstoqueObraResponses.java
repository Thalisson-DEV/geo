package com.nexo.app.modules.estoque.application.dto;

import com.nexo.app.modules.estoque.domain.CondicaoMaterial;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** Respostas do estoque por obra: material da obra, saldo de um local separado por obra e canteiros. */
public final class EstoqueObraResponses {

    private EstoqueObraResponses() {
    }

    /**
     * Material da obra, por material. {@code comEquipes} é o que está hoje nos caminhões e canteiros carimbado para a
     * obra ({@code onde} detalha). {@code recebido}/{@code cedido} são de/para outras obras; {@code semMaterialDaObra}
     * é o que foi aplicado sem material da obra no caminhão (livre ou sem saldo).
     */
    public record MaterialDaObra(UUID idObra, List<LinhaMaterial> materiais, List<Rastro> rastros) {
    }

    public record LinhaMaterial(
            UUID idMaterial,
            String codigo,
            String descricao,
            String unidade,
            BigDecimal previsto,
            BigDecimal entregue,
            BigDecimal aplicado,
            BigDecimal comEquipes,
            BigDecimal devolvido,
            BigDecimal retirado,
            BigDecimal recebido,
            BigDecimal cedido,
            BigDecimal semMaterialDaObra,
            BigDecimal aplicadoSemSaldo,
            List<Local> onde
    ) {
    }

    public record Local(UUID idEstoque, String nome, String tipo, UUID idEquipe, CondicaoMaterial condicao,
                        BigDecimal quantidade) {
    }

    /**
     * Rastro da obra. {@code sentido}: RECEBIDO (veio de outra obra para esta), CEDIDO (saiu desta para outra), LIVRE
     * (aplicado com material livre do caminhão) ou SEM_SALDO (aplicado sem o material no caminhão). {@code tipo}: APLICACAO (a equipe aplicou material de outra obra) ou REMANEJAMENTO (o administrativo
     * mudou a obra do material), ou ESTORNO.
     */
    public record Rastro(
            UUID id,
            OffsetDateTime dataHora,
            String tipo,
            String sentido,
            String codigo,
            String descricao,
            String unidade,
            BigDecimal quantidade,
            UUID idOutraObra,
            String numeroOutraObra,
            String local,
            String observacao
    ) {
    }

    /** Saldo de um local (caminhão, canteiro) separado por obra; o que não é de obra nenhuma é livre. */
    public record SaldoPorObra(UUID idEstoque, String nome, String tipo, UUID idEquipe, List<MaterialNoLocal> materiais) {
    }

    public record MaterialNoLocal(
            UUID idMaterial,
            String codigo,
            String descricao,
            String unidade,
            CondicaoMaterial condicao,
            BigDecimal fisico,
            BigDecimal livre,
            List<ParteDaObra> obras
    ) {
    }

    public record ParteDaObra(UUID idObra, String numero, BigDecimal quantidade) {
    }

    public record Canteiro(
            UUID id,
            String nome,
            UUID idBaseOperacional,
            String nomeBase,
            String referencia,
            BigDecimal latitude,
            BigDecimal longitude,
            long materiais,
            boolean ativo
    ) {
    }
}
