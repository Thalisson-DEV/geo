package com.nexo.app.modules.obras.application.usecases;

import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Locale;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ConversorDwgTest {

    private static final boolean WINDOWS = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");

    @Test
    void semComandoConfiguradoODwgNaoELidoEAvisaComoResolver() {
        ConversorDwg conversor = new ConversorDwg("", Duration.ofSeconds(5));

        assertThat(conversor.disponivel()).isFalse();
        assertThatThrownBy(() -> conversor.paraDxf(new byte[]{1, 2, 3}))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("Exporte o projeto como DXF");
    }

    @Test
    void chamaOConversorComOsArquivosNoLugarDasMarcas() {
        // "Conversor" de mentira que só copia a entrada para a saída: confere a troca de {entrada} e {saida}.
        String copiar = WINDOWS ? "cmd /c copy /y {entrada} {saida}" : "cp {entrada} {saida}";
        ConversorDwg conversor = new ConversorDwg(copiar, Duration.ofSeconds(30));
        byte[] conteudo = "conteúdo do desenho".getBytes(StandardCharsets.UTF_8);

        assertThat(conversor.disponivel()).isTrue();
        assertThat(conversor.paraDxf(conteudo)).isEqualTo(conteudo);
    }

    @Test
    void conversorQueNaoGeraODxfViraMensagemClara() {
        String falhar = WINDOWS ? "cmd /c exit 3" : "false";
        ConversorDwg conversor = new ConversorDwg(falhar, Duration.ofSeconds(30));

        assertThatThrownBy(() -> conversor.paraDxf(new byte[]{1}))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("Não foi possível converter o DWG");
    }
}
