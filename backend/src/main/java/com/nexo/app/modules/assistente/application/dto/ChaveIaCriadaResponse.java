package com.nexo.app.modules.assistente.application.dto;

/** A chave so e mostrada uma vez: o GEO guarda apenas o hash. */
public record ChaveIaCriadaResponse(ConexaoIaResponse conexao, String chave) {
}
