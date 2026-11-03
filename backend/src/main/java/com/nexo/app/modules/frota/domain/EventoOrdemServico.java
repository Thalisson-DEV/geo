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

import java.time.OffsetDateTime;
import java.util.UUID;

/** Linha do histórico de uma OS: o que aconteceu, quando e por quem. Somente inserção. */
@Entity
@Table(name = "frota_os_historico")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class EventoOrdemServico extends BaseEntity {

    @Column(name = "id_ordem_servico", nullable = false, updatable = false)
    private UUID idOrdemServico;

    @Enumerated(EnumType.STRING)
    @Column(name = "tipo", nullable = false, length = 30, updatable = false)
    private TipoEventoOrdemServico tipo;

    @Column(name = "descricao", length = 1000, updatable = false)
    private String descricao;

    /** Nulo quando o fato veio do sistema (ex.: decisão do financeiro). */
    @Column(name = "id_usuario", updatable = false)
    private UUID idUsuario;

    @Column(name = "ocorrido_em", nullable = false, updatable = false)
    private OffsetDateTime ocorridoEm;

    public EventoOrdemServico(UUID idOrdemServico, TipoEventoOrdemServico tipo, String descricao,
                              UUID idUsuario, OffsetDateTime ocorridoEm) {
        this.idOrdemServico = idOrdemServico;
        this.tipo = tipo;
        this.descricao = descricao == null || descricao.length() <= 1000 ? descricao : descricao.substring(0, 1000);
        this.idUsuario = idUsuario;
        this.ocorridoEm = ocorridoEm;
    }
}
