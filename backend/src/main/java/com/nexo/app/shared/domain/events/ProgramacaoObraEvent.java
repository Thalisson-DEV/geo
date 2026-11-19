package com.nexo.app.shared.domain.events;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Mudança na programação de obra que importa ao almoxarifado: os materiais a instalar da programação viram uma
 * solicitação técnica de adição, com o início da programação como saque previsto. Publicado dentro da transação
 * da programação: se a solicitação não puder ser gerada, a programação também não é gravada.
 *
 * @param itens só em {@link Tipo#CRIADA}: material e quantidade, já somados por material
 */
public record ProgramacaoObraEvent(
        Tipo tipo,
        UUID idProgramacao,
        long numeroProgramacao,
        UUID idObra,
        UUID idEquipe,
        LocalDate inicio,
        UUID idAlmoxarifadoAtendimento,
        String ocorrencia,
        String observacao,
        List<Material> itens
) {

    public enum Tipo {
        CRIADA,
        REPROGRAMADA,
        CANCELADA
    }

    public record Material(UUID idMaterial, BigDecimal quantidade) {
    }

    public ProgramacaoObraEvent {
        itens = itens == null ? List.of() : List.copyOf(itens);
    }
}
