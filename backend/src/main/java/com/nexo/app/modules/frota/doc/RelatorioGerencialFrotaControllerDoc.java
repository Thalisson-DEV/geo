package com.nexo.app.modules.frota.doc;

import com.nexo.app.modules.frota.application.dto.RelatorioFrotaDetalheResponse;
import com.nexo.app.modules.frota.application.dto.RelatorioGerencialFrotaFilter;
import com.nexo.app.modules.frota.application.dto.RelatorioGerencialFrotaResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;

@Tag(name = "Frota — Relatórios gerenciais", description = "Custos, manutenção, combustível, uso e conformidade da frota num recorte")
public interface RelatorioGerencialFrotaControllerDoc {

    @Operation(summary = "Relatório gerencial da frota",
            description = "Indicadores do período (até 24 meses; padrão: seis meses anteriores mais o atual) comparados com o período "
                    + "anterior de mesma duração, por base, processo, tipo, regime, situação e veículos. Cada seção só vem para quem "
                    + "tem a leitura do assunto; o custo total soma as partes visíveis e `partesOmitidas` lista as demais.")
    ResponseEntity<RelatorioGerencialFrotaResponse> gerar(RelatorioGerencialFrotaFilter filtro);

    @Operation(summary = "Lançamentos de custo do recorte",
            description = "OS concluídas, despesas (menos as reprovadas), abastecimentos e franquias do período, do maior para o "
                    + "menor, conforme as leituras da pessoa. Seguro e locação são rateios e ficam fora.")
    ResponseEntity<RelatorioFrotaDetalheResponse.Custos> custos(RelatorioGerencialFrotaFilter filtro);

    @Operation(summary = "OS do recorte",
            description = "OS concluídas no período e no período anterior, OS abertas, itens de manutenção, peças e serviços.")
    ResponseEntity<RelatorioFrotaDetalheResponse.Manutencao> manutencao(RelatorioGerencialFrotaFilter filtro);

    @Operation(summary = "Abastecimentos do recorte",
            description = "Abastecimentos realizados no período e no anterior, com posto, condutor, litros, preço, km desde o "
                    + "abastecimento anterior e alertas.")
    ResponseEntity<RelatorioFrotaDetalheResponse.Combustivel> combustivel(RelatorioGerencialFrotaFilter filtro);

    @Operation(summary = "Uso mensal por veículo", description = "Km rodado e produção (turnos, notas, faturado) por veículo e mês.")
    ResponseEntity<RelatorioFrotaDetalheResponse.Uso> uso(RelatorioGerencialFrotaFilter filtro);

    @Operation(summary = "Vencimentos e pendências do recorte",
            description = "Documentos e CNH vencidos ou vencendo até o horizonte (padrão 90 dias, máximo 365) e pendências de "
                    + "checklist abertas. Cada lista vem nula para quem não tem a leitura do assunto.")
    ResponseEntity<RelatorioFrotaDetalheResponse.Conformidade> conformidade(RelatorioGerencialFrotaFilter filtro, Integer horizonte);
}
