package com.nexo.app.modules.rh.application.mappers;

import com.nexo.app.modules.rh.domain.Colaborador;
import com.nexo.app.modules.rh.domain.Equipe;
import com.nexo.app.modules.rh.domain.EquipeMembro;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class EquipeMapperMembrosTest {

    private final EquipeMapper mapper = mock(EquipeMapper.class, Mockito.CALLS_REAL_METHODS);

    @Test
    @DisplayName("Composição da equipe traz só vínculos ativos, sem repetir quem trocou de função")
    void ignoraHistoricoDeVinculos() {
        UUID clovis = UUID.randomUUID();
        UUID guilherme = UUID.randomUUID();
        UUID exMembro = UUID.randomUUID();
        EquipeMembro clovisAntigo = membro(clovis, false);
        EquipeMembro guilhermeAntigo = membro(guilherme, false);
        EquipeMembro clovisAtual = membro(clovis, true);
        EquipeMembro guilhermeAtual = membro(guilherme, true);
        EquipeMembro saiu = membro(exMembro, false);
        Equipe equipe = mock(Equipe.class);
        when(equipe.getMembros()).thenReturn(List.of(clovisAntigo, guilhermeAntigo, clovisAtual, guilhermeAtual, saiu));

        assertThat(mapper.membrosAtivos(equipe)).containsExactly(clovisAtual, guilhermeAtual);
    }

    @Test
    @DisplayName("Equipe sem membros não quebra o mapeamento")
    void equipeSemMembros() {
        assertThat(mapper.membrosAtivos(null)).isEmpty();
    }

    private static EquipeMembro membro(UUID idColaborador, boolean ativo) {
        Colaborador colaborador = mock(Colaborador.class);
        when(colaborador.getId()).thenReturn(idColaborador);
        EquipeMembro membro = mock(EquipeMembro.class);
        when(membro.isVinculoAtivo()).thenReturn(ativo);
        Mockito.lenient().when(membro.getColaborador()).thenReturn(colaborador);
        return membro;
    }
}
