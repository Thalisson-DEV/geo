package com.nexo.app.modules.estoque.domain;

/**
 * Catálogo a que o material pertence. Um catálogo não aparece nem movimenta no outro:
 * {@link #FROTA} só entra em estoques do tipo FROTA, e {@link #OPERACIONAL} nunca entra neles.
 */
public enum CatalogoMaterial {
    OPERACIONAL,
    FROTA
}
