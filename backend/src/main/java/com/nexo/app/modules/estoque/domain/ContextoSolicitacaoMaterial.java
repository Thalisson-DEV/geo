package com.nexo.app.modules.estoque.domain;

public enum ContextoSolicitacaoMaterial {
    COMERCIAL,
    TECNICO,
    /** Regularização do saldo da obra no fechamento; nunca aparece nas telas técnicas e comerciais. */
    FECHAMENTO
}
