package com.nexo.app.modules.estoque.application.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Respostas do balcão do almoxarifado: a fila de equipes do dia, o atendimento de uma equipe (o que retirar e o que
 * está no caminhão) e os atendimentos já feitos.
 */
public final class BalcaoResponses {

    private BalcaoResponses() {
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

    public record Almoxarifado(UUID id, String nome) {
    }

    /** Fila do dia no almoxarifado. */
    public record Painel(
            UUID idAlmoxarifado,
            String almoxarifado,
            LocalDate data,
            List<Almoxarifado> almoxarifados,
            Parametros parametros,
            List<EquipeNoBalcao> equipes,
            List<AtendimentoResumo> atendimentosHoje
    ) {
    }

    /**
     * Uma equipe na fila. {@code retirada}: o que ela tem para retirar até a data (solicitações abertas deste
     * almoxarifado). {@code caminhao}: o que ela tem agora, para a devolução do fim do dia.
     */
    public record EquipeNoBalcao(
            UUID idEquipe,
            String codigo,
            String base,
            String encarregado,
            int solicitacoesRetirada,
            int obrasRetirada,
            int itensRetirada,
            boolean retiradaAtrasada,
            boolean aguardandoSeparacao,
            int itensNoCaminhao,
            int obrasNoCaminhao,
            int sucatasNoCaminhao,
            int negativosNoCaminhao,
            OffsetDateTime ultimaRetirada,
            OffsetDateTime ultimaDevolucao
    ) {
    }

    /** Tudo o que o balcão precisa para atender uma equipe. */
    public record Atendimento(
            UUID idEquipe,
            String codigo,
            String base,
            UUID idAlmoxarifado,
            String almoxarifado,
            Parametros parametros,
            List<Pessoa> pessoas,
            List<RetiradaObra> retiradas,
            List<GrupoCaminhao> caminhao,
            List<AtendimentoResumo> recentes
    ) {
    }

    public record Pessoa(UUID idColaborador, String nome, String matricula, boolean encarregado) {
    }

    /** Uma solicitação a retirar (normalmente uma obra e uma programação). */
    public record RetiradaObra(
            UUID idSolicitacao,
            Long versao,
            UUID idObra,
            String numeroObra,
            String tituloObra,
            Long numeroProgramacao,
            LocalDate dataPrevista,
            boolean atrasada,
            String reserva,
            boolean concreto,
            String separacao,
            List<ItemRetirada> itens
    ) {
    }

    public record ItemRetirada(
            UUID idItem,
            UUID idMaterial,
            String codigo,
            String descricao,
            String unidade,
            BigDecimal pedido,
            BigDecimal entregue,
            BigDecimal falta,
            boolean detalhaSerie,
            BigDecimal saldoAlmoxarifado
    ) {
    }

    /** O caminhão por obra; {@code idObra} nulo = material livre (de nenhuma obra). */
    public record GrupoCaminhao(UUID idObra, String numeroObra, String tituloObra, List<ItemCaminhao> itens) {
    }

    /** Uma linha do inventário dos caminhões: equipe × obra × material (quantidade negativa = saldo negativo). */
    public record ItemNasEquipes(
            UUID idEquipe,
            String equipe,
            UUID idObra,
            String numeroObra,
            String tituloObra,
            UUID idMaterial,
            String codigo,
            String descricao,
            String unidade,
            String condicao,
            BigDecimal quantidade) {
    }

    public record ItemCaminhao(
            UUID idMaterial,
            String codigo,
            String descricao,
            String unidade,
            String condicao,
            BigDecimal quantidade,
            boolean detalhaSerie,
            List<String> series
    ) {
    }

    public record ItemAtendimento(
            String codigo,
            String descricao,
            String unidade,
            BigDecimal quantidade,
            String condicao,
            String numeroObra,
            String numeroSerie,
            String destino,
            BigDecimal excedente,
            String motivoExcedente
    ) {
    }

    public record AtendimentoResumo(
            UUID id,
            String tipo,
            UUID idEquipe,
            String equipe,
            String nomeColaborador,
            String matricula,
            OffsetDateTime realizadoEm,
            String operador,
            boolean temAssinatura,
            boolean assinaturaFisica,
            boolean temFoto,
            String observacao,
            List<ItemAtendimento> itens
    ) {
    }
}
