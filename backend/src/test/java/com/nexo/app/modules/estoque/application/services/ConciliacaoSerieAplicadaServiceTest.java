package com.nexo.app.modules.estoque.application.services;

import com.nexo.app.modules.estoque.domain.CondicaoMaterial;
import com.nexo.app.modules.estoque.domain.Estoque;
import com.nexo.app.modules.estoque.domain.Material;
import com.nexo.app.modules.estoque.domain.SaldoSerie;
import com.nexo.app.modules.estoque.infrastructure.persistence.ConciliacaoSerieAplicadaRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.MovimentacaoEstoqueRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.SaldoSerieRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ConciliacaoSerieAplicadaServiceTest {

    @Mock private MovimentacaoEstoqueRepository movimentacaoRepository;
    @Mock private ConciliacaoSerieAplicadaRepository conciliacaoRepository;
    @Mock private SaldoSerieRepository serieRepository;
    @InjectMocks private ConciliacaoSerieAplicadaService service;

    /** O banco guarda microssegundos: com os nanossegundos, a própria chegada contava como anterior. */
    @Test
    void conciliarChegada_ComparaNaPrecisaoDoBanco() {
        Estoque estoque = mock(Estoque.class);
        when(estoque.getId()).thenReturn(UUID.randomUUID());
        when(estoque.getIdEquipe()).thenReturn(UUID.randomUUID());
        Material material = mock(Material.class);
        when(material.getId()).thenReturn(UUID.randomUUID());
        SaldoSerie serie = mock(SaldoSerie.class);
        when(serie.isAtivo()).thenReturn(true);
        when(serie.getCondicao()).thenReturn(CondicaoMaterial.NOVO);
        when(serie.getEstoque()).thenReturn(estoque);
        when(serie.getMaterial()).thenReturn(material);
        when(serie.getNumSerie()).thenReturn("S-1");
        when(movimentacaoRepository.contarAplicacoesDaSerie(any(), any(), any())).thenReturn(1L);

        boolean conciliou = service.conciliarChegada(serie, OffsetDateTime.parse("2026-11-07T10:00:00.123456789-03:00"));

        assertTrue(conciliou);
        verify(movimentacaoRepository).contarEntradasDaSerieAntesDe(any(), any(), eq("S-1"),
                eq(OffsetDateTime.parse("2026-11-07T10:00:00.123456-03:00")));
    }
}
