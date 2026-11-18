package com.nexo.app.modules.sst.domain;

import com.fasterxml.jackson.annotation.JsonBackReference;
import com.fasterxml.jackson.annotation.JsonManagedReference;
import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Pergunta de um {@link GrupoPergunta}. Define o enunciado, o tipo de resposta
 * esperado e — para tipos objetivos — as opções de resposta possíveis.
 */
@Entity
@Table(name = "perguntas_inspecao")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Pergunta extends BaseEntity {

    @JsonBackReference
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_grupo", nullable = false)
    private GrupoPergunta grupo;

    @NotBlank
    @Column(name = "enunciado", nullable = false, length = 500)
    private String enunciado;

    @Enumerated(EnumType.STRING)
    @Column(name = "tipo_resposta", nullable = false, length = 20)
    private TipoResposta tipoResposta;

    @Column(name = "obrigatoria", nullable = false)
    private boolean obrigatoria;

    @Column(name = "ordem", nullable = false)
    private int ordem;

    /** Quantidade esperada ou observação do item ("IND", "5", "Por escada"), mostrada abaixo do enunciado. */
    @Column(name = "orientacao", length = 300)
    private String orientacao;

    /**
     * Verdadeiro quando o desvio gerado aponta quem o cometeu (EPI, conduta).
     * Falso para itens da equipe ou do veículo (pneu, extintor, ferramenta): o
     * desvio pode ser lançado sem colaborador.
     */
    @Column(name = "desvio_por_colaborador", nullable = false)
    private boolean desvioPorColaborador = true;

    @JsonManagedReference
    @OrderBy("ordem ASC")
    @OneToMany(mappedBy = "pergunta", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<OpcaoResposta> opcoes = new ArrayList<>();

    Pergunta(GrupoPergunta grupo, String enunciado, TipoResposta tipoResposta, boolean obrigatoria, int ordem) {
        this(grupo, enunciado, tipoResposta, obrigatoria, ordem, null, true);
    }

    Pergunta(GrupoPergunta grupo, String enunciado, TipoResposta tipoResposta, boolean obrigatoria, int ordem,
             String orientacao, boolean desvioPorColaborador) {
        this.grupo = Objects.requireNonNull(grupo, "Grupo é obrigatório");
        this.enunciado = exigirEnunciado(enunciado);
        this.tipoResposta = Objects.requireNonNull(tipoResposta, "Tipo de resposta é obrigatório");
        this.obrigatoria = obrigatoria;
        this.ordem = ordem;
        this.orientacao = normalizarOrientacao(orientacao);
        this.desvioPorColaborador = desvioPorColaborador;
    }

    /**
     * Adiciona uma opção de resposta. Só é permitido para perguntas objetivas
     * (cujo tipo admite opções). A marcação {@code geraDesvio} indica que escolher
     * esta opção em uma inspeção configura uma não-conformidade; nesse caso a
     * {@code gravidade} (grau do desvio) é obrigatória e fica pré-definida no formulário.
     */
    public OpcaoResposta adicionarOpcao(String texto, boolean geraDesvio, GravidadeDesvio gravidade) {
        return adicionarOpcao(texto, geraDesvio, gravidade, false);
    }

    public OpcaoResposta adicionarOpcao(String texto, boolean geraDesvio, GravidadeDesvio gravidade, boolean padrao) {
        if (!tipoResposta.permiteOpcoes()) {
            throw new InvarianteVioladaException(
                    "A pergunta do tipo " + tipoResposta + " não admite opções de resposta.");
        }
        if (padrao && tipoResposta == TipoResposta.MULTIPLA_ESCOLHA && opcoes.stream().anyMatch(OpcaoResposta::isPadrao)) {
            throw new InvarianteVioladaException(
                    "A pergunta de múltipla escolha '" + enunciado + "' já possui uma opção padrão definida.");
        }
        OpcaoResposta opcao = new OpcaoResposta(this, texto, geraDesvio, gravidade, padrao, opcoes.size());
        this.opcoes.add(opcao);
        return opcao;
    }

    void atualizarOrdem(int ordem) {
        this.ordem = ordem;
    }

    /**
     * Reordena as opções da pergunta conforme a lista de IDs informada (permutação
     * exata das opções existentes), preservando os IDs.
     */
    void reordenarOpcoes(List<UUID> idsNaOrdem) {
        ReordenacaoValidator.validarPermutacao(
                opcoes.stream().map(OpcaoResposta::getId).toList(), idsNaOrdem, "opções");

        Map<UUID, OpcaoResposta> porId = opcoes.stream()
                .collect(Collectors.toMap(OpcaoResposta::getId, Function.identity()));
        for (int i = 0; i < idsNaOrdem.size(); i++) {
            porId.get(idsNaOrdem.get(i)).atualizarOrdem(i);
        }
        opcoes.sort(Comparator.comparingInt(OpcaoResposta::getOrdem));
    }

    private static String normalizarOrientacao(String orientacao) {
        if (orientacao == null || orientacao.isBlank()) {
            return null;
        }
        String limpa = orientacao.strip();
        if (limpa.length() > 300) {
            throw new InvarianteVioladaException("A orientação da pergunta deve ter no máximo 300 caracteres.");
        }
        return limpa;
    }

    private static String exigirEnunciado(String enunciado) {
        if (enunciado == null || enunciado.isBlank()) {
            throw new InvarianteVioladaException("O enunciado da pergunta é obrigatório.");
        }
        return enunciado;
    }
}
