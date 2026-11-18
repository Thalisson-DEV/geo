package com.nexo.app.modules.frota.doc;

import com.nexo.app.modules.frota.application.dto.AbrirOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.AgendarOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.BaixaOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.ConcluirOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.EditarOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.FornecedorFrotaResponse;
import com.nexo.app.modules.frota.application.dto.IniciarOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.JustificativaRequest;
import com.nexo.app.modules.frota.application.dto.OrdemServicoDetalheResponse;
import com.nexo.app.modules.frota.application.dto.OrdemServicoFilter;
import com.nexo.app.modules.frota.application.dto.OrdemServicoResponse;
import com.nexo.app.modules.frota.application.dto.PainelOrdensServicoResponse;
import com.nexo.app.modules.frota.application.dto.ParadaVeiculoRequest;
import com.nexo.app.modules.frota.application.dto.PreenchimentoFinanceiroResponse;
import com.nexo.app.modules.frota.application.dto.PrevisaoOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.PreviaRepeticaoResponse;
import com.nexo.app.shared.application.dto.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.UUID;

@Tag(name = "Frota — Ordens de serviço", description = "Manutenção: abertura, painel, execução, encerramento e orçamento")
public interface OrdemServicoFrotaControllerDoc {

    @Operation(summary = "Listar OS", description = "Ordenada pela abertura mais recente quando não há ordenação.")
    ResponseEntity<PageResponse<OrdemServicoResponse>> listar(OrdemServicoFilter filtro, Pageable pageable);

    @Operation(summary = "Painel de manutenção", description = "Contagens por situação, criticidade, prazo e veículo parado.")
    ResponseEntity<PainelOrdensServicoResponse> painel(List<UUID> idsBase);

    @Operation(summary = "Ficha da OS", description = "Itens com repetição, orçamentos do financeiro e histórico.")
    ResponseEntity<OrdemServicoDetalheResponse> buscar(UUID id);

    @Operation(summary = "Abrir OS", description = "Sem condutor informado, usa quem dirigia o veículo na abertura. "
            + "Urgente deixa o veículo parado, salvo se veiculoParado=false.")
    ResponseEntity<OrdemServicoDetalheResponse> abrir(AbrirOrdemServicoRequest request);

    @Operation(summary = "Editar OS aberta")
    ResponseEntity<OrdemServicoDetalheResponse> editar(UUID id, EditarOrdemServicoRequest request);

    @Operation(summary = "Agendar ou reagendar")
    ResponseEntity<OrdemServicoDetalheResponse> agendar(UUID id, AgendarOrdemServicoRequest request);

    @Operation(summary = "Iniciar a execução")
    ResponseEntity<OrdemServicoDetalheResponse> iniciar(UUID id, IniciarOrdemServicoRequest request);

    @Operation(summary = "Alterar a previsão de término")
    ResponseEntity<OrdemServicoDetalheResponse> alterarPrevisao(UUID id, PrevisaoOrdemServicoRequest request);

    @Operation(summary = "Concluir", description = "Pode concluir direto de pendente ou agendada (serviço já realizado). "
            + "Grava a repetição de cada item e o KM no odômetro. Se faltar valor de algum serviço ou peça (ou, sem "
            + "lançamentos, o valor da OS), ela fica com valores pendentes e finaliza sozinha quando o último valor entra.")
    ResponseEntity<OrdemServicoDetalheResponse> concluir(UUID id, ConcluirOrdemServicoRequest request);

    @Operation(summary = "Completar a conclusão", description = "Causa, serviço realizado, oficina e valor da OS concluída "
            + "com valores pendentes. Sem mais nada faltando, a OS fica finalizada e a execução não aceita mais lançamentos.")
    ResponseEntity<OrdemServicoDetalheResponse> completarConclusao(UUID id, BaixaOrdemServicoRequest request);

    @Operation(summary = "Voltar para em andamento", description = "A OS concluída volta para em andamento (ex.: problema no teste). "
            + "A finalização é desfeita para ser revista e o veículo volta a contar como parado.")
    ResponseEntity<OrdemServicoDetalheResponse> reabrir(UUID id, JustificativaRequest request);

    @Operation(summary = "Cancelar", description = "Recusado enquanto houver compra ou pagamento em rascunho ou aguardando aprovação.")
    ResponseEntity<OrdemServicoDetalheResponse> cancelar(UUID id, JustificativaRequest request);

    @Operation(summary = "Marcar ou liberar o veículo parado")
    ResponseEntity<OrdemServicoDetalheResponse> alterarParada(UUID id, ParadaVeiculoRequest request);

    @Operation(summary = "Pré-preenchimento do financeiro", description = "Valores da OS para a compra ou o pagamento "
            + "aberto no financeiro com origem FROTA_OS.")
    ResponseEntity<PreenchimentoFinanceiroResponse> preenchimentoFinanceiro(UUID id);

    @Operation(summary = "Prévia de repetição", description = "Itens já feitos na placa dentro da janela de repetição.")
    ResponseEntity<List<PreviaRepeticaoResponse>> previaRepeticoes(UUID idVeiculo, List<UUID> idsItem);

    @Operation(summary = "Fornecedores para oficina externa")
    ResponseEntity<List<FornecedorFrotaResponse>> fornecedores();
}
