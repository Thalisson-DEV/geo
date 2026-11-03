package com.nexo.app.modules.frota.doc;

import com.nexo.app.modules.frota.application.dto.DescartePneuRequest;
import com.nexo.app.modules.frota.application.dto.DiagramaPneusRequest;
import com.nexo.app.modules.frota.application.dto.EnvioPneuRequest;
import com.nexo.app.modules.frota.application.dto.EventoPneuFilter;
import com.nexo.app.modules.frota.application.dto.EventoPneuResponse;
import com.nexo.app.modules.frota.application.dto.InspecaoPneuRequest;
import com.nexo.app.modules.frota.application.dto.InspecaoPneuResponse;
import com.nexo.app.modules.frota.application.dto.MovimentacaoPneusRequest;
import com.nexo.app.modules.frota.application.dto.PneuFilter;
import com.nexo.app.modules.frota.application.dto.PneuRequest;
import com.nexo.app.modules.frota.application.dto.PneuResponse;
import com.nexo.app.modules.frota.application.dto.ResumoPneusResponse;
import com.nexo.app.modules.frota.application.dto.RetornoPneuRequest;
import com.nexo.app.modules.frota.application.dto.VeiculoPneusResponse;
import com.nexo.app.shared.application.dto.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Tag(name = "Frota — Pneus", description = "Cadastro, diagrama, montagem e rodízio, reparo, reforma, descarte, inspeção e histórico dos pneus")
public interface PneuFrotaControllerDoc {

    @Operation(summary = "Listar pneus", description = "Filtro por texto (marca de fogo, série, marca, modelo, placa), situação, veículo, almoxarifado, marca e sulco baixo.")
    ResponseEntity<PageResponse<PneuResponse>> listar(PneuFilter filtro, Pageable pageable);

    @Operation(summary = "Totais", description = "Pneus por situação, alertas de sulco e serviço parado, custo total e custo médio por km.")
    ResponseEntity<ResumoPneusResponse> resumo();

    @Operation(summary = "Marcas em uso")
    ResponseEntity<List<String>> marcas();

    @Operation(summary = "Detalhe do pneu")
    ResponseEntity<PneuResponse> buscar(UUID id);

    @Operation(summary = "Cadastrar pneu", description = "Entra disponível, no almoxarifado informado.")
    ResponseEntity<PneuResponse> cadastrar(PneuRequest request);

    @Operation(summary = "Corrigir cadastro", description = "Vida, km e sulco atual mudam só pela movimentação, inspeção e reforma.")
    ResponseEntity<PneuResponse> atualizar(UUID id, PneuRequest request);

    @Operation(summary = "Histórico do pneu")
    ResponseEntity<List<EventoPneuResponse>> historico(UUID id);

    @Operation(summary = "Histórico de todos os pneus", description = "Filtro por pneu, veículo, tipo e período.")
    ResponseEntity<PageResponse<EventoPneuResponse>> eventos(EventoPneuFilter filtro, Pageable pageable);

    @Operation(summary = "Enviar para reparo ou reforma", description = "Só pneu disponível; para tirar do veículo, use a movimentação.")
    ResponseEntity<PneuResponse> enviar(UUID id, EnvioPneuRequest request);

    @Operation(summary = "Registrar retorno", description = "Do reparo ou da reforma, com o custo. A reforma soma uma vida, zera o km da vida e exige o sulco novo.")
    ResponseEntity<PneuResponse> retornar(UUID id, RetornoPneuRequest request);

    @Operation(summary = "Descartar", description = "Só pneu fora do veículo.")
    ResponseEntity<PneuResponse> descartar(UUID id, DescartePneuRequest request);

    @Operation(summary = "Guardar em outro almoxarifado")
    ResponseEntity<PneuResponse> transferir(UUID id, UUID idEstoque);

    @Operation(summary = "Pneus do veículo", description = "Diagrama com o pneu de cada posição, a medição atual e a última inspeção.")
    ResponseEntity<VeiculoPneusResponse> veiculo(UUID idVeiculo);

    @Operation(summary = "Definir diagrama", description = "Eixos (S simples, D duplo) e estepes. As posições ocupadas precisam continuar existindo.")
    ResponseEntity<VeiculoPneusResponse> definirDiagrama(UUID idVeiculo, DiagramaPneusRequest request);

    @Operation(summary = "Movimentar pneus", description = "Montagem, rodízio e desmontagem para almoxarifado, reparo, reforma ou descarte, gravados de uma vez, com o km do veículo.")
    ResponseEntity<VeiculoPneusResponse> movimentar(MovimentacaoPneusRequest request);

    @Operation(summary = "Inspeções", description = "Calibragem e sulco por veículo e período.")
    ResponseEntity<PageResponse<InspecaoPneuResponse>> inspecoes(UUID idVeiculo, LocalDate de, LocalDate ate, Pageable pageable);

    @Operation(summary = "Registrar inspeção", description = "Pressão e sulco dos pneus montados; o sulco medido vira o sulco atual do pneu.")
    ResponseEntity<InspecaoPneuResponse> registrarInspecao(InspecaoPneuRequest request);
}
