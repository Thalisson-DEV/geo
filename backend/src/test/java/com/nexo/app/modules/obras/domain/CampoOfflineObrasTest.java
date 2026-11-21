package com.nexo.app.modules.obras.domain;

import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Regras do contrato offline de Obras no domínio: ponto inteiro, hora do aparelho, liberação na hora de origem. */
class CampoOfflineObrasTest {

    private static final ZoneId FUSO = ZoneId.of("America/Sao_Paulo");
    private static final UUID OBRA = UUID.randomUUID();
    private static final UUID EQUIPE = UUID.randomUUID();
    private static final UUID TURNO = UUID.randomUUID();
    private static final UUID PONTO = UUID.randomUUID();
    private static final UUID RESPONSAVEL = UUID.randomUUID();
    /** Ontem: "08:10 de hoje" ainda está no futuro quando o teste roda de madrugada. */
    private static final LocalDate HOJE = LocalDate.now(FUSO).minusDays(1);

    private final KitConstrutivo catalogo = new KitConstrutivo(UUID.randomUUID(), "LMI-0168", "POSTE", "POSTE", Set.of());
    private final KitAplicado kit = KitAplicado.noPonto(OBRA, PONTO, catalogo, null, BigDecimal.ONE, List.of(
            new KitAplicado.ModeloItem(TipoItemKit.SERVICO, UUID.randomUUID(), "S1", "Instalar poste", OperacaoItemKit.INSTALAR, "UN", new BigDecimal("2")),
            new KitAplicado.ModeloItem(TipoItemKit.SERVICO, UUID.randomUUID(), "S2", "Instalar cruzeta", OperacaoItemKit.INSTALAR, "UN", new BigDecimal("3")),
            new KitAplicado.ModeloItem(TipoItemKit.MATERIAL, UUID.randomUUID(), "M1", "Poste", OperacaoItemKit.INSTALAR, "UN", BigDecimal.ONE)));
    private final Programacao programacao = programacao(true);

    private Programacao programacao(boolean desligamento) {
        kit.getItens().forEach(i -> ReflectionTestUtils.setField(i, "id", UUID.randomUUID()));
        Programacao nova = new Programacao(1700, OBRA, EQUIPE, HOJE, HOJE.plusDays(1),
                new Programacao.Condicoes("Implantar rede", false, desligamento, false, TurnoProgramacao.DIA_TODO, SituacaoIntervencao.CRIADO, null));
        ReflectionTestUtils.setField(nova, "id", UUID.randomUUID());
        kit.getItensAtivos().forEach(i -> nova.incluirItem(i, i.getTipo() == TipoItemKit.SERVICO ? new BigDecimal("10") : null));
        return nova;
    }

    private ItemPlanejado item(String codigo) {
        return kit.getItensAtivos().stream().filter(i -> i.getCodigo().equals(codigo)).findFirst().orElseThrow();
    }

    @Test
    void tudoFeitoApontaORestanteDeCadaItemDoPontoEConcluiOPonto() {
        programacao.apontar(item("S1").getId(), BigDecimal.ONE, HOJE, TURNO, null);

        List<ApontamentoExecucao> criados = programacao.apontarLocalInteiro(PONTO, HOJE, TURNO);

        assertThat(criados).hasSize(3);
        assertThat(criados).extracting(ApontamentoExecucao::getQuantidade)
                .usingElementComparator(BigDecimal::compareTo)
                .containsExactlyInAnyOrder(BigDecimal.ONE, new BigDecimal("3"), BigDecimal.ONE);
        assertThat(kit.getItensAtivos()).allMatch(ItemPlanejado::concluido);
        assertThat(programacao.situacaoEm(HOJE)).isEqualTo(SituacaoProgramacao.CONCLUIDA);
        assertThat(programacao.apontarLocalInteiro(PONTO, HOJE, TURNO)).isEmpty();
    }

    @Test
    void tudoFeitoEmPontoSemItensNaProgramacaoERecusado() {
        assertThatThrownBy(() -> programacao.apontarLocalInteiro(UUID.randomUUID(), HOJE, TURNO))
                .isInstanceOf(InvarianteVioladaException.class).hasMessageContaining("não tem itens");
    }

    @Test
    void origemDoCampoFicaNoApontamentoUmaVezSo() {
        ApontamentoExecucao apontamento = programacao.apontar(item("S1").getId(), BigDecimal.ONE, HOJE, TURNO, null);
        RegistroCampo campo = new RegistroCampo(UUID.randomUUID(), "abc", RegistroCampo.Origem.AGORA, OffsetDateTime.now());

        apontamento.registrarOrigemCampo(campo, PONTO, true);

        assertThat(apontamento.getCampo().getIdLocal()).isEqualTo(campo.getIdLocal());
        assertThat(apontamento.isPontoInteiro()).isTrue();
        assertThatThrownBy(() -> apontamento.registrarOrigemCampo(campo, PONTO, true)).isInstanceOf(InvarianteVioladaException.class);
    }

