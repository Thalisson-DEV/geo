package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.OrderColumn;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Plano de manutenção preventiva: o que fazer (itens e roteiro) e de quanto em quanto
 * (km, horas e/ou dias, o que vencer primeiro).
 *
 * <p>Vale para os veículos dos tipos informados e para os que estão com um implemento de
 * um dos tipos informados acoplado — a medição é sempre a do veículo. Editar o plano não
 * reescreve as OS já abertas: o roteiro é copiado na abertura.</p>
 */
@Entity
@Table(name = "frota_planos_preventivos")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PlanoPreventivo extends BaseEntity {

    public static final int MAXIMO_TAREFAS = 50;
    public static final int MAXIMO_ITENS = 30;

    @Column(name = "nome", nullable = false, length = 120)
    private String nome;

    @Column(name = "descricao", length = 1000)
    private String descricao;

    @Column(name = "intervalo_km")
    private Long intervaloKm;

    @Column(name = "intervalo_horas")
    private Long intervaloHoras;

    @Column(name = "intervalo_dias")
    private Integer intervaloDias;

    @Column(name = "antecedencia_km")
    private Long antecedenciaKm;

    @Column(name = "antecedencia_horas")
    private Long antecedenciaHoras;

    @Column(name = "antecedencia_dias")
    private Integer antecedenciaDias;

    @Enumerated(EnumType.STRING)
    @Column(name = "criticidade", nullable = false, length = 20)
    private Criticidade criticidade = Criticidade.MEDIA;

    @Column(name = "abrir_os_automaticamente", nullable = false)
    private boolean abrirOsAutomaticamente;

    @ElementCollection
    @CollectionTable(name = "frota_plano_preventivo_tipos_veiculo", joinColumns = @JoinColumn(name = "id_plano"))
    @Column(name = "id_tipo_veiculo", nullable = false)
    private Set<UUID> idsTiposVeiculo = new HashSet<>();

    @ElementCollection
    @CollectionTable(name = "frota_plano_preventivo_tipos_implemento", joinColumns = @JoinColumn(name = "id_plano"))
    @Column(name = "id_tipo_implemento", nullable = false)
    private Set<UUID> idsTiposImplemento = new HashSet<>();

    @ManyToMany
    @JoinTable(name = "frota_plano_preventivo_itens",
            joinColumns = @JoinColumn(name = "id_plano"),
            inverseJoinColumns = @JoinColumn(name = "id_item"))
    @OrderColumn(name = "ordem")
    private List<ItemManutencao> itens = new ArrayList<>();

    @ElementCollection
    @CollectionTable(name = "frota_plano_preventivo_tarefas", joinColumns = @JoinColumn(name = "id_plano"))
    @OrderColumn(name = "ordem")
    @Column(name = "texto", nullable = false, length = 300)
    private List<String> tarefas = new ArrayList<>();

    public record Dados(
            String nome,
            String descricao,
            Set<UUID> idsTiposVeiculo,
            Set<UUID> idsTiposImplemento,
            Long intervaloKm,
            Long intervaloHoras,
            Integer intervaloDias,
            Long antecedenciaKm,
            Long antecedenciaHoras,
            Integer antecedenciaDias,
            Criticidade criticidade,
            boolean abrirOsAutomaticamente,
            List<ItemManutencao> itens,
            List<String> tarefas
    ) {
    }

    public PlanoPreventivo(Dados dados) {
        preencher(dados, List.of());
    }

    public void atualizar(Dados dados) {
        if (!isAtivo()) {
            throw new InvarianteVioladaException("Não é possível alterar um plano preventivo desativado.");
        }
        preencher(dados, List.copyOf(itens));
    }

    /** Vale para o veículo pelo tipo dele ou por um implemento acoplado. */
    public boolean aplicaA(UUID idTipoVeiculo, Set<UUID> idsTiposImplementoAcoplados) {
        return (idTipoVeiculo != null && idsTiposVeiculo.contains(idTipoVeiculo))
                || idsTiposImplementoAcoplados.stream().anyMatch(idsTiposImplemento::contains);
    }

    /** Frequência de uso na unidade do veículo; nula quando o plano não mede por ela. */
    public Long intervalo(UnidadeMedicao unidade) {
        return unidade == UnidadeMedicao.HORAS ? intervaloHoras : intervaloKm;
    }

    public long antecedencia(UnidadeMedicao unidade) {
        Long valor = unidade == UnidadeMedicao.HORAS ? antecedenciaHoras : antecedenciaKm;
        return valor == null ? 0 : valor;
    }

    public int antecedenciaEmDias() {
        return antecedenciaDias == null ? 0 : antecedenciaDias;
    }

    /** Um veículo medido nesta unidade tem como vencer o plano (pelo uso ou pelo tempo). */
    public boolean mede(UnidadeMedicao unidade) {
        return intervalo(unidade) != null || intervaloDias != null;
    }

    public List<ItemManutencao> getItens() {
        return Collections.unmodifiableList(itens);
    }

    public List<String> getTarefas() {
        return Collections.unmodifiableList(tarefas);
    }

    /** Roteiro numerado, como vai para a OS. */
    public String roteiroNumerado() {
        var texto = new StringBuilder();
        for (int i = 0; i < tarefas.size(); i++) {
            if (i > 0) texto.append('\n');
            texto.append(i + 1).append(". ").append(tarefas.get(i));
        }
        return texto.toString();
    }

    /** Frequência legível, ex.: "a cada 10.000 km ou 180 dias". */
    public String frequenciaDescrita() {
        var partes = new ArrayList<String>();
        if (intervaloKm != null) partes.add(Medidas.formatar(intervaloKm) + " km");
        if (intervaloHoras != null) partes.add(Medidas.formatar(intervaloHoras) + " h");
        if (intervaloDias != null) partes.add(intervaloDias + (intervaloDias == 1 ? " dia" : " dias"));
        return "a cada " + String.join(" ou ", partes);
    }

    private void preencher(Dados dados, List<ItemManutencao> atuais) {
        var tiposVeiculo = dados.idsTiposVeiculo() == null ? Set.<UUID>of() : dados.idsTiposVeiculo();
        var tiposImplemento = dados.idsTiposImplemento() == null ? Set.<UUID>of() : dados.idsTiposImplemento();
        if (tiposVeiculo.isEmpty() && tiposImplemento.isEmpty()) {
            throw new InvarianteVioladaException("Escolha ao menos um tipo de veículo ou de implemento para o plano.");
        }
        if (dados.intervaloKm() == null && dados.intervaloHoras() == null && dados.intervaloDias() == null) {
            throw new InvarianteVioladaException("Informe ao menos uma frequência: km, horas ou dias.");
        }
        positivo(dados.intervaloKm(), "A frequência em km");
        positivo(dados.intervaloHoras(), "A frequência em horas");
        positivo(dados.intervaloDias() == null ? null : dados.intervaloDias().longValue(), "A frequência em dias");
        antecedencia(dados.antecedenciaKm(), dados.intervaloKm(), "km");
        antecedencia(dados.antecedenciaHoras(), dados.intervaloHoras(), "horas");
        antecedencia(dados.antecedenciaDias() == null ? null : dados.antecedenciaDias().longValue(),
                dados.intervaloDias() == null ? null : dados.intervaloDias().longValue(), "dias");

        var itensUnicos = new LinkedHashMap<UUID, ItemManutencao>();
        for (ItemManutencao item : dados.itens() == null ? List.<ItemManutencao>of() : dados.itens()) {
            itensUnicos.putIfAbsent(item.getId(), item);
        }
        if (itensUnicos.isEmpty()) {
            throw new InvarianteVioladaException("Inclua ao menos um item de manutenção no plano.");
        }
        if (itensUnicos.size() > MAXIMO_ITENS) {
            throw new InvarianteVioladaException("O plano aceita no máximo " + MAXIMO_ITENS + " itens de manutenção.");
        }
        for (ItemManutencao item : itensUnicos.values()) {
            if (!item.isAtivo() && !atuais.contains(item)) {
                throw new InvarianteVioladaException("O item de manutenção " + item.getNome() + " está desativado.");
            }
        }
        var tarefasLimpas = new ArrayList<String>();
        for (String tarefa : dados.tarefas() == null ? List.<String>of() : dados.tarefas()) {
            String texto = Textos.opcional(tarefa, 300);
            if (texto != null) tarefasLimpas.add(texto);
        }
        if (tarefasLimpas.size() > MAXIMO_TAREFAS) {
            throw new InvarianteVioladaException("O roteiro aceita no máximo " + MAXIMO_TAREFAS + " tarefas.");
        }

        this.nome = Textos.obrigatorio(dados.nome(), "nome do plano", 120);
        this.descricao = Textos.opcional(dados.descricao(), 1000);
        this.idsTiposVeiculo.clear();
        this.idsTiposVeiculo.addAll(tiposVeiculo);
        this.idsTiposImplemento.clear();
        this.idsTiposImplemento.addAll(tiposImplemento);
        this.intervaloKm = dados.intervaloKm();
        this.intervaloHoras = dados.intervaloHoras();
        this.intervaloDias = dados.intervaloDias();
        this.antecedenciaKm = dados.intervaloKm() == null ? null : dados.antecedenciaKm();
        this.antecedenciaHoras = dados.intervaloHoras() == null ? null : dados.antecedenciaHoras();
        this.antecedenciaDias = dados.intervaloDias() == null ? null : dados.antecedenciaDias();
        this.criticidade = dados.criticidade() == null ? Criticidade.MEDIA : dados.criticidade();
        this.abrirOsAutomaticamente = dados.abrirOsAutomaticamente();
        this.itens.clear();
        this.itens.addAll(itensUnicos.values());
        this.tarefas.clear();
        this.tarefas.addAll(tarefasLimpas);
    }

    private static void positivo(Long valor, String campo) {
        if (valor != null && valor <= 0) {
            throw new InvarianteVioladaException(campo + " precisa ser maior que zero.");
        }
    }

    private static void antecedencia(Long antecedencia, Long intervalo, String unidade) {
        if (antecedencia == null || intervalo == null) return;
        if (antecedencia < 0) {
            throw new InvarianteVioladaException("A antecedência em " + unidade + " não pode ser negativa.");
        }
        if (antecedencia >= intervalo) {
            throw new InvarianteVioladaException("A antecedência em " + unidade + " precisa ser menor que a frequência.");
        }
    }
}
