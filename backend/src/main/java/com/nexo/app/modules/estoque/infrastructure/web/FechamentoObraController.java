package com.nexo.app.modules.estoque.infrastructure.web;

import com.nexo.app.modules.estoque.application.dto.FechamentoObraFilter;
import com.nexo.app.modules.estoque.application.dto.FechamentoObraRequests;
import com.nexo.app.modules.estoque.application.dto.FechamentoObraResponses;
import com.nexo.app.modules.estoque.application.dto.HistoricoSolicitacaoResponse;
import com.nexo.app.modules.estoque.application.usecases.ExportarFechamentoObraUseCase;
import com.nexo.app.modules.estoque.application.usecases.FechamentoObraUseCases;
import com.nexo.app.modules.estoque.application.usecases.ImportacaoFechamentoObraUseCases;
import com.nexo.app.modules.estoque.application.usecases.MovimentacaoFechamentoUseCases;
import com.nexo.app.modules.estoque.domain.SituacaoFechamentoObra;
import com.nexo.app.modules.estoque.domain.SituacaoFechamentoSolicitacao;
import com.nexo.app.modules.estoque.domain.SituacaoPrazoFechamento;
import com.nexo.app.modules.estoque.domain.TipoSolicitacaoTecnica;
import com.nexo.app.shared.application.dto.PageResponse;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import com.nexo.app.shared.infrastructure.security.SecurityUtils;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Encerramento de obras: solicitações para regularizar o saldo da obra no SAP. */
@RestController
@RequestMapping("/v1/obras/encerramento")
@RequiredArgsConstructor
@Tag(name = "Encerramento de obras", description = "Solicitações 221/921/222/922 para regularizar o saldo da obra. "
        + "Sem agendamento, separação ou assinatura; o almoxarifado marca como movimentado, com efeito físico "
        + "(almoxarifado <-> estoque da obra) ou virtual. Falta de saldo não barra: o lado que perde fica negativo.")
@SecurityRequirement(name = "bearerAuth")
public class FechamentoObraController {

    private static final String LER = "hasAuthority('obras:fechamento:read')";
    private static final String CRIAR = "hasAuthority('obras:fechamento:create')";
    private static final String MOVIMENTAR = "hasAuthority('obras:fechamento:movimentar')";
    private static final String PENDENCIA = "hasAnyAuthority('obras:fechamento:create', 'obras:fechamento:movimentar')";

    private final FechamentoObraUseCases fechamento;
    private final MovimentacaoFechamentoUseCases movimentacoes;
    private final ImportacaoFechamentoObraUseCases importacao;
    private final ExportarFechamentoObraUseCase exportacao;

    @GetMapping
    @Operation(summary = "Lista as solicitações de encerramento",
            description = "minhas=true mostra só as do usuário logado. Ordem padrão: prazo em curso mais próximo. "
                    + "busca procura no número e no título da obra e no número da reserva; agendaDe/agendaAte "
                    + "trazem o que vence ou foi concluído no intervalo, para o calendário.")
    @PreAuthorize(LER)
    public ResponseEntity<PageResponse<FechamentoObraResponses.Resumo>> listar(
            @RequestParam(defaultValue = "false") boolean minhas,
            @RequestParam(required = false) UUID idSolicitante,
            @RequestParam(required = false) UUID idObra,
            @RequestParam(required = false) List<String> tipos,
            @RequestParam(required = false) List<SituacaoFechamentoSolicitacao> situacoes,
            @RequestParam(required = false) SituacaoPrazoFechamento prazo,
            @RequestParam(required = false) Boolean comPendencia,
            @RequestParam(required = false) UUID idSupervisor,
            @RequestParam(required = false) UUID idCoordenador,
            @RequestParam(required = false) UUID idEncarregado,
            @RequestParam(required = false) SituacaoFechamentoObra situacaoObra,
            @RequestParam(required = false) String reserva,
            @RequestParam(required = false) UUID idAlmoxarifado,
            @RequestParam(required = false) LocalDate criadaDe,
            @RequestParam(required = false) LocalDate criadaAte,
            @RequestParam(required = false) LocalDate agendaDe,
            @RequestParam(required = false) LocalDate agendaAte,
            @RequestParam(required = false) String busca,
            @RequestParam(defaultValue = "prazo") String ordenacao,
            @RequestParam(defaultValue = "asc") String direcao,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        FechamentoObraFilter filtro = new FechamentoObraFilter(
                minhas ? SecurityUtils.getUsuarioLogadoId() : idSolicitante,
                idObra,
                tipos == null ? null : tipos.stream().map(TipoSolicitacaoTecnica::porCodigo).toList(),
                situacoes, prazo, comPendencia, idSupervisor, idCoordenador, idEncarregado, situacaoObra, reserva,
                idAlmoxarifado, criadaDe, criadaAte, agendaDe, agendaAte, busca);
        return ResponseEntity.ok(fechamento.listar(filtro, PageRequest.of(Math.max(page, 0), size, ordem(ordenacao, direcao))));
    }

