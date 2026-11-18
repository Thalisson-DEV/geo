package com.nexo.app.modules.estoque.application.services;

import com.nexo.app.modules.estoque.domain.ContextoSolicitacaoMaterial;
import com.nexo.app.modules.estoque.domain.Material;
import com.nexo.app.modules.rh.ProcessoNegocioApi;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import org.junit.jupiter.api.Test;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ProcessoMaterialServiceTest {

    private final UUID obras = UUID.randomUUID();
    private final UUID comercial = UUID.randomUUID();
    private final ProcessoNegocioApi api = mock(ProcessoNegocioApi.class);
    private final ProcessoMaterialService service = new ProcessoMaterialService(api);

    @Test
    @SuppressWarnings("deprecation")
    void materialDeObrasSoEntraNaTecnicaENoFechamento() {
        when(api.buscarIdPorNome("OBRAS")).thenReturn(Optional.of(obras));
        Material cabo = new Material("CABO-1", "Cabo de cobre", "MT", "MATR", null, null, false, obras);
        Material alca = new Material("ALCA-1", "Alça preformada", "UN", "MATR", null, null, false, comercial);

        assertThat(service.incompatibilidade(ContextoSolicitacaoMaterial.TECNICO, cabo)).isEmpty();
        assertThat(service.incompatibilidade(ContextoSolicitacaoMaterial.FECHAMENTO, cabo)).isEmpty();
        assertThat(service.incompatibilidade(ContextoSolicitacaoMaterial.COMERCIAL, alca)).isEmpty();

        assertThat(service.incompatibilidade(ContextoSolicitacaoMaterial.COMERCIAL, cabo))
                .hasValueSatisfying(m -> assertThat(m).contains("CABO-1").contains("processo Obras"));
        assertThat(service.incompatibilidade(ContextoSolicitacaoMaterial.TECNICO, alca))
                .hasValueSatisfying(m -> assertThat(m).contains("ALCA-1").contains("solicitação comercial"));
        assertThatThrownBy(() -> service.exigirCompativel(ContextoSolicitacaoMaterial.FECHAMENTO, alca))
                .isInstanceOf(InvarianteVioladaException.class);
    }

    @Test
    @SuppressWarnings("deprecation")
    void semProcessoObrasCadastradoNadaEBarrado() {
        when(api.buscarIdPorNome("OBRAS")).thenReturn(Optional.empty());
        Material alca = new Material("ALCA-1", "Alça preformada", "UN", "MATR", null, null, false, comercial);
        assertThat(service.incompatibilidade(ContextoSolicitacaoMaterial.TECNICO, alca)).isEmpty();
    }
}
