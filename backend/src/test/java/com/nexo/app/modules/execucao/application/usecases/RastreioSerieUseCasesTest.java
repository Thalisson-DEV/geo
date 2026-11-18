package com.nexo.app.modules.execucao.application.usecases;

import com.nexo.app.modules.estoque.EstoqueApi;
import com.nexo.app.modules.estoque.MaterialResponse;
import com.nexo.app.modules.execucao.application.dto.SerieNaNota;
import com.nexo.app.modules.execucao.domain.ExecucaoComercial;
import com.nexo.app.modules.execucao.domain.ExecucaoMaterial;
import com.nexo.app.modules.execucao.domain.TipoNota;
import com.nexo.app.modules.execucao.infrastructure.persistence.ExecucaoMaterialRepository;
import com.nexo.app.modules.rh.EquipeApi;
import com.nexo.app.modules.rh.EquipeResponse;
import com.nexo.app.shared.application.dto.OperacaoMaterial;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.lenient;

@ExtendWith(MockitoExtension.class)
class RastreioSerieUseCasesTest {

    @Mock ExecucaoMaterialRepository repository;
    @Mock EquipeApi equipeApi;
    @Mock EstoqueApi estoqueApi;
    @InjectMocks RastreioSerieUseCases useCases;

    private final UUID idEquipe = UUID.randomUUID();
    private final UUID idMaterial = UUID.randomUUID();

    @Test
    @SuppressWarnings("unchecked")
    void devolveANotaDaSerieExataSemDiferenciarMaiusculasNemEspacos() {
        ExecucaoMaterial aplicado = material(" ab123456 ", nota("4001234567", TipoNota.COMUM), OperacaoMaterial.APLICADO);
        when(repository.buscarPorSeries(anyCollection())).thenReturn(List.of(aplicado));
        dadosDeApoio();

        List<SerieNaNota> achadas = useCases.localizar(List.of("AB123456", "ab123456 ", " "));

        assertThat(achadas).singleElement().satisfies(s -> {
            assertThat(s.serieInformada()).isEqualTo("AB123456");
            assertThat(s.numeroSerie()).isEqualTo("ab123456");
            assertThat(s.exata()).isTrue();
            assertThat(s.referenciaNota()).isEqualTo("4001234567");
            assertThat(s.operacao()).isEqualTo(OperacaoMaterial.APLICADO);
            assertThat(s.equipe()).isEqualTo("EQ-01");
            assertThat(s.materialCodigo()).isEqualTo("123");
        });
        var series = org.mockito.ArgumentCaptor.forClass(Collection.class);
        verify(repository).buscarPorSeries(series.capture());
        assertThat(series.getValue()).containsExactly("AB123456");
        verify(repository, never()).buscarPorTrechoDeSerie(anyString(), any(Pageable.class));
    }

    @Test
    void serieSemLancamentoExatoProcuraPorTrechoEMarcaComoAproximada() {
        when(repository.buscarPorSeries(anyCollection())).thenReturn(List.of());
        ExecucaoMaterial parecido = material("00AB123456", nota("4009999999", TipoNota.AVULSA), OperacaoMaterial.RETIRADO);
        when(repository.buscarPorTrechoDeSerie(eq("%AB123456%"), any(Pageable.class))).thenReturn(List.of(parecido));
        dadosDeApoio();

        List<SerieNaNota> achadas = useCases.localizar(List.of("ab123456", "A1"));

        assertThat(achadas).singleElement().satisfies(s -> {
            assertThat(s.exata()).isFalse();
            assertThat(s.serieInformada()).isEqualTo("ab123456");
            assertThat(s.aguardandoNumeroOficial()).isTrue();
            assertThat(s.operacao()).isEqualTo(OperacaoMaterial.RETIRADO);
        });
        // "A1" e curta demais para procurar por trecho.
        verify(repository, never()).buscarPorTrechoDeSerie(eq("%A1%"), any(Pageable.class));
    }

    @Test
    void semSeriesNaoConsulta() {
        assertThat(useCases.localizar(List.of(" ", ""))).isEmpty();
        verify(repository, never()).buscarPorSeries(anyCollection());
    }

    private void dadosDeApoio() {
        EquipeResponse equipe = mock(EquipeResponse.class);
        when(equipe.id()).thenReturn(idEquipe);
        lenient().when(equipe.codigo()).thenReturn("EQ-01");
        when(equipeApi.buscarPorIdsResponse(anyCollection())).thenReturn(List.of(equipe));
        MaterialResponse material = mock(MaterialResponse.class);
        when(material.id()).thenReturn(idMaterial);
        lenient().when(material.codigo()).thenReturn("123");
        lenient().when(material.descricao()).thenReturn("MEDIDOR MONOFASICO");
        when(estoqueApi.buscarMateriaisPorIdsResponse(anyCollection())).thenReturn(List.of(material));
    }

    private ExecucaoComercial nota(String referencia, TipoNota tipo) {
        ExecucaoComercial nota = mock(ExecucaoComercial.class);
        lenient().when(nota.getId()).thenReturn(UUID.randomUUID());
        when(nota.getIdEquipe()).thenReturn(idEquipe);
        lenient().when(nota.getReferenciaNota()).thenReturn(referencia);
        lenient().when(nota.getTipoNota()).thenReturn(tipo);
        lenient().when(nota.getDataLancamento()).thenReturn(OffsetDateTime.parse("2026-11-03T10:15:00-03:00"));
        return nota;
    }

    private ExecucaoMaterial material(String serie, ExecucaoComercial nota, OperacaoMaterial operacao) {
        ExecucaoMaterial material = mock(ExecucaoMaterial.class);
        when(material.getExecucao()).thenReturn(nota);
        when(material.getIdMaterial()).thenReturn(idMaterial);
        when(material.getNumSerie()).thenReturn(serie);
        lenient().when(material.getOperacao()).thenReturn(operacao);
        return material;
    }
}
