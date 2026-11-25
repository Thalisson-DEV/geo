package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.financeiro.FinanceiroApi;
import com.nexo.app.modules.financeiro.ResumoSolicitacaoFinanceira;
import com.nexo.app.modules.frota.FrotaCondutorApi;
import com.nexo.app.modules.frota.FrotaOdometroApi;
import com.nexo.app.modules.frota.application.dto.AbrirOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.ConcluirOrdemServicoRequest;
import com.nexo.app.modules.frota.domain.Criticidade;
import com.nexo.app.modules.frota.domain.FichaVeiculo;
import com.nexo.app.modules.frota.domain.ItemManutencao;
import com.nexo.app.modules.frota.domain.OrdemServico;
import com.nexo.app.modules.frota.domain.OrigemOrdemServico;
import com.nexo.app.modules.frota.domain.OrigemPeca;
import com.nexo.app.modules.frota.domain.SituacaoOperacional;
import com.nexo.app.modules.frota.domain.SituacaoOrdemServico;
import com.nexo.app.modules.frota.domain.SolicitacaoOrdemServico;
import com.nexo.app.modules.frota.domain.TipoManutencao;
import com.nexo.app.modules.frota.domain.TipoOficina;
import com.nexo.app.modules.frota.infrastructure.persistence.EventoOrdemServicoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.FichaVeiculoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.OrdemServicoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.SolicitacaoOrdemServicoRepository;
import com.nexo.app.shared.domain.events.FrotaManutencaoRepetidaEvent;
import com.nexo.app.shared.domain.events.FrotaOrdemServicoAbertaEvent;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OrdemServicoUseCasesTest {

    @Mock
    private OrdemServicoRepository repository;
    @Mock
    private FichaVeiculoRepository fichaRepository;
    @Mock
    private EventoOrdemServicoRepository historicoRepository;
    @Mock
    private SolicitacaoOrdemServicoRepository solicitacaoRepository;
    @Mock
    private ItemManutencaoUseCases itens;
    @Mock
    private RepeticoesManutencao repeticoes;
    @Mock
    private RealizacoesPreventivas preventivas;
    @Mock
    private MontadorOrdemServico montador;
    @Mock
    private ReferenciasFrota referencias;
    @Mock
    private FrotaCondutorApi condutores;
    @Mock
    private FrotaOdometroApi odometro;
    @Mock
    private FinanceiroApi financeiro;
    @Mock
    private ApplicationEventPublisher eventPublisher;
    @Mock
    private com.nexo.app.modules.listas.ListasApi listasApi;

    @org.junit.jupiter.api.BeforeEach
    void listasDevolvemOCodigo() {
        org.mockito.Mockito.lenient().when(listasApi.rotulo(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any())).thenAnswer(i -> i.getArgument(1));
        org.mockito.Mockito.lenient().when(listasApi.exigirAtiva(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any())).thenAnswer(i -> i.getArgument(1));
    }

    @InjectMocks
    private OrdemServicoUseCases useCases;

    private final UUID idVeiculo = UUID.randomUUID();
    private final OffsetDateTime agora = OffsetDateTime.now().minusMinutes(1);
    private FichaVeiculo ficha;
    private ItemManutencao pastilha;

    @BeforeEach
    void setUp() {
        ficha = FichaVeiculo.provisionar(idVeiculo, "ABC1D23", UUID.randomUUID());
        pastilha = new ItemManutencao("PASTILHA", "SUSPENSAO_FREIOS", null, null);
        ReflectionTestUtils.setField(pastilha, "id", UUID.randomUUID());
        lenient().when(fichaRepository.findByIdVeiculo(idVeiculo)).thenReturn(Optional.of(ficha));
        lenient().when(itens.buscarEntidades(anyList())).thenReturn(List.of(pastilha));
        lenient().when(repository.saveAndFlush(any(OrdemServico.class))).thenAnswer(i -> comId(i.getArgument(0)));
        lenient().when(repository.save(any(OrdemServico.class))).thenAnswer(i -> i.getArgument(0));
        lenient().when(referencias.nomesBases(anyCollection())).thenReturn(Map.of());
        lenient().when(referencias.colaboradorAtivo(any())).thenReturn(true);
    }

    private static OrdemServico comId(OrdemServico os) {
        ReflectionTestUtils.setField(os, "id", UUID.randomUUID());
        ReflectionTestUtils.setField(os, "numero", 42L);
        return os;
    }

    private AbrirOrdemServicoRequest abertura(Criticidade criticidade, Long km) {
        return new AbrirOrdemServicoRequest(idVeiculo, TipoManutencao.CORRETIVA, OrigemOrdemServico.VERBAL,
                criticidade, null, "Freio rangendo", List.of(pastilha.getId()), null, agora, km,
                TipoOficina.INTERNA, null, null, null);
    }

    @Test
    void aberturaUrgenteUsaOCondutorDoMomentoParaOVeiculoEAvisa() {
        UUID condutor = UUID.randomUUID();
        when(condutores.condutorEm(idVeiculo, agora)).thenReturn(Optional.of(condutor));

        useCases.abrir(abertura(Criticidade.URGENTE, null));

        var captor = ArgumentCaptor.forClass(OrdemServico.class);
        verify(repository).saveAndFlush(captor.capture());
        assertThat(captor.getValue().getIdCondutor()).isEqualTo(condutor);
        assertThat(ficha.getSituacao()).isEqualTo(SituacaoOperacional.EM_MANUTENCAO);
        verify(eventPublisher).publishEvent(any(FrotaOrdemServicoAbertaEvent.class));
        verify(odometro, never()).registrarLeitura(any(), any(Long.class), any(), any(), any(), any());
    }

    @Test
    void kmIncoerenteDaAberturaViraAvisoSemImpedirAOs() {
        when(odometro.registrarLeitura(eq(idVeiculo), eq(9_000L), eq(agora), eq(FrotaOdometroApi.OrigemLeitura.MANUTENCAO),
                any(), any())).thenReturn(new FrotaOdometroApi.ResultadoLeitura(UUID.randomUUID(), false,
                "KM menor que a leitura anterior (10.000 km).", 10_000L));

        useCases.abrir(abertura(Criticidade.MEDIA, 9_000L));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<String>> avisos = ArgumentCaptor.forClass(List.class);
        verify(montador).detalhar(any(), avisos.capture());
        assertThat(avisos.getValue()).singleElement().asString().contains("inconsistente");
    }

    @Test
    void osImportadaNaoDisparaAviso() {
        var request = new AbrirOrdemServicoRequest(idVeiculo, TipoManutencao.CORRETIVA, OrigemOrdemServico.IMPORTACAO,
                Criticidade.MEDIA, null, "Histórico", List.of(pastilha.getId()), null, agora.minusDays(400), null,
                null, null, "Oficina antiga", null);

        useCases.abrir(request);

        verify(eventPublisher, never()).publishEvent(any(FrotaOrdemServicoAbertaEvent.class));
    }

    @Test
    void cancelamentoRecusadoComCompraAguardandoAprovacao() {
        var os = comId(OrdemServico.abrir(ficha, new OrdemServico.Abertura(TipoManutencao.CORRETIVA,
                OrigemOrdemServico.VERBAL, Criticidade.MEDIA, null, "x", null, agora, null, null, null, null, null),
                List.of(pastilha), null));
        UUID idCompra = UUID.randomUUID();
        when(repository.findById(os.getId())).thenReturn(Optional.of(os));
        when(solicitacaoRepository.findAllByIdOrdemServicoAndAtivoTrueOrderByDataCriacaoAsc(os.getId()))
                .thenReturn(List.of(new SolicitacaoOrdemServico(os.getId(), idCompra, "COMPRA")));
        when(financeiro.resumosSolicitacoes(List.of(idCompra))).thenReturn(Map.of(idCompra,
                new ResumoSolicitacaoFinanceira(idCompra, "COMPRA", 77L, "SOLICITADO", BigDecimal.TEN, null,
                        null, null, null, null, null)));

        assertThatThrownBy(() -> useCases.cancelar(os.getId(), "Duplicada"))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("nº 77");
        assertThat(os.getSituacao()).isEqualTo(SituacaoOrdemServico.PENDENTE);
    }

    @Test
    void conclusaoComRepeticaoPublicaAvisoEDevolveAFichaAoServico() {
        var os = comId(OrdemServico.abrir(ficha, new OrdemServico.Abertura(TipoManutencao.CORRETIVA,
                OrigemOrdemServico.VERBAL, Criticidade.URGENTE, null, "x", null, agora.minusHours(6), null, null,
                null, null, null), List.of(pastilha), null));
        ficha.entrarEmManutencao();
        when(repository.findById(os.getId())).thenReturn(Optional.of(os));
        when(repository.existeOutraParadaEmCurso(eq(idVeiculo), eq(os.getId()), anyCollection())).thenReturn(false);
        when(repeticoes.registrar(os)).thenAnswer(i -> {
            var item = os.getItens().get(0);
            item.registrarRepeticao(UUID.randomUUID(), 30L, 20);
            return List.of(item);
        });

        useCases.concluir(os.getId(), new ConcluirOrdemServicoRequest(agora.minusHours(5), agora.minusHours(1),
                "Troca das pastilhas", null, new BigDecimal("300"), null, TipoOficina.INTERNA, null, null, null,
                "DESGASTE_NATURAL"));

        assertThat(os.getSituacao()).isEqualTo(SituacaoOrdemServico.CONCLUIDA);
        assertThat(ficha.getSituacao()).isEqualTo(SituacaoOperacional.ATIVO);
        var evento = ArgumentCaptor.forClass(FrotaManutencaoRepetidaEvent.class);
        verify(eventPublisher).publishEvent(evento.capture());
        assertThat(evento.getValue().numeroOsAnterior()).isEqualTo(30L);
        assertThat(evento.getValue().diasDesdeAnterior()).isEqualTo(20);
    }

    @Test
    void outraOsParadaMantemAFichaEmManutencao() {
        var os = comId(OrdemServico.abrir(ficha, new OrdemServico.Abertura(TipoManutencao.CORRETIVA,
                OrigemOrdemServico.VERBAL, Criticidade.URGENTE, null, "x", null, agora.minusHours(6), null, null,
                null, null, null), List.of(pastilha), null));
        ficha.entrarEmManutencao();
        when(repository.findById(os.getId())).thenReturn(Optional.of(os));
        when(repository.existeOutraParadaEmCurso(eq(idVeiculo), eq(os.getId()), anyCollection())).thenReturn(true);
        when(solicitacaoRepository.findAllByIdOrdemServicoAndAtivoTrueOrderByDataCriacaoAsc(os.getId())).thenReturn(List.of());
        when(financeiro.resumosSolicitacoes(List.of())).thenReturn(Map.of());

        useCases.cancelar(os.getId(), "Aberta em duplicidade");

        assertThat(ficha.getSituacao()).isEqualTo(SituacaoOperacional.EM_MANUTENCAO);
    }
    @Test
    void preenchimentoLevaOTotalSemAsPecasDoEstoqueEAPrioridadeDaOs() {
        var os = comId(OrdemServico.abrir(ficha, new OrdemServico.Abertura(TipoManutencao.CORRETIVA,
                OrigemOrdemServico.VERBAL, Criticidade.MEDIA, null, "Freio", null, agora, null, TipoOficina.EXTERNA,
                null, "Oficina do Zé", false), List.of(pastilha), null));
        os.lancarServico(new OrdemServico.DadosServico("Troca", null, null, null, BigDecimal.ONE, new BigDecimal("120")));
        os.lancarPeca(new OrdemServico.DadosPeca("Pastilha dianteira", "PD-10", OrigemPeca.COMPRA, new BigDecimal("2"),
                "JG", new BigDecimal("55")));
        os.lancarPeca(new OrdemServico.DadosPeca("Fluido de freio", null, OrigemPeca.ESTOQUE, new BigDecimal("0.5"),
                "L", new BigDecimal("40")));
        when(repository.findById(os.getId())).thenReturn(Optional.of(os));

        var preenchimento = useCases.preenchimentoFinanceiro(os.getId());

        assertThat(preenchimento.varianteSugerida()).isEqualTo("FROTA");
        // 120 de serviço + 110 de pastilha; o fluido saiu do estoque, já foi comprado.
        assertThat((BigDecimal) preenchimento.valores().get("valor")).isEqualByComparingTo("230.00");
        assertThat(preenchimento.valores().get("prioridade")).isEqualTo("NORMAL");
        assertThat(preenchimento.valores().get("quantidade")).isEqualTo(1);
        assertThat((String) preenchimento.valores().get("descricao"))
                .endsWith("Peças a comprar:\n- 2 JG Pastilha dianteira (PD-10)")
                .doesNotContain("Fluido");
    }

    @Test
    void osConcluidaAindaAceitaCompraNoFinanceiro() {
        var os = comId(OrdemServico.abrir(ficha, new OrdemServico.Abertura(TipoManutencao.CORRETIVA,
                OrigemOrdemServico.VERBAL, Criticidade.URGENTE, null, "Pneu", null, agora.minusHours(6), null,
                TipoOficina.EXTERNA, null, "Borracharia", false), List.of(pastilha), null));
        os.concluir(new OrdemServico.Encerramento(agora.minusHours(5), agora.minusHours(1), "Conserto do pneu", null,
                new BigDecimal("20"), null, TipoOficina.EXTERNA, null, "Borracharia", "AVARIA"));
        when(repository.findById(os.getId())).thenReturn(Optional.of(os));

        var preenchimento = useCases.preenchimentoFinanceiro(os.getId());

        assertThat(preenchimento.valores().get("prioridade")).isEqualTo("URGENTE");
        assertThat(preenchimento.valores().get("fornecedorNome")).isEqualTo("Borracharia");
    }
}
