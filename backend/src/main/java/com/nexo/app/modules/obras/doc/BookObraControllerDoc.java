package com.nexo.app.modules.obras.doc;

import com.nexo.app.modules.obras.application.dto.BookObraResponses;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;

import java.util.UUID;

@Tag(name = "Obras - Book e entrega documental", description = "Completude do book, auditoria de entrega, previsto x realizado e visão da carteira")
@SecurityRequirement(name = "bearerAuth")
public interface BookObraControllerDoc {

    @Operation(summary = "Painel documental da obra",
            description = "Indicadores do book (pontos com e sem foto, itens obrigatórios faltando, fichas), semáforo, pendências, "
                    + "auditoria de entrega com quem/quando e as versões do As Built e do Book.")
    ResponseEntity<BookObraResponses.Painel> painel(UUID id);

    @Operation(summary = "Previsto x realizado da obra",
            description = "Por ponto e vão: itens planejados com o previsto, o executado e a diferença, e as divergências da documentação.")
    ResponseEntity<BookObraResponses.Comparativo> comparativo(UUID id);

    @Operation(summary = "Situação documental da carteira", description = "Uma linha por obra ativa, com o semáforo, o percentual pronto e as últimas versões.")
    ResponseEntity<BookObraResponses.Consolidado> consolidado();
}
