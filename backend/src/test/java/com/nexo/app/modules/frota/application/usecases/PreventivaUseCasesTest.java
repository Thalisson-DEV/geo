package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.application.dto.AbrirOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.AbrirOsPreventivaRequest;
import com.nexo.app.modules.frota.application.dto.AcompanhamentoPreventivaFilter;
import com.nexo.app.modules.frota.application.dto.ConcluirOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.InformarRealizacaoPreventivaRequest;
import com.nexo.app.modules.frota.application.dto.OrdemServicoFilter;
import com.nexo.app.modules.frota.application.dto.ItemManutencaoRequest;
import com.nexo.app.modules.frota.application.dto.PlanoPreventivoRequest;
import com.nexo.app.modules.frota.application.dto.RegistrarLeituraRequest;
import com.nexo.app.modules.frota.application.dto.TipoVeiculoRequest;
import com.nexo.app.modules.frota.application.dto.VeiculoFrotaRequest;
import com.nexo.app.modules.frota.domain.CausaManutencao;
import com.nexo.app.modules.frota.domain.Combustivel;
import com.nexo.app.modules.frota.domain.Criticidade;
import com.nexo.app.modules.frota.domain.NaturezaServico;
import com.nexo.app.modules.frota.domain.OrigemBasePreventiva;
import com.nexo.app.modules.frota.domain.OrigemOrdemServico;
import com.nexo.app.modules.frota.domain.RegimeVeiculo;
import com.nexo.app.modules.frota.domain.SituacaoOperacional;
import com.nexo.app.modules.frota.domain.SituacaoPreventiva;
import com.nexo.app.modules.frota.domain.TipoManutencao;
import com.nexo.app.modules.frota.domain.TipoOficina;
import com.nexo.app.modules.rh.domain.BaseOperacional;
import com.nexo.app.modules.rh.domain.CentroFaturamento;
import com.nexo.app.modules.rh.infrastructure.persistence.BaseOperacionalRepository;
import com.nexo.app.modules.rh.infrastructure.persistence.CentroFaturamentoRepository;
import com.nexo.app.shared.domain.events.FrotaPreventivaProximaEvent;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;
import org.springframework.test.context.transaction.BeforeTransaction;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Ciclo da preventiva de ponta a ponta: o plano chega ao veículo, a realização informada vira
 * a base, a leitura nova deixa a revisão próxima (com um aviso só), a OS sai pelo
 * acompanhamento e a conclusão recomeça o ciclo.
 */
@SpringBootTest
@Transactional
@RecordApplicationEvents
class PreventivaUseCasesTest {

    @Autowired
    private PlanoPreventivoUseCases planos;
    @Autowired
    private PreventivaUseCases preventiva;
    @Autowired
    private OrdemServicoUseCases ordens;
    @Autowired
    private OdometroUseCases odometro;
    @Autowired
    private VeiculoFrotaUseCases veiculos;
    @Autowired
    private TipoVeiculoUseCases tipos;
    @Autowired
    private ItemManutencaoUseCases itens;
    @Autowired
    private BaseOperacionalRepository baseRepository;
    @Autowired
    private CentroFaturamentoRepository centroRepository;
    @Autowired
    private EntityManager entityManager;
    @Autowired
    private ApplicationEvents eventos;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private PreventivaScheduler rotina;

    private UUID idVeiculo;
    private UUID idTipo;
    private UUID idOleo;
    private final OffsetDateTime agora = OffsetDateTime.now();

    /** No Postgres o número da OS vem de uma sequência da migração; o H2 do teste cria a tabela pelo JPA, sem ela. */
    @BeforeTransaction
    void numerarOs() {
        jdbc.execute("CREATE SEQUENCE IF NOT EXISTS frota_os_numero_teste START WITH 1000");
        jdbc.execute("ALTER TABLE frota_ordens_servico ALTER COLUMN numero SET DEFAULT NEXT VALUE FOR frota_os_numero_teste");
        jdbc.execute("ALTER TABLE event_publication ALTER COLUMN serialized_event SET DATA TYPE CLOB");
    }

