package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.FrotaCondutorApi;
import com.nexo.app.modules.frota.FrotaOdometroApi;
import com.nexo.app.modules.frota.application.dto.CondutorRequest;
import com.nexo.app.modules.frota.application.dto.JustificativaRequest;
import com.nexo.app.modules.frota.application.dto.PendenciaChecklistFilter;
import com.nexo.app.modules.frota.domain.SituacaoPendenciaChecklist;
import com.nexo.app.modules.frota.application.dto.LiberacaoCnhRequest;
import com.nexo.app.modules.frota.application.dto.ModeloChecklistRequest;
import com.nexo.app.modules.frota.application.dto.ModeloChecklistResponse;
import com.nexo.app.modules.frota.application.dto.RegistrarChecklistRequest;
import com.nexo.app.modules.frota.application.dto.VeiculoFrotaRequest;
import com.nexo.app.modules.frota.domain.CategoriaCnh;
import com.nexo.app.modules.frota.domain.Combustivel;
import com.nexo.app.modules.frota.domain.RegimeVeiculo;
import com.nexo.app.modules.frota.domain.SituacaoOperacional;
import com.nexo.app.modules.frota.domain.TipoModeloChecklist;
import com.nexo.app.modules.frota.domain.TipoRespostaChecklist;
import com.nexo.app.modules.frota.infrastructure.persistence.PendenciaChecklistRepository;
import com.nexo.app.modules.rh.domain.BaseOperacional;
import com.nexo.app.modules.rh.domain.CentroFaturamento;
import com.nexo.app.modules.rh.domain.Colaborador;
import com.nexo.app.modules.rh.domain.Funcao;
import com.nexo.app.modules.rh.domain.ProcessoNegocio;
import com.nexo.app.modules.rh.infrastructure.persistence.BaseOperacionalRepository;
import com.nexo.app.modules.rh.infrastructure.persistence.CentroFaturamentoRepository;
import com.nexo.app.modules.rh.infrastructure.persistence.ColaboradorRepository;
import com.nexo.app.modules.rh.infrastructure.persistence.FuncaoRepository;
import com.nexo.app.modules.rh.infrastructure.persistence.ProcessoNegocioRepository;
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
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

/** Caminho real do checklist pelo app: livro-razão, vínculo de condutor, pendências, reenvio e fotos. */
@SpringBootTest
@Transactional
class ChecklistAppUseCasesTest {

    @Autowired
    private ChecklistAppUseCases useCases;
    @Autowired
    private ModeloChecklistUseCases modelos;
    @Autowired
    private VeiculoFrotaUseCases veiculos;
    @Autowired
    private CondutorUseCases condutores;
    @Autowired
    private FrotaCondutorApi condutorApi;
    @Autowired
    private FrotaOdometroApi odometro;
    @Autowired
    private PendenciaChecklistRepository pendencias;
    @Autowired
    private LiberacaoCnhUseCases liberacoes;
    @Autowired
    private PendenciaChecklistUseCases pendenciaUseCases;
    @Autowired
    private ChecklistConsultaUseCases consultas;
    @Autowired
    private VinculoCondutorUseCases vinculoUseCases;
    @Autowired
    private BaseOperacionalRepository baseRepository;
    @Autowired
    private CentroFaturamentoRepository centroRepository;
    @Autowired
    private ColaboradorRepository colaboradorRepository;
    @Autowired
    private ProcessoNegocioRepository processoRepository;
    @Autowired
    private FuncaoRepository funcaoRepository;
    @Autowired
    private EntityManager entityManager;
    @MockitoBean
    private ObjectStorageService objectStorage;

    private BaseOperacional base;
    private UUID idVeiculo;
    private ModeloChecklistResponse modelo;

