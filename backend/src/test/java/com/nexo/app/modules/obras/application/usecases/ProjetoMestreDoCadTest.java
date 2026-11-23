package com.nexo.app.modules.obras.application.usecases;

import com.nexo.app.modules.obras.domain.PlanejamentoObra;
import com.nexo.app.modules.obras.infrastructure.persistence.PlanejamentoObraRepository;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import org.junit.jupiter.api.Test;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ProjetoMestreDoCadTest {

    private static final UUID OBRA = UUID.randomUUID();
    private static final UUID CAD = UUID.randomUUID();

    private final PlanejamentoObraRepository repositorio = mock(PlanejamentoObraRepository.class);
    private final PlanejamentoObraUseCases planejamento = mock(PlanejamentoObraUseCases.class);
    private final ProjetoMestreDoCad projetoMestre = new ProjetoMestreDoCad(repositorio, planejamento,
            mock(org.springframework.transaction.PlatformTransactionManager.class));

    @Test
    void obraSemProjetoGanhaAPlantaDoCadAnexado() {
        when(repositorio.findByIdObraAndAtivoTrue(OBRA)).thenReturn(Optional.empty());

        projetoMestre.definirSeFaltar(new ProjetoMestreDoCad.ProjetoCadAnexado(OBRA, CAD));

        verify(planejamento).definirProjetoMestre(OBRA, CAD);
    }

    @Test
    void obraQueJaTemProjetoNaoTrocaPorCausaDoAnexo() {
        PlanejamentoObra comProjeto = new PlanejamentoObra(OBRA);
        comProjeto.definirProjetoMestre(UUID.randomUUID());
        when(repositorio.findByIdObraAndAtivoTrue(OBRA)).thenReturn(Optional.of(comProjeto));

        projetoMestre.definirSeFaltar(new ProjetoMestreDoCad.ProjetoCadAnexado(OBRA, CAD));

        verify(planejamento, never()).definirProjetoMestre(any(), any());
    }

    @Test
    void falhaAoGerarAPlantaNaoQuebraNada() {
        when(repositorio.findByIdObraAndAtivoTrue(OBRA)).thenReturn(Optional.of(new PlanejamentoObra(OBRA)));
        when(planejamento.definirProjetoMestre(OBRA, CAD)).thenThrow(new InvarianteVioladaException("sem conversor"));

        // O envio do arquivo já terminou: a falha da planta fica no log e não sobe para quem anexou.
        assertThatCode(() -> projetoMestre.aoAnexarCad(new ProjetoMestreDoCad.ProjetoCadAnexado(OBRA, CAD))).doesNotThrowAnyException();
    }
}
