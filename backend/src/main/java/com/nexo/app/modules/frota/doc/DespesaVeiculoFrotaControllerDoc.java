package com.nexo.app.modules.frota.doc;

import com.nexo.app.modules.frota.application.dto.DespesaImportacaoLinha;
import com.nexo.app.modules.frota.application.dto.DespesaVeiculoFilter;
import com.nexo.app.modules.frota.application.dto.DespesaVeiculoRequest;
import com.nexo.app.modules.frota.application.dto.DespesaVeiculoResponse;
import com.nexo.app.modules.frota.application.dto.ImportacaoDespesasResponse;
import com.nexo.app.modules.frota.application.dto.PreenchimentoFinanceiroResponse;
import com.nexo.app.modules.frota.application.dto.ResumoDespesasResponse;
import com.nexo.app.shared.application.dto.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.core.io.Resource;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

@Tag(name = "Frota — Despesas por veículo", description = "Lavagens, pedágios, estacionamentos, mensalidades e outras despesas")
public interface DespesaVeiculoFrotaControllerDoc {

    @Operation(summary = "Listar despesas", description = "Filtro por veículo, placa, base, tipo, período, forma e situação do pagamento.")
    ResponseEntity<PageResponse<DespesaVeiculoResponse>> listar(DespesaVeiculoFilter filtro, Pageable pageable);

    @Operation(summary = "Totais", description = "Total do recorte, por tipo e quanto falta mandar ao financeiro.")
    ResponseEntity<ResumoDespesasResponse> resumo(DespesaVeiculoFilter filtro);

    @Operation(summary = "Detalhe da despesa")
    ResponseEntity<DespesaVeiculoResponse> buscar(UUID id);

    @Operation(summary = "Lançar despesa", description = "Sem base, vale a do veículo; sem forma de pagamento, vai ao financeiro.")
    ResponseEntity<DespesaVeiculoResponse> criar(DespesaVeiculoRequest request);

    @Operation(summary = "Corrigir despesa", description = "Com pagamento pedido ou aprovado, valor, fornecedor, documento e forma não mudam.")
    ResponseEntity<DespesaVeiculoResponse> atualizar(UUID id, DespesaVeiculoRequest request);

    @Operation(summary = "Excluir despesa", description = "Exclusão lógica; recusada com pagamento pedido ou aprovado.")
    ResponseEntity<Void> excluir(UUID id);

    @Operation(summary = "Anexar comprovante", description = "PDF ou imagem até 15 MB.")
    ResponseEntity<DespesaVeiculoResponse> anexar(UUID id, MultipartFile arquivo);

    @Operation(summary = "Baixar comprovante")
    ResponseEntity<Resource> baixarAnexo(UUID id, UUID idAnexo);

    @Operation(summary = "Remover comprovante")
    ResponseEntity<DespesaVeiculoResponse> removerAnexo(UUID id, UUID idAnexo);

    @Operation(summary = "Preenchimento do pagamento",
            description = "Valores para o formulário de pagamento do financeiro (origem FROTA_DESPESA); a solicitação criada fica vinculada à despesa.")
    ResponseEntity<PreenchimentoFinanceiroResponse> preenchimentoFinanceiro(UUID id);

    @Operation(summary = "Validar planilha", description = "Modelo C.E.S (CSV com ponto e vírgula); devolve a pré-visualização linha a linha.")
    ResponseEntity<ImportacaoDespesasResponse> validarImportacao(MultipartFile arquivo);

    @Operation(summary = "Confirmar importação", description = "Grava as linhas conferidas; com id externo, atualiza em vez de duplicar.")
    ResponseEntity<ImportacaoDespesasResponse> confirmarImportacao(List<DespesaImportacaoLinha> linhas);

    @Operation(summary = "Modelo da planilha")
    ResponseEntity<byte[]> modelo();
}
