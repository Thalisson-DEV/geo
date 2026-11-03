package com.nexo.app.modules.frota.doc;

import com.nexo.app.modules.frota.application.dto.AbrirOsPreventivaRequest;
import com.nexo.app.modules.frota.application.dto.AcompanhamentoPreventivaFilter;
import com.nexo.app.modules.frota.application.dto.AcompanhamentoPreventivaResponse;
import com.nexo.app.modules.frota.application.dto.ControlePreventivoResponse;
import com.nexo.app.modules.frota.application.dto.CorretivaPorItemResponse;
import com.nexo.app.modules.frota.application.dto.InformarRealizacaoPreventivaRequest;
import com.nexo.app.modules.frota.application.dto.OsPreventivaAbertaResponse;
import com.nexo.app.modules.frota.application.dto.PlanoPreventivoFilter;
import com.nexo.app.modules.frota.application.dto.PlanoPreventivoRequest;
import com.nexo.app.modules.frota.application.dto.PlanoPreventivoResponse;
import com.nexo.app.modules.frota.application.dto.PreventivaVeiculoResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Tag(name = "Frota — Preventiva", description = "Planos preventivos, acompanhamento por veículo, OS preventiva e corretivas por serviço")
public interface PreventivaFrotaControllerDoc {

    @Operation(summary = "Listar planos preventivos")
    ResponseEntity<List<PlanoPreventivoResponse>> listarPlanos(PlanoPreventivoFilter filtro);

    @Operation(summary = "Buscar plano preventivo")
    ResponseEntity<PlanoPreventivoResponse> buscarPlano(UUID id);

    @Operation(summary = "Cadastrar plano preventivo", description = "Os veículos dos tipos cobertos passam a ser acompanhados na hora.")
    ResponseEntity<PlanoPreventivoResponse> criarPlano(PlanoPreventivoRequest request);

    @Operation(summary = "Atualizar plano preventivo", description = "OS já abertas mantêm o roteiro copiado na abertura.")
    ResponseEntity<PlanoPreventivoResponse> atualizarPlano(UUID id, PlanoPreventivoRequest request);

    @Operation(summary = "Desativar plano preventivo", description = "Os veículos deixam de ser acompanhados; o histórico continua.")
    ResponseEntity<Void> desativarPlano(UUID id);

    @Operation(summary = "Reativar plano preventivo")
    ResponseEntity<Void> ativarPlano(UUID id);

    @Operation(summary = "Acompanhamento",
            description = "Situação de cada plano em cada veículo, do mais urgente para o menos, com as contagens dos filtros rápidos.")
    ResponseEntity<AcompanhamentoPreventivaResponse> acompanhamento(AcompanhamentoPreventivaFilter filtro, Pageable pageable);

    @Operation(summary = "Informar a última realização", description = "Revisão feita fora do sistema; vira a base do ciclo.")
    ResponseEntity<ControlePreventivoResponse> informarRealizacao(UUID idControle, InformarRealizacaoPreventivaRequest request);

    @Operation(summary = "Abrir OS preventiva", description = "Uma OS por veículo, com os itens e o roteiro dos planos escolhidos. Exige também frota:os:write.")
    ResponseEntity<OsPreventivaAbertaResponse> abrirOs(AbrirOsPreventivaRequest request);

    @Operation(summary = "Preventiva do veículo", description = "Planos que acompanham o veículo e o histórico de realizações.")
    ResponseEntity<PreventivaVeiculoResponse> doVeiculo(UUID idVeiculo);

    @Operation(summary = "Corretivas por serviço", description = "OS corretivas concluídas no período por item de manutenção (padrão: 90 dias).")
    ResponseEntity<List<CorretivaPorItemResponse>> corretivas(LocalDate de, LocalDate ate, List<UUID> idBase, List<UUID> idTipoVeiculo);
}
