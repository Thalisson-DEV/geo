package com.nexo.app.modules.rh;

import java.time.LocalDate;
import java.util.UUID;

public record ColaboradorResponse(
        UUID id,
        UUID idUsuario,
        String primeiroNome,
        String ultimoNome,
        String nomeCompleto,
        String cpf,
        ProcessoNegocioResponse processo,
        BaseOperacionalResponse baseOperacional,
        FuncaoResponse funcao, // 🔍 Usando DTO de resposta da nova Entidade
        LocalDate dataContratacao,
        boolean ativo,
        /** Matrícula da empresa: identifica quem retira material no balcão do almoxarifado. */
        String matricula
) {
    public ColaboradorResponse(UUID id, UUID idUsuario, String primeiroNome, String ultimoNome, String nomeCompleto,
                               String cpf, ProcessoNegocioResponse processo, BaseOperacionalResponse baseOperacional,
                               FuncaoResponse funcao, LocalDate dataContratacao, boolean ativo) {
        this(id, idUsuario, primeiroNome, ultimoNome, nomeCompleto, cpf, processo, baseOperacional, funcao,
                dataContratacao, ativo, null);
    }
}
