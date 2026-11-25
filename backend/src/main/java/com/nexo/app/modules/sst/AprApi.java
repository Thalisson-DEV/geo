package com.nexo.app.modules.sst;

import java.util.List;
import java.util.Map;

/**
 * Porta pública do cadastro da APR mantido pelo SST. O app de campo (via Obras) usa estas opções para montar a APR que
 * a equipe preenche antes de executar.
 */
public interface AprApi {

    /**
     * Opções da APR em texto, na ordem do cadastro.
     *
     * @return {@code sugestoes}: por condição do serviço (SEMPRE, DESLIGAMENTO, LINHA_VIVA...), os riscos e medidas
     * que vêm marcados; {@code medidasDoRisco}: medidas marcadas junto com cada risco;
     * {@code condicoesDasVerificacoes}: só para verificações que não valem em todo serviço.
     */
    OpcoesAprCampo opcoesParaCampo();

    record OpcoesAprCampo(List<String> riscos, List<String> medidas, List<String> verificacoes,
                          Map<String, Sugestao> sugestoes, Map<String, List<String>> medidasDoRisco,
                          Map<String, List<String>> condicoesDasVerificacoes) {
    }

    record Sugestao(List<String> riscos, List<String> medidas) {
    }
}