    /** Sem prazo em curso (movimentada ou cancelada) fica sempre depois das que ainda correm. */
    private static Sort ordem(String ordenacao, String direcao) {
        Sort.Direction sentido = "desc".equalsIgnoreCase(direcao) ? Sort.Direction.DESC : Sort.Direction.ASC;
        Sort.Order recentes = Sort.Order.desc("dataSolicitacao");
        return switch (ordenacao == null ? "" : ordenacao) {
            case "solicitacao" -> Sort.by(new Sort.Order(sentido, "dataSolicitacao"));
            case "situacao" -> Sort.by(new Sort.Order(sentido, "situacaoFechamento"), recentes);
            case "tipo" -> Sort.by(new Sort.Order(sentido, "tipoTecnico"), recentes);
            case "almoxarifado" -> Sort.by(new Sort.Order(sentido, "almoxarifadoAtendimento.nomeIdentificador"), recentes);
            case "reserva" -> Sort.by(new Sort.Order(sentido, "reserva.numero").nullsLast(), recentes);
            case "obra", "encarregado", "supervisor", "coordenador", "solicitante", "itens" ->
                    Sort.by(new Sort.Order(sentido, ordenacao));
            default -> Sort.by(new Sort.Order(sentido, "prazoVigenteAte").nullsLast(), recentes);
        };
    }

    @GetMapping("/solicitantes")
    @Operation(summary = "Quem já criou solicitações de encerramento, para o filtro por solicitante")
    @PreAuthorize(LER)
    public ResponseEntity<List<FechamentoObraResponses.Pessoa>> solicitantes() {
        return ResponseEntity.ok(fechamento.solicitantes());
    }

    @GetMapping("/obras/situacoes")
    @Operation(summary = "Situação do encerramento de várias obras, para a lista de obras",
            description = "Obra sem solicitação de encerramento não vem na resposta.")
    @PreAuthorize(LER)
    public ResponseEntity<Map<UUID, SituacaoFechamentoObra>> situacoesObras(@RequestParam List<UUID> ids) {
        return ResponseEntity.ok(fechamento.situacoesObras(ids));
    }

    @GetMapping("/obras/{idObra}/situacao")
    @Operation(summary = "Situação do encerramento da obra")
    @PreAuthorize("hasAnyAuthority('obras:fechamento:read', 'obras:obra:read')")
    public ResponseEntity<FechamentoObraResponses.SituacaoObra> situacaoObra(@PathVariable UUID idObra) {
        return ResponseEntity.ok(fechamento.situacaoObra(idObra));
    }

