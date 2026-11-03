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

import java.util.UUID;

/**
 * Parecer da IA sobre uma OS, um checklist ou um abastecimento, com a leitura das fotos.
 * Cada nova análise é um registro novo; o relatório mostra a mais recente.
 */
@Entity
@Table(name = "frota_analises_ia")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AnaliseIaFrota extends BaseEntity {

    @Enumerated(EnumType.STRING)
    @Column(name = "alvo", nullable = false, length = 20, updatable = false)
    private AlvoAnaliseIa alvo;

    @Column(name = "id_alvo", nullable = false, updatable = false)
    private UUID idAlvo;

    @Enumerated(EnumType.STRING)
    @Column(name = "parecer", nullable = false, length = 20, updatable = false)
    private ParecerAnaliseIa parecer;

    @Column(name = "resumo", nullable = false, updatable = false, columnDefinition = "TEXT")
    private String resumo;

    /** Pontos, fotos e recomendações em JSON. */
    @Column(name = "resultado", nullable = false, updatable = false, columnDefinition = "TEXT")
    private String resultado;

    @Column(name = "modelo", nullable = false, length = 150, updatable = false)
    private String modelo;

    @Column(name = "fotos_analisadas", nullable = false, updatable = false)
    private int fotosAnalisadas;

    @Column(name = "id_usuario", updatable = false)
    private UUID idUsuario;

    public AnaliseIaFrota(AlvoAnaliseIa alvo, UUID idAlvo, ParecerAnaliseIa parecer, String resumo, String resultado,
                          String modelo, int fotosAnalisadas, UUID idUsuario) {
        this.alvo = alvo;
        this.idAlvo = idAlvo;
        this.parecer = parecer;
        this.resumo = resumo;
        this.resultado = resultado;
        this.modelo = modelo.length() > 150 ? modelo.substring(0, 150) : modelo;
        this.fotosAnalisadas = fotosAnalisadas;
        this.idUsuario = idUsuario;
    }
}
