package com.nexo.app.modules.obras.doc;

import com.nexo.app.modules.obras.application.dto.RevisaoFotosDtos;
import com.nexo.app.shared.application.dto.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Tag(name = "Obras - Revisão de fotos", description = "Revisão das fotos de campo antes da medição, inconformidades e ranking por equipe")
@SecurityRequirement(name = "bearerAuth")
public interface RevisaoFotosControllerDoc {

    @Operation(summary = "Fila de revisão", description = "Paginada; sem status, traz as pendentes (mais antigas primeiro).")
    ResponseEntity<PageResponse<RevisaoFotosDtos.FotoParaRevisao>> listar(RevisaoFotosDtos.RevisaoFotoFilter filtro, Pageable pageable);

    @Operation(summary = "Aprovar ou reprovar a foto", description = "Reprovada volta a ser pendência para a equipe e não entra na medição.")
    ResponseEntity<RevisaoFotosDtos.FotoParaRevisao> revisar(UUID id, RevisaoFotosDtos.Decisao decisao);

    @Operation(summary = "Ranking de qualidade das fotos por equipe", description = "Padrão: últimos 30 dias.")
    ResponseEntity<List<RevisaoFotosDtos.LinhaRanking>> ranking(LocalDate de, LocalDate ate);

    @Operation(summary = "Tipos de inconformidade")
    ResponseEntity<List<RevisaoFotosDtos.OpcaoInconformidade>> inconformidades();
}