    @BeforeEach
    void setUp() {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(UUID.randomUUID().toString(), null, List.of()));
        // No H2 a tabela de eventos nasce do ddl-auto com 255 caracteres; em produção é TEXT (V7).
        entityManager.createNativeQuery("ALTER TABLE event_publication ALTER COLUMN serialized_event SET DATA TYPE CLOB").executeUpdate();
        entityManager.createNativeQuery("""
                INSERT INTO frota_parametros (id, faixas_alerta_dias, limite_km_dia, limite_horas_dia, janela_repeticao_dias, limite_salto_km, versao, data_criacao, ativo)
                VALUES ('00000000-0000-0000-0000-00000000f001', '30,15,7,0', 1500, 16, 90, 2000, 0, CURRENT_TIMESTAMP, TRUE)
                """).executeUpdate();
        var centro = centroRepository.save(new CentroFaturamento("REGIONAL TESTE"));
        base = baseRepository.save(new BaseOperacional("BASE CHECKLIST", "BA", "Rua A, 1", centro));
        idVeiculo = veiculos.criar(new VeiculoFrotaRequest("CHK1A23", "STRADA", "FIAT", base.getId(), null, 2024, 2025,
                null, null, null, Combustivel.FLEX, new BigDecimal("55"), new BigDecimal("10"),
                SituacaoOperacional.ATIVO, RegimeVeiculo.PROPRIO, null, null, null, null, null, null, null)).idVeiculo();
        modelo = modelos.criar(new ModeloChecklistRequest("Geral teste", TipoModeloChecklist.PRINCIPAL, null, false, Set.of(), Set.of(),
                List.of(new ModeloChecklistRequest.Pergunta(null, null, "Faróis", TipoRespostaChecklist.OK_NOK, true, null, null,
                        List.of(new ModeloChecklistRequest.Alternativa(null, "Queimado", false)))),
                List.of(new ModeloChecklistRequest.FotoRecebimento(null, "Frente"))));
        entityManager.flush();
        // Modelo criado antes dos checklists do teste: o que surge depois do preenchimento não é exigido.
        for (var tabela : List.of("frota_checklist_perguntas", "frota_checklist_modelo_fotos_recebimento")) {
            entityManager.createNativeQuery("UPDATE " + tabela + " SET data_criacao = data_criacao - INTERVAL '1' DAY").executeUpdate();
        }
        entityManager.clear();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private UUID colaboradorComCnh(String nome, String cpf, String cnh) {
        var processo = processoRepository.save(new ProcessoNegocio("PROCESSO " + nome));
        var funcao = funcaoRepository.save(new Funcao("MOTORISTA " + nome, null));
        var colaborador = colaboradorRepository.save(new Colaborador(nome, "TESTE", nome + " TESTE", cpf,
                processo, base, funcao, LocalDate.of(2020, 1, 1)));
        condutores.registrarCnh(colaborador.getId(),
                new CondutorRequest(cnh, CategoriaCnh.D, LocalDate.now().plusYears(2), null, null));
        return colaborador.getId();
    }

    private RegistrarChecklistRequest checklist(UUID idAparelho, UUID condutor, OffsetDateTime quando, long km,
                                                boolean farolOk, UUID idFotoFarol, UUID idFotoFrente) {
        var farois = modelo.perguntas().getFirst();
        return new RegistrarChecklistRequest(idAparelho, idVeiculo, modelo.id(), null, null, condutor, quando, km, null, null,
                List.of(new RegistrarChecklistRequest.Resposta(farois.id(), farolOk,
                        farolOk ? null : farois.motivos().getFirst().id(), null, "Lado esquerdo",
                        idFotoFarol == null ? null : List.of(idFotoFarol))),
                idFotoFrente == null ? null
                        : List.of(new RegistrarChecklistRequest.FotoRecebimento(modelo.fotosRecebimento().getFirst().id(), idFotoFrente)));
    }

    @Test
    void primeiroChecklistVinculaOCondutorGravaAMedicaoEAbrePendencia() {
        UUID ana = colaboradorComCnh("ANA", "52998224725", "12345678901");
        var idAparelho = UUID.randomUUID();
        var fotoFarol = UUID.randomUUID();
        var fotoFrente = UUID.randomUUID();
        var quando = OffsetDateTime.now().minusMinutes(30);

        var gravado = useCases.registrar(checklist(idAparelho, ana, quando, 15_000, false, fotoFarol, fotoFrente));
        entityManager.flush();

        assertThat(gravado.passagemVeiculo()).as("não havia condutor antes").isTrue();
        assertThat(gravado.pendencias()).isEqualTo(1);
        assertThat(gravado.fotosPendentes()).containsExactlyInAnyOrder(fotoFarol, fotoFrente);
        assertThat(condutorApi.condutorEm(idVeiculo, OffsetDateTime.now())).contains(ana);
        assertThat(odometro.kmAtual(idVeiculo)).contains(15_000L);
        assertThat(pendencias.findAllByIdChecklist(gravado.id())).singleElement()
                .satisfies(p -> assertThat(p.getResposta().resumo()).isEqualTo("Faróis — Queimado"));

        var reenvio = useCases.registrar(checklist(idAparelho, ana, quando, 15_000, false, fotoFarol, fotoFrente));
        assertThat(reenvio.id()).isEqualTo(gravado.id());
        assertThat(pendencias.findAllByIdChecklist(gravado.id())).hasSize(1);

        var arquivo = new MockMultipartFile("arquivo", "farol.jpg", "image/jpeg", new byte[]{1, 2, 3});
        var depoisDaFoto = useCases.enviarFoto(idAparelho, fotoFarol, arquivo);
        useCases.enviarFoto(idAparelho, fotoFarol, arquivo);
        assertThat(depoisDaFoto.fotosPendentes()).containsExactly(fotoFrente);
        verify(objectStorage, times(1)).enviar(startsWith("frota/checklists/" + gravado.id()), any(), anyLong(), eq("image/jpeg"));
    }

