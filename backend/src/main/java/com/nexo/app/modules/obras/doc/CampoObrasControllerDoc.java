package com.nexo.app.modules.obras.doc;

import com.nexo.app.modules.obras.application.dto.CampoObrasRequests;
import com.nexo.app.modules.obras.application.dto.CampoObrasResponses;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Tag(name = "Obras - Campo", description = "Contrato offline do app de campo: pacote da equipe e comandos idempotentes pelo id do aparelho")
@SecurityRequirement(name = "bearerAuth")
public interface CampoObrasControllerDoc {

    @Operation(summary = "Pacote offline da equipe",
            description = "Agenda de hoje e dos próximos 7 dias, obras, projeto, pontos, itens, modelos e avisos. Com `desde`, só o que mudou. "
                    + "O encarregado recebe a própria equipe; pedir outra responde 403.")
    ResponseEntity<CampoObrasResponses.Pacote> pacote(OffsetDateTime desde, UUID idEquipe);

    @Operation(summary = "Baixar o projeto em PDF da obra", description = "O ETag é o hash informado no pacote.")
    ResponseEntity<StreamingResponseBody> projeto(UUID idObra);

    @Operation(summary = "Pendências de foto da obra", description = "Fotos obrigatórias do modelo que faltam nos pontos executados.")
    ResponseEntity<List<CampoObrasResponses.PendenciaFoto>> pendenciasFoto(UUID idObra);

    @Operation(summary = "Registrar APR", description = "Com `concluir`, conclui no mesmo comando, na hora do aparelho.")
    ResponseEntity<CampoObrasResponses.Resultado> registrarApr(CampoObrasRequests.Apr comando);

    @Operation(summary = "Concluir APR enviada antes")
    ResponseEntity<CampoObrasResponses.Resultado> concluirApr(CampoObrasRequests.ConclusaoApr comando);

    @Operation(summary = "Registrar ocorrência", description = "Com `impedeExecucao`, é o \"Sem condição de executar\".")
    ResponseEntity<CampoObrasResponses.Resultado> registrarOcorrencia(CampoObrasRequests.Ocorrencia comando);

    @Operation(summary = "Registrar obra não programada")
    ResponseEntity<CampoObrasResponses.Resultado> registrarAtividade(CampoObrasRequests.Atividade comando);

    @Operation(summary = "Apontar execução", description = "Por item ou \"Tudo feito\" no ponto (`pontoInteiro`).")
    ResponseEntity<CampoObrasResponses.Resultado> apontar(CampoObrasRequests.Apontamento comando);

    @Operation(summary = "Registrar chegada ou saída da obra")
    ResponseEntity<CampoObrasResponses.Resultado> registrarPresenca(CampoObrasRequests.Presenca comando);

    @Operation(summary = "Salvar o relatório diário montado no app")
    ResponseEntity<CampoObrasResponses.Resultado> salvarRelatorio(CampoObrasRequests.Relatorio comando);

    @Operation(summary = "Enviar foto do ponto ou vão", description = "Multipart: `dados` (JSON) e `arquivo`.")
    ResponseEntity<CampoObrasResponses.Resultado> registrarEvidencia(CampoObrasRequests.Evidencia dados, MultipartFile arquivo);

    @Operation(summary = "Chave pública VAPID", description = "Vazia com o Web Push desligado.")
    ResponseEntity<Map<String, String>> chavePush();

    @Operation(summary = "Assinar avisos por Web Push neste aparelho")
    ResponseEntity<Void> assinarPush(CampoObrasRequests.AssinaturaPush pedido);

    @Operation(summary = "Cancelar a assinatura de Web Push deste aparelho")
    ResponseEntity<Void> cancelarPush(CampoObrasRequests.AssinaturaPush pedido);
}
