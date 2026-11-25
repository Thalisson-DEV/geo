package com.nexo.app.modules.estoque.application.dto;

import com.nexo.app.modules.estoque.domain.CondicaoMaterial;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/** Comandos do estoque por obra. */
public final class EstoqueObraRequests {

    private EstoqueObraRequests() {
    }

    public record ItemObra(
            @NotNull(message = "Informe o material.") UUID idMaterial,
            CondicaoMaterial condicao,
            UUID idObra,
            @NotNull(message = "Informe a quantidade.") @Positive(message = "A quantidade deve ser positiva.") BigDecimal quantidade
    ) {
    }

    /** Material que sobrou no caminhão ou no canteiro volta ao almoxarifado; cada item diz de qual obra era. */
    public record DevolverSobra(
            @NotNull(message = "Informe de onde o material sai.") UUID idOrigem,
            @NotNull(message = "Informe o almoxarifado que recebe.") UUID idAlmoxarifado,
            @NotEmpty(message = "Informe ao menos um material.") List<@Valid ItemObra> itens,
            @Size(max = 500, message = "A observação deve ter até 500 caracteres.") String observacao
    ) {
    }

    public enum SentidoCanteiro { DEIXAR, PEGAR }

    /** A equipe deixa material no canteiro ou pega dele; a obra de cada material vai junto. */
    public record MovimentarCanteiro(
            /** Id gerado no aparelho: o reenvio da fila devolve o mesmo movimento, sem duplicar. */
            UUID idLocal,
            @NotNull(message = "Informe a equipe.") UUID idEquipe,
            @NotNull(message = "Informe se a equipe deixa ou pega.") SentidoCanteiro sentido,
            @NotEmpty(message = "Informe ao menos um material.") List<@Valid ItemObra> itens
    ) {
    }

    /** Muda a obra de um material no mesmo local. Obra nula de origem = livre; de destino = libera. */
    public record Remanejar(
            @NotNull(message = "Informe o local.") UUID idEstoque,
            @NotNull(message = "Informe o material.") UUID idMaterial,
            CondicaoMaterial condicao,
            UUID idObraOrigem,
            UUID idObraDestino,
            @NotNull(message = "Informe a quantidade.") @Positive(message = "A quantidade deve ser positiva.") BigDecimal quantidade,
            @NotBlank(message = "Diga o motivo.") @Size(max = 500, message = "O motivo deve ter até 500 caracteres.") String motivo
    ) {
    }

    public record Canteiro(
            @NotBlank(message = "Informe o nome do canteiro.") @Size(min = 3, max = 100, message = "O nome deve ter entre 3 e 100 caracteres.") String nome,
            @NotNull(message = "Informe a base operacional.") UUID idBaseOperacional,
            @Size(max = 300, message = "A referência deve ter até 300 caracteres.") String referencia,
            @DecimalMin(value = "-90.0", message = "Latitude inválida.") @DecimalMax(value = "90.0", message = "Latitude inválida.") BigDecimal latitude,
            @DecimalMin(value = "-180.0", message = "Longitude inválida.") @DecimalMax(value = "180.0", message = "Longitude inválida.") BigDecimal longitude
    ) {
    }
}
