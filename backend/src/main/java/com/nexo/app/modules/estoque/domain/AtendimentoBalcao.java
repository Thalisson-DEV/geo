package com.nexo.app.modules.estoque.domain;

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
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * Um atendimento do balcão do almoxarifado: a retirada da manhã ou a devolução do fim do dia de uma equipe, com
 * quem retirou ou devolveu (matrícula), a assinatura, a foto e os itens. É o termo do dia; as movimentações de
 * estoque continuam nas tabelas de sempre.
 */
@Entity
@Table(name = "atendimentos_balcao")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AtendimentoBalcao extends BaseEntity {

    public enum Tipo { RETIRADA, DEVOLUCAO }

    /** Linha do termo. {@code destino}: GUARDAR (volta ao estoque) ou DESCARTAR (baixa), só na devolução. */
    public record Item(UUID idMaterial, String codigo, String descricao, String unidade, BigDecimal quantidade,
                       String condicao, UUID idObra, String numeroObra, String numeroSerie, String destino,
                       BigDecimal excedente, String motivoExcedente) {
    }

    @Enumerated(EnumType.STRING)
    @Column(name = "tipo", nullable = false, length = 20)
    private Tipo tipo;

    @Column(name = "id_equipe", nullable = false)
    private UUID idEquipe;

    @Column(name = "id_almoxarifado", nullable = false)
    private UUID idAlmoxarifado;

    @Column(name = "id_colaborador")
    private UUID idColaborador;

    @Column(name = "nome_colaborador", length = 200)
    private String nomeColaborador;

    @Column(name = "matricula", length = 30)
    private String matricula;

    /** Referência no armazenamento ("objeto:...") ou "FISICA" quando o termo é assinado em papel. */
    @Column(name = "assinatura", length = 400)
    private String assinatura;

    @Column(name = "foto", length = 400)
    private String foto;

    @Column(name = "observacao", length = 500)
    private String observacao;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "itens", nullable = false, columnDefinition = "jsonb")
    private List<Item> itens = new ArrayList<>();

    @Column(name = "id_referencia")
    private UUID idReferencia;

    @Column(name = "realizado_em", nullable = false)
    private OffsetDateTime realizadoEm;

    @Column(name = "id_usuario_operador")
    private UUID idUsuarioOperador;

    public AtendimentoBalcao(Tipo tipo, UUID idEquipe, UUID idAlmoxarifado, UUID idColaborador, String nomeColaborador,
                             String matricula, String observacao, UUID idUsuarioOperador) {
        this.tipo = Objects.requireNonNull(tipo, "O tipo do atendimento é obrigatório");
        this.idEquipe = Objects.requireNonNull(idEquipe, "A equipe é obrigatória");
        this.idAlmoxarifado = Objects.requireNonNull(idAlmoxarifado, "O almoxarifado é obrigatório");
        this.idColaborador = idColaborador;
        this.nomeColaborador = nomeColaborador;
        this.matricula = matricula;
        this.observacao = observacao == null || observacao.isBlank() ? null : observacao.trim();
        this.idUsuarioOperador = idUsuarioOperador;
        this.realizadoEm = OffsetDateTime.now();
    }

    public void registrarComprovantes(String assinatura, String foto) {
        this.assinatura = assinatura;
        this.foto = foto;
    }

    public void adicionarItem(Item item) {
        if (item.quantidade() == null || item.quantidade().signum() <= 0) {
            throw new InvarianteVioladaException("A quantidade de cada material deve ser positiva.");
        }
        this.itens.add(item);
    }

    public void vincularReferencia(UUID idReferencia) {
        this.idReferencia = idReferencia;
    }
}
