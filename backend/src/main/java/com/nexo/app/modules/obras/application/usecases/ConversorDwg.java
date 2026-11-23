package com.nexo.app.modules.obras.application.usecases;

import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

/**
 * Converte DWG em DXF chamando um conversor instalado no servidor. O DWG é um formato fechado da Autodesk, sem leitor
 * livre em Java; os conversores maduros são programas à parte, como o {@code dwg2dxf} da LibreDWG (livre) ou o ODA File
 * Converter (gratuito). O comando vem da configuração, com {@code {entrada}} e {@code {saida}} no lugar dos arquivos:
 *
 * <pre>geo.projeto.cad.conversor-dwg.comando: dwg2dxf -y -o {saida} {entrada}</pre>
 *
 * <p>Sem comando configurado, o DWG não é lido e a leitura da folha segue pelo PDF.</p>
 */
@Slf4j
@Component
public class ConversorDwg {

    private final List<String> comando;
    private final Duration limite;

    public ConversorDwg(@Value("${geo.projeto.cad.conversor-dwg.comando:}") String comando,
                        @Value("${geo.projeto.cad.conversor-dwg.limite:PT60S}") Duration limite) {
        this.comando = comando == null || comando.isBlank() ? List.of() : Arrays.asList(comando.trim().split("\\s+"));
        this.limite = limite;
    }

    public boolean disponivel() {
        return !comando.isEmpty();
    }

    /** Roda o conversor numa pasta temporária própria, sem shell (os argumentos vão separados), e apaga tudo no fim. */
    public byte[] paraDxf(byte[] dwg) {
        if (!disponivel()) {
            throw new InvarianteVioladaException("Este ambiente não tem conversor de DWG configurado. Exporte o projeto como DXF e anexe de novo.");
        }
        Path pasta = null;
        try {
            pasta = Files.createTempDirectory("geo-dwg-");
            Path entrada = pasta.resolve("projeto.dwg");
            Path saida = pasta.resolve("projeto.dxf");
            Files.write(entrada, dwg);
            List<String> argumentos = new ArrayList<>();
            for (String parte : comando) {
                argumentos.add(parte.replace("{entrada}", entrada.toString()).replace("{saida}", saida.toString()));
            }
            Process processo = new ProcessBuilder(argumentos)
                    .directory(pasta.toFile())
                    .redirectErrorStream(true)
                    .redirectOutput(pasta.resolve("conversor.log").toFile())
                    .start();
            if (!processo.waitFor(limite.toMillis(), TimeUnit.MILLISECONDS)) {
                processo.destroyForcibly();
                throw new InvarianteVioladaException("A conversão do DWG passou do tempo. Exporte o projeto como DXF e anexe de novo.");
            }
            if (!Files.exists(saida) || Files.size(saida) == 0) {
                log.warn("Conversor de DWG terminou com código {} sem gerar o DXF: {}", processo.exitValue(),
                        Files.exists(pasta.resolve("conversor.log")) ? Files.readString(pasta.resolve("conversor.log")) : "");
                throw new InvarianteVioladaException("Não foi possível converter o DWG. Exporte o projeto como DXF e anexe de novo.");
            }
            return Files.readAllBytes(saida);
        } catch (IOException e) {
            log.warn("Falha ao chamar o conversor de DWG", e);
            throw new InvarianteVioladaException("Não foi possível converter o DWG. Exporte o projeto como DXF e anexe de novo.");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new InvarianteVioladaException("A conversão do DWG foi interrompida.");
        } finally {
            apagar(pasta);
        }
    }

    private static void apagar(Path pasta) {
        if (pasta == null) {
            return;
        }
        try (Stream<Path> arquivos = Files.walk(pasta)) {
            arquivos.sorted(Comparator.reverseOrder()).forEach(p -> p.toFile().delete());
        } catch (IOException e) {
            log.debug("Pasta temporária do conversor de DWG ficou para trás: {}", pasta, e);
        }
    }
}
