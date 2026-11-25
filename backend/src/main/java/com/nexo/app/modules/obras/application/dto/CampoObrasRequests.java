package com.nexo.app.modules.obras.application.dto;

import com.nexo.app.modules.obras.domain.AprTurno;
import com.nexo.app.modules.obras.domain.EvidenciaPonto;
import com.nexo.app.modules.obras.domain.FormularioApr;
import com.nexo.app.modules.obras.domain.PresencaObra;
import com.nexo.app.modules.obras.domain.RegistroCampo;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Comandos que a equipe lança pelo app, offline. Cada um traz o id gerado no aparelho ({@link Campo#idLocal()}): o
 * reenvio com o mesmo id e o mesmo conteúdo devolve o registro já gravado.
 */
public final class CampoObrasRequests {

    private CampoObrasRequests() {
    }

    /**
     * Dados do aparelho comuns a todo comando. Sem {@code idTurno} (ou com o id provisório do aparelho), vale o turno
     * que a equipe tinha aberto no {@code instante}.
     */
    public record Campo(
            @NotNull(message = "Informe o id do aparelho") UUID idLocal,
            UUID idTurno,
            OffsetDateTime instante,
            BigDecimal latitude,
            BigDecimal longitude,
            BigDecimal precisao) {

        public RegistroCampo.Origem origem() {
            return new RegistroCampo.Origem(instante, latitude, longitude, precisao);
        }

        /** O turno não entra no hash: o aparelho pode reenviar já com o id definitivo do turno aberto offline. */
        public Campo semTurno() {
            return new Campo(idLocal, null, instante, latitude, longitude, precisao);
        }
    }

    public record Apr(
            @NotNull @Valid Campo campo,
            @NotNull(message = "Informe a obra") UUID idObra,
            UUID idProgramacao,
            @NotBlank(message = "Informe a atividade") @Size(max = 500) String atividade,
            UUID idResponsavel,
            FormularioApr formulario,
            List<AprTurno.Assinatura> assinaturas,
            /** Concluir no mesmo comando (o app manda a APR já concluída quando a equipe termina offline). */
            boolean concluir) {
    }

    public record ConclusaoApr(
            @NotNull @Valid Campo campo,
            @NotNull(message = "Informe a APR") UUID idApr) {
    }

    public record Ocorrencia(
            @NotNull @Valid Campo campo,
            UUID idObra,
            UUID idProgramacao,
            @NotBlank(message = "Informe o tipo da ocorrência") String tipo,
            @NotBlank(message = "Descreva a ocorrência") @Size(max = 2000) String descricao,
            boolean impedeExecucao) {
    }

    /** Obra não programada: a equipe atuou numa obra que não estava na agenda. */
    public record Atividade(
            @NotNull @Valid Campo campo,
            @NotNull(message = "Informe a obra") UUID idObra,
            @NotBlank(message = "Informe o motivo") @Size(max = 1000) String motivo) {
    }

    /**
     * Apontamento do app. Com {@code pontoInteiro}, aponta o restante de todos os itens do ponto (ou vão) na programação
     * e {@code itens} é ignorado; sem ele, aponta os itens informados. Sem programação e com a obra, é a execução avulsa
     * (obra fora da agenda): o servidor monta a programação avulsa da equipe no dia.
     */
    public record Apontamento(
            @NotNull @Valid Campo campo,
            UUID idProgramacao,
            UUID idObra,
            UUID idPonto,
            boolean pontoInteiro,
            @Valid List<TurnoObraRequests.LinhaApontamento> itens,
            /** A APR que libera este serviço, pelo id do aparelho; informativo para a fila do app. */
            UUID idApr) {
    }

    public record Presenca(
            @NotNull @Valid Campo campo,
            @NotNull(message = "Informe a obra") UUID idObra,
            UUID idProgramacao,
            @NotNull(message = "Informe se é chegada ou saída") PresencaObra.Tipo tipo) {
    }

    /** Metadados da foto; o arquivo vai à parte (multipart ou anexo do envio durável). */
    public record Evidencia(
            @NotNull @Valid Campo campo,
            @NotNull(message = "Informe a obra") UUID idObra,
            UUID idPonto,
            UUID idVao,
            UUID idProgramacao,
            UUID idApontamento,
            UUID idModelo,
            @Size(max = 100) String idItem,
            EvidenciaPonto.Etapa etapa,
            @Size(max = 500) String legenda) {
    }

    /** Relatório diário montado no app ao fechar o turno; grava (ou substitui) o relatório do turno. */
    public record Relatorio(
            @NotNull @Valid Campo campo,
            @NotBlank(message = "Informe a observação geral") @Size(max = 4000) String observacao) {
    }

    /** Assinatura de Web Push do aparelho. */
    public record AssinaturaPush(
            @NotBlank @Size(max = 1000) String endpoint,
            @NotBlank @Size(max = 200) String p256dh,
            @NotBlank @Size(max = 100) String auth) {
    }
}
