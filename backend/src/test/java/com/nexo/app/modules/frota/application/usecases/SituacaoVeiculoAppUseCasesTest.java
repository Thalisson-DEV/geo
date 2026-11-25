package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.application.dto.VeiculoFrotaDetalheResponse;
import com.nexo.app.modules.frota.application.dto.VinculoCondutorResponse;
import com.nexo.app.modules.frota.domain.DocumentoFrota;
import com.nexo.app.modules.frota.domain.OrdemServico;
import com.nexo.app.modules.frota.domain.PendenciaChecklist;
import com.nexo.app.modules.frota.domain.RespostaChecklist;
import com.nexo.app.modules.frota.domain.SituacaoOperacional;
import com.nexo.app.modules.frota.domain.SituacaoOrdemServico;
import com.nexo.app.modules.frota.domain.SituacaoPendenciaChecklist;
import com.nexo.app.modules.frota.domain.SituacaoVencimento;
import com.nexo.app.modules.frota.domain.TipoManutencao;
import com.nexo.app.modules.frota.domain.UnidadeMedicao;
import com.nexo.app.modules.frota.infrastructure.persistence.DocumentoFrotaRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.OrdemServicoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.PendenciaChecklistRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyIterable;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SituacaoVeiculoAppUseCasesTest {

    @Mock
    private com.nexo.app.modules.frota.infrastructure.persistence.DespesaVeiculoRepository despesas;
    @Mock
    private VeiculoFrotaUseCases veiculos;
    @Mock
    private OrdemServicoRepository ordens;
    @Mock
    private PendenciaChecklistRepository pendencias;
    @Mock
    private DocumentoFrotaRepository documentos;
    @Mock
    private ParametrosFrotaUseCases parametros;
    @Mock
    private PreventivaUseCases preventiva;
    @Mock
    private com.nexo.app.modules.frota.infrastructure.persistence.AcoplamentoImplementoRepository acoplamentos;
    @Mock
    private com.nexo.app.shared.infrastructure.storage.ObjectStorageService objectStorage;
    @Mock
    private com.nexo.app.modules.listas.ListasApi listasApi;

    @org.junit.jupiter.api.BeforeEach
    void listasDevolvemNome() {
        org.mockito.Mockito.lenient().when(listasApi.rotulo(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any())).thenAnswer(i -> i.getArgument(1));
    }

    @InjectMocks
    private SituacaoVeiculoAppUseCases useCases;

    private final UUID idVeiculo = UUID.randomUUID();

    @Test
    void juntaOrdensAbertasProblemasDoChecklistEDocumentosComVencimento() {
        var veiculo = veiculo();
        when(veiculos.detalhar(idVeiculo)).thenReturn(veiculo);
        var os = ordem(42L, SituacaoOrdemServico.EM_ANDAMENTO);
        when(ordens.findAllByIdVeiculoAndSituacaoInAndAtivoTrueOrderByAbertaEmDesc(eq(idVeiculo), anyCollection())).thenReturn(List.of(os));
        var concluida = ordem(40L, SituacaoOrdemServico.CONCLUIDA);
        when(ordens.findTop5ByIdVeiculoAndSituacaoAndAtivoTrueOrderByFimRealDesc(idVeiculo, SituacaoOrdemServico.CONCLUIDA))
                .thenReturn(List.of(concluida));

        var resposta = mock(RespostaChecklist.class);
        when(resposta.resumo()).thenReturn("Faróis — Queimado");
        var comOs = pendencia(resposta, SituacaoPendenciaChecklist.OS_ABERTA, os.getId());
        var semDecisao = pendencia(resposta, SituacaoPendenciaChecklist.ABERTA, null);
        when(pendencias.findAllByIdVeiculoAndSituacaoInAndAtivoTrueOrderByDataCriacaoDesc(eq(idVeiculo), anyCollection()))
                .thenReturn(List.of(comOs, semDecisao));
        when(ordens.findAllById(anyIterable())).thenReturn(List.of(os));

        var vencido = documento("CRLV", LocalDate.now().minusDays(3));
        var semData = documento("OUTRO", null);
        when(documentos.findAllByIdVeiculoAndAtivoTrueOrderByDataVencimentoAsc(idVeiculo)).thenReturn(List.of(vencido, semData));
        when(parametros.diasAviso()).thenReturn(30);

        var situacao = useCases.situacao(idVeiculo);

        assertThat(situacao.placa()).isEqualTo("ABC1D23");
        assertThat(situacao.condutorAtual()).isEqualTo("Maria");
        assertThat(situacao.ordensAbertas()).extracting(o -> o.numero()).containsExactly(42L);
        assertThat(situacao.ultimasConcluidas()).extracting(o -> o.numero()).containsExactly(40L);
        assertThat(situacao.pendencias()).extracting(p -> p.numeroOrdem()).containsExactly(42L, null);
        assertThat(situacao.pendencias().get(0).item()).isEqualTo("Faróis — Queimado");
        assertThat(situacao.documentos()).singleElement()
                .satisfies(d -> assertThat(d.situacao()).isEqualTo(SituacaoVencimento.VENCIDO));
        // A consulta de documentos mostra todos, mesmo sem vencimento ou sem arquivo.
        assertThat(situacao.documentosDoConjunto()).hasSize(2)
                .allSatisfy(d -> assertThat(d.titular()).isEqualTo("ABC1D23"))
                .allSatisfy(d -> assertThat(d.arquivoNome()).isNull());
        assertThat(situacao.documentosDoConjunto().get(1).situacao()).isEqualTo(SituacaoVencimento.SEM_VENCIMENTO);
    }

    private VeiculoFrotaDetalheResponse veiculo() {
        var condutor = mock(VinculoCondutorResponse.class);
        when(condutor.condutor()).thenReturn("Maria");
        var v = mock(VeiculoFrotaDetalheResponse.class);
        when(v.idVeiculo()).thenReturn(idVeiculo);
        when(v.placa()).thenReturn("ABC1D23");
        when(v.situacao()).thenReturn(SituacaoOperacional.ATIVO);
        when(v.kmAtual()).thenReturn(128437L);
        when(v.unidadeMedicao()).thenReturn(UnidadeMedicao.KM);
        when(v.condutorAtual()).thenReturn(condutor);
        return v;
    }

    private static OrdemServico ordem(Long numero, SituacaoOrdemServico situacao) {
        var o = mock(OrdemServico.class);
        when(o.getId()).thenReturn(UUID.randomUUID());
        when(o.getNumero()).thenReturn(numero);
        when(o.getSituacao()).thenReturn(situacao);
        when(o.getTipoManutencao()).thenReturn(TipoManutencao.CORRETIVA);
        when(o.getAbertaEm()).thenReturn(OffsetDateTime.now().minusDays(2));
        return o;
    }

    private static PendenciaChecklist pendencia(RespostaChecklist resposta, SituacaoPendenciaChecklist situacao, UUID idOs) {
        var p = mock(PendenciaChecklist.class);
        when(p.getId()).thenReturn(UUID.randomUUID());
        when(p.getResposta()).thenReturn(resposta);
        when(p.getSituacao()).thenReturn(situacao);
        when(p.getIdOrdemServico()).thenReturn(idOs);
        return p;
    }

    private static DocumentoFrota documento(String tipo, LocalDate vencimento) {
        var d = mock(DocumentoFrota.class);
        when(d.getDataVencimento()).thenReturn(vencimento);
        if (vencimento != null) when(d.getTipo()).thenReturn(tipo);
        return d;
    }
}
