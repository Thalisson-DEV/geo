package com.nexo.app.modules.rh.application.events.listeners;

import com.nexo.app.modules.rh.infrastructure.persistence.ColaboradorRepository;
import com.nexo.app.shared.domain.events.VinculoUsuarioColaboradorAlteradoEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

/**
 * Mantém {@code colaboradores.id_usuario} coerente quando o IAM troca o colaborador de
 * um acesso existente: o colaborador anterior deixa de apontar para o usuário e o novo
 * passa a apontar.
 */
@Component
@RequiredArgsConstructor
public class VinculoUsuarioColaboradorListener {

    private final ColaboradorRepository colaboradorRepository;

    /**
     * Grava direto no repositório, então derruba o cache de colaboradores por conta própria.
     */
    @ApplicationModuleListener
    @CacheEvict(cacheNames = "colaboradores", allEntries = true)
    public void on(VinculoUsuarioColaboradorAlteradoEvent event) {
        // Limpa qualquer colaborador que ainda aponte para este usuário, não só o anterior
        // informado: cobre vínculos inversos que tenham ficado dessincronizados no passado.
        colaboradorRepository.findByIdUsuario(event.usuarioId())
            .filter(colaborador -> !colaborador.getId().equals(event.colaboradorNovoId()))
            .ifPresent(colaborador -> {
                colaborador.desvincularUsuario();
                colaboradorRepository.save(colaborador);
            });

        if (event.colaboradorNovoId() != null) {
            colaboradorRepository.findById(event.colaboradorNovoId()).ifPresent(colaborador -> {
                colaborador.vincularUsuario(event.usuarioId());
                colaboradorRepository.save(colaborador);
            });
        }
    }
}
