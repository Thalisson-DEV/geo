package com.nexo.app.modules.listas.application.dto;

import com.nexo.app.modules.listas.ListaConfiguravel;

/** Nome e explicação da lista, para o cabeçalho da tela de cadastro. */
public record ListaConfiguravelResponse(ListaConfiguravel lista, String rotulo, String descricao,
                                        java.util.List<ListaConfiguravel.Contexto> contextos) {
}
