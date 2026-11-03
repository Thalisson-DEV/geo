package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.exception.InvarianteVioladaException;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Diagrama de pneus do veículo: eixos da frente para trás, cada um simples (2 rodas) ou duplo
 * (4 rodas), e os estepes. Dá o código de cada posição, que é o que o pneu montado guarda.
 *
 * <ul>
 *   <li>eixo simples {@code n}: {@code nE} (esquerda) e {@code nD} (direita);</li>
 *   <li>eixo duplo {@code n}: {@code nEE}, {@code nEI}, {@code nDI}, {@code nDE} (esquerda externa,
 *   esquerda interna, direita interna, direita externa);</li>
 *   <li>estepes: {@code S1}, {@code S2}...</li>
 * </ul>
 */
public record DiagramaPneus(List<TipoEixo> eixos, int estepes) {

    public static final int MAX_EIXOS = 9;
    public static final int MAX_ESTEPES = 4;
    private static final Pattern FORMATO = Pattern.compile("^[SD](,[SD]){0,8}$");

    public enum TipoEixo {
        /** Duas rodas, uma de cada lado. */
        S,
        /** Rodado duplo: quatro rodas, duas de cada lado. */
        D
    }

    public record Posicao(String codigo, int eixo, String rotulo, boolean estepe) {
    }

    public DiagramaPneus {
        if (eixos == null || eixos.isEmpty()) {
            throw new InvarianteVioladaException("O diagrama precisa de ao menos um eixo.");
        }
        if (eixos.size() > MAX_EIXOS) {
            throw new InvarianteVioladaException("O diagrama tem no máximo " + MAX_EIXOS + " eixos.");
        }
        if (estepes < 0 || estepes > MAX_ESTEPES) {
            throw new InvarianteVioladaException("O veículo tem de 0 a " + MAX_ESTEPES + " estepes.");
        }
        eixos = List.copyOf(eixos);
    }

    /** @param texto eixos separados por vírgula, ex.: {@code S,D,D} */
    public static DiagramaPneus de(String texto, int estepes) {
        String normalizado = texto == null ? "" : texto.replace(" ", "").toUpperCase(Locale.ROOT);
        if (!FORMATO.matcher(normalizado).matches()) {
            throw new InvarianteVioladaException("Diagrama inválido: use S (simples) ou D (duplo) por eixo, separados por vírgula.");
        }
        return new DiagramaPneus(Arrays.stream(normalizado.split(",")).map(TipoEixo::valueOf).toList(), estepes);
    }

    public String texto() {
        return String.join(",", eixos.stream().map(Enum::name).toList());
    }

    public List<Posicao> posicoes() {
        List<Posicao> lista = new ArrayList<>();
        for (int i = 0; i < eixos.size(); i++) {
            int n = i + 1;
            if (eixos.get(i) == TipoEixo.S) {
                lista.add(new Posicao(n + "E", n, "Eixo " + n + " esquerda", false));
                lista.add(new Posicao(n + "D", n, "Eixo " + n + " direita", false));
            } else {
                lista.add(new Posicao(n + "EE", n, "Eixo " + n + " esquerda externa", false));
                lista.add(new Posicao(n + "EI", n, "Eixo " + n + " esquerda interna", false));
                lista.add(new Posicao(n + "DI", n, "Eixo " + n + " direita interna", false));
                lista.add(new Posicao(n + "DE", n, "Eixo " + n + " direita externa", false));
            }
        }
        for (int s = 1; s <= estepes; s++) {
            lista.add(new Posicao("S" + s, 0, estepes == 1 ? "Estepe" : "Estepe " + s, true));
        }
        return lista;
    }

    public boolean contem(String codigo) {
        return codigo != null && posicoes().stream().anyMatch(p -> p.codigo().equalsIgnoreCase(codigo));
    }

    public Posicao posicao(String codigo) {
        return posicoes().stream().filter(p -> p.codigo().equalsIgnoreCase(codigo)).findFirst()
                .orElseThrow(() -> new InvarianteVioladaException("A posição " + codigo + " não existe no diagrama do veículo."));
    }

    /** Rótulo legível de um código, mesmo fora de um diagrama (histórico de veículo que mudou de diagrama). */
    public static String rotulo(String codigo) {
        if (codigo == null) {
            return null;
        }
        if (codigo.startsWith("S")) {
            return "Estepe" + (codigo.equals("S1") ? "" : " " + codigo.substring(1));
        }
        String eixo = codigo.replaceAll("\\D", "");
        String lado = codigo.replaceAll("\\d", "");
        String texto = switch (lado) {
            case "E" -> "esquerda";
            case "D" -> "direita";
            case "EE" -> "esquerda externa";
            case "EI" -> "esquerda interna";
            case "DI" -> "direita interna";
            case "DE" -> "direita externa";
            default -> lado;
        };
        return "Eixo " + eixo + " " + texto;
    }
}
