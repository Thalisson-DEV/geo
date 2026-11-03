package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

/**
 * Evento de condução importado de um provedor de telemetria. Único por provedor e id externo:
 * reler a mesma janela não duplica. O condutor é quem o provedor informou ou, sem isso, quem
 * estava vinculado ao veículo no instante.
 */
@Entity
@Table(name = "frota_telemetria_eventos")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class EventoTelemetria extends BaseEntity {

    @Enumerated(EnumType.STRING)
    @Column(name = "provedor", nullable = false, updatable = false, length = 20)
    private ProvedorTelemetria provedor;

    @Column(name = "id_externo", nullable = false, updatable = false, length = 80)
    private String idExterno;

    @Column(name = "id_rastreador", nullable = false, updatable = false)
    private UUID idRastreador;

    @Column(name = "id_veiculo", updatable = false)
    private UUID idVeiculo;

    @Column(name = "placa", length = 20, updatable = false)
    private String placa;

    @Enumerated(EnumType.STRING)
    @Column(name = "tipo", nullable = false, updatable = false, length = 30)
    private TipoEventoTelemetria tipo;

    @Column(name = "ocorrido_em", nullable = false, updatable = false)
    private OffsetDateTime ocorridoEm;

    @Column(name = "latitude", updatable = false)
    private Double latitude;

    @Column(name = "longitude", updatable = false)
    private Double longitude;

    @Column(name = "endereco", length = 300, updatable = false)
    private String endereco;

    @Column(name = "velocidade_kmh", precision = 6, scale = 1, updatable = false)
    private BigDecimal velocidadeKmh;

    @Column(name = "limite_kmh", precision = 6, scale = 1, updatable = false)
    private BigDecimal limiteKmh;

    @Column(name = "duracao_segundos", updatable = false)
    private Integer duracaoSegundos;

    @Column(name = "descricao", length = 500, updatable = false)
    private String descricao;

    @Column(name = "motorista_nome", length = 160, updatable = false)
    private String motoristaNome;

    @Column(name = "id_colaborador")
    private UUID idColaborador;

    @Enumerated(EnumType.STRING)
    @Column(name = "origem_condutor", length = 20)
    private OrigemCondutorTelemetria origemCondutor;

    /**
     * @param placa placa da frota (a do provedor quando o rastreador não tem veículo)
     */
    public EventoTelemetria(RastreadorTelemetria rastreador, String placa, FonteTelemetria.EventoProvedor evento,
                            UUID idColaborador, OrigemCondutorTelemetria origemCondutor) {
        Objects.requireNonNull(evento, "O evento é obrigatório");
        this.provedor = rastreador.getProvedor();
        this.idExterno = Textos.obrigatorio(evento.idExterno(), "id do evento", 80);
        this.idRastreador = Objects.requireNonNull(rastreador.getId(), "O rastreador precisa estar salvo");
        this.idVeiculo = rastreador.getIdVeiculo();
        this.placa = Textos.opcional(placa != null ? placa : evento.placa(), 20);
        this.tipo = Objects.requireNonNull(evento.tipo(), "O tipo do evento é obrigatório");
        this.ocorridoEm = Objects.requireNonNull(evento.ocorridoEm(), "O instante do evento é obrigatório");
        this.latitude = evento.latitude();
        this.longitude = evento.longitude();
        this.endereco = Textos.opcional(evento.endereco(), 300);
        this.velocidadeKmh = decimal(evento.velocidadeKmh());
        this.limiteKmh = decimal(evento.limiteKmh());
        this.duracaoSegundos = evento.duracaoSegundos() == null || evento.duracaoSegundos() < 0 ? null : evento.duracaoSegundos();
        this.descricao = Textos.opcional(evento.descricao(), 500);
        this.motoristaNome = evento.motorista() == null ? null : Textos.opcional(evento.motorista().nome(), 160);
        boolean comCondutor = idColaborador != null && origemCondutor != null;
        this.idColaborador = comCondutor ? idColaborador : null;
        this.origemCondutor = comCondutor ? origemCondutor : null;
    }

    /** Resumo para o aviso e para a lista: "98 km/h (limite 80)", "12 min". */
    public String detalhe() {
        if (tipo == TipoEventoTelemetria.EXCESSO_VELOCIDADE && velocidadeKmh != null) {
            return texto(velocidadeKmh) + " km/h" + (limiteKmh == null ? "" : " (limite " + texto(limiteKmh) + ")");
        }
        if (duracaoSegundos != null && duracaoSegundos > 0) {
            return Math.max(1, Math.round(duracaoSegundos / 60.0)) + " min";
        }
        if (velocidadeKmh != null) {
            return "a " + texto(velocidadeKmh) + " km/h";
        }
        return descricao == null ? "" : descricao;
    }

    private static String texto(BigDecimal valor) {
        return valor.stripTrailingZeros().toPlainString();
    }

    private static BigDecimal decimal(Double valor) {
        return valor == null || valor.isNaN() || valor < 0 ? null : BigDecimal.valueOf(valor).setScale(1, RoundingMode.HALF_UP);
    }
}
