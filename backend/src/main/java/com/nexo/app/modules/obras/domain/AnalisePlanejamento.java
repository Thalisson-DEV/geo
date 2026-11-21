package com.nexo.app.modules.obras.domain;

import com.nexo.app.shared.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Leitura de uma página do projeto pela Bússola. A proposta é só sugestão: nada dela entra no planejamento
 * sem o aceite do usuário.
 */
@Entity
@Table(name = "analises_planejamento")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AnalisePlanejamento extends BaseEntity {

    @Column(name = "id_obra", nullable = false)
    private UUID idObra;

    @Column(name = "id_anexo", nullable = false)
    private UUID idAnexo;

    @Column(name = "pagina", nullable = false)
    private Integer pagina;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private StatusAnalisePlanejamento status = StatusAnalisePlanejamento.PROCESSANDO;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "proposta", columnDefinition = "jsonb")
    private PropostaPlanejamento proposta;

    @Column(name = "modelo", length = 200)
    private String modelo;

    @Column(name = "mensagem", length = 1000)
    private String mensagem;

    @Column(name = "data_conclusao")
    private OffsetDateTime dataConclusao;

    public AnalisePlanejamento(UUID idObra, UUID idAnexo, Integer pagina, String modelo) {
        this.idObra = idObra;
        this.idAnexo = idAnexo;
        this.pagina = pagina;
        this.modelo = modelo;
    }

    public void concluir(PropostaPlanejamento proposta) {
        this.proposta = proposta;
        this.status = StatusAnalisePlanejamento.CONCLUIDA;
        this.dataConclusao = OffsetDateTime.now();
    }

    /**
     * Leitura que passou do prazo sem terminar foi interrompida (o servidor reiniciou no meio): falha, para a tela parar
     * de esperar e a pessoa poder pedir de novo.
     *
     * @return true quando a leitura acabou de ser encerrada aqui
     */
    public boolean expirarSeTravada(OffsetDateTime agora, java.time.Duration prazo) {
        if (status != StatusAnalisePlanejamento.PROCESSANDO || getDataCriacao() == null
                || getDataCriacao().plus(prazo).isAfter(agora)) {
            return false;
        }
        falhar("A leitura foi interrompida antes de terminar. Peça a leitura de novo.");
        return true;
    }

    public void falhar(String mensagem) {
        this.mensagem = mensagem != null && mensagem.length() > 1000 ? mensagem.substring(0, 1000) : mensagem;
        this.status = StatusAnalisePlanejamento.FALHOU;
        this.dataConclusao = OffsetDateTime.now();
    }
}
