package com.nexo.app.modules.frota.doc;

import com.nexo.app.modules.frota.application.dto.AbrirReparoSinistroRequest;
import com.nexo.app.modules.frota.application.dto.AcionarSeguradoraRequest;
import com.nexo.app.modules.frota.application.dto.CancelarSinistroRequest;
import com.nexo.app.modules.frota.application.dto.FinalizarSinistroRequest;
import com.nexo.app.modules.frota.application.dto.ResumoSinistrosResponse;
import com.nexo.app.modules.frota.application.dto.SinistroFilter;
import com.nexo.app.modules.frota.application.dto.SinistroRequest;
import com.nexo.app.modules.frota.application.dto.SinistroResponse;
import com.nexo.app.shared.application.dto.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.core.io.Resource;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MultipartFile;

import java.util.UUID;

@Tag(name = "Frota — Sinistros", description = "Acidentes, furtos, assaltos e cargas avariadas, com a seguradora e a OS de reparo")
public interface SinistroFrotaControllerDoc {

    @Operation(summary = "Listar sinistros", description = "Filtro por veículo, placa, base, tipo, situação, condutor, apólice e período.")
    ResponseEntity<PageResponse<SinistroResponse>> listar(SinistroFilter filtro, Pageable pageable);

    @Operation(summary = "Totais", description = "Quantidade do recorte por tipo, base e condutor, em andamento, com culpa do condutor e franquias pagas.")
    ResponseEntity<ResumoSinistrosResponse> resumo(SinistroFilter filtro);

    @Operation(summary = "Detalhe do sinistro")
    ResponseEntity<SinistroResponse> buscar(UUID id);

    @Operation(summary = "Registrar sinistro", description = "Sem condutor, fica quem estava vinculado ao veículo no instante. Avisa a gestão da frota.")
    ResponseEntity<SinistroResponse> registrar(SinistroRequest request);

    @Operation(summary = "Corrigir sinistro", description = "Enquanto não finalizado nem cancelado; o veículo não muda.")
    ResponseEntity<SinistroResponse> atualizar(UUID id, SinistroRequest request);

    @Operation(summary = "Abrir OS de reparo", description = "OS do veículo com origem SINISTRO, ligada ao sinistro, que passa a em oficina.")
    ResponseEntity<SinistroResponse> abrirOrdemServico(UUID id, AbrirReparoSinistroRequest request);

    @Operation(summary = "Acionar seguradora", description = "A apólice precisa cobrir o veículo no dia do sinistro.")
    ResponseEntity<SinistroResponse> acionarSeguradora(UUID id, AcionarSeguradoraRequest request);

    @Operation(summary = "Finalizar", description = "Exige a OS de reparo concluída ou cancelada.")
    ResponseEntity<SinistroResponse> finalizar(UUID id, FinalizarSinistroRequest request);

    @Operation(summary = "Cancelar", description = "Exige a OS de reparo cancelada, se houver.")
    ResponseEntity<SinistroResponse> cancelar(UUID id, CancelarSinistroRequest request);

    @Operation(summary = "Anexar foto ou documento", description = "PDF ou imagem até 15 MB (fotos, boletim de ocorrência).")
    ResponseEntity<SinistroResponse> anexar(UUID id, MultipartFile arquivo);

    @Operation(summary = "Baixar anexo")
    ResponseEntity<Resource> baixarAnexo(UUID id, UUID idAnexo);

    @Operation(summary = "Remover anexo")
    ResponseEntity<SinistroResponse> removerAnexo(UUID id, UUID idAnexo);
}
