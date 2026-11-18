package com.nexo.app.modules.rh.domain;

import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Lançamento da medida já aplicada, suspensão, correção, cancelamento e imediatidade. */
class MedidaDisciplinarTest {

    private static final LocalDate HOJE = LocalDate.of(2026, 10, 20);
    private static final OffsetDateTime AGORA = OffsetDateTime.of(2026, 10, 20, 15, 0, 0, 0, ZoneOffset.ofHours(-3));

    private final TipoMedidaDisciplinar advertencia = new TipoMedidaDisciplinar("Advertência escrita", 3, false);
    private final TipoMedidaDisciplinar suspensao = new TipoMedidaDisciplinar("Suspensão", 4, true);
    private final MotivoMedidaDisciplinar transito = new MotivoMedidaDisciplinar("Trânsito");

    private MedidaDisciplinar.Dados dados(TipoMedidaDisciplinar tipo, Integer dias, LocalDate inicio) {
        return dados(tipo, LocalDate.of(2026, 10, 15), dias, inicio);
    }

    private MedidaDisciplinar.Dados dados(TipoMedidaDisciplinar tipo, LocalDate aplicacao, Integer dias, LocalDate inicio) {
        return new MedidaDisciplinar.Dados(UUID.randomUUID(), UUID.randomUUID(), tipo, transito, LocalDate.of(2026, 10, 10), aplicacao,
                "Excesso de velocidade na BR-324.", dias, inicio);
    }

    private MedidaDisciplinar registrar(MedidaDisciplinar.Dados dados) {
        return MedidaDisciplinar.registrar(dados, UUID.randomUUID(), AGORA);
    }

    private MedidaDisciplinar aplicada() {
        return registrar(dados(advertencia, null, null));
    }

    @Test
    void nasceAplicadaEContaParaReincidencia() {
        UUID usuario = UUID.randomUUID();
        var medida = MedidaDisciplinar.registrar(dados(advertencia, null, null), usuario, AGORA);

        assertThat(medida.getSituacao()).isEqualTo(SituacaoMedidaDisciplinar.APLICADA);
        assertThat(medida.getOrigem()).isEqualTo(OrigemMedidaDisciplinar.MANUAL);
        assertThat(medida.getDataAplicacao()).isEqualTo(LocalDate.of(2026, 10, 15));
        assertThat(medida.getIdUsuarioAplicacao()).isEqualTo(usuario);
        assertThat(medida.getAplicadaEm()).isEqualTo(AGORA);
        assertThat(medida.contaParaReincidencia()).isTrue();
    }

    @Test
    void dataDaAplicacaoEObrigatoriaEntreOFatoEHoje() {
        assertThatThrownBy(() -> registrar(dados(advertencia, null, null, null))).hasMessageContaining("foi aplicada");
        assertThatThrownBy(() -> registrar(dados(advertencia, LocalDate.of(2026, 10, 9), null, null))).hasMessageContaining("antes do fato");
        assertThatThrownBy(() -> registrar(dados(advertencia, HOJE.plusDays(1), null, null))).hasMessageContaining("futuro");
    }

    @Test
    void suspensaoSemPeriodoIndicaOsCampos() {
        assertThatThrownBy(() -> registrar(dados(suspensao, null, null)))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("os dias e o início");
        assertThatThrownBy(() -> registrar(dados(suspensao, 3, null)))
                .hasMessageContaining("o início");
        assertThatThrownBy(() -> registrar(dados(suspensao, 31, LocalDate.of(2026, 10, 12))))
                .hasMessageContaining("de 1 a 30 dias");
    }

    @Test
    void suspensaoCalculaOFim() {
        var medida = registrar(dados(suspensao, 3, LocalDate.of(2026, 10, 12)));

        assertThat(medida.getFimSuspensao()).isEqualTo(LocalDate.of(2026, 10, 14));
    }

    @Test
    void tipoSemPeriodoDescartaASuspensao() {
        var medida = registrar(dados(advertencia, 3, LocalDate.of(2026, 10, 12)));

        assertThat(medida.getDiasSuspensao()).isNull();
        assertThat(medida.getFimSuspensao()).isNull();
    }

    @Test
    void fatoNoFuturoERecusado() {
        var futuro = new MedidaDisciplinar.Dados(UUID.randomUUID(), null, advertencia, transito, HOJE.plusDays(1), HOJE.plusDays(1), "x",
                null, null);

        assertThatThrownBy(() -> registrar(futuro)).hasMessageContaining("futuro");
    }

    @Test
    void origemDeOutroModuloExigeOId() {
        assertThatThrownBy(() -> MedidaDisciplinar.registrarPorOrigem(dados(advertencia, null, null), OrigemMedidaDisciplinar.FROTA_MULTA, null,
                null, AGORA)).hasMessageContaining("registro de origem");
        assertThatThrownBy(() -> MedidaDisciplinar.registrarPorOrigem(dados(advertencia, null, null), OrigemMedidaDisciplinar.MANUAL,
                UUID.randomUUID(), null, AGORA)).hasMessageContaining("não aceita");

        UUID multa = UUID.randomUUID();
        var medida = MedidaDisciplinar.registrarPorOrigem(dados(advertencia, null, null), OrigemMedidaDisciplinar.FROTA_MULTA, multa, null, AGORA);
        assertThat(medida.getOrigem()).isEqualTo(OrigemMedidaDisciplinar.FROTA_MULTA);
        assertThat(medida.getIdOrigem()).isEqualTo(multa);
    }

    @Test
    void correcaoValeAteOCancelamento() {
        var medida = aplicada();
        medida.editar(dados(suspensao, LocalDate.of(2026, 10, 16), 2, LocalDate.of(2026, 10, 17)), HOJE);
        assertThat(medida.getTipo()).isSameAs(suspensao);
        assertThat(medida.getDataAplicacao()).isEqualTo(LocalDate.of(2026, 10, 16));
        assertThat(medida.getSituacao()).isEqualTo(SituacaoMedidaDisciplinar.APLICADA);

        medida.cancelar("Lançada em duplicidade.", null, AGORA);
        assertThatThrownBy(() -> medida.editar(dados(advertencia, null, null), HOJE)).hasMessageContaining("cancelada");
    }

    @Test
    void cancelarExigeJustificativaEDeixaDeContar() {
        var medida = aplicada();
        assertThatThrownBy(() -> medida.cancelar("  ", null, AGORA)).hasMessageContaining("justificativa");

        medida.cancelar("Multa anulada pelo órgão de trânsito.", UUID.randomUUID(), AGORA);

        assertThat(medida.getSituacao()).isEqualTo(SituacaoMedidaDisciplinar.CANCELADA);
        assertThat(medida.contaParaReincidencia()).isFalse();
        assertThat(medida.isAtivo()).isTrue();
        assertThatThrownBy(() -> medida.cancelar("de novo", null, AGORA)).hasMessageContaining("já foi cancelada");
        assertThatThrownBy(medida::exigirNaoCancelada).hasMessageContaining("cancelada");
    }

    @Test
    void imediatidadeContaDoFatoAteAAplicacao() {
        var medida = aplicada();
        assertThat(medida.diasDesdeOFato()).isEqualTo(5);
        assertThat(medida.foraDaImediatidade(5)).isFalse();
        assertThat(medida.foraDaImediatidade(4)).isTrue();

        medida.cancelar("Multa anulada.", null, AGORA);
        assertThat(medida.foraDaImediatidade(4)).isFalse();
    }
}
