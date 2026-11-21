package com.nexo.app.modules.obras.application.usecases;

import com.nexo.app.modules.obras.application.dto.CampoObrasResponses;
import com.nexo.app.modules.obras.domain.*;
import com.nexo.app.modules.obras.infrastructure.persistence.*;
import com.nexo.app.modules.rh.EquipeApi;
import com.nexo.app.modules.rh.EquipeResponse;
import com.nexo.app.modules.rh.MunicipioApi;
import com.nexo.app.shared.domain.exception.AcessoNegadoException;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.infrastructure.storage.ObjectStorageService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PacoteCampoObrasTest {

    @Mock EquipeApi equipeApi;
    @Mock MunicipioApi municipioApi;
    @Mock CampoObrasUseCases campo;
    @Mock ProgramacaoRepository programacaoRepository;
    @Mock ObraRepository obraRepository;
    @Mock PlanejamentoObraRepository planejamentoRepository;
    @Mock AnexoObraRepository anexoRepository;
    @Mock PontoPlanejamentoRepository pontoRepository;
    @Mock VaoPlanejamentoRepository vaoRepository;
    @Mock EvidenciaPontoRepository evidenciaRepository;
    @Mock FichaAsBuiltRepository fichaRepository;
    @Mock ModeloChecklistObraRepository modeloRepository;
    @Mock EventoProgramacaoRepository eventoRepository;
    @Mock ObjectStorageService objectStorage;
    @Mock com.nexo.app.modules.obras.infrastructure.persistence.KitAplicadoRepository kitRepository;
    @Mock com.nexo.app.modules.obras.infrastructure.persistence.AprTurnoRepository aprRepository;
    @Mock com.nexo.app.modules.obras.infrastructure.persistence.OcorrenciaTurnoRepository ocorrenciaRepository;
    @Mock com.nexo.app.modules.execucao.TurnoApi turnoApi;
    @InjectMocks PacoteCampoObras pacote;

    private final UUID usuario = UUID.randomUUID();
    private final UUID equipe = UUID.randomUUID();
    private final LocalDate hoje = LocalDate.now(ZoneId.of("America/Sao_Paulo"));

    @BeforeEach
    void preparar() {
        when(campo.equipeDoUsuario(usuario)).thenReturn(Optional.of(equipe));
        EquipeResponse dados = mock(EquipeResponse.class);
        when(dados.codigo()).thenReturn("FIC-01");
        when(equipeApi.buscarPorIdResponse(equipe)).thenReturn(Optional.of(dados));
        when(eventoRepository.listarDaEquipeDesde(any(), any())).thenReturn(List.of());
    }

    @Test
    void pacoteDeOutraEquipeE403() {
        assertThatThrownBy(() -> pacote.montar(usuario, UUID.randomUUID(), null)).isInstanceOf(AcessoNegadoException.class);
    }

    @Test
    void quemNaoLideraEquipePrecisaInformarQual() {
        UUID supervisor = UUID.randomUUID();
        when(campo.equipeDoUsuario(supervisor)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> pacote.montar(supervisor, null, null)).isInstanceOf(InvarianteVioladaException.class);
    }

    @Test
    void trazAgendaDaEquipeComObraEnderecoEItensESeparaAsCanceladas() {
        UUID idObra = UUID.randomUUID();
        UUID idPonto = UUID.randomUUID();
        KitConstrutivo catalogo = new KitConstrutivo(UUID.randomUUID(), "LMI-0168", "POSTE", "POSTE", Set.of());
        KitAplicado kit = KitAplicado.noPonto(idObra, idPonto, catalogo, null, BigDecimal.ONE, List.of(
                new KitAplicado.ModeloItem(TipoItemKit.SERVICO, UUID.randomUUID(), "S1", "Instalar poste", OperacaoItemKit.INSTALAR, "UN", BigDecimal.ONE)));
        kit.getItens().forEach(i -> ReflectionTestUtils.setField(i, "id", UUID.randomUUID()));
        Programacao vigente = new Programacao(12, idObra, equipe, hoje, hoje,
                new Programacao.Condicoes("Implantar rede", false, true, false, TurnoProgramacao.DIA_TODO, SituacaoIntervencao.CRIADO, null));
        ReflectionTestUtils.setField(vigente, "id", UUID.randomUUID());
        kit.getItensAtivos().forEach(i -> vigente.incluirItem(i, BigDecimal.TEN));
        Programacao cancelada = new Programacao(13, idObra, equipe, hoje, hoje,
                new Programacao.Condicoes("Outra", false, false, false, TurnoProgramacao.DIA_TODO, SituacaoIntervencao.CRIADO, null));
        ReflectionTestUtils.setField(cancelada, "id", UUID.randomUUID());
        ReflectionTestUtils.setField(cancelada, "status", StatusProgramacao.CANCELADA);
        when(programacaoRepository.listarDaEquipeNoPeriodoComItens(equipe, hoje, hoje.plusDays(7))).thenReturn(List.of(vigente, cancelada));
        Obra obra = mock(Obra.class);
        when(obra.getId()).thenReturn(idObra);
        when(obra.getNumero()).thenReturn("7000001");
        when(obra.getEndereco()).thenReturn("Rua das Flores, 100");
        when(obraRepository.findById(idObra)).thenReturn(Optional.of(obra));
        PontoPlanejamento ponto = mock(PontoPlanejamento.class);
        when(ponto.getId()).thenReturn(idPonto);
        when(ponto.getNumero()).thenReturn("4");
        when(pontoRepository.findByIdObraAndAtivoTrueOrderByPaginaAscNumeroAsc(idObra)).thenReturn(List.of(ponto));

        CampoObrasResponses.Pacote p = pacote.montar(usuario, null, null);

        assertThat(p.idEquipe()).isEqualTo(equipe);
        assertThat(p.programacoes()).extracting(CampoObrasResponses.ProgramacaoCampo::numero).containsExactly(12L);
        assertThat(p.programacoes().get(0).itens()).singleElement().satisfies(i -> {
            assertThat(i.idPonto()).isEqualTo(idPonto);
            assertThat(i.local()).isEqualTo("P4");
        });
        assertThat(p.programacoesRemovidas()).containsExactly(cancelada.getId());
        assertThat(p.obras()).singleElement().satisfies(o -> assertThat(o.endereco()).isEqualTo("Rua das Flores, 100"));
        assertThat(p.modeloApr().sugestoes().get("DESLIGAMENTO").riscos()).contains("Choque elétrico", "Arco elétrico");
    }
}
