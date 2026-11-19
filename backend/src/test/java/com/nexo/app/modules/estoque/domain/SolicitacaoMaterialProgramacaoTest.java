package com.nexo.app.modules.estoque.domain;

import com.nexo.app.modules.obras.ObraApi.ObraPublica;
import com.nexo.app.modules.obras.ObraApi.TipoObraPublico;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Solicitação técnica gerada pela programação: vínculo, reprogramação e cancelamento enquanto o material não andou. */
class SolicitacaoMaterialProgramacaoTest {

    private final UUID equipe = UUID.randomUUID();
    private final LocalDate inicio = LocalDate.now().plusDays(5);

    @Test
    void manualNaoAcompanhaProgramacao() {
        SolicitacaoMaterial solicitacao = tecnica();

        assertThat(solicitacao.geradaPorProgramacao()).isFalse();
        assertThat(solicitacao.acompanhaProgramacao()).isFalse();
    }

    @Test
    void vinculadaAcompanhaReprogramacaoNoSaqueENaEquipe() {
        SolicitacaoMaterial solicitacao = tecnica();
        UUID idProgramacao = UUID.randomUUID();
        solicitacao.vincularProgramacao(idProgramacao, 42L);
        UUID novaEquipe = UUID.randomUUID();

        solicitacao.acompanharReprogramacao(inicio.plusDays(3), novaEquipe);

        assertThat(solicitacao.getIdProgramacao()).isEqualTo(idProgramacao);
        assertThat(solicitacao.getNumeroProgramacao()).isEqualTo(42L);
        assertThat(solicitacao.getDataPrevistaRetirada()).isEqualTo(inicio.plusDays(3));
        assertThat(solicitacao.getIdEquipeSaque()).isEqualTo(novaEquipe);
        assertThat(solicitacao.getStatusSeparacao()).isEqualTo(StatusSeparacao.PRONTO_PARA_SEPARACAO);
    }

    @Test
    void separacaoIniciadaTiraASolicitacaoDaProgramacao() {
        SolicitacaoMaterial solicitacao = tecnica();
        solicitacao.vincularProgramacao(UUID.randomUUID(), 1L);
        solicitacao.iniciarSeparacao(UUID.randomUUID());

        assertThat(solicitacao.acompanhaProgramacao()).isFalse();
        assertThatThrownBy(() -> solicitacao.acompanharReprogramacao(inicio.plusDays(1), equipe))
                .isInstanceOf(InvarianteVioladaException.class);
        assertThatThrownBy(() -> solicitacao.cancelarPorProgramacao(UUID.randomUUID(), "x"))
                .isInstanceOf(InvarianteVioladaException.class);
    }

    @Test
    void cancelamentoDaProgramacaoCancelaASolicitacao() {
        SolicitacaoMaterial solicitacao = tecnica();
        solicitacao.vincularProgramacao(UUID.randomUUID(), 7L);
        UUID usuario = UUID.randomUUID();

        solicitacao.cancelarPorProgramacao(usuario, "Programação #7 cancelada.");

        assertThat(solicitacao.getStatus()).isEqualTo(SolicitacaoMaterial.StatusSolicitacao.CANCELADO);
        assertThat(solicitacao.getStatusSeparacao()).isNull();
        assertThat(solicitacao.getIdUsuarioCancelamento()).isEqualTo(usuario);
        assertThat(solicitacao.getMotivoCancelamento()).isEqualTo("Programação #7 cancelada.");
        assertThat(EtapaOperacionalSolicitacao.calcular(solicitacao)).isEqualTo(EtapaOperacionalSolicitacao.CONCLUIDA);
    }

    private SolicitacaoMaterial tecnica() {
        Estoque almoxarifado = mock(Estoque.class);
        when(almoxarifado.getId()).thenReturn(UUID.randomUUID());
        Estoque obraEstoque = mock(Estoque.class);
        when(obraEstoque.getId()).thenReturn(UUID.randomUUID());
        ObraPublica obra = new ObraPublica(
                UUID.randomUUID(), "001", "Obra teste", TipoObraPublico.OBRA, true,
                UUID.randomUUID(), "OBRAS", true, UUID.randomUUID(), Set.of(), null, List.of());
        SolicitacaoMaterial solicitacao = SolicitacaoMaterial.criarTecnica(
                obra, null, TipoSolicitacaoTecnica.ADICAO_COMUM, obraEstoque, almoxarifado, equipe, inicio,
                "Gerada pela programação", UUID.randomUUID());
        Material material = mock(Material.class);
        when(material.getId()).thenReturn(UUID.randomUUID());
        solicitacao.adicionarItemTecnico(material, new BigDecimal("3.000"));
        return solicitacao;
    }
}
