package com.nexo.app.modules.rh;

import com.tngtech.archunit.core.importer.ClassFileImporter;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * O RH não conhece a frota: a medida vinda da multa chega com uma origem opaca e sai por evento
 * e pela {@link MedidaDisciplinarApi}.
 */
class RhModuloArquiteturaTest {

    @Test
    void medidasDisciplinaresNaoDependemDaFrota() {
        var violacoes = new ClassFileImporter().importPackages("com.nexo.app.modules.rh").stream()
                .flatMap(origem -> origem.getDirectDependenciesFromSelf().stream())
                .filter(d -> d.getTargetClass().getPackageName().startsWith("com.nexo.app.modules.frota"))
                .map(Object::toString)
                .toList();

        assertThat(violacoes).as("dependências do RH para a frota").isEmpty();
    }
}
