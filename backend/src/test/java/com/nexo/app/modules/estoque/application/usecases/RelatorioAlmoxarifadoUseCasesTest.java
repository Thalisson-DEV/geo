package com.nexo.app.modules.estoque.application.usecases;

import com.nexo.app.modules.estoque.application.dto.EstoqueRelatorioResponse;
import com.nexo.app.modules.estoque.application.dto.MovimentacoesRelatorioResponse;
import com.nexo.app.modules.estoque.infrastructure.persistence.RelatorioAlmoxarifadoRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.projections.MovimentacaoRelatorioProjection;
import com.nexo.app.modules.estoque.infrastructure.persistence.projections.SaldoRelatorioProjection;
import com.nexo.app.modules.iam.UsuarioApi;
import com.nexo.app.modules.obras.ObraApi;
import com.nexo.app.modules.rh.BaseOperacionalApi;
import com.nexo.app.modules.rh.EquipeApi;
import com.nexo.app.modules.rh.ProcessoNegocioApi;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class RelatorioAlmoxarifadoUseCasesTest {

    @Mock private RelatorioAlmoxarifadoRepository repository;
    @Mock private BaseOperacionalApi baseApi;
    @Mock private EquipeApi equipeApi;
    @Mock private ProcessoNegocioApi processoApi;
    @Mock private ObraApi obraApi;
    @Mock private UsuarioApi usuarioApi;
    @Mock private FechamentoObraUseCases fechamentoUseCases;
    @InjectMocks private RelatorioAlmoxarifadoUseCases useCases;

    private static final UUID OPERADOR = UUID.randomUUID();

    private MovimentacaoRelatorioProjection movimentacao() {
        MovimentacaoRelatorioProjection p = mock(MovimentacaoRelatorioProjection.class);
        when(p.getId()).thenReturn(UUID.randomUUID());
        when(p.getDataHora()).thenReturn(1_794_000_000_000L);
        when(p.getTipo()).thenReturn("ENTREGA");
        when(p.getCondicao()).thenReturn("NOVO");
        when(p.getQuantidade()).thenReturn(new BigDecimal("3"));
        when(p.getObservacao()).thenReturn("Entregue no balcão");
        when(p.getIdOperador()).thenReturn(OPERADOR);
        return p;
    }

    @Test
    void movimentacoesTrazemOPeriodoAnteriorDeMesmaDuracaoMarcado() {
        when(equipeApi.listarEquipesAtivas()).thenReturn(List.of());
        when(baseApi.buscarPorIdsResponse(anyCollection())).thenReturn(Map.of());
        when(usuarioApi.buscarNomePorId(OPERADOR)).thenReturn(Optional.of("Ana"));
        List<MovimentacaoRelatorioProjection> atual = List.of(movimentacao());
        List<MovimentacaoRelatorioProjection> anterior = List.of(movimentacao());
        when(repository.listarMovimentacoes(anyString(), anyString(), anyInt())).thenReturn(atual, anterior);

        MovimentacoesRelatorioResponse r = useCases.movimentacoes(LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 31));

        assertThat(r.anteriorDe()).isEqualTo(LocalDate.of(2026, 8, 31));
        assertThat(r.anteriorAte()).isEqualTo(LocalDate.of(2026, 9, 30));
        assertThat(r.movimentacoes()).hasSize(2);
        assertThat(r.movimentacoes()).extracting(MovimentacoesRelatorioResponse.Linha::anterior).containsExactly(false, true);
        assertThat(r.movimentacoes()).extracting(MovimentacoesRelatorioResponse.Linha::operador).containsOnly("Ana");
        // A observação do período anterior não interessa à comparação.
        assertThat(r.movimentacoes().get(1).observacao()).isNull();
        ArgumentCaptor<String> inicio = ArgumentCaptor.forClass(String.class);
        verify(repository, org.mockito.Mockito.times(2)).listarMovimentacoes(inicio.capture(), anyString(), eq(40_001));
        assertThat(inicio.getAllValues().get(0)).startsWith("2026-10-01T00:00");
    }

    @Test
    void periodoInvertidoEhCorrigido() {
        when(equipeApi.listarEquipesAtivas()).thenReturn(List.of());
        when(repository.listarMovimentacoes(anyString(), anyString(), anyInt())).thenReturn(List.of());

        MovimentacoesRelatorioResponse r = useCases.movimentacoes(LocalDate.of(2026, 10, 31), LocalDate.of(2026, 10, 1));

        assertThat(r.de()).isEqualTo(LocalDate.of(2026, 10, 1));
        assertThat(r.ate()).isEqualTo(LocalDate.of(2026, 10, 31));
    }

    @Test
    void estoqueMarcaQuandoPassaDoLimite() {
        when(equipeApi.listarEquipesAtivas()).thenReturn(List.of());
        SaldoRelatorioProjection s = mock(SaldoRelatorioProjection.class);
        when(s.getQuantidade()).thenReturn(BigDecimal.TEN);
        when(s.getSeries()).thenReturn(2L);
        when(repository.listarSaldos(anyInt())).thenReturn(java.util.Collections.nCopies(30_001, s));

        EstoqueRelatorioResponse r = useCases.estoque();

        assertThat(r.truncado()).isTrue();
        assertThat(r.saldos()).hasSize(30_000);
        assertThat(r.saldos().get(0).series()).isEqualTo(2);
    }
}
