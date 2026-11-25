package com.nexo.app.modules.estoque.application.dto;

import com.nexo.app.modules.estoque.domain.CondicaoMaterial;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/** Comandos do balcão do almoxarifado. */
public final class BalcaoRequests {

    private BalcaoRequests() {
    }

    /**
     * Quem retira ou devolve e os comprovantes. {@code assinatura}: PNG em data URL, ou "FISICA" quando o termo é
     * assinado em papel. {@code foto}: JPEG ou PNG em data URL, só para consulta.
     */
    public record Comprovante(
            UUID idColaborador,
            @Size(max = 30, message = "A matrícula deve ter até 30 caracteres.") String matricula,
            @Size(max = 400_000, message = "A assinatura é grande demais.") String assinatura,
            @Size(max = 2_000_000, message = "A foto é grande demais.") String foto,
            @Size(max = 500, message = "A observação deve ter até 500 caracteres.") String observacao
    ) {
    }

    public record ItemRetirada(
            @NotNull(message = "Informe o item.") UUID idItemSolicitacao,
            @NotNull(message = "Informe a quantidade.") @Positive(message = "A quantidade deve ser positiva.") BigDecimal quantidade,
            String numeroSerie,
            @Size(max = 300, message = "O motivo deve ter até 300 caracteres.") String motivoExcedente
    ) {
    }

    public record RetiradaSolicitacao(
            @NotNull(message = "Informe a solicitação.") UUID idSolicitacao,
            Long versaoEsperada,
            @Size(max = 50, message = "A reserva deve ter até 50 caracteres.") String numeroReserva,
            @NotEmpty(message = "Informe ao menos um material.") List<@Valid ItemRetirada> itens
    ) {
    }

    /** A equipe retira de uma vez o material de todas as suas solicitações do dia. */
    public record RegistrarRetirada(
            @NotNull(message = "Informe o almoxarifado.") UUID idAlmoxarifado,
            @NotNull(message = "Informe quem retira.") @Valid Comprovante comprovante,
            @NotEmpty(message = "Informe ao menos uma solicitação.") List<@Valid RetiradaSolicitacao> solicitacoes
    ) {
    }

    public enum Destino { GUARDAR, DESCARTAR }

    public record ItemDevolucao(
            @NotNull(message = "Informe o material.") UUID idMaterial,
            CondicaoMaterial condicao,
            UUID idObra,
            @NotNull(message = "Informe a quantidade.") @Positive(message = "A quantidade deve ser positiva.") BigDecimal quantidade,
            String numeroSerie,
            Destino destino
    ) {
    }

    /** A equipe devolve o que sobrou no caminhão (novo e sucata), de qualquer obra, numa só operação. */
    public record RegistrarDevolucao(
            @NotNull(message = "Informe o almoxarifado.") UUID idAlmoxarifado,
            @NotNull(message = "Informe quem devolve.") @Valid Comprovante comprovante,
            @NotEmpty(message = "Informe ao menos um material.") List<@Valid ItemDevolucao> itens
    ) {
    }

    public record Parametros(
            boolean separacaoObrigatoria,
            boolean entregaAcimaPedido,
            boolean devolucaoAcimaCaminhao,
            boolean exigeAssinatura,
            boolean exigeMatricula,
            boolean exigeFoto
    ) {
    }
}
