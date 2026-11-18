package com.nexo.app.modules.obras.application.dto;

import com.nexo.app.modules.obras.domain.TipoEventoProgramacao;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Filtros do histórico. {@code mudou} é EQUIPE ou PERIODO: mostra só as mudanças que trocaram isso.
 * {@code numeroProgramacao} restringe a uma programação pelo número que a tela mostra.
 */
public record EventoProgramacaoFilter(List<TipoEventoProgramacao> tipos, UUID idObra, UUID idProgramacao, String obra, String equipe,
                                      String usuario, String mudou, LocalDate de, LocalDate ate, String q,
                                      Long numeroProgramacao) {
}