    @BeforeEach
    void setUp() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                UUID.randomUUID().toString(), null, List.of(new SimpleGrantedAuthority("frota:os:write"))));
        entityManager.createNativeQuery("""
                INSERT INTO frota_parametros (id, faixas_alerta_dias, limite_km_dia, limite_horas_dia, janela_repeticao_dias, limite_salto_km, versao, data_criacao, ativo)
                VALUES ('00000000-0000-0000-0000-00000000f001', '30,15,7,0', 1500, 16, 90, 2000, 0, CURRENT_TIMESTAMP, TRUE)
                """).executeUpdate();
        var centro = centroRepository.save(new CentroFaturamento("REGIONAL PREVENTIVA"));
        var base = baseRepository.save(new BaseOperacional("BASE PREVENTIVA", "BA", "Rua P, 3", centro));
        idTipo = tipos.criar(new TipoVeiculoRequest("PICAPE PREVENTIVA", null, null)).id();
        idOleo = itens.criar(new ItemManutencaoRequest("TROCA DE ÓLEO PREVENTIVA", NaturezaServico.SUSPENSAO_FREIOS, null, null)).id();
        idVeiculo = veiculos.criar(new VeiculoFrotaRequest("PRV1A23", "HILUX", "TOYOTA", base.getId(), idTipo, 2024, 2025,
                null, null, null, Combustivel.DIESEL_S10, new BigDecimal("80"), new BigDecimal("9"),
                SituacaoOperacional.ATIVO, RegimeVeiculo.PROPRIO, null, null, null, null, null, null, null, null)).idVeiculo();
        odometro.registrarManual(idVeiculo, new RegistrarLeituraRequest(40_000L, agora.minusDays(30), null));
        entityManager.flush();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private PlanoPreventivoRequest revisao() {
        return new PlanoPreventivoRequest("Revisão 10 mil km", "Óleo e filtros", Set.of(idTipo), Set.of(),
                10_000L, null, 180, 1_000L, null, 15, Criticidade.BAIXA, false, List.of(idOleo),
                List.of("Trocar o óleo do motor", "Conferir o nível do arrefecimento"));
    }

    private AcompanhamentoPreventivaFilter filtro(String... situacoes) {
        return new AcompanhamentoPreventivaFilter(List.of(situacoes), null, null, idVeiculo, null);
    }

    @Test
    void cicloCompletoDaPreventiva() {
        var plano = planos.criar(revisao());
        assertThat(plano.frequencia()).isEqualTo("a cada 10.000 km ou 180 dias");
        assertThat(plano.veiculos()).as("o veículo do tipo passa a ser acompanhado").isEqualTo(1);

        var inicial = preventiva.acompanhamento(filtro(), PageRequest.of(0, 10));
        assertThat(inicial.contagens().semHistorico()).isEqualTo(1);
        var controle = inicial.pagina().getContent().get(0);
        assertThat(controle.baseOrigem()).isEqualTo(OrigemBasePreventiva.INICIO);
        assertThat(controle.baseMedicao()).isEqualTo(40_000L);

        preventiva.informarRealizacao(controle.id(),
                new InformarRealizacaoPreventivaRequest(LocalDate.now().minusDays(20), 40_000L, "Feita na concessionária"));
        odometro.registrarManual(idVeiculo, new RegistrarLeituraRequest(49_500L, agora.minusDays(1), "Viagem longa"));

        var proxima = preventiva.acompanhamento(filtro(SituacaoPreventiva.PROXIMA.name()), PageRequest.of(0, 10));
        assertThat(proxima.pagina().getContent()).singleElement().satisfies(c -> {
            assertThat(c.baseOrigem()).isEqualTo(OrigemBasePreventiva.INFORMADA);
            assertThat(c.falta()).isEqualTo("faltam 500 km");
            assertThat(c.semHistorico()).isFalse();
        });

        assertThat(preventiva.avisar(LocalDate.now())).isEqualTo(1);
        assertThat(preventiva.avisar(LocalDate.now())).as("uma vez por etapa no ciclo").isZero();
        assertThat(eventos.stream(FrotaPreventivaProximaEvent.class)).singleElement()
                .satisfies(e -> assertThat(e.contexto()).containsEntry("situacao", "próxima").containsEntry("placa", "PRV1A23"));

        var abertas = preventiva.abrirOs(new AbrirOsPreventivaRequest(List.of(controle.id())));
        assertThat(abertas.ordens()).singleElement().satisfies(o -> assertThat(o.planos()).containsExactly("Revisão 10 mil km"));
        var idOs = abertas.ordens().get(0).id();
        var detalhe = ordens.detalhar(idOs);
        assertThat(detalhe.ordem().tipoManutencao()).isEqualTo(TipoManutencao.PREVENTIVA);
        assertThat(detalhe.ordem().descricao()).contains("Preventiva: Revisão 10 mil km.", "1. Trocar o óleo do motor");
        assertThat(detalhe.preventivas()).singleElement().satisfies(p -> assertThat(p.roteiro()).contains("2. Conferir"));
        assertThat(preventiva.acompanhamento(filtro(), PageRequest.of(0, 10)).contagens().comOs()).isEqualTo(1);
        assertThatThrownBy(() -> preventiva.abrirOs(new AbrirOsPreventivaRequest(List.of(controle.id()))))
                .hasMessageContaining("já tem a OS");

        ordens.concluir(idOs, new ConcluirOrdemServicoRequest(agora, OffsetDateTime.now(), "Óleo trocado", null, null,
                50_100L, TipoOficina.EXTERNA, null, "Oficina do teste", null, CausaManutencao.SERVICO_PREVENTIVO));

        var depois = preventiva.doVeiculo(idVeiculo);
        assertThat(depois.controles()).singleElement().satisfies(c -> {
            assertThat(c.situacao()).isEqualTo(SituacaoPreventiva.EM_DIA);
            assertThat(c.baseOrigem()).isEqualTo(OrigemBasePreventiva.ORDEM_SERVICO);
            assertThat(c.baseMedicao()).isEqualTo(50_100L);
            assertThat(c.proximaMedicao()).isEqualTo(60_100L);
            assertThat(c.idOrdemServico()).isNull();
        });
        assertThat(depois.realizacoes()).extracting(r -> r.origemRotulo(), r -> r.situacaoRotulo())
                .containsExactly(org.assertj.core.groups.Tuple.tuple("Ordem de serviço", "Realizada"),
                        org.assertj.core.groups.Tuple.tuple("Informada", "Realizada"));
    }

    @Test
    void planoSoPorDataRecebeRealizacaoSemMedicao() {
        planos.criar(new PlanoPreventivoRequest("Inspeção semestral", null, Set.of(idTipo), Set.of(),
                null, null, 180, null, null, 30, Criticidade.ALTA, false, List.of(idOleo), List.of()));
        var controle = preventiva.acompanhamento(filtro(), PageRequest.of(0, 10)).pagina().getContent().get(0);

        var depois = preventiva.informarRealizacao(controle.id(),
                new InformarRealizacaoPreventivaRequest(LocalDate.now().minusDays(170), null, null));

        assertThat(depois.baseOrigem()).isEqualTo(OrigemBasePreventiva.INFORMADA);
        assertThat(depois.baseMedicao()).isNull();
        assertThat(depois.situacao()).isEqualTo(SituacaoPreventiva.PROXIMA);
    }

    @Test
    void outroPlanoDoVeiculoEntraNaPreventivaQueAindaNaoComecou() {
        planos.criar(revisao());
        var freios = itens.criar(new ItemManutencaoRequest("PASTILHA PREVENTIVA", NaturezaServico.SUSPENSAO_FREIOS, null, null)).id();
        planos.criar(new PlanoPreventivoRequest("Revisão de freios", null, Set.of(idTipo), Set.of(),
                20_000L, null, null, 2_000L, null, null, Criticidade.ALTA, false, List.of(freios), List.of("Medir as pastilhas")));
        var controles = preventiva.acompanhamento(filtro(), PageRequest.of(0, 10)).pagina().getContent();
        var revisaoControle = controles.stream().filter(c -> c.plano().equals("Revisão 10 mil km")).findFirst().orElseThrow();
        var freiosControle = controles.stream().filter(c -> c.plano().equals("Revisão de freios")).findFirst().orElseThrow();

        var primeira = preventiva.abrirOs(new AbrirOsPreventivaRequest(List.of(revisaoControle.id()))).ordens().get(0);
        var segunda = preventiva.abrirOs(new AbrirOsPreventivaRequest(List.of(freiosControle.id()))).ordens().get(0);

        assertThat(segunda.id()).as("mesma ida à oficina").isEqualTo(primeira.id());
        assertThat(segunda.incluida()).isTrue();
        var detalhe = ordens.detalhar(primeira.id());
        assertThat(detalhe.ordem().criticidade()).as("sobe para a do plano mais grave").isEqualTo(Criticidade.ALTA);
        assertThat(detalhe.ordem().descricao()).contains("Revisão 10 mil km, Revisão de freios");
        assertThat(detalhe.preventivas()).hasSize(2);
        assertThat(detalhe.itens()).hasSize(2);
    }

    @Test
    void preventivaQueTrocaOQueQuebrouHaPoucoNaoEhRepeticao() {
        var corretiva = ordens.abrir(new AbrirOrdemServicoRequest(idVeiculo, TipoManutencao.CORRETIVA, OrigemOrdemServico.VERBAL,
                Criticidade.MEDIA, null, "Vazamento de óleo", List.of(idOleo), null, null, null, null, null, null, false)).ordem();
        ordens.concluir(corretiva.id(), new ConcluirOrdemServicoRequest(agora.minusDays(3), agora.minusDays(2), "Retentor trocado",
                null, null, null, TipoOficina.EXTERNA, null, "Oficina do teste", null, CausaManutencao.AVARIA));
        var idOs = preventiva.abrirOs(new AbrirOsPreventivaRequest(List.of(idControle()))).ordens().get(0).id();

        ordens.concluir(idOs, new ConcluirOrdemServicoRequest(agora, OffsetDateTime.now(), "Revisão feita", null, null,
                null, TipoOficina.EXTERNA, null, "Oficina do teste", null, CausaManutencao.SERVICO_PREVENTIVO));

        assertThat(ordens.detalhar(idOs).itens()).allSatisfy(i -> assertThat(i.repeticao()).isNull());
    }

    @Test
    void ordenarPorCriticidadePoeOVeiculoParadoEDepoisOMaisGrave() {
        java.util.function.BiFunction<Criticidade, Boolean, UUID> abrir = (criticidade, parado) -> ordens.abrir(
                new AbrirOrdemServicoRequest(idVeiculo, TipoManutencao.CORRETIVA, OrigemOrdemServico.VERBAL, criticidade, null,
                        "Problema " + criticidade, List.of(idOleo), null, null, null, null, null, null, parado)).ordem().id();
        var media = abrir.apply(Criticidade.MEDIA, false);
        var urgente = abrir.apply(Criticidade.URGENTE, false);
        var altaParado = abrir.apply(Criticidade.ALTA, true);
        var filtro = new OrdemServicoFilter(null, null, null, null, null, null, null, idVeiculo, null, null, null,
                null, null, null, null, null, null, null);

        var lista = ordens.listar(filtro, PageRequest.of(0, 10, org.springframework.data.domain.Sort.by(
                org.springframework.data.domain.Sort.Order.desc("criticidade"))));

        assertThat(lista.getContent()).extracting(o -> o.id()).containsExactly(altaParado, urgente, media);
        assertThat(lista.getPage().getTotalElements()).isEqualTo(3);
    }

    @Test
    void osCanceladaVoltaAEsperarOutra() {
        var controle = idControle();
        var idOs = preventiva.abrirOs(new AbrirOsPreventivaRequest(List.of(controle))).ordens().get(0).id();
        ordens.cancelar(idOs, "Veículo vendido para outra base");
        assertThat(preventiva.acompanhamento(filtro(), PageRequest.of(0, 10)).contagens().comOs()).isZero();
        assertThat(preventiva.abrirOs(new AbrirOsPreventivaRequest(List.of(controle))).ordens()).hasSize(1);
    }

    @Test
    void veiculoQueMudaDeTipoSaiDoAcompanhamento() {
        planos.criar(revisao());
        var outroTipo = tipos.criar(new TipoVeiculoRequest("CAMINHÃO PREVENTIVA", null, null)).id();
        var atual = veiculos.detalhar(idVeiculo);
        veiculos.atualizar(idVeiculo, new VeiculoFrotaRequest("PRV1A23", "HILUX", "TOYOTA", atual.idBaseOperacional(),
                outroTipo, 2024, 2025, null, null, null, Combustivel.DIESEL_S10, new BigDecimal("80"), new BigDecimal("9"),
                SituacaoOperacional.ATIVO, RegimeVeiculo.PROPRIO, null, null, null, null, null, null, null, null));
        assertThat(preventiva.acompanhamento(filtro(), PageRequest.of(0, 10)).contagens().todas()).isZero();
    }

    @Test
    void corretivasPorServicoMostramSeAlgumPlanoJaCobre() {
        planos.criar(revisao());
        var os = ordens.abrir(new AbrirOrdemServicoRequest(idVeiculo, TipoManutencao.CORRETIVA, OrigemOrdemServico.VERBAL,
                Criticidade.MEDIA, null, "Vazamento de óleo", List.of(idOleo), null, null, null, null, null, null, false)).ordem();
        ordens.concluir(os.id(), new ConcluirOrdemServicoRequest(agora, OffsetDateTime.now(), "Retentor trocado", null,
                new BigDecimal("350.00"), null, TipoOficina.EXTERNA, null, "Oficina do teste", null, CausaManutencao.AVARIA));

        assertThat(preventiva.corretivasPorItem(null, null, null, List.of(idTipo))).singleElement().satisfies(l -> {
            assertThat(l.item()).isEqualTo("TROCA DE ÓLEO PREVENTIVA");
            assertThat(l.ordens()).isEqualTo(1);
            assertThat(l.valor()).isEqualByComparingTo("350.00");
            assertThat(l.planos()).containsExactly("Revisão 10 mil km");
        });
    }

    @Test
    void rotinaDiariaAbreAOsDoPlanoAutomaticoESemAvisarOQueJaTemOs() {
        var automatico = revisao();
        planos.criar(new PlanoPreventivoRequest("Revisão automática", null, automatico.idsTiposVeiculo(), Set.of(),
                10_000L, null, null, 1_000L, null, null, Criticidade.MEDIA, true, automatico.idsItem(), List.of("Trocar o óleo")));
        odometro.registrarManual(idVeiculo, new RegistrarLeituraRequest(49_500L, agora.minusDays(1), "Viagem longa"));
        var controle = preventiva.acompanhamento(filtro(), PageRequest.of(0, 10)).pagina().getContent().get(0);
        preventiva.informarRealizacao(controle.id(), new InformarRealizacaoPreventivaRequest(LocalDate.now().minusDays(5), 40_000L, null));

        rotina.processar(LocalDate.now());

        var depois = preventiva.acompanhamento(filtro(), PageRequest.of(0, 10));
        assertThat(depois.contagens().comOs()).isEqualTo(1);
        assertThat(depois.pagina().getContent().get(0).numeroOrdemServico()).isNotNull();
        assertThat(eventos.stream(FrotaPreventivaProximaEvent.class)).as("com a OS aberta não precisa avisar").isEmpty();
        assertThat(preventiva.pendentesDeAberturaAutomatica(LocalDate.now())).isEmpty();
    }

    private UUID idControle() {
        planos.criar(revisao());
        return preventiva.acompanhamento(filtro(), PageRequest.of(0, 10)).pagina().getContent().get(0).id();
    }
}
