package com.nexo.app.modules.listas.domain;

import com.nexo.app.modules.listas.ListaConfiguravel;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OpcaoListaTest {

    @Test
    void codigoNasceDoNomeSemAcentoECabeNaColuna() {
        OpcaoLista o = new OpcaoLista(ListaConfiguravel.OCORRENCIA_TURNO, "  Obra já executada   por terceiros ", null, 1);
        assertThat(o.getRotulo()).isEqualTo("Obra já executada por terceiros");
        assertThat(o.getCodigo()).isEqualTo("OBRA_JA_EXECUTADA_POR_TERCEIRO");
        assertThat(o.getCodigo().length()).isLessThanOrEqualTo(OpcaoLista.LIMITE_CODIGO);
    }

    @Test
    void renomearMantemOCodigoQueOsRegistrosGuardam() {
        OpcaoLista o = new OpcaoLista(ListaConfiguravel.CAUSA_MANUTENCAO, "Avaria", null, 1);
        o.atualizar("Avaria em campo", "Batida ou quebra");
        assertThat(o.getCodigo()).isEqualTo("AVARIA");
        assertThat(o.getRotulo()).isEqualTo("Avaria em campo");
    }

    @Test
    void opcaoDoSistemaNaoPodeSerDesativadaENomeVazioERecusado() {
        OpcaoLista outro = new OpcaoLista(ListaConfiguravel.TIPO_DOCUMENTO_VEICULO, "Outro", null, 1);
        ReflectionTestUtils.setField(outro, "sistema", true);
        assertThatThrownBy(outro::desativar).isInstanceOf(InvarianteVioladaException.class).hasMessageContaining("regra do sistema");
        assertThatThrownBy(() -> new OpcaoLista(ListaConfiguravel.OCORRENCIA_TURNO, "  ", null, 1))
                .isInstanceOf(InvarianteVioladaException.class);
    }
}
