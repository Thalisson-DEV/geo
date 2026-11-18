package com.nexo.app.modules.rh.doc;

import com.nexo.app.modules.rh.application.dto.CancelarMedidaDisciplinarRequest;
import com.nexo.app.modules.rh.application.dto.MedidaDisciplinarFilter;
import com.nexo.app.modules.rh.application.dto.MedidaDisciplinarRequest;
import com.nexo.app.modules.rh.application.dto.MedidaDisciplinarResponse;
import com.nexo.app.modules.rh.application.dto.ReincidenciaMedidaDisciplinarResponse;
import com.nexo.app.shared.application.dto.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.core.io.Resource;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDate;
import java.util.UUID;

@Tag(name = "RH — Medidas disciplinares", description = "Lançamento, correção, cancelamento, anexos e histórico das medidas disciplinares (dado restrito)")
public interface MedidaDisciplinarControllerDoc {

    @Operation(summary = "Listar medidas", description = "Filtro por colaborador (nome), base, tipo, motivo, período do fato, situação e origem.")
    ResponseEntity<PageResponse<MedidaDisciplinarResponse>> listar(MedidaDisciplinarFilter filtro, Pageable pageable);

    @Operation(summary = "Detalhe da medida", description = "Com descrição dos fatos, histórico e anexos.")
    ResponseEntity<MedidaDisciplinarResponse> buscar(UUID id);

    @Operation(summary = "Reincidência", description = "Medidas aplicadas do colaborador com o mesmo motivo dentro da janela, e o tipo sugerido (não imposto).")
    ResponseEntity<ReincidenciaMedidaDisciplinarResponse> reincidencia(UUID idColaborador, UUID idMotivo, LocalDate dataFato, UUID idIgnorar);

    @Operation(summary = "Lançar medida", description = "A medida já foi aplicada ao colaborador: nasce aplicada e dispara o aviso de medida aplicada. Com origem (ex.: FROTA_MULTA), o módulo de origem grava o vínculo na mesma transação.")
    ResponseEntity<MedidaDisciplinarResponse> registrar(MedidaDisciplinarRequest request);

    @Operation(summary = "Corrigir medida", description = "Corrige os dados lançados enquanto a medida não foi cancelada.")
    ResponseEntity<MedidaDisciplinarResponse> editar(UUID id, MedidaDisciplinarRequest request);

    @Operation(summary = "Cancelar medida", description = "Exige justificativa; a medida fica no histórico e deixa de contar para a reincidência.")
    ResponseEntity<MedidaDisciplinarResponse> cancelar(UUID id, CancelarMedidaDisciplinarRequest request);

    @Operation(summary = "Anexar arquivo", description = "Opcional. PDF ou imagem até 15 MB (documento assinado, foto, outro documento).")
    ResponseEntity<MedidaDisciplinarResponse> anexar(UUID id, MultipartFile arquivo);

    @Operation(summary = "Baixar anexo")
    ResponseEntity<Resource> baixarAnexo(UUID id, UUID idAnexo);

    @Operation(summary = "Remover anexo", description = "Exclusão lógica; o arquivo fica para auditoria.")
    ResponseEntity<MedidaDisciplinarResponse> removerAnexo(UUID id, UUID idAnexo);
}
