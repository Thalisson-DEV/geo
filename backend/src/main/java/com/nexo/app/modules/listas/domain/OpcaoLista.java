package com.nexo.app.modules.listas.domain;

import com.nexo.app.modules.listas.ListaConfiguravel;
import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.text.Normalizer;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

/**
 * Uma opção de uma lista configurável. O código nasce do rótulo e não muda, porque é o que os registros guardam; o
 * rótulo pode ser corrigido a qualquer momento. Opção marcada como do sistema é usada por alguma regra (ex.: "Outro"
 * exige descrição) e não pode ser desativada.
 */
@Entity
@Table(name = "opcoes_lista")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OpcaoLista extends BaseEntity {

    public static final int LIMITE_CODIGO = 30;
    public static final int LIMITE_ROTULO = 80;

    @Enumerated(EnumType.STRING)
    @Column(name = "lista", nullable = false, length = 40, updatable = false)
    private ListaConfiguravel lista;

    @Column(name = "codigo", nullable = false, length = LIMITE_CODIGO, updatable = false)
    private String codigo;

    @Column(name = "rotulo", nullable = false, length = LIMITE_ROTULO)
    private String rotulo;

    @Column(name = "descricao", length = 255)
    private String descricao;

    @Column(name = "ordem", nullable = false)
    private int ordem;

    @Column(name = "sistema", nullable = false, updatable = false)
    private boolean sistema;

    /** Contextos em que a opção vale, separados por vírgula; vazio, vale em todos. */
    @Column(name = "contextos", length = 200)
    private String contextos;

    public OpcaoLista(ListaConfiguravel lista, String rotulo, String descricao, int ordem) {
        this.lista = Objects.requireNonNull(lista);
        this.rotulo = rotuloValido(rotulo);
        this.codigo = codigoDe(this.rotulo);
        this.descricao = limpo(descricao);
        this.ordem = ordem;
    }

    public void atualizar(String rotulo, String descricao) {
        if (!isAtivo()) {
            throw new InvarianteVioladaException("Reative a opção antes de alterá-la.");
        }
        this.rotulo = rotuloValido(rotulo);
        this.descricao = limpo(descricao);
    }

    /** Marca onde a opção vale (ex.: só na baixa avulsa); só aceita os contextos que a lista tem. */
    public void definirContextos(List<String> codigos) {
        List<String> limpos = codigos == null ? List.of() : codigos.stream().filter(c -> c != null && !c.isBlank())
                .map(String::trim).distinct().toList();
        for (String c : limpos) {
            if (!lista.temContexto(c)) {
                throw new InvarianteVioladaException("\"" + c + "\" não é um uso válido para " + lista.rotulo().toLowerCase(Locale.ROOT) + ".");
            }
        }
        this.contextos = limpos.isEmpty() ? null : String.join(",", limpos);
    }

    public List<String> getContextos() {
        return contextos == null || contextos.isBlank() ? List.of() : List.of(contextos.split(","));
    }

    public boolean valeEm(String contexto) {
        return getContextos().isEmpty() || getContextos().contains(contexto);
    }

    public void posicionar(int ordem) {
        this.ordem = ordem;
    }

    @Override
    public void desativar() {
        if (sistema) {
            throw new InvarianteVioladaException("\"" + rotulo + "\" é usada por uma regra do sistema e não pode ser desativada. Você pode mudar o nome.");
        }
        super.desativar();
    }

    private static String rotuloValido(String rotulo) {
        String r = limpo(rotulo);
        if (r == null) {
            throw new InvarianteVioladaException("Informe o nome da opção.");
        }
        if (r.length() > LIMITE_ROTULO) {
            throw new InvarianteVioladaException("O nome da opção tem no máximo " + LIMITE_ROTULO + " caracteres.");
        }
        return r;
    }

    private static String limpo(String texto) {
        if (texto == null || texto.isBlank()) {
            return null;
        }
        return texto.trim().replaceAll("\\s+", " ");
    }

    /** "Obra já executada por terceiros" vira OBRA_JA_EXECUTADA_POR_TERCEIROS (até 30 caracteres). */
    public static String codigoDe(String rotulo) {
        String semAcento = Normalizer.normalize(rotulo, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        String codigo = semAcento.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]+", "_").replaceAll("(^_+)|(_+$)", "");
        if (codigo.isEmpty()) {
            throw new InvarianteVioladaException("O nome da opção precisa ter letras ou números.");
        }
        return codigo.length() > LIMITE_CODIGO ? codigo.substring(0, LIMITE_CODIGO).replaceAll("_+$", "") : codigo;
    }
}
