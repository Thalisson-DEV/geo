package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Liberação do gestor para um condutor com CNH vencida ou de categoria insuficiente dirigir
 * um veículo, só naquele dia, com a justificativa registrada.
 */
@Entity
@Table(name = "frota_liberacoes_cnh")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class LiberacaoCnh extends BaseEntity {

    private static final int JUSTIFICATIVA_MINIMA = 10;

    @Column(name = "id_condutor", nullable = false, updatable = false)
    private UUID idCondutor;

    @Column(name = "id_veiculo", nullable = false, updatable = false)
    private UUID idVeiculo;

    @Column(name = "dia", nullable = false, updatable = false)
    private LocalDate dia;

    @Column(name = "justificativa", nullable = false, length = 1000, updatable = false)
    private String justificativa;

    @Column(name = "id_usuario_liberacao", updatable = false)
    private UUID idUsuarioLiberacao;

    /**
     * @param hoje data atual no fuso de Brasília: não se libera dia passado
     */
    public LiberacaoCnh(UUID idCondutor, UUID idVeiculo, LocalDate dia, String justificativa, UUID idUsuario,
                        AptidaoConducao aptidao, LocalDate hoje) {
        if (idCondutor == null || idVeiculo == null) {
            throw new InvarianteVioladaException("Informe o condutor e o veículo.");
        }
        if (dia == null || dia.isBefore(hoje)) {
            throw new InvarianteVioladaException("A liberação vale para hoje ou para um dia futuro.");
        }
        if (aptidao.isApto()) {
            throw new InvarianteVioladaException("A CNH do condutor já permite conduzir este veículo; não é preciso liberar.");
        }
        var texto = Textos.obrigatorio(justificativa, "justificativa da liberação", 1000);
        if (texto.length() < JUSTIFICATIVA_MINIMA) {
            throw new InvarianteVioladaException("Descreva a justificativa com pelo menos " + JUSTIFICATIVA_MINIMA + " caracteres.");
        }
        this.idCondutor = idCondutor;
        this.idVeiculo = idVeiculo;
        this.dia = dia;
        this.justificativa = texto;
        this.idUsuarioLiberacao = idUsuario;
    }
}