    @GetMapping("/exportar/{formato}")
    @Operation(summary = "Exporta em CSV o recorte da lista: resumo (uma linha por solicitação) ou detalhado (uma por material)")
    @PreAuthorize(LER)
    public ResponseEntity<byte[]> exportar(@PathVariable String formato, FiltroExportacao filtro) {
        boolean detalhado = "detalhado".equals(formato);
        if (!detalhado && !"resumo".equals(formato)) {
            throw new RecursoNaoEncontradoException("Formato de exportação não encontrado.");
        }
        FechamentoObraFilter recorte = filtro.recorte(SecurityUtils.getUsuarioLogadoId());
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"fechamento_obras_" + formato + ".csv\"")
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .body(detalhado ? exportacao.detalhado(recorte) : exportacao.resumo(recorte));
    }

    @GetMapping("/importar/modelo")
    @Operation(summary = "Modelo CSV da importação de solicitações de encerramento")
    @PreAuthorize(CRIAR)
    public ResponseEntity<byte[]> modeloImportacao() {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"modelo-importacao-encerramento-obras.csv\"")
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .body(importacao.modeloCsv());
    }

    @PostMapping(value = "/importar/validar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Lê e valida a planilha; nada é gravado")
    @PreAuthorize(CRIAR)
    public ResponseEntity<FechamentoObraResponses.Importacao> validarImportacao(
            @RequestPart("arquivo") MultipartFile arquivo) {
        return ResponseEntity.ok(importacao.validarArquivo(arquivo));
    }

    @PostMapping("/importar/revalidar")
    @Operation(summary = "Valida de novo as linhas corrigidas na pré-visualização; nada é gravado")
    @PreAuthorize(CRIAR)
    public ResponseEntity<FechamentoObraResponses.Importacao> revalidarImportacao(
            @RequestBody FechamentoObraRequests.Importar request) {
        return ResponseEntity.ok(importacao.revalidar(request.registros()));
    }

    @PostMapping("/importar/confirmar")
    @Operation(summary = "Cria as solicitações das linhas válidas; cada solicitação grava por conta própria")
    @PreAuthorize(CRIAR)
    public ResponseEntity<FechamentoObraResponses.Importacao> confirmarImportacao(
            @RequestBody FechamentoObraRequests.Importar request,
            @RequestHeader(value = "Idempotency-Key", required = false) String chave
    ) {
        return ResponseEntity.ok(importacao.confirmar(request.registros(), SecurityUtils.getUsuarioLogadoId(), chave));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Detalhe da solicitação de encerramento, com as ações permitidas ao usuário")
    @PreAuthorize(LER)
    public ResponseEntity<FechamentoObraResponses.Detalhe> detalhe(@PathVariable UUID id) {
        return ResponseEntity.ok(fechamento.detalhe(id));
    }

    @GetMapping("/{id}/historico")
    @Operation(summary = "Linha do tempo da solicitação de encerramento")
    @PreAuthorize(LER)
    public ResponseEntity<HistoricoSolicitacaoResponse> historico(
            @PathVariable UUID id,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size
    ) {
        return ResponseEntity.ok(fechamento.historico(id, PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 200))));
    }

    @PostMapping
    @Operation(summary = "Cria uma ou mais solicitações de encerramento para a mesma obra (uma por tipo)")
    @PreAuthorize(CRIAR)
    public ResponseEntity<FechamentoObraResponses.Criacao> criar(
            @RequestBody FechamentoObraRequests.Criar request,
            @RequestHeader(value = "Idempotency-Key", required = false) String chave
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(fechamento.criar(request, SecurityUtils.getUsuarioLogadoId(), chave));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Edita materiais, quantidades, encarregado, supervisor e observação")
    @PreAuthorize(CRIAR)
    public ResponseEntity<FechamentoObraResponses.Detalhe> editar(
            @PathVariable UUID id, @RequestBody FechamentoObraRequests.Editar request) {
        fechamento.editar(id, request, SecurityUtils.getUsuarioLogadoId());
        return ResponseEntity.ok(fechamento.detalhe(id));
    }

    @PutMapping("/{id}/reserva")
    @Operation(summary = "Registra ou corrige a reserva (até a primeira movimentação não estornada)")
    @PreAuthorize(CRIAR)
    public ResponseEntity<FechamentoObraResponses.Detalhe> registrarReserva(
            @PathVariable UUID id, @RequestBody FechamentoObraRequests.RegistrarReserva request) {
        fechamento.registrarReserva(id, request, SecurityUtils.getUsuarioLogadoId());
        return ResponseEntity.ok(fechamento.detalhe(id));
    }

    @PostMapping("/{id}/pendencias")
    @Operation(summary = "Registra pendência geral (sem idItem) ou específica de um material")
    @PreAuthorize(PENDENCIA)
    public ResponseEntity<FechamentoObraResponses.Detalhe> registrarPendencia(
            @PathVariable UUID id, @RequestBody FechamentoObraRequests.Pendencia request) {
        fechamento.registrarPendencia(id, request, SecurityUtils.getUsuarioLogadoId());
        return ResponseEntity.ok(fechamento.detalhe(id));
    }

    @DeleteMapping("/{id}/pendencias")
    @Operation(summary = "Remove a pendência geral (sem idItem) ou a de um material")
    @PreAuthorize(PENDENCIA)
    public ResponseEntity<FechamentoObraResponses.Detalhe> removerPendencia(
            @PathVariable UUID id, @RequestParam(required = false) UUID idItem) {
        fechamento.removerPendencia(id, idItem, SecurityUtils.getUsuarioLogadoId());
        return ResponseEntity.ok(fechamento.detalhe(id));
    }

    @PostMapping("/{id}/cancelamento")
    @Operation(summary = "Cancela a solicitação sem movimentação líquida, com motivo")
    @PreAuthorize(CRIAR)
    public ResponseEntity<FechamentoObraResponses.Detalhe> cancelar(
            @PathVariable UUID id, @RequestBody FechamentoObraRequests.Cancelar request) {
        fechamento.cancelar(id, request, SecurityUtils.getUsuarioLogadoId());
        return ResponseEntity.ok(fechamento.detalhe(id));
    }

    @PostMapping("/{id}/movimentacoes")
    @Operation(summary = "Marca como movimentado (parcial por quantidade) com efeito físico ou virtual")
    @PreAuthorize(MOVIMENTAR)
    public ResponseEntity<FechamentoObraResponses.Detalhe> movimentar(
            @PathVariable UUID id,
            @RequestBody FechamentoObraRequests.Movimentar request,
            @RequestHeader(value = "Idempotency-Key", required = false) String chave
    ) {
        movimentacoes.movimentar(id, request, SecurityUtils.getUsuarioLogadoId(), chave);
        return ResponseEntity.ok(fechamento.detalhe(id));
    }

    @PostMapping("/{id}/movimentacoes/previa")
    @Operation(summary = "Saldo resultante por material antes de confirmar uma movimentação física")
    @PreAuthorize(MOVIMENTAR)
    public ResponseEntity<FechamentoObraResponses.Previa> previaMovimentacao(
            @PathVariable UUID id, @RequestBody FechamentoObraRequests.Movimentar request) {
        return ResponseEntity.ok(movimentacoes.previaMovimentacao(id, request));
    }

    @PostMapping("/{id}/movimentacoes/{idOperacao}/estorno")
    @Operation(summary = "Estorna a movimentação inteira ou parte dos itens, com motivo")
    @PreAuthorize(MOVIMENTAR)
    public ResponseEntity<FechamentoObraResponses.Detalhe> estornar(
            @PathVariable UUID id,
            @PathVariable UUID idOperacao,
            @RequestBody FechamentoObraRequests.Estornar request,
            @RequestHeader(value = "Idempotency-Key", required = false) String chave
    ) {
        movimentacoes.estornar(id, idOperacao, request, SecurityUtils.getUsuarioLogadoId(), chave);
        return ResponseEntity.ok(fechamento.detalhe(id));
    }

    @PostMapping("/{id}/movimentacoes/{idOperacao}/estorno/previa")
    @Operation(summary = "Saldo resultante por material antes de confirmar o estorno")
    @PreAuthorize(MOVIMENTAR)
    public ResponseEntity<FechamentoObraResponses.Previa> previaEstorno(
            @PathVariable UUID id,
            @PathVariable UUID idOperacao,
            @RequestBody FechamentoObraRequests.Estornar request
    ) {
        return ResponseEntity.ok(movimentacoes.previaEstorno(id, idOperacao, request));
    }

    /** Mesmos filtros da lista, sem paginação. */
    public record FiltroExportacao(
            Boolean minhas,
            UUID idSolicitante,
            UUID idObra,
            List<String> tipos,
            List<SituacaoFechamentoSolicitacao> situacoes,
            SituacaoPrazoFechamento prazo,
            Boolean comPendencia,
            UUID idSupervisor,
            UUID idCoordenador,
            UUID idEncarregado,
            SituacaoFechamentoObra situacaoObra,
            String reserva,
            UUID idAlmoxarifado,
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate criadaDe,
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate criadaAte,
            String busca
    ) {
        FechamentoObraFilter recorte(UUID idUsuario) {
            return new FechamentoObraFilter(
                    Boolean.TRUE.equals(minhas) ? idUsuario : idSolicitante,
                    idObra,
                    tipos == null ? null : tipos.stream().map(TipoSolicitacaoTecnica::porCodigo).toList(),
                    situacoes, prazo, comPendencia, idSupervisor, idCoordenador, idEncarregado, situacaoObra, reserva,
                    idAlmoxarifado, criadaDe, criadaAte, null, null, busca);
        }
    }
}
