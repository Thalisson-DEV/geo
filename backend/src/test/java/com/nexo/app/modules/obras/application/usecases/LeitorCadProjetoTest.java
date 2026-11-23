package com.nexo.app.modules.obras.application.usecases;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import static com.nexo.app.modules.obras.application.usecases.ArquivoDxfTest.dxf;
import static com.nexo.app.modules.obras.application.usecases.ArquivoDxfTest.pares;
import static org.assertj.core.api.Assertions.assertThat;

class LeitorCadProjetoTest {

    private final LeitorCadProjeto leitor = new LeitorCadProjeto();

    /** Texto centralizado, como o GeoRede grava os rótulos. */
    private static String texto(String camada, String valor, double x, double y, double rotacao) {
        return pares(0, "TEXT", 8, camada, 1, " " + valor, 50, rotacao, 40, "1", 10, "0.0", 20, "0.0", 11, x, 21, y, 72, "4");
    }

    private static String poste(String camada, double x, double y) {
        return pares(0, "INSERT", 8, camada, 2, "002F", 10, x, 20, y, 50, "0");
    }

    private static String linha(String camada, double x1, double y1, double x2, double y2) {
        return pares(0, "LINE", 8, camada, 10, x1, 20, y1, 11, x2, 21, y2);
    }

    /**
     * Rótulo do GeoRede: código em cima e as linhas seguintes 2,5 m abaixo, alinhadas à esquerda; a coordenada fecha a
     * pilha. {@code linhas} vem em pares camada/texto.
     */
    private static List<String> rotulo(String camadaNumero, String codigo, double x, double y, double leste, double norte, String... linhas) {
        List<String> textos = new ArrayList<>();
        double esquerda = x - codigo.length() * 0.4;
        textos.add(texto(camadaNumero, codigo, x, y, 0));
        int linha = 1;
        for (int i = 0; i < linhas.length; i += 2) {
            textos.add(texto(linhas[i], linhas[i + 1], esquerda + linhas[i + 1].length() * 0.4, y - 2.5 * linha, 0));
            linha++;
        }
        String coordenada = Math.round(leste) + " / " + Math.round(norte);
        textos.add(texto(camadaNumero.endsWith("_PROJ") ? "TEXTO_PG_COORD_PROJ" : "TEXTO_PG_COORD", coordenada,
                esquerda + coordenada.length() * 0.4, y - 2.5 * linha, 0));
        return textos;
    }

    /**
     * Ramal novo saindo de um poste existente (10000035, que ganha S3I e perde S3A) para dois postes novos. O primeiro
     * vão vem em dois pedaços de linha; o segundo traz a cota escrita, que confere com o comprimento.
     */
    private static byte[] projeto() {
        List<String> e = new ArrayList<>();
        e.add(poste("PONTO_GEOGRAFICO", 500477, 8000106));
        e.add(poste("PONTO_GEOGRAFICO_PROJ", 500475, 8000136));
        e.add(poste("PONTO_GEOGRAFICO_PROJ", 500445, 8000156));
        e.add(poste("PONTO_GEOGRAFICO", 500600, 8000300));
        e.addAll(rotulo("TEXTO_PG_NUMERO", "10000035", 500485, 8000103, 500477, 8000106,
                "TEXTO_PG", "DT 9/300", "TEXTO_PG_ESTRUTURA_SEC_PROJ", "S3I"));
        e.add(texto("TEXTO_PG_ESTRUTURA_SEC_RETI", "S3A", 500488, 8000098, 0));
        e.addAll(rotulo("TEXTO_PG_NUMERO_PROJ", "00000008", 500484, 8000144, 500475, 8000136,
                "TEXTO_PG_PROJ", "DT 9/300", "TEXTO_PG_ESTRUTURA_SEC_PROJ", "S4I"));
        e.addAll(rotulo("TEXTO_PG_NUMERO_PROJ", "00000003", 500452, 8000165, 500445, 8000156,
                "TEXTO_PG_PROJ", "DT 9/300", "TEXTO_PG_ESTRUTURA_SEC_PROJ", "S1I"));
        e.addAll(rotulo("TEXTO_PG_NUMERO", "900008", 500610, 8000308, 500600, 8000300, "TEXTO_PG", "150/9"));
        // Vão 10000035 → 00000008 em dois pedaços, terminando na cruzeta (a 1 m do centro do poste).
        e.add(linha("TRECHO_SECUNDARIO_PROJ", 500478, 8000107, 500476.5, 8000120));
        e.add(linha("TRECHO_SECUNDARIO_PROJ", 500476.5, 8000120, 500475.5, 8000135));
        // Vão 00000008 → 00000003 (36 m) com a cota escrita ao longo dele.
        e.add(linha("TRECHO_SECUNDARIO_PROJ", 500474.5, 8000136.5, 500445.5, 8000155.5));
        e.add(texto("TEXTO_TS_PROJ", "36m AN 1 #35(35) MULT", 500460, 8000148, -33.7));
        // Rede existente sem mudança: não entra na obra.
        e.add(linha("TRECHO_PRIMARIO", 500477, 8000106, 500600, 8000300));
        return dxf("AC1009", "ANSI_1252", e.toArray(String[]::new)).getBytes(StandardCharsets.UTF_8);
    }

