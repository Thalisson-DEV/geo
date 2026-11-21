package com.nexo.app.modules.obras.domain;

import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RevisaoFotoTest {

    private static EvidenciaPonto foto() {
        return EvidenciaPonto.doCampo(UUID.randomUUID(), UUID.randomUUID(),
                new EvidenciaPonto.ItemRespondido(UUID.randomUUID(), "depois", "Poste instalado"), null,
                new EvidenciaPonto.Arquivo("foto.jpg", "image/jpeg", 10, "k", "km"), EvidenciaPonto.Captura.VAZIA,
                new EvidenciaPonto.OrigemCampo(UUID.randomUUID(), "h", null, UUID.randomUUID(), null, null, UUID.randomUUID()));
    }

    @Test
    void fotoNasceParaRevisarComAEquipeDoApp() {
        EvidenciaPonto f = foto();
        assertThat(f.getRevisao()).isEqualTo(EvidenciaPonto.Revisao.PENDENTE);
        assertThat(f.getIdEquipe()).isNotNull();
    }

    @Test
    void reprovarExigeInconformidadeEMotivoNaOutra() {
        EvidenciaPonto f = foto();
        assertThatThrownBy(() -> f.reprovar(null, "x", "ana")).isInstanceOf(InvarianteVioladaException.class);
        assertThatThrownBy(() -> f.reprovar(EvidenciaPonto.Inconformidade.OUTRA, " ", "ana")).isInstanceOf(InvarianteVioladaException.class);

        f.reprovar(EvidenciaPonto.Inconformidade.FORA_DE_FOCO, null, "ana");
        assertThat(f.reprovada()).isTrue();
        assertThat(f.getRevisadaPor()).isEqualTo("ana");

        f.aprovar("bia");
        assertThat(f.getRevisao()).isEqualTo(EvidenciaPonto.Revisao.APROVADA);
        assertThat(f.getInconformidade()).isNull();
        assertThat(f.getMotivoReprovacao()).isNull();
    }
}
