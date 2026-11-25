package com.nexo.app.modules.rh.application.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.hibernate.validator.constraints.br.CPF;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Record para criação de um novo colaborador.
 */
public record ColaboradorRequest(
    @NotBlank(message = "Primeiro nome é obrigatório")
    String primeiroNome,

    @NotBlank(message = "Último nome é obrigatório")
    String ultimoNome,

    @NotBlank(message = "Nome completo é obrigatório")
    String nomeCompleto,

    @CPF(message = "CPF inválido")
    @NotBlank(message = "CPF é obrigatório")
    String cpf,

    @NotNull(message = "A data de contratação é obrigatória")
    LocalDate dataContratacao,

    @NotNull(message = "O ID do processo é obrigatório")
    UUID idProcesso,

    @NotNull(message = "O ID da Base Operacional é obrigatório")
    UUID idBaseOperacional,

    @NotNull(message = "O ID da função é obrigatório")
    UUID idFuncao,

    /** Matrícula da empresa (opcional, única entre os colaboradores ativos). */
    @jakarta.validation.constraints.Size(max = 30, message = "A matrícula deve ter até 30 caracteres.")
    String matricula
) {
    public ColaboradorRequest(String primeiroNome, String ultimoNome, String nomeCompleto, String cpf, LocalDate dataContratacao, UUID idProcesso, UUID idBaseOperacional, UUID idFuncao) {
        this(primeiroNome, ultimoNome, nomeCompleto, cpf, dataContratacao, idProcesso, idBaseOperacional, idFuncao, null);
    }
}
