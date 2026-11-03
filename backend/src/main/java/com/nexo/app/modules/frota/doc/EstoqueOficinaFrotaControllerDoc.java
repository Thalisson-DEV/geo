package com.nexo.app.modules.frota.doc;

import com.nexo.app.modules.estoque.EstoqueFrotaApi;
import com.nexo.app.modules.frota.application.dto.AjusteEstoqueFrotaRequest;
import com.nexo.app.modules.frota.application.dto.AlmoxarifadoFrotaRequest;
import com.nexo.app.modules.frota.application.dto.AlmoxarifadoFrotaResponse;
import com.nexo.app.modules.frota.application.dto.EntradaEstoqueFrotaRequest;
import com.nexo.app.modules.frota.application.dto.MovimentoEstoqueFrotaFilter;
import com.nexo.app.modules.frota.application.dto.MovimentoEstoqueFrotaResponse;
import com.nexo.app.modules.frota.application.dto.ParametrosPecaFrotaRequest;
import com.nexo.app.modules.frota.application.dto.PecaFrotaRequest;
import com.nexo.app.modules.frota.application.dto.SaidaEstoqueFrotaRequest;
import com.nexo.app.modules.frota.application.dto.TransferenciaEstoqueFrotaRequest;
import com.nexo.app.shared.application.dto.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.UUID;

@Tag(name = "Frota — Estoque da oficina", description = "Almoxarifados da frota (estoque do tipo FROTA), peças, saldos com custo médio e movimentações")
public interface EstoqueOficinaFrotaControllerDoc {

    @Operation(summary = "Almoxarifados da frota")
    ResponseEntity<List<AlmoxarifadoFrotaResponse>> almoxarifados();

    @Operation(summary = "Criar almoxarifado", description = "Estoque do tipo FROTA, em geral um por base.")
    ResponseEntity<AlmoxarifadoFrotaResponse> criarAlmoxarifado(AlmoxarifadoFrotaRequest request);

    @Operation(summary = "Alterar almoxarifado")
    ResponseEntity<AlmoxarifadoFrotaResponse> atualizarAlmoxarifado(UUID id, AlmoxarifadoFrotaRequest request);

    @Operation(summary = "Desativar almoxarifado", description = "Só sem peças em saldo.")
    ResponseEntity<Void> desativarAlmoxarifado(UUID id);

    @Operation(summary = "Catálogo de peças", description = "Só o catálogo da frota; o almoxarifado operacional não aparece.")
    ResponseEntity<PageResponse<EstoqueFrotaApi.Peca>> pecas(String busca, String grupo, Boolean ativo, Pageable pageable);

    @Operation(summary = "Grupos de peças em uso")
    ResponseEntity<List<String>> grupos();

    @Operation(summary = "Cadastrar peça")
    ResponseEntity<EstoqueFrotaApi.Peca> criarPeca(PecaFrotaRequest request);

    @Operation(summary = "Alterar peça")
    ResponseEntity<EstoqueFrotaApi.Peca> atualizarPeca(UUID id, PecaFrotaRequest request);

    @Operation(summary = "Desativar peça", description = "Só sem saldo em nenhum almoxarifado.")
    ResponseEntity<Void> desativarPeca(UUID id);

    @Operation(summary = "Saldos", description = "Por almoxarifado (ou de todos), com custo médio, valor, mínimo e localização.")
    ResponseEntity<List<EstoqueFrotaApi.SaldoPeca>> saldos(UUID idEstoque);

    @Operation(summary = "Totais", description = "Itens, valor em estoque, abaixo do mínimo e entradas e saídas dos últimos 30 dias.")
    ResponseEntity<EstoqueFrotaApi.Resumo> resumo(UUID idEstoque);

    @Operation(summary = "Mínimo e localização da peça no almoxarifado")
    ResponseEntity<EstoqueFrotaApi.SaldoPeca> definirParametros(UUID idEstoque, UUID idMaterial, ParametrosPecaFrotaRequest request);

    @Operation(summary = "Movimentações", description = "Filtro por almoxarifado, peça, veículo, OS, tipo, texto e período.")
    ResponseEntity<PageResponse<MovimentoEstoqueFrotaResponse>> movimentos(MovimentoEstoqueFrotaFilter filtro, Pageable pageable);

    @Operation(summary = "Entrada", description = "Recalcula o custo médio de cada peça.")
    ResponseEntity<List<MovimentoEstoqueFrotaResponse>> entrada(EntradaEstoqueFrotaRequest request);

    @Operation(summary = "Saída avulsa", description = "Para veículo, uso na oficina, perda ou venda, pelo custo médio. A saída para OS é lançada na OS.")
    ResponseEntity<List<MovimentoEstoqueFrotaResponse>> saida(SaidaEstoqueFrotaRequest request);

    @Operation(summary = "Transferência entre almoxarifados da frota")
    ResponseEntity<List<MovimentoEstoqueFrotaResponse>> transferencia(TransferenciaEstoqueFrotaRequest request);

    @Operation(summary = "Ajuste de inventário", description = "Sem corpo quando o contado é igual ao saldo.")
    ResponseEntity<MovimentoEstoqueFrotaResponse> ajuste(AjusteEstoqueFrotaRequest request);
}
