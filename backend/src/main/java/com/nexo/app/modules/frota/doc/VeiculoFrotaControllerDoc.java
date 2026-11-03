package com.nexo.app.modules.frota.doc;

import com.nexo.app.modules.frota.application.dto.UsoFrotaDtos.UsoVeiculoResponse;
import com.nexo.app.modules.frota.application.dto.AcoplamentoImplementoResponse;
import com.nexo.app.modules.frota.application.dto.FichaVeiculoFilter;
import com.nexo.app.modules.frota.application.dto.LeituraOdometroResponse;
import com.nexo.app.modules.frota.application.dto.RegistrarLeituraRequest;
import com.nexo.app.modules.frota.application.dto.TrocaPainelRequest;
import com.nexo.app.modules.frota.application.dto.VeiculoFrotaDetalheResponse;
import com.nexo.app.modules.frota.application.dto.VeiculoFrotaRequest;
import com.nexo.app.modules.frota.application.dto.VeiculoFrotaResumoResponse;
import com.nexo.app.modules.frota.application.dto.VincularCondutorRequest;
import com.nexo.app.modules.frota.application.dto.VinculoCondutorResponse;
import com.nexo.app.shared.application.dto.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.UUID;

@Tag(name = "Frota — Veículos", description = "Ficha do veículo, condutor atual, implementos e odômetro")
public interface VeiculoFrotaControllerDoc {

    @Operation(summary = "Listar veículos da frota",
            description = "Filtra por placa/chassi/renavam, base, tipo, situação e regime. Ordenável por placa, situacao, regime, anoModelo.")
    ResponseEntity<PageResponse<VeiculoFrotaResumoResponse>> listar(FichaVeiculoFilter filtro, Pageable pageable);

    @Operation(summary = "Detalhar veículo", description = "Ficha completa com KM atual, condutor atual e implementos acoplados.")
    @ApiResponse(responseCode = "404", description = "Veículo não encontrado na frota")
    ResponseEntity<VeiculoFrotaDetalheResponse> detalhar(UUID idVeiculo);

    @Operation(summary = "Cadastrar veículo", description = "Grava placa/modelo/fabricante/base no RH e a ficha da frota na mesma transação.")
    @ApiResponse(responseCode = "201", description = "Veículo cadastrado")
    @ApiResponse(responseCode = "422", description = "Placa duplicada ou dados inválidos")
    ResponseEntity<VeiculoFrotaDetalheResponse> criar(VeiculoFrotaRequest request);

    @Operation(summary = "Atualizar veículo")
    ResponseEntity<VeiculoFrotaDetalheResponse> atualizar(UUID idVeiculo, VeiculoFrotaRequest request);

    @Operation(summary = "Histórico de condutores do veículo", description = "Do mais recente para o mais antigo.")
    ResponseEntity<PageResponse<VinculoCondutorResponse>> historicoCondutores(UUID idVeiculo, Pageable pageable);

    @Operation(summary = "Vincular condutor",
            description = "Encerra o vínculo atual do veículo e o do condutor em outro veículo no instante informado. Exige CNH válida e compatível.")
    @ApiResponse(responseCode = "422", description = "CNH vencida, categoria insuficiente ou período sobreposto")
    ResponseEntity<VinculoCondutorResponse> vincularCondutor(UUID idVeiculo, VincularCondutorRequest request);

    @Operation(summary = "Condutor em um instante", description = "Quem respondia pelo veículo no instante informado (ISO 8601). 404 se ninguém.")
    ResponseEntity<VinculoCondutorResponse> condutorEm(UUID idVeiculo, java.time.OffsetDateTime instante);

    @Operation(summary = "Histórico de implementos acoplados ao veículo")
    ResponseEntity<List<AcoplamentoImplementoResponse>> historicoImplementos(UUID idVeiculo);

    @Operation(summary = "Leituras de odômetro do veículo", description = "Todas as origens, incluindo inconsistentes e anuladas.")
    ResponseEntity<PageResponse<LeituraOdometroResponse>> leituras(UUID idVeiculo, Pageable pageable);

    @Operation(summary = "Lançar KM manualmente",
            description = "Recusa KM menor que a leitura anterior, maior que a seguinte ou com salto acima do limite diário.")
    @ApiResponse(responseCode = "201", description = "Leitura registrada")
    @ApiResponse(responseCode = "422", description = "Leitura incoerente com o histórico")
    ResponseEntity<LeituraOdometroResponse> registrarLeitura(UUID idVeiculo, RegistrarLeituraRequest request);

    @Operation(summary = "Registrar troca de painel",
            description = "Fecha o painel antigo com o último valor e abre o novo. As leituras seguintes só são comparadas "
                    + "com o painel novo, e o acumulado soma o que o antigo rodou. Também é o jeito de mudar entre km e horas "
                    + "num veículo que já tem leituras.")
    @ApiResponse(responseCode = "201", description = "Troca registrada")
    @ApiResponse(responseCode = "422", description = "Troca antes da última leitura ou valores incoerentes")
    ResponseEntity<LeituraOdometroResponse> trocarPainel(UUID idVeiculo, TrocaPainelRequest request);

    @Operation(summary = "Uso do veículo pela telemetria",
            description = "Nos últimos 7, 30 ou 90 dias: km, uso fora do expediente (com as saídas), motor ligado parado e custo por km.")
    ResponseEntity<UsoVeiculoResponse> uso(UUID idVeiculo, Integer dias);
}
