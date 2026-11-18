package com.nexo.app.modules.automacao.application.usecases;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import com.nexo.app.modules.automacao.domain.definicao.DefinicaoAutomacao;
import com.nexo.app.modules.automacao.domain.expressao.Valores;

class ModelosSstTest {

    private final ModelosAutomacao modelos = new ModelosAutomacao();

    private String json(ModelosAutomacao.Modelo modelo) {
        return Valores.paraJson(DefinicaoAutomacao.ler(modelo.definicao()).paraMapa());
    }

    @Test
    void metasSaemTodaSegundaParaAGestao() {
        String json = json(modelos.metasInspecaoSemanal());
        assertThat(json).contains("geo.sst_goals").contains("steps.metas.outputs.html")
                .contains("\"weekdays\":[0]").contains("/sst/metas-inspecao/acompanhamento");
    }

    @Test
    void cadaInspetorRecebeSoOsProprios() {
        String json = json(modelos.desviosDosInspetores());
        assertThat(json).contains("geo.sst_open_deviations").contains("steps.desvios.outputs.inspectors")
                .contains("{{ item.usuario_id }}").contains("item.html").contains("/sst/meus-desvios")
                .contains("item.tem_email").contains("notify.people");
    }

    @Test
    void gestaoRecebeOResumoGeral() {
        assertThat(json(modelos.desviosDaGestao())).contains("steps.desvios.outputs.html").contains("/sst/desvios");
        assertThat(modelos.listar()).extracting(ModelosAutomacao.Modelo::id)
                .contains(ModelosAutomacao.METAS_INSPECAO_ID, ModelosAutomacao.DESVIOS_INSPETORES_ID, ModelosAutomacao.DESVIOS_GESTAO_ID);
    }
}
