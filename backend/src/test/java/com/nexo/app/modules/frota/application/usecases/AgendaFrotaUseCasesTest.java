package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.financeiro.FinanceiroApi;
import com.nexo.app.modules.frota.domain.Apolice;
import com.nexo.app.modules.frota.domain.CategoriaCnh;
import com.nexo.app.modules.frota.domain.Condutor;
import com.nexo.app.modules.frota.domain.OrdemServico;
import com.nexo.app.modules.frota.domain.SituacaoOrdemServico;
import com.nexo.app.modules.frota.domain.TipoEventoAgendaFrota;
import com.nexo.app.modules.frota.infrastructure.persistence.ApoliceRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.CondutorRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.DocumentoFrotaRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.FichaVeiculoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.ImplementoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.OrdemServicoRepository;
import com.nexo.app.modules.rh.ResumoColaborador;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AgendaFrotaUseCasesTest {

    @Mock
    private OrdemServicoRepository ordens;
    @Mock
    private DocumentoFrotaRepository documentos;
    @Mock
    private CondutorRepository condutores;
    @Mock
    private FichaVeiculoRepository fichas;
    @Mock
    private ImplementoRepository implementos;
    @Mock
    private ReferenciasFrota referencias;
    @Mock
    private PreventivaUseCases preventiva;
    @Mock
    private ApoliceRepository apolices;
    @Mock
    private FinanceiroApi financeiro;
    @InjectMocks
    private AgendaFrotaUseCases useCases;

    private final LocalDate hoje = LocalDate.now(LiberacaoCnhUseCases.FUSO);
    private final UUID baseFeira = UUID.randomUUID();
    private final UUID baseSalvador = UUID.randomUUID();

    @AfterEach
    void limparSessao() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void previsaoVencidaApareceNoDiaComoAtrasada() {
        logar("frota:os:read");
        var ontem = OffsetDateTime.now().minusDays(1);
        var os = ordem(12L, baseFeira, "ABC1D23");
        when(os.getPrevisaoTermino()).thenReturn(ontem);
        when(ordens.findAllBySituacaoAndPrevisaoTerminoBetweenAndAtivoTrue(eq(SituacaoOrdemServico.EM_ANDAMENTO), any(), any()))
                .thenReturn(List.of(os));
        when(referencias.nomesBases(anyCollection())).thenReturn(Map.of(baseFeira, "Feira de Santana"));

        var agenda = useCases.agenda(hoje.minusDays(3), hoje, null, Set.of(TipoEventoAgendaFrota.OS_PREVISAO_TERMINO));

        assertThat(agenda.eventos()).singleElement().satisfies(e -> {
            assertThat(e.tipo()).isEqualTo(TipoEventoAgendaFrota.OS_PREVISAO_TERMINO);
            assertThat(e.data()).isEqualTo(ontem.atZoneSameInstant(LiberacaoCnhUseCases.FUSO).toLocalDate());
            assertThat(e.atrasado()).isTrue();
            assertThat(e.tom()).isEqualTo("danger");
            assertThat(e.base()).isEqualTo("Feira de Santana");
            assertThat(e.numeroOs()).isEqualTo(12L);
        });
    }

    @Test
    void osAgendadaParaOntemFicaComoNaoIniciada() {
        logar("frota:os:read");
        var os = ordem(7L, baseFeira, "XYZ9A87");
        when(os.getAgendadaPara()).thenReturn(OffsetDateTime.now().minusDays(1));
        when(ordens.findAllBySituacaoAndAgendadaParaBetweenAndAtivoTrue(eq(SituacaoOrdemServico.AGENDADA), any(), any()))
                .thenReturn(List.of(os));

        var agenda = useCases.agenda(hoje.minusDays(2), hoje, null, Set.of(TipoEventoAgendaFrota.OS_AGENDADA));

        assertThat(agenda.eventos()).singleElement().satisfies(e -> {
            assertThat(e.atrasado()).isTrue();
            assertThat(e.detalhe()).startsWith("Não iniciada");
        });
    }

    @Test
    void semLeituraDeCondutoresNaoMostraCnhEMostraAsOs() {
        logar("frota:os:read");
        var os = ordem(3L, baseFeira, "ABC1D23");
        when(os.getAgendadaPara()).thenReturn(OffsetDateTime.now().plusDays(1));
        when(ordens.findAllBySituacaoAndAgendadaParaBetweenAndAtivoTrue(any(), any(), any())).thenReturn(List.of(os));

        var agenda = useCases.agenda(hoje, hoje.plusDays(10), null, null);

        assertThat(agenda.eventos()).extracting(e -> e.tipo()).containsOnly(TipoEventoAgendaFrota.OS_AGENDADA);
        verify(condutores, never()).findAllByAtivoTrueAndCnhValidadeBetween(any(), any());
        verify(documentos, never()).findAllByAtivoTrueAndDataVencimentoBetween(any(), any());
    }

    @Test
    void cnhVencendoMostraONomeDoCondutor() {
        logar("frota:condutor:read");
        var condutor = mock(Condutor.class);
        var idColaborador = UUID.randomUUID();
        when(condutor.getId()).thenReturn(UUID.randomUUID());
        when(condutor.getIdColaborador()).thenReturn(idColaborador);
        when(condutor.getCnhValidade()).thenReturn(hoje.plusDays(5));
        when(condutor.getCnhCategoria()).thenReturn(CategoriaCnh.D);
        when(condutores.findAllByAtivoTrueAndCnhValidadeBetween(any(), any())).thenReturn(List.of(condutor));
        when(referencias.colaboradores(anyCollection()))
                .thenReturn(Map.of(idColaborador, new ResumoColaborador(idColaborador, "Maria Souza", "Motorista", "Feira de Santana", true)));

        var agenda = useCases.agenda(hoje, hoje.plusDays(30), null, null);

        assertThat(agenda.eventos()).singleElement().satisfies(e -> {
            assertThat(e.tipo()).isEqualTo(TipoEventoAgendaFrota.CNH_VENCIMENTO);
            assertThat(e.titulo()).isEqualTo("CNH · Maria Souza");
            assertThat(e.detalhe()).isEqualTo("Vence neste dia · categoria D");
            assertThat(e.atrasado()).isFalse();
        });
    }

    @Test
    void filtroDeBaseDeixaDeForaAsOsDeOutraBase() {
        logar("frota:os:read");
        var daBase = ordem(1L, baseFeira, "AAA1A11");
        when(daBase.getAgendadaPara()).thenReturn(OffsetDateTime.now().plusDays(2));
        var deOutra = ordem(2L, baseSalvador, "BBB2B22");
        when(deOutra.getAgendadaPara()).thenReturn(OffsetDateTime.now().plusDays(2));
        when(ordens.findAllBySituacaoAndAgendadaParaBetweenAndAtivoTrue(any(), any(), any())).thenReturn(List.of(daBase, deOutra));

        var agenda = useCases.agenda(hoje, hoje.plusDays(7), List.of(baseFeira), Set.of(TipoEventoAgendaFrota.OS_AGENDADA));

        assertThat(agenda.eventos()).extracting(e -> e.numeroOs()).containsExactly(1L);
    }

    @Test
    void ordenaPorDataETruncaNoLimite() {
        logar("frota:os:read");
        var lista = new java.util.ArrayList<OrdemServico>();
        for (long i = 0; i <= AgendaFrotaUseCases.MAXIMO_EVENTOS; i++) {
            var os = ordem(i, baseFeira, "PLA" + i);
            when(os.getAgendadaPara()).thenReturn(OffsetDateTime.now().plusDays(1 + (i % 5)));
            lista.add(os);
        }
        when(ordens.findAllBySituacaoAndAgendadaParaBetweenAndAtivoTrue(any(), any(), any())).thenReturn(lista);

        var agenda = useCases.agenda(hoje, hoje.plusDays(10), null, Set.of(TipoEventoAgendaFrota.OS_AGENDADA));

        assertThat(agenda.truncado()).isTrue();
        assertThat(agenda.eventos()).hasSize(AgendaFrotaUseCases.MAXIMO_EVENTOS);
        assertThat(agenda.eventos()).extracting(e -> e.data()).isSorted();
    }

    @Test
    void apoliceVencendoApareceSoParaQuemLeSeguros() {
        var idSeguradora = UUID.randomUUID();
        var apolice = Apolice.cadastrar(new Apolice.Dados("777", idSeguradora, null, null, baseSalvador, null,
                hoje.minusMonths(11), hoje.plusDays(5), new BigDecimal("9000"), null, null));
        apolice.incluirVeiculo(UUID.randomUUID(), null, null);
        when(apolices.findAllByAtivoTrueAndVigenciaFimBetween(any(), any())).thenReturn(List.of(apolice));
        when(financeiro.nomesFornecedores(anyCollection())).thenReturn(Map.of(idSeguradora, "SEGURADORA TESTE"));
        when(referencias.nomesBases(anyCollection())).thenReturn(Map.of(baseSalvador, "Salvador"));

        logar("frota:seguro:read");
        var agenda = useCases.agenda(hoje, hoje.plusDays(10), null, null);
        assertThat(agenda.eventos()).singleElement().satisfies(e -> {
            assertThat(e.tipo()).isEqualTo(TipoEventoAgendaFrota.APOLICE_VENCIMENTO);
            assertThat(e.titulo()).isEqualTo("Apólice 777 · SEGURADORA TESTE");
            assertThat(e.detalhe()).isEqualTo("Fim da vigência · 1 veículo");
            assertThat(e.base()).isEqualTo("Salvador");
        });
        assertThat(useCases.agenda(hoje, hoje.plusDays(10), Set.of(baseFeira), null).eventos()).as("outra base").isEmpty();

        logar("frota:os:read");
        assertThat(useCases.agenda(hoje, hoje.plusDays(10), null, Set.of(TipoEventoAgendaFrota.APOLICE_VENCIMENTO)).eventos()).isEmpty();
        verify(apolices, org.mockito.Mockito.times(2)).findAllByAtivoTrueAndVigenciaFimBetween(any(), any());
    }

    @Test
    void recusaPeriodoAcimaDoMaximoOuInvertido() {
        logar("frota:os:read");

        assertThatThrownBy(() -> useCases.agenda(hoje, hoje.plusDays(AgendaFrotaUseCases.MAXIMO_DIAS + 1), null, null))
                .isInstanceOf(InvarianteVioladaException.class);
        assertThatThrownBy(() -> useCases.agenda(hoje, hoje.minusDays(1), null, null))
                .isInstanceOf(InvarianteVioladaException.class);
    }

    @Test
    void semNenhumaLeituraDaFrotaNegaOAcesso() {
        logar("rh:colaborador:read");

        assertThatThrownBy(() -> useCases.agenda(hoje, hoje.plusDays(1), null, null)).isInstanceOf(AccessDeniedException.class);
    }

    private static void logar(String... autoridades) {
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken("gestor", null, autoridades));
    }

    private static OrdemServico ordem(Long numero, UUID idBase, String placa) {
        var o = mock(OrdemServico.class);
        when(o.getId()).thenReturn(UUID.randomUUID());
        when(o.getNumero()).thenReturn(numero);
        when(o.getIdBaseOperacional()).thenReturn(idBase);
        when(o.getPlaca()).thenReturn(placa);
        when(o.isVeicular()).thenReturn(true);
        when(o.getDescricao()).thenReturn("Troca de pastilhas");
        return o;
    }
}
