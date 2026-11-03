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
import java.util.UUID;

/**
 * Preço lido no cupom pelo Assistente, diferente do cadastrado no posto. O cadastro só muda
 * quando uma pessoa confirma; descartar mantém o preço atual.
 */
@Entity
@Table(name = "frota_sugestoes_preco_posto")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SugestaoPrecoPosto extends BaseEntity {

    public enum Situacao {
        PENDENTE("Aguardando confirmação"),
        CONFIRMADA("Preço atualizado"),
        DESCARTADA("Descartada");

        private final String rotulo;

        Situacao(String rotulo) {
            this.rotulo = rotulo;
        }

        public String getRotulo() {
            return rotulo;
        }
    }

    @Column(name = "id_abastecimento", nullable = false, updatable = false)
    private UUID idAbastecimento;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_posto", nullable = false, updatable = false)
    private PostoAbastecimento posto;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_produto", nullable = false, updatable = false)
    private ProdutoAbastecimento produto;

    @Column(name = "preco_cadastrado", precision = 12, scale = 3, updatable = false)
    private BigDecimal precoCadastrado;

    @Column(name = "preco_cupom", nullable = false, precision = 12, scale = 3, updatable = false)
    private BigDecimal precoCupom;

    @Column(name = "data_cupom", nullable = false, updatable = false)
    private LocalDate dataCupom;

    @Enumerated(EnumType.STRING)
    @Column(name = "situacao", nullable = false, length = 20)
    private Situacao situacao = Situacao.PENDENTE;

    @Column(name = "id_usuario_decisao")
    private UUID idUsuarioDecisao;

    @Column(name = "decidido_em")
    private OffsetDateTime decididoEm;

    public SugestaoPrecoPosto(UUID idAbastecimento, PostoAbastecimento posto, ProdutoAbastecimento produto,
                              BigDecimal precoCadastrado, BigDecimal precoCupom, LocalDate dataCupom) {
        if (idAbastecimento == null || posto == null || produto == null || dataCupom == null) {
            throw new InvarianteVioladaException("Sugestão de preço incompleta.");
        }
        if (precoCupom == null || precoCupom.signum() <= 0) {
            throw new InvarianteVioladaException("O preço lido no cupom precisa ser maior que zero.");
        }
        this.idAbastecimento = idAbastecimento;
        this.posto = posto;
        this.produto = produto;
        this.precoCadastrado = precoCadastrado == null ? null : precoCadastrado.setScale(3, RoundingMode.HALF_UP);
        this.precoCupom = precoCupom.setScale(3, RoundingMode.HALF_UP);
        this.dataCupom = dataCupom;
    }

    /** Uma pessoa conferiu o cupom: o preço do posto passa a ser o lido, a partir da data do cupom. */
    public PrecoPostoAbastecimento confirmar(UUID idUsuario, OffsetDateTime agora) {
        exigirPendente();
        this.situacao = Situacao.CONFIRMADA;
        this.idUsuarioDecisao = idUsuario;
        this.decididoEm = agora;
        return new PrecoPostoAbastecimento(posto, produto, precoCupom, dataCupom, PrecoPostoAbastecimento.Origem.CUPOM_CONFIRMADO,
                idAbastecimento, idUsuario);
    }

    public void descartar(UUID idUsuario, OffsetDateTime agora) {
        exigirPendente();
        this.situacao = Situacao.DESCARTADA;
        this.idUsuarioDecisao = idUsuario;
        this.decididoEm = agora;
    }

    private void exigirPendente() {
        if (situacao != Situacao.PENDENTE) {
            throw new InvarianteVioladaException("Esta sugestão de preço já foi decidida (" + situacao.getRotulo().toLowerCase() + ").");
        }
    }
}
