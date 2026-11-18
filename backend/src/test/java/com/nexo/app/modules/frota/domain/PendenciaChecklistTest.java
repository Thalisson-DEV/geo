package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PendenciaChecklistTest {

    private static final OffsetDateTime AGORA = OffsetDateTime.now();

    private PendenciaChecklist pendencia() {
        var modelo = new ModeloChecklist(new ModeloChecklist.Dados("Geral", TipoModeloChecklist.PRINCIPAL, null, false,
                Set.of(), Set.of(), List.of(new ModeloChecklist.DadosPergunta(null, null, "Faróis", TipoRespostaChecklist.OK_NOK,
                ModoFotoPergunta.NUNCA, null, null)), null));
        modelo.getPerguntas().forEach(p -> ReflectionTestUtils.setField(p, "id", UUID.randomUUID()));
        var ficha = FichaVeiculo.provisionar(UUID.randomUUID(), "ABC1D23", UUID.randomUUID());
        var checklist = Checklist.registrar(new Checklist.Registro(UUID.randomUUID(), FinalidadeChecklist.USO, UUID.randomUUID(), UUID.randomUUID(),
                AGORA, 100L, null, false, List.of(new Checklist.RespostaInformada(modelo.getPerguntas().getFirst().getId(),
                false, null, null, null, null)), null), ficha, modelo, List.of(), false, AGORA);
        return new PendenciaChecklist(checklist, checklist.problemas().getFirst());
    }

    @Test
    void encaminhaParaOsUmaVezSo() {
        var pendencia = pendencia();
        UUID idOs = UUID.randomUUID();

        pendencia.encaminharParaOs(idOs, UUID.randomUUID(), AGORA);

        assertThat(pendencia.getSituacao()).isEqualTo(SituacaoPendenciaChecklist.OS_ABERTA);
        assertThat(pendencia.getIdOrdemServico()).isEqualTo(idOs);
        assertThatThrownBy(() -> pendencia.resolverNaHora(UUID.randomUUID(), null, AGORA))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessage("A pendência \"Faróis — Não OK\" já foi tratada: OS aberta.");
    }

    @Test
    void descarteExigeJustificativa() {
        var pendencia = pendencia();

        assertThatThrownBy(() -> pendencia.descartar(" ", null, AGORA)).hasMessage("Informe a justificativa do descarte.");

        pendencia.descartar("Marcado por engano", null, AGORA);
        assertThat(pendencia.getSituacao()).isEqualTo(SituacaoPendenciaChecklist.DESCARTADA);
        assertThat(pendencia.getJustificativa()).isEqualTo("Marcado por engano");
    }

    @Test
    void resolvidaNaHoraGuardaAOs() {
        var pendencia = pendencia();
        UUID idOs = UUID.randomUUID();

        pendencia.resolverNaHora(idOs, null, AGORA);

        assertThat(pendencia.getSituacao()).isEqualTo(SituacaoPendenciaChecklist.RESOLVIDA_NA_HORA);
        assertThat(pendencia.getIdOrdemServico()).isEqualTo(idOs);
    }
}
