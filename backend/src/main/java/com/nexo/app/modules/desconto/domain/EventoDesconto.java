package com.nexo.app.modules.desconto.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

/**
 * Um ponto da linha do tempo de um desconto.
 *
 * <p>As colunas do desconto guardam só o estado atual: desfazer uma validação ou uma
 * baixa as apaga. Aqui fica o que aconteceu, na ordem em que aconteceu, sem nunca
 * ser reescrito — corrigir uma decisão é registrar outra.</p>
 */
@Entity
@Table(name = "desconto_evento")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class EventoDesconto {

    @Id
    private UUID id;

    @Column(name = "id_desconto", nullable = false, updatable = false)
    private UUID idDesconto;

    @Enumerated(EnumType.STRING)
    @Column(name = "tipo", nullable = false, length = 30, updatable = false)
    private TipoEventoDesconto tipo;

    @Enumerated(EnumType.STRING)
    @Column(name = "status_anterior", length = 20, updatable = false)
    private StatusDesconto statusAnterior;

    @Enumerated(EnumType.STRING)
    @Column(name = "status_novo", nullable = false, length = 20, updatable = false)
    private StatusDesconto statusNovo;

    /** Quem fez; nulo apenas em registros reconstruídos ou feitos fora de uma requisição. */
    @Column(name = "id_usuario", updatable = false)
    private UUID idUsuario;

    /** Valor em jogo: sugerido, validado, baixado, do item ou o que deixou de valer. */
    @Column(name = "valor", precision = 12, scale = 2, updatable = false)
    private BigDecimal valor;

    /** Motivo, descrição do item, nome do arquivo ou o que mudou nos dados. */
    @Column(name = "texto", columnDefinition = "TEXT", updatable = false)
    private String texto;

    /** Anexo envolvido (comprovante ou termo assinado), para abrir pela linha do tempo. */
    @Column(name = "id_anexo", updatable = false)
    private UUID idAnexo;

    @Column(name = "ocorrido_em", nullable = false, updatable = false)
    private OffsetDateTime ocorridoEm;

    public EventoDesconto(Desconto desconto, TipoEventoDesconto tipo, StatusDesconto statusAnterior,
                          UUID idUsuario, BigDecimal valor, String texto, UUID idAnexo) {
        Objects.requireNonNull(desconto, "O desconto é obrigatório.");
        this.id = UUID.randomUUID();
        this.idDesconto = Objects.requireNonNull(desconto.getId(), "O desconto precisa estar salvo.");
        this.tipo = Objects.requireNonNull(tipo, "O tipo do evento é obrigatório.");
        this.statusAnterior = statusAnterior;
        this.statusNovo = desconto.getStatus();
        this.idUsuario = idUsuario;
        this.valor = valor;
        this.texto = StringUtils.hasText(texto) ? texto.trim() : null;
        this.idAnexo = idAnexo;
        this.ocorridoEm = OffsetDateTime.now();
    }
}
