package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Inspeção dos pneus de um veículo: pressão (calibragem) e sulco de cada posição, num momento.
 * Só entram os pneus montados no veículo, um por posição.
 */
@Entity
@Table(name = "frota_pneu_inspecoes")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class InspecaoPneu extends BaseEntity {

    private static final Duration TOLERANCIA_FUTURO = Duration.ofMinutes(10);

    @Column(name = "id_veiculo", nullable = false, updatable = false)
    private UUID idVeiculo;

    @Column(name = "placa", nullable = false, length = 10, updatable = false)
    private String placa;

    @Column(name = "realizada_em", nullable = false)
    private OffsetDateTime realizadaEm;

    @Column(name = "km")
    private Integer km;

    @Column(name = "id_responsavel")
    private UUID idResponsavel;

    @Column(name = "observacao", length = 1000)
    private String observacao;

    @OneToMany(mappedBy = "inspecao", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<ItemInspecaoPneu> itens = new ArrayList<>();

    public record Medicao(Pneu pneu, Integer pressaoPsi, BigDecimal sulcoMm, String observacao) {
    }

    /** @param medicoes pneus montados no veículo com o que foi medido */
    public static InspecaoPneu registrar(FichaVeiculo ficha, OffsetDateTime realizadaEm, Integer km, UUID idResponsavel,
                                         String observacao, List<Medicao> medicoes, OffsetDateTime agora) {
        if (realizadaEm == null || realizadaEm.isAfter(agora.plus(TOLERANCIA_FUTURO))) {
            throw new InvarianteVioladaException("Informe quando a inspeção foi feita (não pode ser no futuro).");
        }
        if (km != null && km < 0) {
            throw new InvarianteVioladaException("O km não pode ser negativo.");
        }
        if (medicoes == null || medicoes.isEmpty()) {
            throw new InvarianteVioladaException("Informe a pressão ou o sulco de ao menos um pneu.");
        }
        var inspecao = new InspecaoPneu();
        inspecao.idVeiculo = ficha.getIdVeiculo();
        inspecao.placa = ficha.getPlaca();
        inspecao.realizadaEm = realizadaEm;
        inspecao.km = km;
        inspecao.idResponsavel = idResponsavel;
        inspecao.observacao = Textos.opcional(observacao, 1000);
        var vistos = new HashSet<UUID>();
        for (var m : medicoes) {
            var pneu = m.pneu();
            if (pneu.getSituacao() != SituacaoPneu.EM_USO || !ficha.getIdVeiculo().equals(pneu.getIdVeiculo())) {
                throw new InvarianteVioladaException("O pneu " + pneu.getMarcaFogo() + " não está montado no " + ficha.getPlaca() + ".");
            }
            if (!vistos.add(pneu.getId())) {
                throw new InvarianteVioladaException("O pneu " + pneu.getMarcaFogo() + " aparece duas vezes na inspeção.");
            }
            if (m.pressaoPsi() == null && m.sulcoMm() == null) {
                continue;
            }
            inspecao.itens.add(new ItemInspecaoPneu(inspecao, pneu, m.pressaoPsi(), m.sulcoMm(), m.observacao()));
        }
        if (inspecao.itens.isEmpty()) {
            throw new InvarianteVioladaException("Informe a pressão ou o sulco de ao menos um pneu.");
        }
        return inspecao;
    }

    public List<ItemInspecaoPneu> getItens() {
        return Collections.unmodifiableList(itens);
    }

    /** Pressão medida por pneu (para alertas da última inspeção). */
    public Map<UUID, Integer> pressoes() {
        var mapa = new java.util.HashMap<UUID, Integer>();
        itens.stream().filter(i -> i.getPressaoPsi() != null).forEach(i -> mapa.put(i.getIdPneu(), i.getPressaoPsi()));
        return mapa;
    }
}
