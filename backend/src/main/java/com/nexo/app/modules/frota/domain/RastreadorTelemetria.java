package com.nexo.app.modules.frota.domain;

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

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Locale;
import java.util.Objects;
import java.util.UUID;

/**
 * Rastreador de um provedor de telemetria: o vínculo com o veículo da frota e o último estado
 * lido (posição, odômetro, motorista).
 *
 * <p>O vínculo é automático pela placa. O gestor pode vincular à mão (prevalece sobre a placa)
 * ou ignorar um rastreador que não é da frota (não volta sozinho).</p>
 */
@Entity
@Table(name = "frota_telemetria_rastreadores")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RastreadorTelemetria extends BaseEntity {

    @Enumerated(EnumType.STRING)
    @Column(name = "provedor", nullable = false, updatable = false, length = 20)
    private ProvedorTelemetria provedor;

    @Column(name = "id_externo", nullable = false, updatable = false, length = 40)
    private String idExterno;

    @Column(name = "placa_provedor", length = 20)
    private String placaProvedor;

    @Column(name = "nome_provedor", length = 160)
    private String nomeProvedor;

    @Column(name = "id_veiculo")
    private UUID idVeiculo;

    @Enumerated(EnumType.STRING)
    @Column(name = "situacao", nullable = false, length = 20)
    private SituacaoRastreador situacao;

    @Column(name = "vinculo_manual", nullable = false)
    private boolean vinculoManual;

    @Column(name = "ultima_comunicacao")
    private OffsetDateTime ultimaComunicacao;

    @Column(name = "latitude")
    private Double latitude;

    @Column(name = "longitude")
    private Double longitude;

    @Column(name = "velocidade_kmh", precision = 6, scale = 1)
    private BigDecimal velocidadeKmh;

    @Column(name = "ignicao")
    private Boolean ignicao;

    @Column(name = "odometro_metros")
    private Long odometroMetros;

    @Column(name = "horimetro_horas", precision = 12, scale = 1)
    private BigDecimal horimetroHoras;

    @Column(name = "motorista_externo", length = 40)
    private String motoristaExterno;

    @Column(name = "motorista_nome", length = 160)
    private String motoristaNome;

    @Column(name = "id_colaborador_motorista")
    private UUID idColaboradorMotorista;

    @Column(name = "leitura_registrada_em")
    private OffsetDateTime leituraRegistradaEm;

    @Column(name = "eventos_ate")
    private OffsetDateTime eventosAte;

    @Column(name = "posicao_gravada_em")
    private OffsetDateTime posicaoGravadaEm;

    /** Velocidade a partir da qual o veículo conta como em movimento (o GPS parado oscila). */
    public static final double VELOCIDADE_MOVIMENTO_KMH = 3;

    public RastreadorTelemetria(ProvedorTelemetria provedor, String idExterno) {
        this.provedor = Objects.requireNonNull(provedor, "O provedor é obrigatório");
        this.idExterno = Textos.obrigatorio(idExterno, "id do rastreador", 40);
        this.situacao = SituacaoRastreador.SEM_VEICULO;
    }

    /** Placa sem hífen nem espaço, em maiúsculas, como a frota compara. */
    public static String normalizarPlaca(String placa) {
        return placa == null ? null : placa.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
    }

    public void atualizarCadastro(String placa, String nome) {
        this.placaProvedor = Textos.opcional(placa, 20);
        this.nomeProvedor = Textos.opcional(nome, 160);
    }

    /**
     * Guarda o último estado. Leitura igual ou mais antiga que a atual é ignorada (o provedor
     * repete a última posição enquanto o equipamento está sem sinal).
     *
     * @return se a leitura era nova
     */
    public boolean registrarLeitura(FonteTelemetria.Leitura leitura, UUID idColaboradorMotorista) {
        if (leitura == null || leitura.lidoEm() == null) {
            return false;
        }
        if (ultimaComunicacao != null && !leitura.lidoEm().isAfter(ultimaComunicacao)) {
            return false;
        }
        this.ultimaComunicacao = leitura.lidoEm();
        this.latitude = leitura.latitude();
        this.longitude = leitura.longitude();
        this.velocidadeKmh = decimal(leitura.velocidadeKmh());
        this.ignicao = leitura.ignicao();
        if (leitura.odometroMetros() != null && leitura.odometroMetros() > 0) {
            this.odometroMetros = leitura.odometroMetros();
        }
        if (leitura.horimetroHoras() != null && leitura.horimetroHoras() > 0) {
            this.horimetroHoras = decimal(leitura.horimetroHoras());
        }
        var motorista = leitura.motorista();
        this.motoristaExterno = motorista == null ? null : Textos.opcional(motorista.idExterno(), 40);
        this.motoristaNome = motorista == null ? null : Textos.opcional(motorista.nome(), 160);
        this.idColaboradorMotorista = idColaboradorMotorista;
        return true;
    }

    /** Vínculo pela placa ou pelo id já informado na ficha; não mexe em vínculo manual nem em ignorado. */
    public void vincularAutomaticamente(UUID idVeiculo) {
        if (vinculoManual || situacao == SituacaoRastreador.IGNORADO) {
            return;
        }
        if (idVeiculo == null) {
            desvincular();
        } else if (!idVeiculo.equals(this.idVeiculo)) {
            this.idVeiculo = idVeiculo;
            this.situacao = SituacaoRastreador.VINCULADO;
            this.leituraRegistradaEm = null;
        }
    }

    /** O gestor indica o veículo. Prevalece sobre a placa até ele desfazer. */
    public void vincularManualmente(UUID idVeiculo) {
        if (idVeiculo == null) {
            throw new InvarianteVioladaException("Informe o veículo do rastreador.");
        }
        this.idVeiculo = idVeiculo;
        this.situacao = SituacaoRastreador.VINCULADO;
        this.vinculoManual = true;
        this.leituraRegistradaEm = null;
    }

    /** Volta ao casamento automático pela placa na próxima sincronização. */
    public void desfazerVinculoManual() {
        this.vinculoManual = false;
        desvincular();
    }

    /** Outro rastreador mais recente ficou com o veículo (troca de equipamento). */
    public void perderVeiculo() {
        this.vinculoManual = false;
        desvincular();
    }

    public void ignorar() {
        this.vinculoManual = false;
        this.idVeiculo = null;
        this.situacao = SituacaoRastreador.IGNORADO;
        this.leituraRegistradaEm = null;
    }

    public void reativar() {
        if (situacao != SituacaoRastreador.IGNORADO) {
            throw new InvarianteVioladaException("O rastreador não está ignorado.");
        }
        this.situacao = SituacaoRastreador.SEM_VEICULO;
    }

    public boolean isVinculado() {
        return situacao == SituacaoRastreador.VINCULADO && idVeiculo != null;
    }

    /** Já passou o intervalo mínimo desde a última leitura de km gravada pela telemetria. */
    public boolean podeRegistrarLeitura(OffsetDateTime agora, Duration intervalo) {
        return leituraRegistradaEm == null || !agora.isBefore(leituraRegistradaEm.plus(intervalo));
    }

    public void marcarLeituraRegistrada(OffsetDateTime instante) {
        this.leituraRegistradaEm = instante;
    }

    /**
     * Se a leitura entra na série de posições: sempre em movimento ou quando a ignição muda (o
     * trajeto fica fiel); parado, no máximo uma a cada {@code intervaloParado}.
     */
    public boolean deveGravarPosicao(FonteTelemetria.Leitura leitura, Boolean ignicaoAnterior, Duration intervaloParado) {
        if (leitura == null || leitura.lidoEm() == null) {
            return false;
        }
        boolean andando = leitura.velocidadeKmh() != null && leitura.velocidadeKmh() > VELOCIDADE_MOVIMENTO_KMH;
        boolean mudouIgnicao = leitura.ignicao() != null && !leitura.ignicao().equals(ignicaoAnterior);
        return andando || mudouIgnicao || posicaoGravadaEm == null || !leitura.lidoEm().isBefore(posicaoGravadaEm.plus(intervaloParado));
    }

    public void marcarPosicaoGravada(OffsetDateTime lidoEm) {
        this.posicaoGravadaEm = lidoEm;
    }

    public void avancarEventos(OffsetDateTime ate) {
        if (ate != null && (eventosAte == null || ate.isAfter(eventosAte))) {
            this.eventosAte = ate;
        }
    }

    private void desvincular() {
        this.idVeiculo = null;
        this.situacao = SituacaoRastreador.SEM_VEICULO;
        this.leituraRegistradaEm = null;
    }

    private static BigDecimal decimal(Double valor) {
        return valor == null || valor.isNaN() || valor < 0 ? null : BigDecimal.valueOf(valor).setScale(1, RoundingMode.HALF_UP);
    }
}
