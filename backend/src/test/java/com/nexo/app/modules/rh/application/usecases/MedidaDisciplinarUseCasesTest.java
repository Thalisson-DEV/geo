package com.nexo.app.modules.rh.application.usecases;

import com.nexo.app.modules.rh.application.dto.CancelarMedidaDisciplinarRequest;
import com.nexo.app.modules.rh.application.dto.MedidaDisciplinarFilter;
import com.nexo.app.modules.rh.application.dto.MedidaDisciplinarRequest;
import com.nexo.app.modules.rh.application.dto.MedidaDisciplinarResponse;
import com.nexo.app.modules.rh.application.dto.MotivoMedidaDisciplinarRequest;
import com.nexo.app.modules.rh.application.dto.MotivoMedidaDisciplinarResponse;
import com.nexo.app.modules.rh.application.dto.OrigemMedidaDisciplinarRequest;
import com.nexo.app.modules.rh.application.dto.TipoMedidaDisciplinarRequest;
import com.nexo.app.modules.rh.application.dto.TipoMedidaDisciplinarResponse;
import com.nexo.app.modules.rh.domain.BaseOperacional;
import com.nexo.app.modules.rh.domain.CentroFaturamento;
import com.nexo.app.modules.rh.domain.Colaborador;
import com.nexo.app.modules.rh.domain.Funcao;
import com.nexo.app.modules.rh.domain.OrigemMedidaDisciplinar;
import com.nexo.app.modules.rh.domain.ProcessoNegocio;
import com.nexo.app.modules.rh.domain.SituacaoMedidaDisciplinar;
import com.nexo.app.modules.rh.domain.TipoEventoMedidaDisciplinar;
import com.nexo.app.modules.rh.infrastructure.persistence.BaseOperacionalRepository;
import com.nexo.app.modules.rh.infrastructure.persistence.CentroFaturamentoRepository;
import com.nexo.app.modules.rh.infrastructure.persistence.ColaboradorRepository;
import com.nexo.app.modules.rh.infrastructure.persistence.FuncaoRepository;
import com.nexo.app.modules.rh.infrastructure.persistence.ProcessoNegocioRepository;
import com.nexo.app.shared.domain.events.MedidaDisciplinarCriadaEvent;
import com.nexo.app.shared.domain.events.RhMedidaDisciplinarAplicadaEvent;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.infrastructure.storage.ObjectStorageService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Medidas disciplinares: cenários da spec, reincidência, origem da frota, correção e anexos. */
@SpringBootTest
@Transactional
@RecordApplicationEvents
class MedidaDisciplinarUseCasesTest {

    @Autowired
    private MedidaDisciplinarUseCases medidas;
    @Autowired
    private AnexoMedidaDisciplinarUseCases anexos;
    @Autowired
    private TipoMedidaDisciplinarUseCases tipos;
    @Autowired
    private MotivoMedidaDisciplinarUseCases motivos;
    @Autowired
    private ColaboradorRepository colaboradorRepository;
    @Autowired
    private BaseOperacionalRepository baseRepository;
    @Autowired
    private CentroFaturamentoRepository centroRepository;
    @Autowired
    private ProcessoNegocioRepository processoRepository;
    @Autowired
    private FuncaoRepository funcaoRepository;
    @Autowired
    private EntityManager entityManager;
    @Autowired
    private ApplicationEvents eventos;
    @MockitoBean
    private ObjectStorageService objectStorage;

    private Colaborador colaborador;
    private TipoMedidaDisciplinarResponse verbal;
    private TipoMedidaDisciplinarResponse escrita;
    private TipoMedidaDisciplinarResponse suspensao;
    private MotivoMedidaDisciplinarResponse transito;
    private MotivoMedidaDisciplinarResponse conduta;

    @BeforeEach
    void setUp() {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(UUID.randomUUID().toString(), null, List.of()));
        // Os eventos notificáveis passam dos 255 caracteres do esquema gerado no H2.
        entityManager.createNativeQuery("ALTER TABLE event_publication ALTER COLUMN serialized_event SET DATA TYPE CLOB").executeUpdate();
        entityManager.createNativeQuery("""
                INSERT INTO rh_parametros (id, janela_reincidencia_meses, dias_imediatidade, versao, data_criacao, ativo)
                VALUES ('00000000-0000-0000-0000-000000000a01', 12, 30, 0, CURRENT_TIMESTAMP, TRUE)
                """).executeUpdate();
        var centro = centroRepository.save(new CentroFaturamento("REGIONAL MEDIDAS"));
        var base = baseRepository.save(new BaseOperacional("BASE MEDIDAS", "BA", "Rua B, 2", centro));
        var processo = processoRepository.save(new ProcessoNegocio("PROCESSO MEDIDAS"));
        var funcao = funcaoRepository.save(new Funcao("ELETRICISTA MEDIDAS", null));
        colaborador = colaboradorRepository.save(new Colaborador("CARLOS", "SOUZA", "CARLOS SOUZA", "52998224725",
                processo, base, funcao, LocalDate.of(2020, 1, 1)));
        tipos.criar(new TipoMedidaDisciplinarRequest("Orientação T", 1, false));
        verbal = tipos.criar(new TipoMedidaDisciplinarRequest("Advertência verbal T", 2, false));
        escrita = tipos.criar(new TipoMedidaDisciplinarRequest("Advertência escrita T", 3, false));
        suspensao = tipos.criar(new TipoMedidaDisciplinarRequest("Suspensão T", 4, true));
        transito = motivos.criar(new MotivoMedidaDisciplinarRequest("Trânsito T"));
        conduta = motivos.criar(new MotivoMedidaDisciplinarRequest("Conduta T"));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private MedidaDisciplinarRequest pedido(TipoMedidaDisciplinarResponse tipo, MotivoMedidaDisciplinarResponse motivo, LocalDate fato,
                                            Integer dias, LocalDate inicio, OrigemMedidaDisciplinarRequest origem) {
        return new MedidaDisciplinarRequest(colaborador.getId(), tipo.id(), motivo.id(), fato, fato,
                "Excesso de velocidade registrado pelo rastreador.", dias, inicio, origem);
    }

