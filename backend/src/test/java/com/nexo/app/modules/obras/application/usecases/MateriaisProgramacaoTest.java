package com.nexo.app.modules.obras.application.usecases;

import com.nexo.app.modules.obras.domain.ItemPlanejado;
import com.nexo.app.modules.obras.domain.OperacaoItemKit;
import com.nexo.app.modules.obras.domain.TipoItemKit;
import com.nexo.app.shared.domain.events.ProgramacaoObraEvent;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** O que a programação manda ao almoxarifado: só material a instalar, somado por material. */
class MateriaisProgramacaoTest {

    @Test
    void somaMaterialAInstalarEIgnoraServicoRetiradaESemCadastro() {
        UUID cabo = UUID.randomUUID();
        UUID poste = UUID.randomUUID();
        List<ProgramacaoObraUseCases.ItemQuantidade> itens = List.of(
                item(TipoItemKit.MATERIAL, OperacaoItemKit.INSTALAR, cabo, "10"),
                item(TipoItemKit.MATERIAL, OperacaoItemKit.INSTALAR, cabo, "5.5"),
                item(TipoItemKit.MATERIAL, OperacaoItemKit.INSTALAR, poste, "1"),
                item(TipoItemKit.MATERIAL, OperacaoItemKit.RETIRAR, UUID.randomUUID(), "2"),
                item(TipoItemKit.MATERIAL, OperacaoItemKit.INSTALAR, null, "3"),
                item(TipoItemKit.SERVICO, OperacaoItemKit.INSTALAR, null, "1"),
                item(TipoItemKit.MATERIAL, OperacaoItemKit.INSTALAR, UUID.randomUUID(), "0"));

        List<ProgramacaoObraEvent.Material> materiais = ProgramacaoObraUseCases.materiaisASolicitar(itens);

        assertThat(materiais).containsExactly(
                new ProgramacaoObraEvent.Material(cabo, new BigDecimal("15.5")),
                new ProgramacaoObraEvent.Material(poste, new BigDecimal("1")));
    }

    @Test
    void semMaterialNaoHaSolicitacao() {
        assertThat(ProgramacaoObraUseCases.materiaisASolicitar(List.of(
                item(TipoItemKit.SERVICO, OperacaoItemKit.INSTALAR, null, "1")))).isEmpty();
    }

    private static ProgramacaoObraUseCases.ItemQuantidade item(TipoItemKit tipo, OperacaoItemKit operacao, UUID idMaterial, String quantidade) {
        ItemPlanejado item = mock(ItemPlanejado.class);
        when(item.getTipo()).thenReturn(tipo);
        when(item.getOperacao()).thenReturn(operacao);
        when(item.getIdMaterial()).thenReturn(idMaterial);
        return new ProgramacaoObraUseCases.ItemQuantidade(item, new BigDecimal(quantidade));
    }
}