    @Test
    void leOProjetoPelasCamadasSemAdivinhar() {
        LeitorCadProjeto.ProjetoCad projeto = leitor.interpretar(projeto()).orElseThrow();

        assertThat(projeto.perfil()).isEqualTo("GeoRede");
        assertThat(projeto.postes()).extracting(p -> p.codigo).containsExactlyInAnyOrder("10000035", "00000008", "00000003", "900008");
        assertThat(projeto.pontos()).extracting(p -> p.codigo).containsExactlyInAnyOrder("10000035", "00000008", "00000003");

        LeitorCadProjeto.PosteCad existente = projeto.pontos().stream().filter(p -> p.codigo.equals("10000035")).findFirst().orElseThrow();
        assertThat(existente.novas).containsExactly("S3I");
        assertThat(existente.retirar).containsExactly("S3A");
        assertThat(existente.projetado).isFalse();
        assertThat(existente.pelaCoordenada).isTrue();

        LeitorCadProjeto.PosteCad novo = projeto.pontos().stream().filter(p -> p.codigo.equals("00000008")).findFirst().orElseThrow();
        assertThat(novo.projetado).isTrue();
        assertThat(novo.poste).isEqualTo("DT 9/300");
        assertThat(novo.novas).containsExactly("S4I");

        assertThat(projeto.vaos()).hasSize(2);
        LeitorCadProjeto.VaoCad emDoisPedacos = projeto.vaos().stream()
                .filter(v -> v.a.codigo.equals("10000035") || v.b.codigo.equals("10000035")).findFirst().orElseThrow();
        // Sem cota escrita: a metragem é medida de poste a poste nas coordenadas do campo (30 m), não pelas pontas
        // desenhadas, que param na cruzeta.
        assertThat(emDoisPedacos.metragem).isEqualTo(30.0);
        assertThat(emDoisPedacos.medida).isTrue();
        LeitorCadProjeto.VaoCad comCota = projeto.vaos().stream()
                .filter(v -> v.a.codigo.equals("00000003") || v.b.codigo.equals("00000003")).findFirst().orElseThrow();
        assertThat(comCota.metragem).isEqualTo(36.0);
        assertThat(comCota.medida).isFalse();
        assertThat(comCota.condutor).isEqualTo("AN 1 #35(35) MULT");
    }

    @Test
    void poeOProjetoNaFolhaPelaGeorreferenciaENumeraPelaRede() throws Exception {
        LeitorCadProjeto.ProjetoCad projeto = leitor.interpretar(projeto()).orElseThrow();
        // Folha A4 em 1:1000 com o canto superior esquerdo em (500400, 8000200).
        double mpp = 0.0254 / 72 * 1000;
        List<double[]> utm = List.of(new double[]{500400, 8000200}, new double[]{500600, 8000000}, new double[]{500500, 8000100});
        List<double[]> folha = utm.stream().map(u -> new double[]{(u[0] - 500400) / mpp, (8000200 - u[1]) / mpp}).toList();
        LeitorVetorialProjeto.Georreferencia geo = LeitorVetorialProjeto.Georreferencia.ajustar(utm, folha, 595, 842).orElseThrow();

        LeitorCadProjeto.Leitura leitura = leitor.naFolha(projeto, geo);

        assertThat(leitura.pontos()).isEqualTo(3);
        assertThat(leitura.vaos()).isEqualTo(2);
        assertThat(leitura.escala()).isEqualTo(1000);
        JsonNode json = new ObjectMapper().readTree(leitura.json());
        JsonNode primeiro = null;
        for (JsonNode p : json.path("pontos")) {
            if (p.path("ordem").asInt() == 1) {
                primeiro = p;
            }
        }
        // A numeração começa no poste existente de onde o ramal sai.
        assertThat(primeiro.path("barramento").asText()).isEqualTo("10000035");
        assertThat(primeiro.path("x").asDouble()).isCloseTo((500477 - 500400) / mpp / 595, org.assertj.core.data.Offset.offset(0.001));
        assertThat(primeiro.path("y").asDouble()).isCloseTo((8000200 - 8000106) / mpp / 842, org.assertj.core.data.Offset.offset(0.001));
        assertThat(primeiro.path("estruturas").toString()).contains("S3I", "Retirar: S3A");
    }

    @Test
    void pontoForaDaFolhaFicaDeForaEContado() {
        LeitorCadProjeto.ProjetoCad projeto = leitor.interpretar(projeto()).orElseThrow();
        // Folha estreita em 1:300, de 500440 a cerca de 500458 de leste: só o poste 00000003 (500445) cabe nela.
        double mpp = 0.0254 / 72 * 300;
        List<double[]> utm = List.of(new double[]{500440, 8000200}, new double[]{500500, 8000100}, new double[]{500450, 8000150});
        List<double[]> folha = utm.stream().map(u -> new double[]{(u[0] - 500440) / mpp, (8000200 - u[1]) / mpp}).toList();
        LeitorVetorialProjeto.Georreferencia geo = LeitorVetorialProjeto.Georreferencia.ajustar(utm, folha, 170, 842).orElseThrow();

        LeitorCadProjeto.Leitura leitura = leitor.naFolha(projeto, geo);

        assertThat(leitura.pontos()).isEqualTo(1);
        assertThat(leitura.foraDaFolha()).isEqualTo(2);
        assertThat(leitura.vaos()).isZero();
    }

    @Test
    void dxfComCamadasDesconhecidasNaoEInterpretado() {
        byte[] outro = dxf("AC1015", null, linha("REDE", 0, 0, 10, 10), texto("NOTAS", "QUALQUER", 1, 1, 0))
                .getBytes(StandardCharsets.UTF_8);
        assertThat(leitor.interpretar(outro)).isEmpty();
    }
}
