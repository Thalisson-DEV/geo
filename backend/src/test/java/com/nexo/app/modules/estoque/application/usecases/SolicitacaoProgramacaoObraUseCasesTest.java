package com.nexo.app.modules.estoque.application.usecases;

import com.nexo.app.modules.estoque.application.dto.CriacaoSolicitacaoTecnicaResponse;
import com.nexo.app.modules.estoque.application.dto.CriarSolicitacaoTecnicaRequest;
import com.nexo.app.modules.estoque.application.services.GravadorEventoSolicitacaoService;
import com.nexo.app.modules.estoque.application.services.ProcessoMaterialService;
import com.nexo.app.modules.estoque.domain.ContextoSolicitacaoMaterial;
import com.nexo.app.modules.estoque.domain.Material;
import com.nexo.app.modules.estoque.domain.OrigemComandoTecnico;
import com.nexo.app.modules.estoque.domain.SolicitacaoMaterial;
import com.nexo.app.modules.estoque.domain.TipoEventoSolicitacao;
import com.nexo.app.modules.estoque.domain.TipoSolicitacaoTecnica;
import com.nexo.app.modules.estoque.infrastructure.persistence.MaterialRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.SolicitacaoMaterialRepository;
import com.nexo.app.shared.domain.events.ProgramacaoObraEvent;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class SolicitacaoProgramacaoObraUseCasesTest {

    private final SolicitacaoTecnicaUseCases solicitacoes = mock(SolicitacaoTecnicaUseCases.class);
    private final SolicitacaoMaterialRepository repository = mock(SolicitacaoMaterialRepository.class);
    private final GravadorEventoSolicitacaoService gravador = mock(GravadorEventoSolicitacaoService.class);
    private final MaterialRepository materiais = mock(MaterialRepository.class);
    private final ProcessoMaterialService processo = mock(ProcessoMaterialService.class);
    private final SolicitacaoProgramacaoObraUseCases useCases =
            new SolicitacaoProgramacaoObraUseCases(solicitacoes, repository, gravador, materiais, processo);

    private final UUID usuario = UUID.randomUUID();
    private final UUID idProgramacao = UUID.randomUUID();
    private final UUID idMaterial = UUID.randomUUID();
    private final LocalDate inicio = LocalDate.of(2026, 11, 23);

    @Test
    void criadaPedeAdicaoComumComInicioComoSaqueEVinculaAProgramacao() {
        Material material = material("300078");
        when(materiais.findAllById(List.of(idMaterial))).thenReturn(List.of(material));
        when(processo.incompatibilidade(ContextoSolicitacaoMaterial.TECNICO, material)).thenReturn(Optional.empty());
        UUID idCriada = UUID.randomUUID();
        when(solicitacoes.criar(any(), eq(usuario), eq(OrigemComandoTecnico.SYSTEM))).thenReturn(new CriacaoSolicitacaoTecnicaResponse(
                List.of(new CriacaoSolicitacaoTecnicaResponse.SolicitacaoCriada(TipoSolicitacaoTecnica.ADICAO_COMUM, idCriada))));
        SolicitacaoMaterial criada = mock(SolicitacaoMaterial.class);
        when(repository.findById(idCriada)).thenReturn(Optional.of(criada));

        useCases.criar(evento(ProgramacaoObraEvent.Tipo.CRIADA, List.of(new ProgramacaoObraEvent.Material(idMaterial, new BigDecimal("4")))), usuario);

        ArgumentCaptor<CriarSolicitacaoTecnicaRequest> pedido = ArgumentCaptor.forClass(CriarSolicitacaoTecnicaRequest.class);
        verify(solicitacoes).criar(pedido.capture(), eq(usuario), eq(OrigemComandoTecnico.SYSTEM));
        assertThat(pedido.getValue().dataPrevista()).isEqualTo(inicio);
        assertThat(pedido.getValue().itens()).singleElement().satisfies(item -> {
            assertThat(item.tipoMovimentacao()).isEqualTo(TipoSolicitacaoTecnica.ADICAO_COMUM);
            assertThat(item.quantidade()).isEqualByComparingTo("4");
        });
        verify(criada).vincularProgramacao(idProgramacao, 12L);
    }

    @Test
    void materialForaDeObrasBarraComTodosOsNomes() {
        Material material = material("300101");
        when(materiais.findAllById(List.of(idMaterial))).thenReturn(List.of(material));
        when(processo.incompatibilidade(ContextoSolicitacaoMaterial.TECNICO, material)).thenReturn(Optional.of("fora"));

        assertThatThrownBy(() -> useCases.criar(evento(ProgramacaoObraEvent.Tipo.CRIADA,
                List.of(new ProgramacaoObraEvent.Material(idMaterial, BigDecimal.ONE))), usuario))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("300101 - Material 300101");
        verify(solicitacoes, never()).criar(any(), any(), any());
    }

    @Test
    void semMaterialNadaAcontece() {
        useCases.criar(evento(ProgramacaoObraEvent.Tipo.CRIADA, List.of()), usuario);

        verifyNoInteractions(solicitacoes, materiais);
    }

    @Test
    void reprogramacaoSoMexeNaQueAindaAcompanha() {
        SolicitacaoMaterial acompanha = mock(SolicitacaoMaterial.class);
        when(acompanha.acompanhaProgramacao()).thenReturn(true);
        when(acompanha.getDataPrevistaRetirada()).thenReturn(inicio.minusDays(2));
        SolicitacaoMaterial emAtendimento = mock(SolicitacaoMaterial.class);
        when(repository.findAllByIdProgramacaoAndAtivoTrue(idProgramacao)).thenReturn(List.of(acompanha, emAtendimento));

        useCases.reprogramar(evento(ProgramacaoObraEvent.Tipo.REPROGRAMADA, List.of()), usuario);

        verify(acompanha).acompanharReprogramacao(eq(inicio), any());
        verify(gravador).registrarFilho(eq(acompanha), eq(TipoEventoSolicitacao.DATA_PREVISTA_ALTERADA), any(), any());
        verify(emAtendimento, never()).acompanharReprogramacao(any(), any());
    }

    @Test
    void cancelamentoCancelaSoAQueAindaAcompanha() {
        SolicitacaoMaterial acompanha = mock(SolicitacaoMaterial.class);
        when(acompanha.acompanhaProgramacao()).thenReturn(true);
        SolicitacaoMaterial emAtendimento = mock(SolicitacaoMaterial.class);
        when(repository.findAllByIdProgramacaoAndAtivoTrue(idProgramacao)).thenReturn(List.of(acompanha, emAtendimento));

        useCases.cancelar(evento(ProgramacaoObraEvent.Tipo.CANCELADA, List.of()), usuario);

        verify(acompanha).cancelarPorProgramacao(eq(usuario), any());
        verify(emAtendimento, never()).cancelarPorProgramacao(any(), any());
        verify(gravador).registrarFilho(eq(acompanha), eq(TipoEventoSolicitacao.CANCELAMENTO_CONFIRMADO), any(), any());
    }

    private ProgramacaoObraEvent evento(ProgramacaoObraEvent.Tipo tipo, List<ProgramacaoObraEvent.Material> itens) {
        return new ProgramacaoObraEvent(tipo, idProgramacao, 12L, UUID.randomUUID(), UUID.randomUUID(), inicio,
                UUID.randomUUID(), null, "Gerada pela programação #12", itens);
    }

    private static Material material(String codigo) {
        Material material = mock(Material.class);
        when(material.getCodigo()).thenReturn(codigo);
        when(material.getDescricao()).thenReturn("Material " + codigo);
        return material;
    }
}
