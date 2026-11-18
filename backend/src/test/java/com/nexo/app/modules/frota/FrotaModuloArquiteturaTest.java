package com.nexo.app.modules.frota;

import com.nexo.app.GeoApplication;
import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;

/** A frota só pode depender das APIs públicas de outros módulos (RH, IAM) e do shared. */
class FrotaModuloArquiteturaTest {

    @Test
    void frotaUsaApenasApisPublicasDeOutrosModulos() {
        var modules = ApplicationModules.of(GeoApplication.class);
        var frota = modules.stream()
                .filter(module -> module.getBasePackage().getName().equals("com.nexo.app.modules.frota"))
                .findFirst()
                .orElseThrow(() -> new AssertionError("Modulo frota nao encontrado"));

        frota.verifyDependencies(modules);
    }
}
