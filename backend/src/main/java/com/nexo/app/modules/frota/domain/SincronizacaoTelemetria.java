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

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Objects;

/**
 * Situação de uma rotina de sincronização de um provedor. Uma falha que dura mais que a
 * tolerância abre um incidente, avisado uma vez; o próximo sucesso fecha o incidente.
 */
@Entity
@Table(name = "frota_telemetria_sincronizacoes")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SincronizacaoTelemetria extends BaseEntity {

    @Enumerated(EnumType.STRING)
    @Column(name = "provedor", nullable = false, updatable = false, length = 20)
    private ProvedorTelemetria provedor;

    @Enumerated(EnumType.STRING)
    @Column(name = "rotina", nullable = false, updatable = false, length = 20)
    private RotinaTelemetria rotina;

    @Enumerated(EnumType.STRING)
    @Column(name = "situacao", nullable = false, length = 20)
    private SituacaoSincronizacaoTelemetria situacao;

    @Column(name = "ultima_execucao")
    private OffsetDateTime ultimaExecucao;

    @Column(name = "ultimo_sucesso")
    private OffsetDateTime ultimoSucesso;

    @Column(name = "mensagem", length = 500)
    private String mensagem;

    @Column(name = "falhas_seguidas", nullable = false)
    private int falhasSeguidas;

    @Column(name = "itens", nullable = false)
    private int itens;

    @Column(name = "falha_avisada_em")
    private OffsetDateTime falhaAvisadaEm;

    public SincronizacaoTelemetria(ProvedorTelemetria provedor, RotinaTelemetria rotina) {
        this.provedor = Objects.requireNonNull(provedor);
        this.rotina = Objects.requireNonNull(rotina);
        this.situacao = SituacaoSincronizacaoTelemetria.NAO_CONFIGURADO;
    }

    public void registrarSucesso(OffsetDateTime instante, int itens) {
        this.ultimaExecucao = instante;
        this.ultimoSucesso = instante;
        this.situacao = SituacaoSincronizacaoTelemetria.OK;
        this.mensagem = null;
        this.falhasSeguidas = 0;
        this.itens = Math.max(0, itens);
        this.falhaAvisadaEm = null;
    }

    public void registrarFalha(OffsetDateTime instante, String mensagem) {
        this.ultimaExecucao = instante;
        this.situacao = SituacaoSincronizacaoTelemetria.ERRO;
        this.mensagem = Textos.opcional(mensagem == null || mensagem.isBlank() ? "Falha sem mensagem do provedor." : mensagem, 500);
        this.falhasSeguidas++;
    }

    public void registrarSemConfiguracao(OffsetDateTime instante) {
        this.ultimaExecucao = instante;
        this.situacao = SituacaoSincronizacaoTelemetria.NAO_CONFIGURADO;
        this.mensagem = null;
        this.falhasSeguidas = 0;
        this.falhaAvisadaEm = null;
    }

    /**
     * Em erro há mais que a tolerância desde o último sucesso (ou, sem nenhum, desde que a rotina
     * começou a rodar) e ainda não avisada neste incidente.
     */
    public boolean precisaAvisarFalha(OffsetDateTime agora, Duration tolerancia) {
        if (situacao != SituacaoSincronizacaoTelemetria.ERRO || falhaAvisadaEm != null) {
            return false;
        }
        OffsetDateTime referencia = ultimoSucesso != null ? ultimoSucesso : getDataCriacao();
        return referencia != null && !agora.isBefore(referencia.plus(tolerancia));
    }

    public void marcarFalhaAvisada(OffsetDateTime instante) {
        this.falhaAvisadaEm = instante;
    }
}
