package com.nexo.app.modules.estoque.application.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Comandos do encerramento de obra. */
public final class FechamentoObraRequests {

    private FechamentoObraRequests() {
    }

    @Schema(description = "Cria uma ou mais solicitações de encerramento para a mesma obra, uma por tipo")
    public record Criar(
            UUID idObra,
            UUID idAlmoxarifadoAtendimento,
            @Schema(description = "Colaborador encarregado (opcional)") UUID idEncarregado,
            @Schema(description = "Supervisor do cadastro de RH (opcional); o coordenador vem dele") UUID idSupervisor,
            String observacao,
            List<Solicitacao> solicitacoes
    ) {
        public record Solicitacao(
                @Schema(description = "221, 921, 222 ou 922") String tipo,
                @Schema(description = "Número da reserva SAP, até 20 dígitos (opcional)") String numeroReserva,
                LocalDate dataReserva,
                List<Item> itens
        ) {
        }

        public record Item(UUID idMaterial, BigDecimal quantidade) {
        }
    }

    @Schema(description = "Edita a solicitação enquanto não estiver toda movimentada. Itens ausentes da lista são removidos.")
    public record Editar(
            Long versaoEsperada,
            UUID idEncarregado,
            UUID idSupervisor,
            String observacao,
            List<Item> itens
    ) {
        public record Item(
                @Schema(description = "Item existente; vazio para incluir material novo") UUID idItem,
                UUID idMaterial,
                BigDecimal quantidade
        ) {
        }
    }

    public record RegistrarReserva(Long versaoEsperada, String numero, LocalDate dataCriacao) {
    }

    public record Pendencia(
            @Schema(description = "Item da pendência específica; vazio para pendência geral") UUID idItem,
            UUID idMotivoPendencia,
            String justificativa
    ) {
    }

    public record Cancelar(Long versaoEsperada, String motivo) {
    }

    public record Movimentar(
            Long versaoEsperada,
            @Schema(description = "Itens e quantidades; a movimentação sempre altera o saldo entre almoxarifado e obra") List<Item> itens
    ) {
        /** {@code unidade}: em que a quantidade foi informada; vazia = unidade do material. */
        public record Item(UUID idItem, BigDecimal quantidade, String unidade) {
            public Item(UUID idItem, BigDecimal quantidade) {
                this(idItem, quantidade, null);
            }
        }
    }

    @Schema(description = "Linhas da planilha para revalidar ou confirmar")
    public record Importar(List<FechamentoImportacaoDTO> registros) {
    }

    public record Estornar(Long versaoEsperada, String motivo, List<Item> itens) {
        public record Item(UUID idItemOperacao, BigDecimal quantidade) {
        }
    }
}
