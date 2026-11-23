package com.nexo.app.modules.obras.application.usecases;

import com.nexo.app.modules.obras.application.dto.OrcamentoObraResponse;
import com.nexo.app.modules.obras.application.dto.OrcamentoObraResponse.SituacaoItemOrcamento;
import com.nexo.app.modules.obras.domain.ItemOrcamentoObra;
import com.nexo.app.modules.obras.domain.OperacaoItemKit;
import com.nexo.app.modules.obras.domain.TipoItemKit;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class ComparativoOrcamentoTest {

    private static final UUID OBRA = UUID.randomUUID();

    @Test
    void situacaoDeCadaItemEOsTotais() {
        ComparativoOrcamento c = new ComparativoOrcamento();
        c.orcar(item(TipoItemKit.SERVICO, "0123", OperacaoItemKit.INSTALAR, "2", "100", UUID.randomUUID()));
        c.orcar(item(TipoItemKit.SERVICO, "B2", OperacaoItemKit.INSTALAR, "1", "50", UUID.randomUUID()));
        c.orcar(item(TipoItemKit.SERVICO, "D4", OperacaoItemKit.RETIRAR, "4", "10", null));
        c.orcar(item(TipoItemKit.MATERIAL, "MAT-1", OperacaoItemKit.INSTALAR, "3", null, UUID.randomUUID()));
        // Planilha perdeu o zero: 123 é o mesmo serviço 0123.
        c.planejar(TipoItemKit.SERVICO, "123", OperacaoItemKit.INSTALAR, "Poste", "UN", null, null, new BigDecimal("3"), new BigDecimal("150"));
        c.executar(TipoItemKit.SERVICO, "123", OperacaoItemKit.INSTALAR, new BigDecimal("1"), new BigDecimal("50"));
        c.medir(TipoItemKit.SERVICO, "123", OperacaoItemKit.INSTALAR, null, null, new BigDecimal("1"), new BigDecimal("50"));
        c.planejar(TipoItemKit.SERVICO, "C3", OperacaoItemKit.INSTALAR, "Fora", "UN", null, null, BigDecimal.ONE, new BigDecimal("80"));
        c.planejar(TipoItemKit.SERVICO, "D4", OperacaoItemKit.RETIRAR, "Retirada", "UN", null, null, new BigDecimal("4"), new BigDecimal("40"));
        c.planejar(TipoItemKit.MATERIAL, "MAT-1", OperacaoItemKit.INSTALAR, "Poste", "UN", null, null, new BigDecimal("2"), null);

        List<OrcamentoObraResponse.Item> itens = c.itens();

        assertThat(itens).extracting(OrcamentoObraResponse.Item::codigo).containsExactly("123", "C3", "B2", "D4", "MAT-1");
        OrcamentoObraResponse.Item acima = itens.getFirst();
        assertThat(acima.situacao()).isEqualTo(SituacaoItemOrcamento.ACIMA);
        assertThat(acima.excedente()).isEqualByComparingTo("1");
        assertThat(acima.medidoValor()).isEqualByComparingTo("50");
        assertThat(itens.get(1).situacao()).isEqualTo(SituacaoItemOrcamento.FORA_DO_ORCAMENTO);
        assertThat(itens.get(2).situacao()).isEqualTo(SituacaoItemOrcamento.NAO_PLANEJADO);
        assertThat(itens.get(3).situacao()).isEqualTo(SituacaoItemOrcamento.DENTRO);
        assertThat(itens.get(3).semReferencia()).isTrue();
        assertThat(itens.get(4).situacao()).isEqualTo(SituacaoItemOrcamento.DENTRO);

        OrcamentoObraResponse.Totais totais = ComparativoOrcamento.totais(itens);
        assertThat(totais.orcadoServicos()).isEqualByComparingTo("290");
        assertThat(totais.planejadoServicos()).isEqualByComparingTo("270");
        assertThat(totais.medidoServicos()).isEqualByComparingTo("50");
        assertThat(totais.saldoServicos()).isEqualByComparingTo("240");
        assertThat(totais.planejadoForaDoOrcamento()).isEqualByComparingTo("80");
        assertThat(ComparativoOrcamento.contagens(itens))
                .isEqualTo(new OrcamentoObraResponse.Contagens(1, 1, 1, 1));
    }

    @Test
    void tipoQueOOrcamentoNaoTrazNaoViraDesvio() {
        ComparativoOrcamento c = new ComparativoOrcamento();
        c.orcar(item(TipoItemKit.SERVICO, "S1", OperacaoItemKit.INSTALAR, "1", "10", UUID.randomUUID()));
        c.planejar(TipoItemKit.MATERIAL, "MAT-9", OperacaoItemKit.INSTALAR, "Cabo", "M", null, null, BigDecimal.TEN, null);

        List<OrcamentoObraResponse.Item> itens = c.itens();

        assertThat(itens.get(1).situacao()).isEqualTo(SituacaoItemOrcamento.SEM_ORCADO);
        assertThat(ComparativoOrcamento.contagens(itens).foraDoOrcamento()).isZero();
    }

    private static ItemOrcamentoObra item(TipoItemKit tipo, String codigo, OperacaoItemKit operacao, String quantidade,
                                          String unitario, UUID referencia) {
        return new ItemOrcamentoObra(OBRA, null, null, new ItemOrcamentoObra.Dados(tipo, operacao, codigo, null, "UN",
                new BigDecimal(quantidade), unitario != null ? new BigDecimal(unitario) : null, null,
                tipo == TipoItemKit.SERVICO ? referencia : null, tipo == TipoItemKit.MATERIAL ? referencia : null));
    }
}
