package com.nexo.app.modules.automacao.application.motor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.nexo.app.modules.automacao.application.motor.Catalogo.EspecNo;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;

class CatalogoTest {

    private static EspecNo no(String tipo) {
        return EspecNo.de(tipo, "data", tipo, "", "x").criar();
    }

    @Test
    void provedorQueFalhaNaoDeixaOCatalogoPelaMetade() {
        AtomicBoolean primeiraVez = new AtomicBoolean(true);
        Catalogo.ProvedorNos estavel = () -> List.of(no("teste.a"));
        Catalogo.ProvedorNos instavel = () -> {
            if (primeiraVez.getAndSet(false)) throw new IllegalStateException("banco ainda subindo");
            return List.of(no("teste.b"));
        };
        Catalogo catalogo = new Catalogo(List.of(estavel, instavel));

        assertThatThrownBy(() -> catalogo.buscar("teste.a")).hasMessageContaining("banco ainda subindo");

        assertThat(catalogo.buscar("teste.a")).isNotNull();
        assertThat(catalogo.buscar("teste.b")).isNotNull();
        assertThat(catalogo.todos()).hasSize(2);
    }

    @Test
    void recusaNoDuplicado() {
        Catalogo catalogo = new Catalogo(List.of(() -> List.of(no("teste.a")), () -> List.of(no("teste.a"))));

        assertThatThrownBy(() -> catalogo.buscar("teste.a")).hasMessageContaining("Nó duplicado");
    }
}
