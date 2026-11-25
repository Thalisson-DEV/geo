package com.nexo.app.modules.estoque.domain;

import com.nexo.app.shared.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.UUID;

/**
 * Regras do almoxarifado que o gestor ajusta sem deploy. Existe uma única linha, criada pela migração com o id
 * {@link #ID_UNICO}. Os padrões servem à rotina diária (retirada de manhã, devolução no fim do dia).
 */
@Entity
@Table(name = "estoque_parametros")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ParametrosEstoque extends BaseEntity {

    public static final UUID ID_UNICO = UUID.fromString("00000000-0000-0000-0000-00000000e001");

    /** Ligado: a retirada só sai depois da separação concluída. Desligado: o balcão entrega direto. */
    @Column(name = "separacao_obrigatoria", nullable = false)
    private boolean separacaoObrigatoria;

    /** O almoxarife pode entregar mais do que o pedido (o excedente fica registrado, com motivo). */
    @Column(name = "entrega_acima_pedido", nullable = false)
    private boolean entregaAcimaPedido = true;

    /** A equipe pode devolver mais do que o caminhão tem desse material (o caminhão fica negativo e aparece). */
    @Column(name = "devolucao_acima_caminhao", nullable = false)
    private boolean devolucaoAcimaCaminhao;

    @Column(name = "exige_assinatura", nullable = false)
    private boolean exigeAssinatura = true;

    @Column(name = "exige_matricula", nullable = false)
    private boolean exigeMatricula = true;

    @Column(name = "exige_foto", nullable = false)
    private boolean exigeFoto = true;

    public void atualizar(boolean separacaoObrigatoria, boolean entregaAcimaPedido, boolean devolucaoAcimaCaminhao,
                          boolean exigeAssinatura, boolean exigeMatricula, boolean exigeFoto) {
        this.separacaoObrigatoria = separacaoObrigatoria;
        this.entregaAcimaPedido = entregaAcimaPedido;
        this.devolucaoAcimaCaminhao = devolucaoAcimaCaminhao;
        this.exigeAssinatura = exigeAssinatura;
        this.exigeMatricula = exigeMatricula;
        this.exigeFoto = exigeFoto;
    }
}
