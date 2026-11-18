package com.nexo.app.modules.sst;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * API pública, somente leitura, com os números dos relatórios periódicos de SST (as
 * automações semanais de metas e de desvios). Os números são os mesmos das telas de
 * acompanhamento de metas e de desvios: a regra continua dentro do módulo.
 */
public interface SstRelatoriosApi {

    /**
     * Metas de inspeção na data {@code hoje}, com o que cada pessoa lançou na semana
     * passada (segunda a domingo) e, quando um período acabou de virar, como ele fechou.
     */
    MetasDaSemana metasDaSemana(LocalDate hoje);

    /** Desvios ainda não resolvidos (abertos ou em tratamento), de toda a empresa. */
    List<DesvioPendente> desviosPendentes();

    /**
     * @param semanaInicio       segunda-feira da semana passada
     * @param semanaFim          domingo da semana passada
     * @param pessoas            situação de cada pessoa no período em curso
     * @param fechamentoAnterior períodos que terminaram na última semana, já com o resultado final
     */
    record MetasDaSemana(
            LocalDate hoje,
            LocalDate semanaInicio,
            LocalDate semanaFim,
            List<MetaPessoa> pessoas,
            List<MetaPessoa> fechamentoAnterior) {
    }

    /**
     * @param situacao        ATINGIDA, EM_ANDAMENTO ou NAO_ATINGIDA
     * @param realizadoSemana inspeções do tipo da meta lançadas na semana passada
     */
    record MetaPessoa(
            UUID idColaborador,
            String nome,
            UUID idUsuario,
            String funcao,
            String base,
            String processo,
            String tipoInspecao,
            LocalDate janelaInicio,
            LocalDate janelaFim,
            long diasRestantes,
            int meta,
            long realizado,
            long realizadoSemana,
            BigDecimal percentual,
            String situacao) {
    }

    /**
     * @param inspetor      quem registrou a inspeção (é quem trata o desvio)
     * @param processo      processo da inspeção ou, sem ele, o do inspetor
     * @param gravidade     BAIXA, MEDIA, ALTA ou CRITICA
     * @param status        ABERTO ou EM_TRATAMENTO
     * @param diasEmAtraso  dias além do prazo; nulo quando não venceu
     */
    record DesvioPendente(
            UUID id,
            UUID idInspecao,
            UUID idInspetor,
            String inspetor,
            String processo,
            String base,
            String equipe,
            String formulario,
            String pergunta,
            String descricao,
            String gravidade,
            String status,
            LocalDate prazo,
            boolean vencido,
            Integer diasEmAtraso,
            LocalDate dataInspecao,
            List<String> colaboradores) {
    }
}
