package com.nexo.app.modules.obras.application.usecases;

import com.nexo.app.modules.obras.application.dto.AnexoObraResponse;
import com.nexo.app.modules.obras.infrastructure.persistence.ObraRepository;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.List;
import java.util.UUID;

/**
 * Obra que só tem o arquivo CAD: gera a planta em PDF e a guarda como anexo, para ela ser o projeto mestre. O CAD
 * continua anexado e é dele que a Bússola lê a obra; a planta dá a folha que a tela e o app de campo mostram.
 */
@Component
@RequiredArgsConstructor
public class PlantaDoProjetoCad {

    /** Folga em volta da obra na planta, para mostrar a rede onde ela chega. */
    private static final double MARGEM_M = 40;
    private static final double MENOR_LARGURA_M = 150;
    private static final double MENOR_ALTURA_M = 100;

    private final AnexoObraUseCases anexos;
    private final TipoAnexoObraUseCases tiposAnexo;
    private final ConversorDwg conversorDwg;
    private final LeitorCadProjeto leitorCad;
    private final GeradorPlantaCad gerador;
    private final ObraRepository obraRepository;

    public static boolean ehCad(String nomeArquivo) {
        return ProjetoCadDaObra.dxf(nomeArquivo) || ProjetoCadDaObra.dwg(nomeArquivo);
    }

    /** Observação que marca a planta gerada de um arquivo CAD (a tela usa para identificá-la). */
    static String observacao(String nomeCad) {
        return "Planta gerada do arquivo CAD " + nomeCad;
    }

    static String nomePlanta(String nomeCad) {
        return nomeCad.replaceAll("(?i)\\.(dxf|dwg)$", "") + "-planta.pdf";
    }

    /** Planta do anexo CAD: a que já foi gerada dele (usar o mesmo arquivo de novo não duplica), ou uma nova. */
    public AnexoObraResponse gerar(UUID idObra, UUID idAnexoCad) {
        List<AnexoObraResponse> daObra = anexos.listarPorObra(idObra);
        AnexoObraResponse cad = daObra.stream()
                .filter(a -> a.id().equals(idAnexoCad))
                .findFirst()
                .orElseThrow(() -> new RecursoNaoEncontradoException("Anexo não encontrado nesta obra."));
        String nome = nomePlanta(cad.nomeArquivo());
        var existente = daObra.stream()
                .filter(a -> nome.equals(a.nomeArquivo()) && a.observacoes() != null
                        && a.observacoes().startsWith(observacao(cad.nomeArquivo())))
                .findFirst();
        if (existente.isPresent()) {
            return existente.get();
        }
        byte[] conteudo;
        try (var stream = anexos.baixar(idObra, idAnexoCad).stream()) {
            conteudo = stream.readAllBytes();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        byte[] dxf = ProjetoCadDaObra.dwg(cad.nomeArquivo()) ? conversorDwg.paraDxf(conteudo) : conteudo;

        GeometriaDxf.Desenho desenho = GeometriaDxf.ler(dxf);
        if (desenho.formas().isEmpty() && desenho.textos().isEmpty()) {
            throw new InvarianteVioladaException("O arquivo CAD não tem desenho para gerar a planta.");
        }
        double[] janela = leitorCad.interpretar(dxf)
                .filter(p -> !p.pontos().isEmpty())
                .map(PlantaDoProjetoCad::janelaDaObra)
                .orElseGet(() -> extensao(desenho));

        String titulo = obraRepository.findById(idObra)
                .map(o -> "Obra " + o.getNumero() + (o.getTitulo() != null ? " — " + o.getTitulo() : ""))
                .orElse("Planta do projeto");
        GeradorPlantaCad.Planta planta = gerador.gerar(desenho, janela, cad.nomeArquivo(), titulo);
        return anexos.anexarGerado(idObra, tiposAnexo.buscarEntidade(cad.idTipoAnexo()), nome, "application/pdf", planta.pdf(),
                observacao(cad.nomeArquivo()) + " (escala 1:" + planta.escala() + ", folha " + planta.folha() + ")");
    }

    /** Postes da obra com folga em volta, e um tamanho mínimo para a folha não ficar só no poste. */
    static double[] janelaDaObra(LeitorCadProjeto.ProjetoCad projeto) {
        double[] j = {Double.MAX_VALUE, Double.MAX_VALUE, -Double.MAX_VALUE, -Double.MAX_VALUE};
        for (LeitorCadProjeto.PosteCad p : projeto.pontos()) {
            j[0] = Math.min(j[0], p.leste);
            j[1] = Math.min(j[1], p.norte);
            j[2] = Math.max(j[2], p.leste);
            j[3] = Math.max(j[3], p.norte);
        }
        return comFolga(j, MARGEM_M);
    }

    /** Sem obra reconhecida nas camadas: o desenho inteiro. */
    static double[] extensao(GeometriaDxf.Desenho desenho) {
        double[] j = {Double.MAX_VALUE, Double.MAX_VALUE, -Double.MAX_VALUE, -Double.MAX_VALUE};
        for (GeometriaDxf.Forma f : desenho.formas()) {
            incluir(j, f.pontos());
        }
        for (GeometriaDxf.TextoDesenho t : desenho.textos()) {
            incluir(j, List.of(new double[]{t.x(), t.y()}));
        }
        return comFolga(j, 0);
    }

    private static void incluir(double[] j, List<double[]> pontos) {
        for (double[] p : pontos) {
            j[0] = Math.min(j[0], p[0]);
            j[1] = Math.min(j[1], p[1]);
            j[2] = Math.max(j[2], p[0]);
            j[3] = Math.max(j[3], p[1]);
        }
    }

    private static double[] comFolga(double[] j, double folga) {
        double cx = (j[0] + j[2]) / 2;
        double cy = (j[1] + j[3]) / 2;
        double largura = Math.max(j[2] - j[0] + 2 * folga, MENOR_LARGURA_M);
        double altura = Math.max(j[3] - j[1] + 2 * folga, MENOR_ALTURA_M);
        return new double[]{cx - largura / 2, cy - altura / 2, cx + largura / 2, cy + altura / 2};
    }
}
