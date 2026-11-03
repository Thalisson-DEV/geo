package com.nexo.app.modules.frota.doc;

import com.nexo.app.modules.frota.application.dto.ApoliceFilter;
import com.nexo.app.modules.frota.application.dto.ApoliceRequest;
import com.nexo.app.modules.frota.application.dto.ApoliceResponse;
import com.nexo.app.modules.frota.application.dto.CoberturaApoliceRequest;
import com.nexo.app.modules.frota.application.dto.EncerrarCoberturaRequest;
import com.nexo.app.modules.frota.application.dto.GerarParcelasRequest;
import com.nexo.app.modules.frota.application.dto.ParcelaApoliceRequest;
import com.nexo.app.modules.frota.application.dto.PreenchimentoFinanceiroResponse;
import com.nexo.app.shared.application.dto.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.core.io.Resource;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Tag(name = "Frota — Seguros", description = "Apólices, veículos cobertos, parcelas pelo financeiro e vencimento")
public interface ApoliceFrotaControllerDoc {

    @Operation(summary = "Listar apólices", description = "Filtro por número ou segurado, seguradora, veículo coberto, base e situação da vigência.")
    ResponseEntity<PageResponse<ApoliceResponse>> listar(ApoliceFilter filtro, Pageable pageable);

    @Operation(summary = "Apólices que cobrem o veículo", description = "Com dia, só as que cobriam o veículo nele (para acionar num sinistro).")
    ResponseEntity<List<ApoliceResponse>> cobrindo(UUID idVeiculo, LocalDate dia);

    @Operation(summary = "Seguro de cada veículo", description = "Veículos ativos com a cobertura de hoje: até quando, quem perde a cobertura dentro da faixa de aviso e quem está sem seguro.")
    ResponseEntity<List<com.nexo.app.modules.frota.application.dto.CoberturaVeiculoResponse>> coberturaVeiculos();

    @Operation(summary = "Detalhe da apólice")
    ResponseEntity<ApoliceResponse> buscar(UUID id);

    @Operation(summary = "Cadastrar apólice", description = "Seguradora e corretor do cadastro de fornecedores; os veículos informados ficam cobertos por toda a vigência.")
    ResponseEntity<ApoliceResponse> criar(ApoliceRequest request);

    @Operation(summary = "Corrigir apólice", description = "A nova vigência precisa conter os períodos dos veículos cobertos.")
    ResponseEntity<ApoliceResponse> atualizar(UUID id, ApoliceRequest request);

    @Operation(summary = "Excluir apólice", description = "Exclusão lógica; recusada com parcela com pagamento pedido ou aprovado.")
    ResponseEntity<Void> excluir(UUID id);

    @Operation(summary = "Incluir veículo", description = "Cobertura dentro da vigência, sem sobrepor outro período do mesmo veículo.")
    ResponseEntity<ApoliceResponse> incluirVeiculo(UUID id, CoberturaApoliceRequest request);

    @Operation(summary = "Encerrar cobertura", description = "O veículo saiu da apólice na data informada, com o motivo (venda, perda total, troca de apólice...).")
    ResponseEntity<ApoliceResponse> encerrarCobertura(UUID id, UUID idCobertura, EncerrarCoberturaRequest request);

    @Operation(summary = "Retirar veículo", description = "Cobertura lançada por engano.")
    ResponseEntity<ApoliceResponse> removerCobertura(UUID id, UUID idCobertura);

    @Operation(summary = "Gerar parcelas", description = "Parcelas mensais iguais; substitui as que ainda não foram ao financeiro.")
    ResponseEntity<ApoliceResponse> gerarParcelas(UUID id, GerarParcelasRequest request);

    @Operation(summary = "Incluir parcela")
    ResponseEntity<ApoliceResponse> incluirParcela(UUID id, ParcelaApoliceRequest request);

    @Operation(summary = "Corrigir parcela", description = "Recusada com pagamento pedido ou aprovado no financeiro.")
    ResponseEntity<ApoliceResponse> alterarParcela(UUID id, UUID idParcela, ParcelaApoliceRequest request);

    @Operation(summary = "Excluir parcela", description = "Recusada com pagamento pedido ou aprovado no financeiro.")
    ResponseEntity<ApoliceResponse> removerParcela(UUID id, UUID idParcela);

    @Operation(summary = "Preenchimento do pagamento da parcela",
            description = "Valores para o formulário de pagamento do financeiro (origem FROTA_SEGURO, id da parcela); a solicitação criada fica vinculada à parcela.")
    ResponseEntity<PreenchimentoFinanceiroResponse> preenchimentoFinanceiro(UUID idParcela);

    @Operation(summary = "Anexar documento", description = "PDF ou imagem até 15 MB (apólice, proposta, endosso, boleto).")
    ResponseEntity<ApoliceResponse> anexar(UUID id, MultipartFile arquivo);

    @Operation(summary = "Baixar documento")
    ResponseEntity<Resource> baixarAnexo(UUID id, UUID idAnexo);

    @Operation(summary = "Remover documento")
    ResponseEntity<ApoliceResponse> removerAnexo(UUID id, UUID idAnexo);
}
