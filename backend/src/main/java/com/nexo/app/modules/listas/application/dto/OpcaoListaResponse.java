package com.nexo.app.modules.listas.application.dto;

import com.nexo.app.modules.listas.ListaConfiguravel;

import java.util.List;
import java.util.UUID;

/** {@code sistema}: usada por regra do sistema; o nome muda, mas não pode ser desativada. */
public record OpcaoListaResponse(UUID id, ListaConfiguravel lista, String codigo, String rotulo, String descricao,
                                 int ordem, boolean sistema, boolean ativo, List<String> contextos) {
}
