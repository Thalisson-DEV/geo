package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.TipoModeloChecklist;
import com.nexo.app.modules.frota.domain.ModoFotoPergunta;
import com.nexo.app.modules.frota.domain.TipoRespostaChecklist;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Modelo completo: a lista de perguntas substitui a atual. Pergunta, opção, motivo ou foto
 * enviada com {@code id} mantém o registro; a que não vier é desativada.
 */
public record ModeloChecklistRequest(
        @NotBlank(message = "Informe o nome do modelo.") @Size(max = 120) String nome,
        @NotNull(message = "Informe se o modelo é principal ou adicional.") TipoModeloChecklist tipo,
        @Size(max = 2000) String instrucoes,
        Boolean exigeAssinatura,
        Set<UUID> idsTiposVeiculo,
        Set<UUID> idsTiposImplemento,
        @NotEmpty(message = "Inclua pelo menos uma pergunta no modelo.") @Size(max = 200) List<@Valid Pergunta> perguntas,
        @Size(max = 20) List<@Valid FotoRecebimento> fotosRecebimento
) {

    public record Pergunta(
            UUID id,
            @Size(max = 80) String grupo,
            @NotBlank(message = "Informe o texto da pergunta.") @Size(max = 300) String texto,
            @NotNull(message = "Informe o tipo de resposta da pergunta.") TipoRespostaChecklist tipoResposta,
            /** Legado: sem {@code modoFoto}, verdadeiro vale como foto no Não OK. */
            Boolean fotoNoNaoOk,
            ModoFotoPergunta modoFoto,
            @Size(max = 30) List<@Valid Alternativa> opcoes,
            @Size(max = 30) List<@Valid Alternativa> motivos
    ) {
    }

    public record Alternativa(
            UUID id,
            @NotBlank(message = "Informe o texto da opção.") @Size(max = 120) String texto,
            Boolean indicaProblema
    ) {
    }

    public record FotoRecebimento(
            UUID id,
            @NotBlank(message = "Informe a descrição da foto.") @Size(max = 120) String descricao
    ) {
    }
}
