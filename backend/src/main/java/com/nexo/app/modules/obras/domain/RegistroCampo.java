package com.nexo.app.modules.obras.domain;

import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

/**
 * Como um registro chegou do aparelho: o id gerado lá (chave do reenvio), o hash do conteúdo, a hora do aparelho e a do
 * servidor, e o GPS com a precisão. O reenvio com o mesmo id e o mesmo conteúdo devolve o registro; com outro conteúdo
 * é recusado.
 */
@Embeddable
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RegistroCampo {

    /** Hora do aparelho mais adiantada que isto em relação ao servidor é tratada como relógio errado. */
    public static final Duration TOLERANCIA_RELOGIO = Duration.ofMinutes(10);

    @Column(name = "id_local", updatable = false)
    private UUID idLocal;

    @Column(name = "hash_campo", length = 64, updatable = false)
    private String hash;

    @Column(name = "data_origem", updatable = false)
    private OffsetDateTime dataOrigem;

    @Column(name = "recebido_em", updatable = false)
    private OffsetDateTime recebidoEm;

    @Column(name = "latitude_campo", precision = 9, scale = 6, updatable = false)
    private BigDecimal latitude;

    @Column(name = "longitude_campo", precision = 9, scale = 6, updatable = false)
    private BigDecimal longitude;

    @Column(name = "precisao_metros", precision = 8, scale = 1, updatable = false)
    private BigDecimal precisao;

    /** Onde e quando a equipe fez o registro, como o aparelho informou. */
    public record Origem(OffsetDateTime instante, BigDecimal latitude, BigDecimal longitude, BigDecimal precisao) {
        public static final Origem AGORA = new Origem(null, null, null, null);
    }

    public RegistroCampo(UUID idLocal, String hash, Origem origem, OffsetDateTime recebidoEm) {
        this.idLocal = Objects.requireNonNull(idLocal, "O id do aparelho é obrigatório");
        this.hash = Objects.requireNonNull(hash);
        this.recebidoEm = Objects.requireNonNull(recebidoEm);
        Origem dados = origem != null ? origem : Origem.AGORA;
        this.dataOrigem = dados.instante() != null ? dados.instante() : recebidoEm;
        if ((dados.latitude() == null) != (dados.longitude() == null)) {
            throw new InvarianteVioladaException("Informe a latitude e a longitude juntas.");
        }
        if (dados.latitude() != null) {
            exigirFaixa(dados.latitude(), 90, "latitude");
            exigirFaixa(dados.longitude(), 180, "longitude");
            this.latitude = dados.latitude().setScale(6, RoundingMode.HALF_UP);
            this.longitude = dados.longitude().setScale(6, RoundingMode.HALF_UP);
        }
        if (dados.precisao() != null) {
            if (dados.precisao().signum() < 0) {
                throw new InvarianteVioladaException("A precisão do GPS não pode ser negativa.");
            }
            this.precisao = dados.precisao().min(new BigDecimal("9999999")).setScale(1, RoundingMode.HALF_UP);
        }
    }

    /** O mesmo comando, reenviado: mesmo id e mesmo conteúdo. */
    public boolean mesmoConteudo(String outroHash) {
        return hash != null && hash.equalsIgnoreCase(outroHash);
    }

    /** Relógio do aparelho adiantado além da tolerância: os relatórios usam a hora do servidor. */
    public boolean relogioDivergente() {
        return dataOrigem != null && recebidoEm != null && dataOrigem.isAfter(recebidoEm.plus(TOLERANCIA_RELOGIO));
    }

    /** Hora que vale para regras e relatórios: a do aparelho, salvo relógio adiantado. */
    public OffsetDateTime momentoConfiavel() {
        return relogioDivergente() ? recebidoEm : dataOrigem;
    }

    private static void exigirFaixa(BigDecimal valor, int limite, String nome) {
        if (valor.abs().compareTo(BigDecimal.valueOf(limite)) > 0) {
            throw new InvarianteVioladaException("A " + nome + " está fora do intervalo válido.");
        }
    }
}
