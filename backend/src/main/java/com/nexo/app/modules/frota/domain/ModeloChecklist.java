package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.CascadeType;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Modelo de checklist. O principal vale para os tipos de veículo informados (vazio = todos);
 * o adicional soma perguntas quando um implemento do tipo informado está acoplado.
 * <p>
 * Editar o modelo não reescreve checklists antigos: a resposta copia o texto da pergunta,
 * e pergunta ou alternativa retirada é desativada, não apagada.
 */
@Entity
@Table(name = "frota_checklist_modelos")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ModeloChecklist extends BaseEntity {

    @Column(name = "nome", nullable = false, length = 120)
    private String nome;

    @Enumerated(EnumType.STRING)
    @Column(name = "tipo", nullable = false, length = 20)
    private TipoModeloChecklist tipo;

    @Column(name = "instrucoes", length = 2000)
    private String instrucoes;

    @Column(name = "exige_assinatura", nullable = false)
    private boolean exigeAssinatura;

    @ElementCollection
    @CollectionTable(name = "frota_checklist_modelo_tipos_veiculo", joinColumns = @JoinColumn(name = "id_modelo"))
    @Column(name = "id_tipo_veiculo", nullable = false)
    private Set<UUID> idsTiposVeiculo = new HashSet<>();

    @ElementCollection
    @CollectionTable(name = "frota_checklist_modelo_tipos_implemento", joinColumns = @JoinColumn(name = "id_modelo"))
    @Column(name = "id_tipo_implemento", nullable = false)
    private Set<UUID> idsTiposImplemento = new HashSet<>();

    @OneToMany(mappedBy = "modelo", cascade = CascadeType.ALL)
    @OrderBy("ordem ASC")
    private List<PerguntaChecklist> perguntas = new ArrayList<>();

    @OneToMany(mappedBy = "modelo", cascade = CascadeType.ALL)
    @OrderBy("ordem ASC")
    private List<FotoRecebimentoChecklist> fotosRecebimento = new ArrayList<>();

    public record Dados(
            String nome,
            TipoModeloChecklist tipo,
            String instrucoes,
            boolean exigeAssinatura,
            Set<UUID> idsTiposVeiculo,
            Set<UUID> idsTiposImplemento,
            List<DadosPergunta> perguntas,
            List<DadosFotoRecebimento> fotosRecebimento) {
    }

    /** {@code id} nulo cria a pergunta; o id de uma existente a mantém (e o histórico ligado a ela). */
    public record DadosPergunta(
            UUID id,
            String grupo,
            String texto,
            TipoRespostaChecklist tipoResposta,
            ModoFotoPergunta modoFoto,
            List<DadosAlternativa> opcoes,
            List<DadosAlternativa> motivos) {
    }

    public record DadosAlternativa(UUID id, String texto, boolean indicaProblema) {
    }

    public record DadosFotoRecebimento(UUID id, String descricao) {
    }

    public ModeloChecklist(Dados dados) {
        preencher(dados);
    }

    public void atualizar(Dados dados) {
        if (!isAtivo()) {
            throw new InvarianteVioladaException("Não é possível alterar um modelo de checklist desativado.");
        }
        preencher(dados);
    }

    /** Perguntas em uso, na ordem. */
    public List<PerguntaChecklist> perguntasAtivas() {
        return perguntas.stream().filter(PerguntaChecklist::isAtivo)
                .sorted(Comparator.comparingInt(PerguntaChecklist::getOrdem)).toList();
    }

    public List<FotoRecebimentoChecklist> fotosRecebimentoAtivas() {
        return fotosRecebimento.stream().filter(FotoRecebimentoChecklist::isAtivo)
                .sorted(Comparator.comparingInt(FotoRecebimentoChecklist::getOrdem)).toList();
    }

    /** Inclui perguntas desativadas: o app pode enviar um checklist preenchido antes da edição. */
    public Optional<PerguntaChecklist> pergunta(UUID id) {
        return perguntas.stream().filter(p -> p.getId() != null && p.getId().equals(id)).findFirst();
    }

    public Optional<FotoRecebimentoChecklist> fotoRecebimento(UUID id) {
        return fotosRecebimento.stream().filter(f -> f.getId() != null && f.getId().equals(id)).findFirst();
    }

    /** Principal que vale para o tipo de veículo (sem tipos definidos vale para todos). */
    public boolean aplicaAoTipoVeiculo(UUID idTipoVeiculo) {
        return tipo == TipoModeloChecklist.PRINCIPAL
                && (idsTiposVeiculo.isEmpty() || (idTipoVeiculo != null && idsTiposVeiculo.contains(idTipoVeiculo)));
    }

    /** Adicional que vale quando algum implemento acoplado é de um dos tipos do modelo. */
    public boolean aplicaAosImplementos(Set<UUID> idsTiposImplementoAcoplados) {
        return tipo == TipoModeloChecklist.ADICIONAL
                && idsTiposImplementoAcoplados.stream().anyMatch(idsTiposImplemento::contains);
    }

    /** Principal com tipos de veículo definidos ganha do genérico na escolha do modelo. */
    public boolean isEspecifico() {
        return !idsTiposVeiculo.isEmpty();
    }

    private void preencher(Dados dados) {
        if (dados.tipo() == null) {
            throw new InvarianteVioladaException("Informe se o modelo é principal ou adicional.");
        }
        var tiposVeiculo = dados.idsTiposVeiculo() == null ? Set.<UUID>of() : dados.idsTiposVeiculo();
        var tiposImplemento = dados.idsTiposImplemento() == null ? Set.<UUID>of() : dados.idsTiposImplemento();
        if (dados.tipo() == TipoModeloChecklist.ADICIONAL && tiposImplemento.isEmpty()) {
            throw new InvarianteVioladaException("Informe os tipos de implemento a que o modelo adicional se aplica.");
        }
        if (dados.tipo() == TipoModeloChecklist.ADICIONAL && !tiposVeiculo.isEmpty()) {
            throw new InvarianteVioladaException("O modelo adicional vale pelo implemento; não informe tipos de veículo.");
        }
        if (dados.tipo() == TipoModeloChecklist.PRINCIPAL && !tiposImplemento.isEmpty()) {
            throw new InvarianteVioladaException("O modelo principal vale pelo tipo de veículo; use um modelo adicional para o implemento.");
        }
        if (dados.perguntas() == null || dados.perguntas().isEmpty()) {
            throw new InvarianteVioladaException("Inclua pelo menos uma pergunta no modelo.");
        }
        this.nome = Textos.obrigatorio(dados.nome(), "nome do modelo", 120);
        this.tipo = dados.tipo();
        this.instrucoes = Textos.opcional(dados.instrucoes(), 2000);
        this.exigeAssinatura = dados.exigeAssinatura();
        this.idsTiposVeiculo.clear();
        this.idsTiposVeiculo.addAll(tiposVeiculo);
        this.idsTiposImplemento.clear();
        this.idsTiposImplemento.addAll(tiposImplemento);
        sincronizarPerguntas(dados.perguntas());
        sincronizarFotos(dados.fotosRecebimento() == null ? List.of() : dados.fotosRecebimento());
    }

    private void sincronizarPerguntas(List<DadosPergunta> dados) {
        var mantidas = new ArrayList<PerguntaChecklist>();
        for (int i = 0; i < dados.size(); i++) {
            var d = dados.get(i);
            var pergunta = d.id() == null ? null : pergunta(d.id()).orElse(null);
            if (pergunta == null) {
                pergunta = new PerguntaChecklist(this);
                perguntas.add(pergunta);
            } else if (!pergunta.isAtivo()) {
                pergunta.ativar();
            }
            pergunta.preencher(i, d);
            mantidas.add(pergunta);
        }
        perguntas.stream().filter(p -> p.isAtivo() && !mantidas.contains(p)).forEach(PerguntaChecklist::desativar);
    }

    private void sincronizarFotos(List<DadosFotoRecebimento> dados) {
        var mantidas = new ArrayList<FotoRecebimentoChecklist>();
        for (int i = 0; i < dados.size(); i++) {
            var d = dados.get(i);
            var foto = d.id() == null ? null : fotoRecebimento(d.id()).orElse(null);
            if (foto == null) {
                foto = new FotoRecebimentoChecklist(this);
                fotosRecebimento.add(foto);
            } else if (!foto.isAtivo()) {
                foto.ativar();
            }
            foto.preencher(i, d.descricao());
            mantidas.add(foto);
        }
        fotosRecebimento.stream().filter(f -> f.isAtivo() && !mantidas.contains(f)).forEach(FotoRecebimentoChecklist::desativar);
    }
}
