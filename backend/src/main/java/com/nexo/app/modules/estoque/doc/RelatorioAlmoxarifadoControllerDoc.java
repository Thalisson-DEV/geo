package com.nexo.app.modules.estoque.doc;

import com.nexo.app.modules.estoque.application.dto.EstoqueRelatorioResponse;
import com.nexo.app.modules.estoque.application.dto.FechamentoRelatorioResponse;
import com.nexo.app.modules.estoque.application.dto.MovimentacoesRelatorioResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;

import java.time.LocalDate;

@Tag(name = "Estoque - Relatórios do almoxarifado", description = "Dados dos relatórios gerenciais do almoxarifado.")
@SecurityRequirement(name = "bearerAuth")
public interface RelatorioAlmoxarifadoControllerDoc {

    @Operation(summary = "Movimentações do período",
               description = "Uma linha por movimentação do período e do período anterior de mesma duração (marcadas em "
                       + "`anterior`), com estoques, base, equipe, processo, obra e operador resolvidos. Sem datas, os "
                       + "últimos 90 dias. O estoque da oficina da frota fica de fora. Limitado a 40.000 linhas por período.")
    ResponseEntity<MovimentacoesRelatorioResponse> movimentacoes(
            @Parameter(description = "Primeiro dia do período (yyyy-MM-dd)") LocalDate de,
            @Parameter(description = "Último dia do período (yyyy-MM-dd)") LocalDate ate);

    @Operation(summary = "Posição atual do estoque",
               description = "Saldos positivos por estoque, material e condição, com séries em estoque e reservadas, "
                       + "última entrada e última saída. O estoque da oficina da frota fica de fora.")
    ResponseEntity<EstoqueRelatorioResponse> estoque();

    @Operation(summary = "Encerramento de obras do período",
               description = "Solicitações de encerramento criadas no período e as ainda em andamento de antes dele, com os "
                       + "prazos de reserva e de movimentação (48 horas úteis) e quando foram cumpridos. Sem datas, os últimos 90 dias.")
    ResponseEntity<FechamentoRelatorioResponse> fechamento(
            @Parameter(description = "Primeiro dia do período (yyyy-MM-dd)") LocalDate de,
            @Parameter(description = "Último dia do período (yyyy-MM-dd)") LocalDate ate);
}
