package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import org.hibernate.annotations.ColumnDefault;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalTime;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

/**
 * Limiares da frota que o gestor ajusta sem deploy. Existe uma única linha,
 * criada pela migração com o id {@link #ID_UNICO}.
 */
@Entity
@Table(name = "frota_parametros")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ParametrosFrota extends BaseEntity {

    public static final UUID ID_UNICO = UUID.fromString("00000000-0000-0000-0000-00000000f001");

    @Column(name = "faixas_alerta_dias", nullable = false, length = 100)
    private String faixasAlertaDias;

    /** Sulco a partir do qual o pneu pede troca (mm). */
    @ColumnDefault("3.0")
    @Column(name = "sulco_minimo_mm", nullable = false, precision = 4, scale = 1)
    private java.math.BigDecimal sulcoMinimoMm = new java.math.BigDecimal("3.0");

    @Column(name = "limite_km_dia", nullable = false)
    private Integer limiteKmDia;

    /** Acima disto, a média de horas por dia entre duas leituras do horímetro é inconsistente. */
    @Column(name = "limite_horas_dia", nullable = false)
    private Integer limiteHorasDia = 16;

    /** Trava dos lançamentos de campo: acima disto sobre a última leitura válida, o KM é recusado. */
    @Column(name = "limite_salto_km", nullable = false)
    private Integer limiteSaltoKm = 2000;

    /** Mesma trava em horas; nula = sem trava de salto no horímetro. */
    @Column(name = "limite_salto_horas")
    private Integer limiteSaltoHoras;

    /** Dias em que a mesma manutenção na mesma placa conta como repetição, quando o item não define a sua. */
    @Column(name = "janela_repeticao_dias", nullable = false)
    private Integer janelaRepeticaoDias = 90;

    /** Expediente: andar fora dele (no domingo, e no sábado se ele não contar) é uso fora do expediente. */
    @ColumnDefault("'06:00'")
    @Column(name = "expediente_inicio", nullable = false)
    private LocalTime expedienteInicio = LocalTime.of(6, 0);

    @ColumnDefault("'19:00'")
    @Column(name = "expediente_fim", nullable = false)
    private LocalTime expedienteFim = LocalTime.of(19, 0);

    @ColumnDefault("false")
    @Column(name = "sabado_expediente", nullable = false)
    private boolean sabadoExpediente;

    /** Dias de antecedência, do maior para o menor e sem repetição (ex.: 30, 15, 7, 0). */
    public List<Integer> faixasAlerta() {
        return converterFaixas(faixasAlertaDias);
    }

    public void atualizar(List<Integer> faixas, Integer limiteKmDia) {
        if (limiteKmDia == null || limiteKmDia <= 0) {
            throw new InvarianteVioladaException("O limite de km por dia deve ser maior que zero.");
        }
        if (faixas == null || faixas.isEmpty()) {
            throw new InvarianteVioladaException("Informe ao menos uma faixa de aviso de vencimento.");
        }
        if (faixas.stream().anyMatch(f -> f == null || f < 0 || f > 365)) {
            throw new InvarianteVioladaException("As faixas de aviso devem estar entre 0 e 365 dias.");
        }
        this.faixasAlertaDias = String.join(",", faixas.stream()
                .distinct().sorted((a, b) -> b - a).map(String::valueOf).toList());
        this.limiteKmDia = limiteKmDia;
    }

    public void definirLimiteHorasDia(Integer horas) {
        if (horas == null || horas < 1 || horas > 24) {
            throw new InvarianteVioladaException("O limite de horas por dia deve estar entre 1 e 24.");
        }
        this.limiteHorasDia = horas;
    }

    /** Limite diário de salto na unidade do veículo. */
    public int limiteDiario(UnidadeMedicao unidade) {
        return unidade == UnidadeMedicao.HORAS ? limiteHorasDia : limiteKmDia;
    }

    public void definirTravaSalto(Integer km, Integer horas) {
        if (km == null || km < 1) {
            throw new InvarianteVioladaException("O limite de salto em km deve ser maior que zero.");
        }
        if (horas != null && horas < 1) {
            throw new InvarianteVioladaException("O limite de salto em horas deve ser maior que zero.");
        }
        this.limiteSaltoKm = km;
        this.limiteSaltoHoras = horas;
    }

    /** Trava de salto na unidade do veículo; nula quando não há trava. */
    public Integer limiteSalto(UnidadeMedicao unidade) {
        return unidade == UnidadeMedicao.HORAS ? limiteSaltoHoras : limiteSaltoKm;
    }

    public void definirJanelaRepeticao(Integer dias) {
        if (dias == null || dias < 1 || dias > ItemManutencao.DIAS_REPETICAO_MAXIMO) {
            throw new InvarianteVioladaException(
                    "A janela de repetição deve estar entre 1 e " + ItemManutencao.DIAS_REPETICAO_MAXIMO + " dias.");
        }
        this.janelaRepeticaoDias = dias;
    }

    public void definirExpediente(LocalTime inicio, LocalTime fim, boolean sabado) {
        if (inicio == null || fim == null || !fim.isAfter(inicio)) {
            throw new InvarianteVioladaException("O fim do expediente deve ser depois do início.");
        }
        this.expedienteInicio = inicio;
        this.expedienteFim = fim;
        this.sabadoExpediente = sabado;
    }

    public Expediente expediente() {
        return new Expediente(expedienteInicio, expedienteFim, sabadoExpediente);
    }

    static List<Integer> converterFaixas(String texto) {
        if (texto == null || texto.isBlank()) return List.of();
        return Arrays.stream(texto.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(Integer::valueOf)
                .distinct()
                .sorted((a, b) -> b - a)
                .toList();
    }
}