    private MedidaDisciplinarResponse aplicada(TipoMedidaDisciplinarResponse tipo, MotivoMedidaDisciplinarResponse motivo, LocalDate fato) {
        return medidas.registrar(pedido(tipo, motivo, fato, null, null, null));
    }

    @Test
    void suspensaoSemPeriodoERecusada() {
        assertThatThrownBy(() -> medidas.registrar(pedido(suspensao, transito, LocalDate.now().minusDays(2), null, null, null)))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("os dias e o início");
    }

    @Test
    void lancaJaAplicadaComBaseDoColaboradorEDescricaoCifrada() {
        var medida = medidas.registrar(pedido(escrita, transito, LocalDate.now().minusDays(2), null, null, null));

        assertThat(medida.situacao()).isEqualTo(SituacaoMedidaDisciplinar.APLICADA);
        assertThat(medida.dataAplicacao()).isEqualTo(LocalDate.now().minusDays(2));
        assertThat(medida.idBaseOperacional()).isEqualTo(colaborador.getBaseOperacional().getId());
        assertThat(medida.colaboradorNome()).isEqualTo("CARLOS SOUZA");
        assertThat(medida.historico()).extracting(MedidaDisciplinarResponse.Evento::tipo).containsExactly(TipoEventoMedidaDisciplinar.REGISTRADA);
        entityManager.flush();
        Object bruto = entityManager.createNativeQuery("SELECT descricao FROM rh_medidas_disciplinares WHERE id = :id")
                .setParameter("id", medida.id()).getSingleResult();
        assertThat(bruto.toString()).doesNotContain("velocidade");
    }

    @Test
    void segundaMultaEmSeisMesesSugereAdvertenciaEscrita() {
        aplicada(verbal, transito, LocalDate.now().minusMonths(6));
        aplicada(escrita, conduta, LocalDate.now().minusMonths(2));
        var nova = medidas.registrar(pedido(verbal, transito, LocalDate.now().minusDays(1), null, null, null));

        var reincidencia = medidas.reincidencia(colaborador.getId(), transito.id(), nova.dataFato(), nova.id());

        assertThat(reincidencia.anteriores()).hasSize(1);
        assertThat(reincidencia.anteriores().get(0).tipoNome()).isEqualTo("Advertência verbal T");
        assertThat(reincidencia.gravidadeUltima()).isEqualTo(2);
        assertThat(reincidencia.idTipoSugerido()).isEqualTo(escrita.id());
    }

    @Test
    void foraDaJanelaNaoContaComoReincidencia() {
        aplicada(verbal, transito, LocalDate.now().minusMonths(13));

        var reincidencia = medidas.reincidencia(colaborador.getId(), transito.id(), LocalDate.now(), null);

        assertThat(reincidencia.anteriores()).isEmpty();
        assertThat(reincidencia.idTipoSugerido()).isNull();
    }

    @Test
    void canceladaFicaNoHistoricoEDeixaDeContar() {
        var medida = aplicada(verbal, transito, LocalDate.now().minusMonths(1));

        var cancelada = medidas.cancelar(medida.id(), new CancelarMedidaDisciplinarRequest("Multa anulada."));

        assertThat(cancelada.situacao()).isEqualTo(SituacaoMedidaDisciplinar.CANCELADA);
        assertThat(medidas.listar(new MedidaDisciplinarFilter(null, colaborador.getId(), null, null, null, null, null, null, null),
                PageRequest.of(0, 10)).getContent()).hasSize(1);
        assertThat(medidas.reincidencia(colaborador.getId(), transito.id(), LocalDate.now(), null).anteriores()).isEmpty();
    }

