package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
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

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.UUID;

/**
 * Fatura do posto: o administrativo lança, confere contra os abastecimentos realizados no
 * período e manda ao financeiro, que paga pelo fornecedor do posto.
 */
@Entity
@Table(name = "frota_faturas_posto")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FaturaPosto extends BaseEntity {

    public enum Situacao {
        RASCUNHO("Em conferência"),
        CONFERIDA("Conferida"),
        ENVIADA_AO_FINANCEIRO("Enviada ao financeiro");

        private final String rotulo;

        Situacao(String rotulo) {
            this.rotulo = rotulo;
        }

        public String getRotulo() {
            return rotulo;
        }
    }

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_posto", nullable = false, updatable = false)
    private PostoAbastecimento posto;

    @Column(name = "numero", nullable = false, length = 60)
    private String numero;

    @Column(name = "periodo_inicio", nullable = false)
    private LocalDate periodoInicio;

    @Column(name = "periodo_fim", nullable = false)
    private LocalDate periodoFim;

    @Column(name = "valor", nullable = false, precision = 14, scale = 2)
    private BigDecimal valor;

    @Enumerated(EnumType.STRING)
    @Column(name = "situacao", nullable = false, length = 25)
    private Situacao situacao;

    @Column(name = "conferida_em")
    private OffsetDateTime conferidaEm;

    @Column(name = "id_usuario_conferencia")
    private UUID idUsuarioConferencia;

    public FaturaPosto(PostoAbastecimento posto, String numero, LocalDate inicio, LocalDate fim, BigDecimal valor) {
        if (posto == null) {
            throw new InvarianteVioladaException("Informe o posto da fatura.");
        }
        this.posto = posto;
        this.situacao = Situacao.RASCUNHO;
        preencher(numero, inicio, fim, valor);
    }

    public void atualizar(String numero, LocalDate inicio, LocalDate fim, BigDecimal valor) {
        if (situacao == Situacao.ENVIADA_AO_FINANCEIRO) {
            throw new InvarianteVioladaException("A fatura já foi enviada ao financeiro e não pode mudar.");
        }
        preencher(numero, inicio, fim, valor);
        this.situacao = Situacao.RASCUNHO;
    }

    /**
     * Liga os abastecimentos escolhidos à fatura; os que estavam nela e saíram voltam a ficar
     * livres. Cada abastecimento fica em uma fatura só.
     */
    public void conferir(Collection<Abastecimento> incluidos, Collection<Abastecimento> anteriores, UUID idUsuario, OffsetDateTime agora) {
        if (situacao == Situacao.ENVIADA_AO_FINANCEIRO) {
            throw new InvarianteVioladaException("A fatura já foi enviada ao financeiro.");
        }
        if (incluidos.isEmpty()) {
            throw new InvarianteVioladaException("Escolha os abastecimentos que estão na fatura.");
        }
        for (var a : incluidos) {
            if (!a.getPosto().getId().equals(posto.getId())) {
                throw new InvarianteVioladaException("Há abastecimento de outro posto na conferência.");
            }
        }
        anteriores.stream().filter(a -> !incluidos.contains(a)).forEach(Abastecimento::retirarDaFatura);
        incluidos.forEach(a -> a.faturar(getId()));
        this.situacao = Situacao.CONFERIDA;
        this.conferidaEm = agora;
        this.idUsuarioConferencia = idUsuario;
    }

    public void enviarAoFinanceiro() {
        if (situacao == Situacao.ENVIADA_AO_FINANCEIRO) return;
        if (situacao != Situacao.CONFERIDA) {
            throw new InvarianteVioladaException("Confira a fatura antes de enviar ao financeiro.");
        }
        this.situacao = Situacao.ENVIADA_AO_FINANCEIRO;
    }

    private void preencher(String numero, LocalDate inicio, LocalDate fim, BigDecimal valor) {
        this.numero = Textos.obrigatorio(numero, "número da fatura", 60);
        if (inicio == null || fim == null || fim.isBefore(inicio)) {
            throw new InvarianteVioladaException("Informe o período da fatura (o fim não pode ser antes do início).");
        }
        if (valor == null || valor.signum() <= 0) {
            throw new InvarianteVioladaException("Informe o valor da fatura.");
        }
        this.periodoInicio = inicio;
        this.periodoFim = fim;
        this.valor = valor.setScale(2, RoundingMode.HALF_UP);
    }
}