    @Test
    void mesmoCondutorNaoPedeFotosDeRecebimentoEOutroCondutorPede() {
        UUID ana = colaboradorComCnh("ANA", "52998224725", "12345678901");
        UUID beto = colaboradorComCnh("BETO", "11144477735", "10987654321");
        useCases.registrar(checklist(UUID.randomUUID(), ana, OffsetDateTime.now().minusHours(3), 15_000, true, null, UUID.randomUUID()));
        entityManager.flush();

        var mesmo = useCases.registrar(checklist(UUID.randomUUID(), ana, OffsetDateTime.now().minusHours(2), 15_040, true, null, null));
        assertThat(mesmo.passagemVeiculo()).isFalse();

        assertThatThrownBy(() -> useCases.registrar(
                checklist(UUID.randomUUID(), beto, OffsetDateTime.now().minusHours(1), 15_080, true, null, null)))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("Frente");

        var troca = useCases.registrar(checklist(UUID.randomUUID(), beto, OffsetDateTime.now().minusHours(1), 15_080, true, null, UUID.randomUUID()));
        entityManager.flush();
        assertThat(troca.passagemVeiculo()).isTrue();
        assertThat(condutorApi.condutorEm(idVeiculo, OffsetDateTime.now())).contains(beto);
    }

    @Test
    void cnhVencidaSoAvisaNoChecklistEVinculaOCondutor() {
        UUID caio = colaboradorComCnh("CAIO", "39053344705", "11122233344");
        condutores.registrarCnh(caio, new CondutorRequest("11122233344", CategoriaCnh.D, LocalDate.now().minusDays(3), null, null));
        var quando = OffsetDateTime.now().minusMinutes(10);

        var aceito = useCases.registrar(checklist(UUID.randomUUID(), caio, quando, 15_000, true, null, UUID.randomUUID()));
        entityManager.flush();

        assertThat(aceito.passagemVeiculo()).isTrue();
        assertThat(condutorApi.condutorEm(idVeiculo, OffsetDateTime.now())).as("o checklist vincula mesmo com a CNH vencida").contains(caio);
        assertThat(consultas.listar(null, PageRequest.of(0, 10)).getContent()).singleElement()
                .satisfies(c -> assertThat(c.avisoCnh()).contains("vencida desde"));
    }

    @Test
    void recebimentoSemCondutorSoParaQuemTemAPermissao() {
        var request = new RegistrarChecklistRequest(UUID.randomUUID(), idVeiculo, modelo.id(), null,
                com.nexo.app.modules.frota.domain.FinalidadeChecklist.RECEBIMENTO, null, OffsetDateTime.now().minusMinutes(5),
                15_000L, null, null, List.of(new RegistrarChecklistRequest.Resposta(modelo.perguntas().getFirst().id(), true,
                null, null, null, null)), null);
        assertThatThrownBy(() -> useCases.registrar(request)).hasMessageContaining("equipe administrativa");

        var atual = SecurityContextHolder.getContext().getAuthentication();
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(atual.getPrincipal(), null,
                List.of(new org.springframework.security.core.authority.SimpleGrantedAuthority("frota:checklist:registrar"))));
        var registrado = useCases.registrar(request);
        entityManager.flush();

