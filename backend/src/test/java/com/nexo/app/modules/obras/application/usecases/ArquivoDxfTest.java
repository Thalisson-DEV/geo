package com.nexo.app.modules.obras.application.usecases;

import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import org.junit.jupiter.api.Test;

import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ArquivoDxfTest {

    /** Monta um DXF a partir de pares código/valor, como o AutoCAD grava (código numa linha, valor na seguinte). */
    static String dxf(String versao, String codepage, String... entidades) {
        StringBuilder s = new StringBuilder();
        s.append("  0\r\nSECTION\r\n  2\r\nHEADER\r\n  9\r\n$ACADVER\r\n  1\r\n").append(versao).append("\r\n");
        if (codepage != null) {
            s.append("  9\r\n$DWGCODEPAGE\r\n  3\r\n").append(codepage).append("\r\n");
        }
        s.append("  0\r\nENDSEC\r\n  0\r\nSECTION\r\n  2\r\nENTITIES\r\n");
        for (String e : entidades) {
            s.append(e);
        }
        s.append("  0\r\nENDSEC\r\n  0\r\nEOF\r\n");
        return s.toString();
    }

    static String pares(Object... codigoValor) {
        StringBuilder s = new StringBuilder();
        for (int i = 0; i < codigoValor.length; i += 2) {
            s.append(String.format("%3s", codigoValor[i])).append("\r\n").append(codigoValor[i + 1]).append("\r\n");
        }
        return s.toString();
    }

    @Test
    void textoJustificadoFicaNoPontoDeAlinhamento() {
        String conteudo = dxf("AC1009", "ANSI_1252",
                pares(0, "TEXT", 8, "TEXTO_PG_NUMERO_PROJ", 1, " 00000003", 50, "0", 40, "1", 10, "0.0", 20, "0.0",
                        11, "500458.23", 21, "8000151.77", 72, "4"),
                pares(0, "TEXT", 8, "NOTA", 1, "SEM ALINHAMENTO", 40, "2", 10, "10.5", 20, "20.5"));

        ArquivoDxf.Desenho d = ArquivoDxf.ler(conteudo.getBytes(StandardCharsets.US_ASCII));

        assertThat(d.textos()).hasSize(2);
        ArquivoDxf.Texto codigo = d.textos().getFirst();
        assertThat(codigo.texto()).isEqualTo("00000003");
        assertThat(codigo.x()).isEqualTo(500458.23);
        assertThat(codigo.y()).isEqualTo(8000151.77);
        assertThat(codigo.ancora()).isEqualTo(0.5);
        assertThat(d.textos().get(1).x()).isEqualTo(10.5);
        assertThat(d.textos().get(1).ancora()).isZero();
    }

    @Test
    void leLinhaPolilinhaLevePolilinhaAntigaEBlocoComAtributos() {
        String conteudo = dxf("AC1015", null,
                pares(0, "LINE", 8, "TRECHO_SECUNDARIO_PROJ", 10, "1", 20, "2", 11, "3", 21, "4"),
                pares(0, "LWPOLYLINE", 8, "TRECHO_PRIMARIO", 90, "3", 70, "1", 10, "0", 20, "0", 10, "10", 20, "0", 10, "10", 20, "5"),
                pares(0, "POLYLINE", 8, "TRECHO_PRIMARIO_PROJ", 66, "1", 70, "0"),
                pares(0, "VERTEX", 8, "TRECHO_PRIMARIO_PROJ", 10, "5", 20, "5"),
                pares(0, "VERTEX", 8, "TRECHO_PRIMARIO_PROJ", 10, "6", 20, "7"),
                pares(0, "SEQEND", 8, "TRECHO_PRIMARIO_PROJ"),
                pares(0, "INSERT", 8, "PONTO_GEOGRAFICO", 2, "POSTE", 10, "100", 20, "200", 50, "45", 66, "1"),
                pares(0, "ATTRIB", 8, "PONTO_GEOGRAFICO", 2, "codigo", 1, "10000035", 10, "100", 20, "200"),
                pares(0, "SEQEND", 8, "PONTO_GEOGRAFICO"));

        ArquivoDxf.Desenho d = ArquivoDxf.ler(conteudo.getBytes(StandardCharsets.UTF_8));

        assertThat(d.tracos()).hasSize(3);
        assertThat(d.tracos().get(0).vertices()).hasSize(2);
        // Polilinha fechada volta ao primeiro vértice.
        assertThat(d.tracos().get(1).vertices()).hasSize(4);
        assertThat(d.tracos().get(2).camada()).isEqualTo("TRECHO_PRIMARIO_PROJ");
        assertThat(d.tracos().get(2).vertices()).extracting(v -> v[0]).containsExactly(5.0, 6.0);
        assertThat(d.insercoes()).singleElement().satisfies(i -> {
            assertThat(i.bloco()).isEqualTo("POSTE");
            assertThat(i.rotacao()).isEqualTo(45);
            assertThat(i.atributos()).containsEntry("CODIGO", "10000035");
        });
    }

    @Test
    void textoMultilinhaPerdeOsCodigosDeFormatacao() {
        String conteudo = dxf("AC1018", null,
                pares(0, "MTEXT", 8, "TEXTO_PROJ", 10, "1", 20, "2", 40, "1.5", 71, "5",
                        3, "{\\fArial|b1;LIMPEZA DE FAIXA}", 1, "\\PE PODA"));

        ArquivoDxf.Texto t = ArquivoDxf.ler(conteudo.getBytes(StandardCharsets.UTF_8)).textos().getFirst();

        assertThat(t.texto()).isEqualTo("LIMPEZA DE FAIXA E PODA");
        assertThat(t.ancora()).isEqualTo(0.5);
    }

    @Test
    void codificacaoSaiDoConteudoQuandoOCabecalhoDizOutra() {
        String texto = pares(0, "TEXT", 8, "TEXTO_IT_PROJ", 1, "0000123-Chave Fusível-ABC-6K", 10, "1", 20, "1");
        // Gravado em UTF-8 apesar do cabeçalho ANSI_1252 (acontece em DXF exportado pelo GeoRede).
        byte[] utf8 = dxf("AC1009", "ANSI_1252", texto).getBytes(StandardCharsets.UTF_8);
        // Gravado de fato em Windows-1252.
        byte[] ansi = dxf("AC1009", "ANSI_1252", texto).getBytes(Charset.forName("windows-1252"));

        assertThat(ArquivoDxf.ler(utf8).textos().getFirst().texto()).isEqualTo("0000123-Chave Fusível-ABC-6K");
        assertThat(ArquivoDxf.ler(ansi).textos().getFirst().texto()).isEqualTo("0000123-Chave Fusível-ABC-6K");
    }

    @Test
    void codigosDeControleDoAutocadViramOsSimbolos() {
        assertThat(ArquivoDxf.limparTexto("%%c35 %%d \\U+00B2")).isEqualTo("Ø35 ° ²");
    }

    @Test
    void dxfBinarioOuArquivoQueNaoEDxfSaoRecusadosComMensagemClara() {
        byte[] binario = "AutoCAD Binary DXF\r\n\u001a\u0000".getBytes(StandardCharsets.ISO_8859_1);
        assertThatThrownBy(() -> ArquivoDxf.ler(binario))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("binário");
        assertThatThrownBy(() -> ArquivoDxf.ler("isto não é um DXF".getBytes(StandardCharsets.UTF_8)))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("não é um DXF");
    }
}
