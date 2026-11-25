package com.nexo.app.modules.sst.domain;

import com.nexo.app.shared.domain.exception.InvarianteVioladaException;

import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Opções da APR do app: riscos, medidas de controle e verificações, e quando cada uma é sugerida. Cada item tem um
 * identificador próprio, para o risco apontar as medidas que pede mesmo se o texto for corrigido. A APR lançada grava
 * os textos como foram respondidos, então mudar o cadastro não altera APRs antigas.
 *
 * @param riscos       {@code sugeridoEm}: condições que deixam o risco marcado; {@code medidas}: ids das medidas que
 *                     vêm marcadas junto quando a equipe marca o risco.
 * @param medidas      {@code sugeridaEm}: condições que deixam a medida marcada.
 * @param verificacoes {@code exigidaEm}: condições em que a pergunta aparece; vazia, aparece em todo serviço.
 */
public record EstruturaApr(List<Risco> riscos, List<Medida> medidas, List<Verificacao> verificacoes) {

    public static final int LIMITE_ITENS = 100;
    public static final int LIMITE_TEXTO = 200;

    public EstruturaApr {
        riscos = riscos == null ? List.of() : List.copyOf(riscos);
        medidas = medidas == null ? List.of() : List.copyOf(medidas);
        verificacoes = verificacoes == null ? List.of() : List.copyOf(verificacoes);
    }

    public record Risco(String id, String texto, List<CondicaoApr> sugeridoEm, List<String> medidas) {
        public Risco {
            sugeridoEm = sugeridoEm == null ? List.of() : List.copyOf(sugeridoEm);
            medidas = medidas == null ? List.of() : List.copyOf(medidas);
        }
    }

    public record Medida(String id, String texto, List<CondicaoApr> sugeridaEm) {
        public Medida {
            sugeridaEm = sugeridaEm == null ? List.of() : List.copyOf(sugeridaEm);
        }
    }

    public record Verificacao(String id, String texto, List<CondicaoApr> exigidaEm) {
        public Verificacao {
            exigidaEm = exigidaEm == null ? List.of() : List.copyOf(exigidaEm);
        }
    }

    /** A APR precisa de ao menos um risco, uma medida e uma verificação para a equipe conseguir concluí-la. */
    public void validar() {
        if (riscos.isEmpty()) {
            throw new InvarianteVioladaException("Cadastre ao menos um risco.");
        }
        if (medidas.isEmpty()) {
            throw new InvarianteVioladaException("Cadastre ao menos uma medida de controle.");
        }
        if (verificacoes.isEmpty()) {
            throw new InvarianteVioladaException("Cadastre ao menos uma verificação.");
        }
        Set<String> ids = new HashSet<>();
        lista("risco", riscos.stream().map(r -> new String[]{r.id(), r.texto()}).toList(), ids);
        Set<String> idsMedidas = new HashSet<>();
        lista("medida", medidas.stream().map(m -> new String[]{m.id(), m.texto()}).toList(), idsMedidas);
        lista("verificação", verificacoes.stream().map(v -> new String[]{v.id(), v.texto()}).toList(), ids);
        for (String id : idsMedidas) {
            if (!ids.add(id)) {
                throw new InvarianteVioladaException("Há itens repetidos na APR. Recarregue a página e tente de novo.");
            }
        }
        for (Risco r : riscos) {
            for (String idMedida : r.medidas()) {
                if (!idsMedidas.contains(idMedida)) {
                    throw new InvarianteVioladaException("O risco \"" + r.texto().trim() + "\" aponta uma medida que não existe mais.");
                }
            }
        }
    }

    private static void lista(String nome, List<String[]> itens, Set<String> ids) {
        if (itens.size() > LIMITE_ITENS) {
            throw new InvarianteVioladaException("Cadastre no máximo " + LIMITE_ITENS + " itens de cada lista.");
        }
        Set<String> textos = new HashSet<>();
        for (String[] item : itens) {
            String id = item[0];
            String texto = item[1] == null ? "" : item[1].trim();
            if (id == null || id.isBlank() || !ids.add(id)) {
                throw new InvarianteVioladaException("Há itens repetidos na APR. Recarregue a página e tente de novo.");
            }
            if (texto.isEmpty()) {
                throw new InvarianteVioladaException("Escreva o texto de cada " + nome + ".");
            }
            if (texto.length() > LIMITE_TEXTO) {
                throw new InvarianteVioladaException("Cada " + nome + " tem no máximo " + LIMITE_TEXTO + " caracteres.");
            }
            if (!textos.add(texto.toLowerCase(Locale.ROOT))) {
                throw new InvarianteVioladaException("A " + nome + " \"" + texto + "\" aparece duas vezes.");
            }
        }
    }

    /** Mesma estrutura com os textos sem espaços sobrando. */
    public EstruturaApr normalizada() {
        return new EstruturaApr(
                riscos.stream().map(r -> new Risco(r.id(), limpo(r.texto()), r.sugeridoEm().stream().distinct().toList(),
                        r.medidas().stream().distinct().toList())).toList(),
                medidas.stream().map(m -> new Medida(m.id(), limpo(m.texto()), m.sugeridaEm().stream().distinct().toList())).toList(),
                verificacoes.stream().map(v -> new Verificacao(v.id(), limpo(v.texto()), v.exigidaEm().stream().distinct().toList())).toList());
    }

    private static String limpo(String texto) {
        return texto == null ? null : texto.trim().replaceAll("\\s+", " ");
    }
}
