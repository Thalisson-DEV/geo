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
import org.hibernate.annotations.Generated;
import org.hibernate.generator.EventType;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Objects;
import java.util.UUID;

/**
 * Sinistro de um veículo: acidente, furto, assalto ou carga avariada, com quem dirigia, o
 * boletim de ocorrência, a seguradora acionada e a OS de reparo.
 *
 * <p>A situação só avança (ver {@link SituacaoSinistro}). Abrir a OS de reparo leva a "em
 * oficina"; acionar a apólice, a "seguradora acionada". Finalizar ou cancelar exige que a OS
 * vinculada não esteja mais aberta.</p>
 */
@Entity
@Table(name = "frota_sinistros")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Sinistro extends BaseEntity {

    /** Folga para relógios de aparelhos diferentes ao comparar com "agora". */
    private static final Duration TOLERANCIA_FUTURO = Duration.ofMinutes(10);
    private static final ZoneId FUSO = ZoneId.of("America/Sao_Paulo");

    @Generated(event = EventType.INSERT)
    @Column(name = "numero", nullable = false, insertable = false, updatable = false)
    private Long numero;

    @Column(name = "id_veiculo", nullable = false, updatable = false)
    private UUID idVeiculo;

    @Column(name = "placa", nullable = false, length = 10, updatable = false)
    private String placa;

    /** Base do veículo no registro (para os recortes por base). */
    @Column(name = "id_base_operacional", updatable = false)
    private UUID idBaseOperacional;

    @Column(name = "ocorrido_em", nullable = false)
    private OffsetDateTime ocorridoEm;

    @Column(name = "local", length = 300)
    private String local;

    @Enumerated(EnumType.STRING)
    @Column(name = "tipo", nullable = false, length = 30)
    private TipoSinistro tipo;

    /** Colaborador que dirigia o veículo no instante do sinistro. */
    @Column(name = "id_condutor")
    private UUID idCondutor;

    /** Nulo enquanto não apurado. Com culpa, pode levar a medida disciplinar no RH. */
    @Column(name = "culpa_condutor")
    private Boolean culpaCondutor;

    @Column(name = "descricao", nullable = false, length = 4000)
    private String descricao;

    @Column(name = "terceiros", length = 2000)
    private String terceiros;

    @Column(name = "boletim_ocorrencia", length = 60)
    private String boletimOcorrencia;

    // ── Seguradora ─────────────────────────────────────────────────────────────────
    @Column(name = "id_apolice")
    private UUID idApolice;

    @Column(name = "numero_sinistro_seguradora", length = 60)
    private String numeroSinistroSeguradora;

    @Column(name = "seguradora_acionada_em")
    private OffsetDateTime seguradoraAcionadaEm;

    @Column(name = "franquia_paga", precision = 14, scale = 2)
    private BigDecimal franquiaPaga;

    // ── Reparo ─────────────────────────────────────────────────────────────────────
    @Column(name = "id_ordem_servico")
    private UUID idOrdemServico;

    @Enumerated(EnumType.STRING)
    @Column(name = "situacao", nullable = false, length = 30)
    private SituacaoSinistro situacao;

    @Column(name = "finalizado_em")
    private OffsetDateTime finalizadoEm;

    @Column(name = "cancelado_em")
    private OffsetDateTime canceladoEm;

    @Column(name = "motivo_cancelamento", length = 1000)
    private String motivoCancelamento;

    public record Dados(OffsetDateTime ocorridoEm, String local, TipoSinistro tipo, UUID idCondutor, Boolean culpaCondutor,
                        String descricao, String terceiros, String boletimOcorrencia) {
    }

    /** {@code dados.idCondutor()} já resolvido: o informado ou quem estava vinculado no instante. */
    public static Sinistro registrar(FichaVeiculo ficha, Dados dados, OffsetDateTime agora) {
        if (ficha == null || !ficha.isAtivo()) {
            throw new InvarianteVioladaException("Escolha um veículo ativo da frota.");
        }
        var sinistro = new Sinistro();
        sinistro.idVeiculo = ficha.getIdVeiculo();
        sinistro.placa = ficha.getPlaca();
        sinistro.idBaseOperacional = ficha.getIdBaseOperacional();
        sinistro.situacao = SituacaoSinistro.RASCUNHO;
        sinistro.preencher(dados, agora);
        return sinistro;
    }

    public void atualizar(Dados dados, OffsetDateTime agora) {
        exigirEmAndamento("alterado");
        if (idApolice != null && dados.ocorridoEm() != null && !dados.ocorridoEm().equals(ocorridoEm)) {
            throw new InvarianteVioladaException("A seguradora já foi acionada com esta data: a data e hora do sinistro não mudam.");
        }
        preencher(dados, agora);
    }

    /** A OS de reparo foi aberta pelo sinistro. */
    public void vincularOrdemServico(UUID idOs) {
        exigirEmAndamento("alterado");
        if (idOrdemServico != null) {
            throw new InvarianteVioladaException("Este sinistro já tem OS de reparo.");
        }
        this.idOrdemServico = Objects.requireNonNull(idOs);
        avancar(SituacaoSinistro.EM_OFICINA);
    }

    public void exigirPodeAbrirOrdemServico() {
        exigirEmAndamento("alterado");
        if (idOrdemServico != null) {
            throw new InvarianteVioladaException("Este sinistro já tem OS de reparo.");
        }
    }

    /**
     * Aciona a apólice que cobria o veículo na data do sinistro. Pode ser refeito para corrigir
     * a apólice ou o número do sinistro na seguradora.
     */
    public void acionarSeguradora(Apolice apolice, String numeroNaSeguradora, OffsetDateTime acionadaEm, OffsetDateTime agora) {
        exigirEmAndamento("alterado");
        if (apolice == null) {
            throw new InvarianteVioladaException("Escolha a apólice acionada.");
        }
        LocalDate dia = ocorridoEm.atZoneSameInstant(FUSO).toLocalDate();
        if (!apolice.cobre(idVeiculo, dia)) {
            throw new InvarianteVioladaException(apolice.descricao() + " não cobria o " + placa + " no dia do sinistro.");
        }
        OffsetDateTime quando = acionadaEm == null ? agora : acionadaEm;
        exigirNaoFuturo(quando, agora, "O acionamento");
        if (quando.isBefore(ocorridoEm)) {
            throw new InvarianteVioladaException("A seguradora não pode ter sido acionada antes do sinistro.");
        }
        this.idApolice = apolice.getId();
        this.numeroSinistroSeguradora = Textos.opcional(numeroNaSeguradora, 60);
        this.seguradoraAcionadaEm = quando;
        avancar(SituacaoSinistro.SEGURADORA_ACIONADA);
    }

    /** @param osAberta a OS de reparo vinculada ainda está pendente, agendada ou em andamento */
    public void finalizar(BigDecimal franquia, boolean osAberta, OffsetDateTime agora) {
        exigirEmAndamento("finalizado");
        if (osAberta) {
            throw new InvarianteVioladaException("Conclua ou cancele a OS de reparo antes de finalizar o sinistro.");
        }
        if (franquia != null && franquia.signum() < 0) {
            throw new InvarianteVioladaException("A franquia paga não pode ser negativa.");
        }
        if (franquia != null && franquia.signum() > 0 && idApolice == null) {
            throw new InvarianteVioladaException("Franquia só vale com a seguradora acionada.");
        }
        this.franquiaPaga = franquia == null ? null : franquia.setScale(2, RoundingMode.HALF_UP);
        this.finalizadoEm = agora;
        this.situacao = SituacaoSinistro.FINALIZADO;
    }

    public void cancelar(String motivo, boolean osAberta, OffsetDateTime agora) {
        exigirEmAndamento("cancelado");
        if (osAberta) {
            throw new InvarianteVioladaException("Cancele a OS de reparo antes de cancelar o sinistro.");
        }
        this.motivoCancelamento = Textos.obrigatorio(motivo, "motivo do cancelamento", 1000);
        this.canceladoEm = agora;
        this.situacao = SituacaoSinistro.CANCELADO;
    }

    /** "Sinistro 12". */
    public String rotulo() {
        return "Sinistro " + numero;
    }

    private void avancar(SituacaoSinistro nova) {
        if (nova.ordinal() > situacao.ordinal()) {
            this.situacao = nova;
        }
    }

    private void exigirEmAndamento(String acao) {
        if (!isAtivo() || situacao.isEncerrada()) {
            throw new InvarianteVioladaException("Este sinistro está " + situacao.getRotulo().toLowerCase() + " e não pode ser " + acao + ".");
        }
    }

    private void preencher(Dados d, OffsetDateTime agora) {
        if (d.ocorridoEm() == null) {
            throw new InvarianteVioladaException("Informe a data e hora do sinistro.");
        }
        exigirNaoFuturo(d.ocorridoEm(), agora, "A data do sinistro");
        if (d.tipo() == null) {
            throw new InvarianteVioladaException("Escolha o tipo do sinistro.");
        }
        this.ocorridoEm = d.ocorridoEm();
        this.local = Textos.opcional(d.local(), 300);
        this.tipo = d.tipo();
        this.idCondutor = d.idCondutor();
        this.culpaCondutor = d.culpaCondutor();
        this.descricao = Textos.obrigatorio(d.descricao(), "relato do sinistro", 4000);
        this.terceiros = Textos.opcional(d.terceiros(), 2000);
        this.boletimOcorrencia = Textos.opcional(d.boletimOcorrencia(), 60);
    }

    private static void exigirNaoFuturo(OffsetDateTime instante, OffsetDateTime agora, String campo) {
        if (instante.isAfter(agora.plus(TOLERANCIA_FUTURO))) {
            throw new InvarianteVioladaException(campo + " não pode ser no futuro.");
        }
    }
}
