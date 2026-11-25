package com.nexo.app.modules.listas.infrastructure.web;

import com.nexo.app.modules.listas.ListaConfiguravel;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/** Cada lista segue as permissões do módulo dono (Obras, Almoxarifado, Frota); usado nos {@code @PreAuthorize}. */
@Component("permissoesListas")
public class PermissoesListas {

    public boolean podeLer(ListaConfiguravel lista) {
        return lista != null && temAlguma(lista.permissoesLeitura());
    }

    public boolean podeEscrever(ListaConfiguravel lista) {
        return lista != null && temAlguma(lista.permissoesEscrita());
    }

    private static boolean temAlguma(List<String> permissoes) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) {
            return false;
        }
        Set<String> minhas = auth.getAuthorities().stream().map(GrantedAuthority::getAuthority).collect(Collectors.toSet());
        return permissoes.stream().anyMatch(minhas::contains);
    }
}
