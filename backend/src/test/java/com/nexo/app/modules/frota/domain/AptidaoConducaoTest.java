package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AptidaoConducaoTest {

    private static final LocalDate HOJE = LocalDate.of(2026, 10, 15);

    private static Condutor condutor(CategoriaCnh categoria, LocalDate validade) {
        var condutor = new Condutor(UUID.randomUUID());
        condutor.registrarCnh("12345678901", categoria, validade, null, null);
        return condutor;
    }

    @Test
    void avaliaSemCnhVencidaCategoriaEApto() {
        assertThat(AptidaoConducao.avaliar(null, CategoriaCnh.B, HOJE).situacao()).isEqualTo(AptidaoConducao.SituacaoCnh.SEM_CNH);

        var vencida = AptidaoConducao.avaliar(condutor(CategoriaCnh.D, HOJE.minusDays(1)), CategoriaCnh.B, HOJE);
        assertThat(vencida.situacao()).isEqualTo(AptidaoConducao.SituacaoCnh.VENCIDA);
        assertThat(vencida.mensagem()).isEqualTo("A CNH do condutor está vencida desde 14/10/2026.");

        var categoria = AptidaoConducao.avaliar(condutor(CategoriaCnh.B, HOJE.plusYears(1)), CategoriaCnh.D, HOJE);
        assertThat(categoria.situacao()).isEqualTo(AptidaoConducao.SituacaoCnh.CATEGORIA_INSUFICIENTE);
        assertThat(categoria.mensagem()).contains("categoria B", "categoria D");

        assertThat(AptidaoConducao.avaliar(condutor(CategoriaCnh.D, HOJE), CategoriaCnh.C, HOJE).isApto())
                .as("vence hoje, ainda vale").isTrue();
    }

    @Test
    void liberacaoExigeJustificativaDiaValidoECnhQueImpede() {
        var vencida = AptidaoConducao.avaliar(condutor(CategoriaCnh.D, HOJE.minusDays(1)), null, HOJE);
        var apta = AptidaoConducao.avaliar(condutor(CategoriaCnh.D, HOJE.plusYears(1)), null, HOJE);
        UUID idCondutor = UUID.randomUUID();
        UUID idVeiculo = UUID.randomUUID();

        var liberacao = new LiberacaoCnh(idCondutor, idVeiculo, HOJE, "Renovação em andamento, protocolo 123", null, vencida, HOJE);
        assertThat(liberacao.getDia()).isEqualTo(HOJE);

        assertThatThrownBy(() -> new LiberacaoCnh(idCondutor, idVeiculo, HOJE, "curta", null, vencida, HOJE))
                .isInstanceOf(InvarianteVioladaException.class).hasMessageContaining("10 caracteres");
        assertThatThrownBy(() -> new LiberacaoCnh(idCondutor, idVeiculo, HOJE.minusDays(1), "Renovação em andamento", null, vencida, HOJE))
                .isInstanceOf(InvarianteVioladaException.class).hasMessageContaining("hoje");
        assertThatThrownBy(() -> new LiberacaoCnh(idCondutor, idVeiculo, HOJE, "Renovação em andamento", null, apta, HOJE))
                .isInstanceOf(InvarianteVioladaException.class).hasMessageContaining("não é preciso liberar");
    }
}
