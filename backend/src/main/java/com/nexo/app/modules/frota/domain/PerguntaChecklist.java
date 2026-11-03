package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Pergunta de um modelo de checklist. Não é apagada: as respostas antigas a referenciam,
 * então sai do modelo por desativação.
 */
@Entity
@Table(name = "frota_checklist_perguntas")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PerguntaChecklist extends BaseEntity {

    private static final int MINIMO_OPCOES = 2;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_modelo", nullable = false, updatable = false)
    private ModeloChecklist modelo;

    @Column(name = "ordem", nullable = false)
    private int ordem;

    @Column(name = "grupo", length = 80)
    private String grupo;

    @Column(name = "texto", nullable = false, length = 300)
    private String texto;

    @Enumerated(EnumType.STRING)
    @Column(name = "tipo_resposta", nullable = false, length = 20)
    private TipoRespostaChecklist tipoResposta;

    /** Coluna antiga, mantida em sincronia com {@link #modoFoto} até ser removida. */
    @Column(name = "foto_no_nao_ok", nullable = false)
    private boolean fotoNoNaoOk;

    @Enumerated(EnumType.STRING)
    @Column(name = "modo_foto", nullable = false, length = 10)
    private ModoFotoPergunta modoFoto = ModoFotoPergunta.NUNCA;

    @OneToMany(mappedBy = "pergunta", cascade = CascadeType.ALL)
    @OrderBy("ordem ASC")
    private List<AlternativaChecklist> alternativas = new ArrayList<>();

    PerguntaChecklist(ModeloChecklist modelo) {
        this.modelo = modelo;
    }

    void preencher(int ordem, ModeloChecklist.DadosPergunta dados) {
        if (dados.tipoResposta() == null) {
            throw new InvarianteVioladaException("Informe o tipo de resposta da pergunta.");
        }
        this.ordem = ordem;
        this.grupo = Textos.opcional(dados.grupo(), 80);
        this.texto = Textos.obrigatorio(dados.texto(), "texto da pergunta", 300);
        this.tipoResposta = dados.tipoResposta();
        var modo = dados.modoFoto() == null ? ModoFotoPergunta.NUNCA : dados.modoFoto();
        // Foto no Não OK só existe em pergunta OK/Não OK.
        this.modoFoto = modo == ModoFotoPergunta.NAO_OK && tipoResposta != TipoRespostaChecklist.OK_NOK ? ModoFotoPergunta.NUNCA : modo;
        this.fotoNoNaoOk = modoFoto == ModoFotoPergunta.NAO_OK;

        var opcoes = tipoResposta == TipoRespostaChecklist.OPCOES ? listaOuVazia(dados.opcoes()) : List.<ModeloChecklist.DadosAlternativa>of();
        var motivos = tipoResposta == TipoRespostaChecklist.OK_NOK ? listaOuVazia(dados.motivos()) : List.<ModeloChecklist.DadosAlternativa>of();
        if (tipoResposta == TipoRespostaChecklist.OPCOES && opcoes.size() < MINIMO_OPCOES) {
            throw new InvarianteVioladaException("A pergunta \"" + texto + "\" precisa de pelo menos " + MINIMO_OPCOES + " opções.");
        }
        sincronizar(TipoAlternativaChecklist.OPCAO, opcoes);
        sincronizar(TipoAlternativaChecklist.MOTIVO, motivos);
    }

    /** Alternativas em uso, na ordem. */
    public List<AlternativaChecklist> alternativasAtivas(TipoAlternativaChecklist tipo) {
        return alternativas.stream().filter(a -> a.isAtivo() && a.getTipo() == tipo)
                .sorted(Comparator.comparingInt(AlternativaChecklist::getOrdem)).toList();
    }

    public Optional<AlternativaChecklist> alternativa(UUID id) {
        return alternativas.stream().filter(a -> a.getId() != null && a.getId().equals(id)).findFirst();
    }

    private void sincronizar(TipoAlternativaChecklist tipo, List<ModeloChecklist.DadosAlternativa> dados) {
        var mantidas = new ArrayList<AlternativaChecklist>();
        for (int i = 0; i < dados.size(); i++) {
            var d = dados.get(i);
            var alternativa = d.id() == null ? null : alternativas.stream()
                    .filter(a -> d.id().equals(a.getId()) && a.getTipo() == tipo)
                    .findFirst().orElse(null);
            if (alternativa == null) {
                alternativa = new AlternativaChecklist(this, tipo);
                alternativas.add(alternativa);
            } else if (!alternativa.isAtivo()) {
                alternativa.ativar();
            }
            alternativa.preencher(i, d.texto(), d.indicaProblema());
            mantidas.add(alternativa);
        }
        alternativas.stream()
                .filter(a -> a.getTipo() == tipo && a.isAtivo() && !mantidas.contains(a))
                .forEach(AlternativaChecklist::desativar);
    }

    private static <T> List<T> listaOuVazia(List<T> lista) {
        return lista == null ? List.of() : lista;
    }
}