        assertThat(registrado.passagemVeiculo()).isFalse();
        assertThat(condutorApi.condutorEm(idVeiculo, OffsetDateTime.now())).as("recebimento não vincula ninguém").isEmpty();
        assertThat(consultas.listar(null, PageRequest.of(0, 10)).getContent()).singleElement()
                .satisfies(c -> assertThat(c.finalidadeRotulo()).isEqualTo("Recebimento do veículo"));
    }

    @Test
    void filaMostraOProblemaEDescarteTiraDaFila() {
        UUID ana = colaboradorComCnh("ANA", "52998224725", "12345678901");
        useCases.registrar(checklist(UUID.randomUUID(), ana, OffsetDateTime.now().minusHours(2), 15_000, false,
                UUID.randomUUID(), UUID.randomUUID()));
        entityManager.flush();

        var fila = pendenciaUseCases.listar(null, PageRequest.of(0, 10)).getContent();
        assertThat(fila).singleElement().satisfies(p -> {
            assertThat(p.resumo()).isEqualTo("Faróis — Queimado");
            assertThat(p.comentario()).isEqualTo("Lado esquerdo");
            assertThat(p.placa()).isEqualTo("CHK1A23");
            assertThat(p.baseNome()).isEqualTo("BASE CHECKLIST");
            assertThat(p.condutorNome()).isEqualTo("ANA TESTE");
            assertThat(p.fotos()).hasSize(1);
            assertThat(p.fotosAChegar()).isEqualTo(1);
        });

        var descartada = pendenciaUseCases.descartar(fila.getFirst().id(), new JustificativaRequest("Marcado por engano"));
        entityManager.flush();

        assertThat(descartada.situacao()).isEqualTo(SituacaoPendenciaChecklist.DESCARTADA);
        assertThat(pendenciaUseCases.listar(null, PageRequest.of(0, 10)).getContent()).isEmpty();
        assertThat(pendenciaUseCases.listar(new PendenciaChecklistFilter(SituacaoPendenciaChecklist.DESCARTADA, null, null),
                PageRequest.of(0, 10)).getContent()).singleElement()
                .satisfies(p -> assertThat(p.justificativa()).isEqualTo("Marcado por engano"));
    }

    @Test
    void veiculoUsadoSemChecklistApareceAteOChecklistEVoltaNaTrocaDeCondutor() {
        UUID ana = colaboradorComCnh("ANA", "52998224725", "12345678901");
        UUID beto = colaboradorComCnh("BETO", "11144477735", "10987654321");
        var hoje = LocalDate.now(LiberacaoCnhUseCases.FUSO);
        var inicioDoDia = hoje.atStartOfDay(LiberacaoCnhUseCases.FUSO).toOffsetDateTime();
        odometro.registrarLeitura(idVeiculo, 14_900, inicioDoDia.plusMinutes(1), FrotaOdometroApi.OrigemLeitura.MANUTENCAO,
                UUID.randomUUID(), null);
        entityManager.flush();

        assertThat(consultas.semChecklist(hoje, null)).singleElement()
                .satisfies(v -> assertThat(v.motivo()).isEqualTo("Usado hoje sem checklist"));

        var gravado = useCases.registrar(checklist(UUID.randomUUID(), ana, inicioDoDia.plusMinutes(2), 15_000, false,
                UUID.randomUUID(), UUID.randomUUID()));
        entityManager.flush();
        assertThat(consultas.semChecklist(hoje, null)).isEmpty();

        vinculoUseCases.vincular(idVeiculo, new com.nexo.app.modules.frota.application.dto.VincularCondutorRequest(
                beto, inicioDoDia.plusMinutes(3), null));
        entityManager.flush();
        assertThat(consultas.semChecklist(hoje, List.of(base.getId()))).singleElement()
                .satisfies(v -> {
                    assertThat(v.motivo()).startsWith("Condutor trocado às ").endsWith(" sem checklist");
                    assertThat(v.condutorAtualNome()).isEqualTo("BETO TESTE");
                });
        assertThat(consultas.semChecklist(hoje, List.of(UUID.randomUUID()))).as("filtro de base").isEmpty();

        var detalhe = consultas.detalhar(gravado.id());
        assertThat(detalhe.resumo().condutorNome()).isEqualTo("ANA TESTE");
        assertThat(detalhe.respostas()).singleElement().satisfies(r -> {
            assertThat(r.resposta()).isEqualTo("Não OK — Queimado");
            assertThat(r.fotos()).hasSize(1);
            assertThat(r.situacaoPendencia()).isEqualTo(SituacaoPendenciaChecklist.ABERTA);
            assertThat(r.historico().checklistsSeguidos()).isEqualTo(1);
            assertThat(r.historico().vezes30Dias()).isEqualTo(1);
            assertThat(r.historico().ultimoOkEm()).isNull();
        });
        assertThat(detalhe.fotosRecebimento()).extracting(f -> f.descricao()).containsExactly("Frente");
        assertThat(consultas.listar(new com.nexo.app.modules.frota.application.dto.ChecklistFilter(null, null, null,
                hoje, hoje, true), PageRequest.of(0, 10)).getContent()).singleElement()
                .satisfies(c -> assertThat(c.problemas()).isEqualTo(1));
        assertThat(consultas.listar(new com.nexo.app.modules.frota.application.dto.ChecklistFilter(null, null, null,
                null, null, false), PageRequest.of(0, 10)).getContent()).isEmpty();
    }

    @Test
    void mesmoItemComPendenciaEmAbertoNaoDuplicaAFila() {
        UUID ana = colaboradorComCnh("ANA", "52998224725", "12345678901");
        useCases.registrar(checklist(UUID.randomUUID(), ana, OffsetDateTime.now().minusHours(3), 15_000, false, UUID.randomUUID(), UUID.randomUUID()));
        useCases.registrar(checklist(UUID.randomUUID(), ana, OffsetDateTime.now().minusHours(2), 15_010, false, UUID.randomUUID(), null));
        entityManager.flush();

        var fila = pendenciaUseCases.listar(null, PageRequest.of(0, 10)).getContent();
        assertThat(fila).as("o segundo Não OK conta no histórico, não vira outra pendência").singleElement()
                .satisfies(p -> assertThat(p.historico().checklistsSeguidos()).isEqualTo(2));
    }

    @Test
    void catalogoTrazOVeiculoComOModeloEOCondutor() {
        UUID ana = colaboradorComCnh("ANA", "52998224725", "12345678901");
        useCases.registrar(checklist(UUID.randomUUID(), ana, OffsetDateTime.now().minusHours(1), 15_000, true, null, UUID.randomUUID()));
        entityManager.flush();

        var catalogo = useCases.catalogo();

        assertThat(catalogo.modelos()).extracting(m -> m.nome()).contains("Geral teste");
        assertThat(catalogo.veiculos()).filteredOn(v -> v.idVeiculo().equals(idVeiculo)).singleElement().satisfies(v -> {
            assertThat(v.placa()).isEqualTo("CHK1A23");
            assertThat(v.descricao()).isEqualTo("FIAT STRADA");
            assertThat(v.idsModelosPrincipais()).contains(modelo.id());
            assertThat(v.medicaoAtual()).isEqualTo(15_000L);
            assertThat(v.idCondutorAtual()).isEqualTo(ana);
        });
    }

    @Test
    void appConsultaOsMeusEmQualquerAparelhoEOHistoricoDoVeiculo() {
        UUID ana = colaboradorComCnh("ANA", "52998224725", "12345678901");
        var primeiro = UUID.randomUUID();
        useCases.registrar(checklist(primeiro, ana, OffsetDateTime.now().minusHours(3), 15_000, true, null, UUID.randomUUID()));
        entityManager.flush();

        var outraPessoa = UUID.randomUUID();
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(outraPessoa.toString(), null, List.of()));
        var segundo = UUID.randomUUID();
        useCases.registrar(checklist(segundo, ana, OffsetDateTime.now().minusHours(1), 15_040, false, UUID.randomUUID(), null));
        entityManager.flush();

        assertThat(consultas.meusNoApp(30)).singleElement()
                .satisfies(i -> assertThat(i.idAparelho()).isEqualTo(segundo));
        var historico = consultas.doVeiculoNoApp(idVeiculo);
        assertThat(historico).extracting(i -> i.idAparelho()).containsExactly(segundo, primeiro);
        assertThat(historico.getFirst().checklist().problemas()).isEqualTo(1);
        assertThat(consultas.detalhar(historico.getFirst().checklist().id()).respostas()).singleElement()
                .satisfies(r -> assertThat(r.situacaoPendencia()).isEqualTo(SituacaoPendenciaChecklist.ABERTA));
    }
}