    @Test
    void corrigeAMedidaLancada() {
        var medida = aplicada(escrita, transito, LocalDate.now().minusDays(3));

        var corrigida = medidas.editar(medida.id(), pedido(verbal, conduta, LocalDate.now().minusDays(4), null, null, null));

        assertThat(corrigida.tipoNome()).isEqualTo("Advertência verbal T");
        assertThat(corrigida.motivoNome()).isEqualTo("Conduta T");
        assertThat(corrigida.situacao()).isEqualTo(SituacaoMedidaDisciplinar.APLICADA);
        assertThat(corrigida.historico()).extracting(MedidaDisciplinarResponse.Evento::tipo)
                .containsExactly(TipoEventoMedidaDisciplinar.REGISTRADA, TipoEventoMedidaDisciplinar.EDITADA);
    }

    @Test
    void lancarPublicaOAvisoDeMedidaAplicada() {
        var medida = aplicada(escrita, transito, LocalDate.now().minusDays(3));

        assertThat(eventos.stream(RhMedidaDisciplinarAplicadaEvent.class))
                .singleElement()
                .satisfies(e -> {
                    assertThat(e.idMedida()).isEqualTo(medida.id());
                    assertThat(e.colaborador()).isEqualTo("CARLOS SOUZA");
                    assertThat(e.link()).contains(medida.id().toString());
                });
    }

    @Test
    void medidaVindaDaMultaPublicaAOrigemEMostraASituacao() {
        UUID multa = UUID.randomUUID();
        var medida = medidas.registrar(pedido(escrita, transito, LocalDate.now().minusDays(3), null, null,
                new OrigemMedidaDisciplinarRequest("FROTA_MULTA", multa)));

        assertThat(medida.origem()).isEqualTo(OrigemMedidaDisciplinar.FROTA_MULTA);
        assertThat(eventos.stream(MedidaDisciplinarCriadaEvent.class))
                .singleElement()
                .satisfies(e -> {
                    assertThat(e.idMedida()).isEqualTo(medida.id());
                    assertThat(e.origemTipo()).isEqualTo("FROTA_MULTA");
                    assertThat(e.origemId()).isEqualTo(multa);
                });
        assertThat(medidas.resumos(List.of(medida.id(), UUID.randomUUID())))
                .hasSize(1)
                .extractingByKey(medida.id())
                .satisfies(r -> assertThat(r.situacao()).isEqualTo("APLICADA"));
        assertThatThrownBy(() -> medidas.registrar(pedido(escrita, transito, LocalDate.now(), null, null,
                new OrigemMedidaDisciplinarRequest("OUTRA", multa)))).hasMessageContaining("não reconhecida");
    }

    @Test
    void semOrigemNaoPublicaEventoDeCriacao() {
        medidas.registrar(pedido(escrita, transito, LocalDate.now().minusDays(3), null, null, null));

        assertThat(eventos.stream(MedidaDisciplinarCriadaEvent.class)).isEmpty();
    }

    @Test
    void filtraPorBaseMotivoESituacao() {
        aplicada(verbal, transito, LocalDate.now().minusDays(5));
        var outra = aplicada(escrita, conduta, LocalDate.now().minusDays(1));
        medidas.cancelar(outra.id(), new CancelarMedidaDisciplinarRequest("Lançada em duplicidade."));
        UUID base = colaborador.getBaseOperacional().getId();

        var aplicadas = medidas.listar(new MedidaDisciplinarFilter(null, null, List.of(base), null, null,
                List.of(SituacaoMedidaDisciplinar.APLICADA), null, null, null), PageRequest.of(0, 10));
        var porNome = medidas.listar(new MedidaDisciplinarFilter("carlos", null, null, null, List.of(conduta.id()), null, null, null, null),
                PageRequest.of(0, 10));
        var outraBase = medidas.listar(new MedidaDisciplinarFilter(null, null, List.of(UUID.randomUUID()), null, null, null, null, null, null),
                PageRequest.of(0, 10));

        assertThat(aplicadas.getContent()).singleElement().satisfies(m -> assertThat(m.motivoNome()).isEqualTo("Trânsito T"));
        assertThat(porNome.getContent()).singleElement().satisfies(m -> assertThat(m.descricao()).isNull());
        assertThat(outraBase.getContent()).isEmpty();
    }

    @Test
    void anexoOpcionalGuardaOSha256() {
        var medida = aplicada(escrita, transito, LocalDate.now().minusDays(3));
        assertThat(medida.quantidadeAnexos()).isZero();
        byte[] conteudo = "documento assinado".getBytes(StandardCharsets.UTF_8);

        var comAnexo = anexos.anexar(medida.id(), new MockMultipartFile("arquivo", "advertencia.pdf", "application/pdf", conteudo));

        assertThat(comAnexo.quantidadeAnexos()).isEqualTo(1);
        assertThat(comAnexo.anexos()).singleElement().satisfies(a ->
                assertThat(a.sha256()).isEqualTo(AnexoMedidaDisciplinarUseCases.sha256(conteudo)).hasSize(64));
        var semAnexo = anexos.remover(medida.id(), comAnexo.anexos().get(0).id());
        assertThat(semAnexo.anexos()).isEmpty();
        assertThat(semAnexo.historico()).extracting(MedidaDisciplinarResponse.Evento::tipo)
                .contains(TipoEventoMedidaDisciplinar.ANEXO_INCLUIDO, TipoEventoMedidaDisciplinar.ANEXO_REMOVIDO);
    }
}
