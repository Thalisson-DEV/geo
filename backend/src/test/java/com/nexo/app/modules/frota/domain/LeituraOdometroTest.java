package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class LeituraOdometroTest {

    private static final UUID VEICULO = UUID.randomUUID();
    private static final int LIMITE_KM_DIA = 1500;

    private static LeituraOdometro leitura(long km, OffsetDateTime quando, LeituraOdometro anterior, LeituraOdometro posterior) {
        return LeituraOdometro.registrar(VEICULO, UnidadeMedicao.KM, km, quando, OrigemLeituraOdometro.MANUAL, null, null,
                anterior, posterior, LIMITE_KM_DIA);
    }

    @Test
    void primeiraLeituraEhValida() {
        var primeira = leitura(10_000, OffsetDateTime.now().minusDays(2), null, null);

        assertThat(primeira.isValida()).isTrue();
        assertThat(primeira.getKmAnterior()).isNull();
    }

    @Test
    void kmMenorQueOAnteriorFicaInconsistenteMasEhGuardado() {
        var anterior = leitura(10_000, OffsetDateTime.now().minusDays(2), null, null);

        var atual = leitura(9_500, OffsetDateTime.now().minusDays(1), anterior, null);

        assertThat(atual.isInconsistente()).isTrue();
        assertThat(atual.getMotivoSituacao()).contains("menor que a leitura anterior");
        assertThat(atual.getKmAnterior()).isEqualTo(10_000L);
    }

    @Test
    void leituraForaDeOrdemMaiorQueASeguinteFicaInconsistente() {
        var seguinte = leitura(10_000, OffsetDateTime.now().minusDays(1), null, null);

        var atrasada = leitura(10_500, OffsetDateTime.now().minusDays(3), null, seguinte);

        assertThat(atrasada.isInconsistente()).isTrue();
        assertThat(atrasada.getMotivoSituacao()).contains("maior que a leitura seguinte");
    }

    @Test
    void saltoAcimaDoLimiteDiarioFicaInconsistente() {
        var anterior = leitura(10_000, OffsetDateTime.now().minusDays(1), null, null);

        var salto = leitura(13_000, OffsetDateTime.now(), anterior, null);

        assertThat(salto.isInconsistente()).isTrue();
        assertThat(salto.getMotivoSituacao()).contains("Salto de 3000 km");
    }

    @Test
    void saltoDeHorasAcimaDoLimiteFicaInconsistenteComMotivoEmHoras() {
        var anterior = LeituraOdometro.registrar(VEICULO, UnidadeMedicao.HORAS, 1_000, OffsetDateTime.now().minusDays(1),
                OrigemLeituraOdometro.MANUAL, null, null, null, null, 16);

        var salto = LeituraOdometro.registrar(VEICULO, UnidadeMedicao.HORAS, 1_040, OffsetDateTime.now(),
                OrigemLeituraOdometro.MANUAL, null, null, anterior, null, 16);

        assertThat(salto.getUnidade()).isEqualTo(UnidadeMedicao.HORAS);
        assertThat(salto.isInconsistente()).isTrue();
        assertThat(salto.getMotivoSituacao()).isEqualTo(
                "Salto de 40 h desde a leitura anterior, acima do limite de 16 h por dia.");
    }

    @Test
    void horimetroMenorQueOAnteriorUsaORotuloDaUnidade() {
        var anterior = LeituraOdometro.registrar(VEICULO, UnidadeMedicao.HORAS, 4_009, OffsetDateTime.now().minusDays(1),
                OrigemLeituraOdometro.MANUAL, null, null, null, null, 16);

        var menor = LeituraOdometro.registrar(VEICULO, UnidadeMedicao.HORAS, 4_000, OffsetDateTime.now(),
                OrigemLeituraOdometro.MANUAL, null, null, anterior, null, 16);

        assertThat(menor.getMotivoSituacao()).startsWith("Horímetro menor que a leitura anterior (4009 h");
    }

    @Test
    void trocaDePainelGuardaFechamentoEDeslocamento() {
        var ultima = leitura(264_656, OffsetDateTime.now().minusDays(1), null, null);

        var troca = LeituraOdometro.registrarTrocaPainel(VEICULO, UnidadeMedicao.KM, 264_656, 0,
                OffsetDateTime.now().minusHours(1), null, ultima, "Painel queimado");

        assertThat(troca.isTrocaPainel()).isTrue();
        assertThat(troca.isValida()).isTrue();
        assertThat(troca.getKm()).isZero();
        assertThat(troca.getFechamentoPainel()).isEqualTo(264_656L);
        assertThat(troca.getDeslocamento()).isEqualTo(264_656L);
        assertThat(troca.getMotivoSituacao()).isEqualTo("Troca de painel. Painel antigo encerrado em 264656 km. Painel queimado");
    }

    @Test
    void leituraDepoisDaTrocaComparaSoComOPainelNovo() {
        var troca = LeituraOdometro.registrarTrocaPainel(VEICULO, UnidadeMedicao.KM, 264_656, 0,
                OffsetDateTime.now().minusHours(5), null, null, null);

        var seguinte = leitura(120, OffsetDateTime.now(), troca, null);

        assertThat(seguinte.isValida()).isTrue();
    }

    @Test
    void trocaQueMudaAUnidadeRecomecaOAcumulado() {
        var ultima = leitura(80_000, OffsetDateTime.now().minusDays(1), null, null);

        var troca = LeituraOdometro.registrarTrocaPainel(VEICULO, UnidadeMedicao.HORAS, 80_000, 0,
                OffsetDateTime.now(), null, ultima, null);

        assertThat(troca.getUnidade()).isEqualTo(UnidadeMedicao.HORAS);
        assertThat(troca.getDeslocamento()).isNull();
        assertThat(troca.getMotivoSituacao()).contains("unidade alterada para h");
    }

    @Test
    void trocaRecusaFechamentoMenorQueAUltimaLeituraEDataAnterior() {
        var ultima = leitura(10_000, OffsetDateTime.now().minusDays(1), null, null);

        assertThatThrownBy(() -> LeituraOdometro.registrarTrocaPainel(VEICULO, UnidadeMedicao.KM, 9_000, 0,
                OffsetDateTime.now(), null, ultima, null))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("não pode ser menor que a última leitura válida");
        assertThatThrownBy(() -> LeituraOdometro.registrarTrocaPainel(VEICULO, UnidadeMedicao.KM, 10_000, 0,
                OffsetDateTime.now().minusDays(2), null, ultima, null))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("depois da última leitura válida");
        assertThatThrownBy(() -> LeituraOdometro.registrarTrocaPainel(VEICULO, UnidadeMedicao.KM, 10_000, 10_500,
                OffsetDateTime.now(), null, ultima, null))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("não pode começar acima");
    }

    @Test
    void rodagemCompativelComOPeriodoEhValida() {
        var anterior = leitura(10_000, OffsetDateTime.now().minusDays(3), null, null);

        var atual = leitura(13_000, OffsetDateTime.now(), anterior, null);

        assertThat(atual.isValida()).isTrue();
    }

    @Test
    void mesmoKmNoMesmoDiaEhValido() {
        var anterior = leitura(10_000, OffsetDateTime.now().minusHours(2), null, null);

        assertThat(leitura(10_000, OffsetDateTime.now(), anterior, null).isValida()).isTrue();
    }

    @Test
    void recusaLeituraNoFuturo() {
        assertThatThrownBy(() -> leitura(10_000, OffsetDateTime.now().plusDays(1), null, null))
                .isInstanceOf(InvarianteVioladaException.class);
    }

    @Test
    void leituraAutomaticaExigeRegistroDeOrigem() {
        assertThatThrownBy(() -> LeituraOdometro.registrar(VEICULO, UnidadeMedicao.KM, 100, OffsetDateTime.now(),
                OrigemLeituraOdometro.CHECKLIST, null, null, null, null, LIMITE_KM_DIA))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("registro de origem");
    }

    @Test
    void anularGuardaJustificativaENaoPermiteAnularDuasVezes() {
        var leitura = leitura(10_000, OffsetDateTime.now(), null, null);
        UUID gestor = UUID.randomUUID();

        leitura.anular(gestor, "Digitado com um zero a mais");

        assertThat(leitura.getSituacao()).isEqualTo(SituacaoLeituraOdometro.ANULADA);
        assertThat(leitura.getIdUsuarioAnulacao()).isEqualTo(gestor);
        assertThatThrownBy(() -> leitura.anular(gestor, "de novo")).isInstanceOf(InvarianteVioladaException.class);
    }

    @Test
    void confirmarSoValeParaInconsistente() {
        var anterior = leitura(10_000, OffsetDateTime.now().minusDays(1), null, null);
        var inconsistente = leitura(9_000, OffsetDateTime.now(), anterior, null);

        inconsistente.confirmar("Troca de painel registrada na oficina");

        assertThat(inconsistente.isValida()).isTrue();
        assertThat(inconsistente.getMotivoSituacao()).startsWith("Confirmada pelo gestor");
        assertThatThrownBy(() -> anterior.confirmar("já é válida")).isInstanceOf(InvarianteVioladaException.class);
    }
}
