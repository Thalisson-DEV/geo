package com.nexo.app.modules.frota.doc;

import com.nexo.app.modules.frota.application.dto.UsoFrotaDtos.SaudeResponse;
import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.ConsumoAbastecimentoResponse;
import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.EventoFilter;
import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.EventoResponse;
import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.MapaResponse;
import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.RastreadorFilter;
import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.RastreadorResponse;
import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.SituacaoResponse;
import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.TrajetoResponse;
import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.VeiculoResponse;
import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.VincularRequest;
import com.nexo.app.shared.application.dto.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Tag(name = "Frota — Telemetria", description = "Rastreadores da Ubicaly e da Zuq, eventos de condução, km e consumo")
public interface TelemetriaFrotaControllerDoc {

    @Operation(summary = "Situação dos provedores",
            description = "Se cada provedor tem chave, a última sincronização de veículos e de eventos e um resumo dos rastreadores.")
    ResponseEntity<SituacaoResponse> situacao();

    @Operation(summary = "Sincronizar agora", description = "Roda as rotinas de veículos e de eventos na hora e devolve a situação.")
    ResponseEntity<SituacaoResponse> sincronizar();

    @Operation(summary = "Listar rastreadores", description = "Rastreadores dos provedores, vinculados ou não a um veículo da frota.")
    ResponseEntity<PageResponse<RastreadorResponse>> listarRastreadores(RastreadorFilter filtro, Pageable pageable);

    @Operation(summary = "Detalhar rastreador")
    ResponseEntity<RastreadorResponse> detalharRastreador(UUID id);

    @Operation(summary = "Vincular rastreador a um veículo",
            description = "Vínculo manual: prevalece sobre o casamento pela placa até ser desfeito.")
    ResponseEntity<RastreadorResponse> vincular(UUID id, VincularRequest request);

    @Operation(summary = "Desfazer vínculo manual", description = "O rastreador volta ao casamento automático pela placa.")
    ResponseEntity<RastreadorResponse> desfazerVinculo(UUID id);

    @Operation(summary = "Ignorar rastreador", description = "Para rastreadores que não são da frota. Não volta sozinho.")
    ResponseEntity<RastreadorResponse> ignorar(UUID id);

    @Operation(summary = "Reativar rastreador ignorado")
    ResponseEntity<RastreadorResponse> reativar(UUID id);

    @Operation(summary = "Listar eventos de condução")
    ResponseEntity<PageResponse<EventoResponse>> listarEventos(EventoFilter filtro, Pageable pageable);

    @Operation(summary = "Detalhar evento de condução")
    ResponseEntity<EventoResponse> detalharEvento(UUID id);

    @Operation(summary = "Saúde dos rastreadores",
            description = "Placas com dois rastreadores (fica o que comunica melhor) e rastreadores sem sinal, sem posição ou sem odômetro.")
    ResponseEntity<SaudeResponse> saude();

    @Operation(summary = "Mapa da frota",
            description = "Cada veículo rastreado com posição, estado (em movimento, ligado parado, desligado, sem sinal), condutor, km e eventos em 24 h.")
    ResponseEntity<MapaResponse> mapa(List<UUID> idsBase);

    @Operation(summary = "Telemetria do veículo",
            description = "Posição, rodado em 7 e 30 dias, consumo médio, eventos por tipo e os últimos eventos.")
    ResponseEntity<VeiculoResponse> veiculo(UUID idVeiculo);

    @Operation(summary = "Trajeto do veículo", description = "Posições do período (até 7 dias e 3.000 pontos).")
    ResponseEntity<TrajetoResponse> trajeto(UUID idVeiculo, OffsetDateTime de, OffsetDateTime ate);

    @Operation(summary = "Consumo do abastecimento pela telemetria",
            description = "Rodado desde o abastecimento anterior realizado e o consumo estimado do intervalo.")
    ResponseEntity<ConsumoAbastecimentoResponse> consumoAbastecimento(UUID idAbastecimento);
}