    @Test
    void registroGuardaGpsEDetectaRelogioAdiantado() {
        OffsetDateTime servidor = OffsetDateTime.now();
        RegistroCampo certo = new RegistroCampo(UUID.randomUUID(), "h", new RegistroCampo.Origem(servidor.minusHours(3),
                new BigDecimal("-9.4390071"), new BigDecimal("-41.968228"), new BigDecimal("12.34")), servidor);
        RegistroCampo adiantado = new RegistroCampo(UUID.randomUUID(), "h", new RegistroCampo.Origem(servidor.plusHours(2),
                null, null, null), servidor);

        assertThat(certo.getLatitude()).isEqualByComparingTo("-9.439007");
        assertThat(certo.getPrecisao()).isEqualByComparingTo("12.3");
        assertThat(certo.momentoConfiavel()).isEqualTo(servidor.minusHours(3));
        assertThat(adiantado.relogioDivergente()).isTrue();
        assertThat(adiantado.momentoConfiavel()).isEqualTo(servidor);
        assertThat(certo.mesmoConteudo("H")).isTrue();
        assertThatThrownBy(() -> new RegistroCampo(UUID.randomUUID(), "h", new RegistroCampo.Origem(null, BigDecimal.ONE, null, null), servidor))
                .isInstanceOf(InvarianteVioladaException.class);
    }

    @Test
    void conclusaoDoAparelhoValeAHoraDoAparelhoENuncaOFuturo() {
        AprTurno manha = apr();
        OffsetDateTime oitoEDez = HOJE.atTime(8, 10).atZone(FUSO).toOffsetDateTime();
        manha.concluirEm(oitoEDez, UUID.randomUUID());
        assertThat(manha.getDataConclusao()).isEqualTo(oitoEDez);

        AprTurno futura = apr();
        futura.concluirEm(OffsetDateTime.now().plusHours(5), UUID.randomUUID());
        assertThat(futura.getDataConclusao()).isBeforeOrEqualTo(OffsetDateTime.now());
    }

    @Test
    void aprDaManhaLiberaApontamentoDaManhaMesmoComImpedimentoDaTardeEnviadoJunto() {
        AprTurno apr = apr();
        apr.concluirEm(HOJE.atTime(8, 10).atZone(FUSO).toOffsetDateTime(), UUID.randomUUID());
        OcorrenciaTurno chuva = OcorrenciaTurno.doCampo(TURNO, OBRA, programacao.getId(), TipoOcorrenciaTurno.CLIMA, "Chuva forte", true,
                new RegistroCampo(UUID.randomUUID(), "h", new RegistroCampo.Origem(HOJE.atTime(14, 0).atZone(FUSO).toOffsetDateTime(), null, null, null),
                        HOJE.atTime(14, 0).atZone(FUSO).toOffsetDateTime().plusHours(6)));

        OffsetDateTime dezEMeia = HOJE.atTime(10, 30).atZone(FUSO).toOffsetDateTime();
        OffsetDateTime seteHoras = HOJE.atTime(7, 0).atZone(FUSO).toOffsetDateTime();
        OffsetDateTime quinzeHoras = HOJE.atTime(15, 0).atZone(FUSO).toOffsetDateTime();

        assertThat(SituacaoLiberacao.avaliar(OBRA, programacao.getId(), HOJE, FUSO, List.of(apr), List.of(chuva), dezEMeia))
                .isEqualTo(SituacaoLiberacao.LIBERADA);
        assertThat(SituacaoLiberacao.avaliar(OBRA, programacao.getId(), HOJE, FUSO, List.of(apr), List.of(chuva), seteHoras))
                .isNotEqualTo(SituacaoLiberacao.LIBERADA);
        assertThat(SituacaoLiberacao.avaliar(OBRA, programacao.getId(), HOJE, FUSO, List.of(apr), List.of(chuva), quinzeHoras))
                .isEqualTo(SituacaoLiberacao.IMPEDIDA);
    }

    @Test
    void desligamentoGuardaHorarioEManobraSoQuandoHaDesligamento() {
        programacao.informarDesligamento(LocalTime.of(8, 0), LocalTime.of(12, 0), " 2026-4471 ");
        assertThat(programacao.getNumeroManobra()).isEqualTo("2026-4471");
        assertThat(programacao.getHoraDesligamentoInicio()).isEqualTo(LocalTime.of(8, 0));
        assertThatThrownBy(() -> programacao.informarDesligamento(LocalTime.of(12, 0), LocalTime.of(8, 0), null))
                .isInstanceOf(InvarianteVioladaException.class);

        Programacao semDesligamento = new Programacao(1701, OBRA, EQUIPE, HOJE, HOJE,
                new Programacao.Condicoes("Rede", false, false, false, TurnoProgramacao.DIA_TODO, SituacaoIntervencao.CRIADO, null));
        semDesligamento.informarDesligamento(LocalTime.of(8, 0), LocalTime.of(12, 0), "123");
        assertThat(semDesligamento.getNumeroManobra()).isNull();
        assertThat(semDesligamento.getHoraDesligamentoInicio()).isNull();
    }

    private AprTurno apr() {
        return AprTurno.doCampo(TURNO, OBRA, programacao.getId(), "Instalar poste", RESPONSAVEL,
                new FormularioApr("P1", List.of("Choque elétrico"), null, List.of("Desenergização"), null,
                        List.of(new FormularioApr.Verificacao("Área sinalizada", FormularioApr.Resposta.SIM)), List.of(RESPONSAVEL)),
                List.of(new AprTurno.Assinatura(RESPONSAVEL, "Encarregado", OffsetDateTime.now(), "iVBOR")),
                new RegistroCampo(UUID.randomUUID(), "h", RegistroCampo.Origem.AGORA, OffsetDateTime.now()));
    }
}
