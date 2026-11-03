package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.util.UUID;

/** Veículo coberto pela apólice num período; sem fim, vale até o fim da vigência. */
@Entity
@Table(name = "frota_apolice_veiculos")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CoberturaApolice extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_apolice", nullable = false, updatable = false)
    private Apolice apolice;

    @Column(name = "id_veiculo", nullable = false, updatable = false)
    private UUID idVeiculo;

    @Column(name = "inicio", nullable = false)
    private LocalDate inicio;

    @Column(name = "fim")
    private LocalDate fim;

    @Enumerated(EnumType.STRING)
    @Column(name = "motivo_encerramento", length = 20)
    private MotivoEncerramentoCobertura motivoEncerramento;

    @Column(name = "observacao_encerramento", length = 300)
    private String observacaoEncerramento;

    CoberturaApolice(Apolice apolice, UUID idVeiculo, LocalDate inicio, LocalDate fim) {
        this.apolice = apolice;
        this.idVeiculo = idVeiculo;
        this.inicio = inicio;
        this.fim = fim;
    }

    void encerrar(LocalDate novoFim, MotivoEncerramentoCobertura motivo, String observacao) {
        this.fim = novoFim;
        this.motivoEncerramento = motivo;
        this.observacaoEncerramento = Textos.opcional(observacao, 300);
    }

    public LocalDate fimEfetivo(LocalDate fimVigencia) {
        return fim == null ? fimVigencia : fim;
    }

    public boolean cobre(LocalDate data, LocalDate fimVigencia) {
        return isAtivo() && !data.isBefore(inicio) && !data.isAfter(fimEfetivo(fimVigencia));
    }
}
