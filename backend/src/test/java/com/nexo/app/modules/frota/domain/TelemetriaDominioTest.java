package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TelemetriaDominioTest {

    private final OffsetDateTime agora = OffsetDateTime.parse("2026-10-26T15:00:00-03:00");

    private static FonteTelemetria.Leitura leitura(OffsetDateTime em, Long odometro) {
        return new FonteTelemetria.Leitura(em, -12.0, -38.0, 40.0, true, odometro, null,
                new FonteTelemetria.Motorista("7", "MARIA", null, null));
    }

    @Test
    void normalizaAPlacaComoAFrotaCompara() {
        assertThat(RastreadorTelemetria.normalizarPlaca("abc-1d23 ")).isEqualTo("ABC1D23");
    }

    @Test
    void vinculoManualPrevaleceSobreAPlacaEIgnoradoNaoVoltaSozinho() {
        var r = new RastreadorTelemetria(ProvedorTelemetria.ZUQ, "4410");
        UUID manual = UUID.randomUUID();
        r.vincularManualmente(manual);

        r.vincularAutomaticamente(UUID.randomUUID());
        assertThat(r.getIdVeiculo()).isEqualTo(manual);

        r.ignorar();
        r.vincularAutomaticamente(UUID.randomUUID());
        assertThat(r.getSituacao()).isEqualTo(SituacaoRastreador.IGNORADO);

        r.reativar();
        UUID pelaPlaca = UUID.randomUUID();
        r.vincularAutomaticamente(pelaPlaca);
        assertThat(r.getSituacao()).isEqualTo(SituacaoRastreador.VINCULADO);
        assertThat(r.getIdVeiculo()).isEqualTo(pelaPlaca);
        assertThatThrownBy(r::reativar).isInstanceOf(InvarianteVioladaException.class);
    }

    @Test
    void placaQueSumiuDesvincula() {
        var r = new RastreadorTelemetria(ProvedorTelemetria.UBICALY, "17");
        r.vincularAutomaticamente(UUID.randomUUID());

        r.vincularAutomaticamente(null);

        assertThat(r.getSituacao()).isEqualTo(SituacaoRastreador.SEM_VEICULO);
        assertThat(r.getIdVeiculo()).isNull();
    }

    @Test
    void leituraRepetidaOuMaisAntigaNaoMudaOEstado() {
        var r = new RastreadorTelemetria(ProvedorTelemetria.ZUQ, "4410");
        assertThat(r.registrarLeitura(leitura(agora, 100_000L), null)).isTrue();

        assertThat(r.registrarLeitura(leitura(agora, 100_500L), null)).isFalse();
        assertThat(r.registrarLeitura(leitura(agora.minusMinutes(5), 99_000L), null)).isFalse();
        assertThat(r.getOdometroMetros()).isEqualTo(100_000L);

        assertThat(r.registrarLeitura(leitura(agora.plusMinutes(10), 0L), null)).isTrue();
        assertThat(r.getOdometroMetros()).as("odômetro zerado pelo provedor não apaga o último").isEqualTo(100_000L);
    }

    @Test
    void intervaloDaLeituraDeKm() {
        var r = new RastreadorTelemetria(ProvedorTelemetria.ZUQ, "4410");
        assertThat(r.podeRegistrarLeitura(agora, Duration.ofHours(6))).isTrue();
        r.marcarLeituraRegistrada(agora);
        assertThat(r.podeRegistrarLeitura(agora.plusHours(5), Duration.ofHours(6))).isFalse();
        assertThat(r.podeRegistrarLeitura(agora.plusHours(6), Duration.ofHours(6))).isTrue();
    }

    @Test
    void falhaAvisaUmaVezPorIncidenteDepoisDaTolerancia() {
        var s = new SincronizacaoTelemetria(ProvedorTelemetria.UBICALY, RotinaTelemetria.VEICULOS);
        s.registrarSucesso(agora, 10);
        s.registrarFalha(agora.plusMinutes(10), "HTTP 503");

        assertThat(s.precisaAvisarFalha(agora.plusMinutes(30), Duration.ofHours(1))).isFalse();
        assertThat(s.precisaAvisarFalha(agora.plusMinutes(61), Duration.ofHours(1))).isTrue();
        s.marcarFalhaAvisada(agora.plusMinutes(61));
        s.registrarFalha(agora.plusMinutes(70), "HTTP 503");
        assertThat(s.precisaAvisarFalha(agora.plusMinutes(90), Duration.ofHours(1))).isFalse();

        s.registrarSucesso(agora.plusMinutes(100), 10);
        assertThat(s.getFalhaAvisadaEm()).as("o sucesso fecha o incidente").isNull();
        assertThat(s.getFalhasSeguidas()).isZero();
    }

    @Test
    void eventoSemOrigemNaoGuardaCondutorEResumeOExcesso() {
        var r = new RastreadorTelemetria(ProvedorTelemetria.ZUQ, "4410");
        ReflectionTestUtils.setField(r, "id", UUID.randomUUID());
        var provedor = new FonteTelemetria.EventoProvedor("1", "4410", "XYZ9A87", TipoEventoTelemetria.EXCESSO_VELOCIDADE,
                agora, null, null, null, 97.0, 80.0, null, null, null);

        var evento = new EventoTelemetria(r, null, provedor, UUID.randomUUID(), null);

        assertThat(evento.getIdColaborador()).isNull();
        assertThat(evento.getPlaca()).isEqualTo("XYZ9A87");
        assertThat(evento.detalhe()).isEqualTo("97 km/h (limite 80)");
    }
}
