package com.nexo.app.modules.rh.infrastructure.web;

import org.junit.jupiter.api.Test;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;

import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Medida disciplinar é dado restrito: todo endpoint exige uma permissão própria, e quem só lê
 * o cadastro do colaborador ({@code rh:colaborador:read}) não chega a nenhum deles.
 */
class MedidaDisciplinarControllerAcessoTest {

    @Test
    void todosOsEndpointsExigemPermissaoDeMedidaDisciplinar() {
        for (Class<?> controller : List.of(MedidaDisciplinarController.class, ConfiguracaoMedidaDisciplinarController.class)) {
            List<Method> endpoints = Arrays.stream(controller.getDeclaredMethods()).filter(MedidaDisciplinarControllerAcessoTest::endpoint).toList();
            assertThat(endpoints).isNotEmpty();
            for (Method m : endpoints) {
                PreAuthorize regra = m.getAnnotation(PreAuthorize.class);
                assertThat(regra).as(controller.getSimpleName() + "." + m.getName()).isNotNull();
                assertThat(regra.value()).as(m.getName()).contains("rh:medida-disciplinar:").doesNotContain("rh:colaborador");
            }
        }
    }

    @Test
    void cancelarExigeAPermissaoDeCancelamento() throws Exception {
        Method cancelar = Arrays.stream(MedidaDisciplinarController.class.getDeclaredMethods())
                .filter(m -> m.getName().equals("cancelar")).findFirst().orElseThrow();

        assertThat(cancelar.getAnnotation(PreAuthorize.class).value()).contains("rh:medida-disciplinar:cancelar");
    }

    private static boolean endpoint(Method m) {
        return m.isAnnotationPresent(GetMapping.class) || m.isAnnotationPresent(PostMapping.class) || m.isAnnotationPresent(PutMapping.class)
                || m.isAnnotationPresent(PatchMapping.class) || m.isAnnotationPresent(DeleteMapping.class);
    }
}
