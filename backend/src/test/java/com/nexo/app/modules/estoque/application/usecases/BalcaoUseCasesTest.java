package com.nexo.app.modules.estoque.application.usecases;

import com.nexo.app.modules.estoque.application.dto.BalcaoRequests;
import com.nexo.app.modules.estoque.application.dto.BalcaoResponses;
import com.nexo.app.modules.estoque.application.services.AlocacaoObraService;
import com.nexo.app.modules.estoque.application.services.ComprovanteBalcaoService;
import com.nexo.app.modules.estoque.application.services.DebitoSaldoService;
import com.nexo.app.modules.estoque.domain.AtendimentoBalcao;
import com.nexo.app.modules.estoque.domain.CondicaoMaterial;
import com.nexo.app.modules.estoque.domain.Estoque;
import com.nexo.app.modules.estoque.domain.Material;
import com.nexo.app.modules.estoque.domain.MovimentacaoEstoque;
import com.nexo.app.modules.estoque.domain.MovimentacaoEstoque.TipoMovimentacao;
import com.nexo.app.modules.estoque.domain.ParametrosEstoque;
import com.nexo.app.modules.estoque.domain.Saldo;
import com.nexo.app.modules.estoque.domain.TipoEstoque;
import com.nexo.app.modules.estoque.infrastructure.persistence.AlocacaoObraRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.AtendimentoBalcaoRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.EstoqueRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.MaterialRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.MovimentacaoEstoqueRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.SaldoRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.SaldoSerieRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.SolicitacaoMaterialRepository;
import com.nexo.app.modules.obras.ObraApi;
import com.nexo.app.modules.rh.ColaboradorApi;
import com.nexo.app.modules.rh.EquipeApi;
import com.nexo.app.modules.rh.EquipeMembroResponse;
import com.nexo.app.modules.rh.EquipeResponse;
import com.nexo.app.modules.rh.ResumoColaborador;
import com.nexo.app.modules.rh.domain.EquipeMembro;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BalcaoUseCasesTest {

    @Mock private ParametrosEstoqueUseCases parametrosUseCases;
    @Mock private SolicitacaoMaterialRepository solicitacaoRepository;
    @Mock private MovimentacaoEstoqueRepository movimentacaoRepository;
    @Mock private EstoqueRepository estoqueRepository;
    @Mock private SaldoRepository saldoRepository;
    @Mock private SaldoSerieRepository serieRepository;
    @Mock private AlocacaoObraRepository alocacaoRepository;
    @Mock private MaterialRepository materialRepository;
    @Mock private AtendimentoBalcaoRepository atendimentoRepository;
    @Mock private AlocacaoObraService alocacao;
    @Mock private DebitoSaldoService debitoSaldoService;
    @Mock private ComprovanteBalcaoService comprovantes;
    @Mock private OperacaoSolicitacaoTecnicaUseCases operacoes;
    @Mock private SeparacaoSolicitacaoTecnicaUseCases separacao;
    @Mock private EquipeApi equipeApi;
    @Mock private ColaboradorApi colaboradorApi;
    @Mock private ObraApi obraApi;
    @InjectMocks private BalcaoUseCases useCases;

    private final UUID idEquipe = UUID.randomUUID();
    private final UUID idObra = UUID.randomUUID();
    private final UUID idEncarregado = UUID.randomUUID();
    private ParametrosEstoque parametros;
    private Estoque almox;
    private Estoque caminhao;
    private Material cabo;

    @BeforeEach
    void preparar() {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(UUID.randomUUID().toString(), null, List.of()));
        parametros = mock(ParametrosEstoque.class);
        lenient().when(parametros.isExigeMatricula()).thenReturn(true);
        lenient().when(parametros.isExigeFoto()).thenReturn(true);
        lenient().when(parametros.isExigeAssinatura()).thenReturn(true);
        lenient().when(parametrosUseCases.obter()).thenReturn(parametros);
        almox = comId(new Estoque("ALMOX CENTRAL TIMON", comId(new TipoEstoque("FISICO"))));
        caminhao = comId(new Estoque("CON-TMN-01", comId(new TipoEstoque("CAMPO"))));
        caminhao.vincularEquipe(idEquipe);
        cabo = comId(new Material("300013", "Cabo multiplexado 1x1x35", "M", "MATR", null, null, false, UUID.randomUUID()));
        lenient().when(estoqueRepository.findById(almox.getId())).thenReturn(Optional.of(almox));
        lenient().when(estoqueRepository.findByIdEquipe(idEquipe)).thenReturn(Optional.of(caminhao));
        lenient().when(materialRepository.findById(cabo.getId())).thenReturn(Optional.of(cabo));
        lenient().when(equipeApi.buscarPorIdResponse(idEquipe)).thenReturn(Optional.of(equipe()));
        lenient().when(colaboradorApi.buscarIdPorMatricula("12345")).thenReturn(Optional.of(idEncarregado));
        lenient().when(colaboradorApi.buscarResumosPorIds(anyCollection())).thenReturn(Map.of(idEncarregado,
                new ResumoColaborador(idEncarregado, "ELIENE MARIA DOS REIS", "ENCARREGADO", "TIMON", true)));
        lenient().when(colaboradorApi.buscarMatriculasPorIds(anyCollection())).thenReturn(Map.of(idEncarregado, "12345"));
        lenient().when(atendimentoRepository.saveAndFlush(any())).thenAnswer(i -> comId(i.getArgument(0)));
        lenient().when(atendimentoRepository.save(any())).thenAnswer(i -> i.getArgument(0));
        lenient().when(comprovantes.guardarAssinatura(any(), any())).thenReturn("objeto:assinatura.png");
        lenient().when(comprovantes.guardarFoto(any(), any())).thenReturn("objeto:foto.jpg");
        lenient().when(obraApi.numerosPorIds(anyCollection())).thenReturn(Map.of(idObra, "430126363"));
    }

    @AfterEach
    void limpar() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("Devolução tira do caminhão, libera a obra e volta ao almoxarifado, com quem devolveu pela matrícula")
    void devolverSobraDaObra() {
        when(saldoRepository.findByEstoqueIdAndMaterialIdAndCondicao(caminhao.getId(), cabo.getId(), CondicaoMaterial.NOVO))
                .thenReturn(Optional.of(saldo(caminhao, "6")));

        BalcaoResponses.AtendimentoResumo resumo = useCases.registrarDevolucao(idEquipe, devolucao(
                item(CondicaoMaterial.NOVO, "5", BalcaoRequests.Destino.GUARDAR)));

        verify(alocacao).liberar(caminhao, cabo, CondicaoMaterial.NOVO, idObra, new BigDecimal("5"));
        verify(debitoSaldoService).debitar(caminhao, cabo, CondicaoMaterial.NOVO, new BigDecimal("5"));
        ArgumentCaptor<MovimentacaoEstoque> movimento = ArgumentCaptor.forClass(MovimentacaoEstoque.class);
        verify(movimentacaoRepository).save(movimento.capture());
        assertThat(movimento.getValue().getTipo()).isEqualTo(TipoMovimentacao.DEVOLUCAO);
        assertThat(movimento.getValue().getIdObra()).isEqualTo(idObra);
        assertThat(resumo.tipo()).isEqualTo("DEVOLUCAO");
        assertThat(resumo.nomeColaborador()).isEqualTo("ELIENE MARIA DOS REIS");
        assertThat(resumo.matricula()).isEqualTo("12345");
        assertThat(resumo.temFoto()).isTrue();
        assertThat(resumo.itens()).singleElement().satisfies(i -> {
            assertThat(i.numeroObra()).isEqualTo("430126363");
            assertThat(i.destino()).isEqualTo("GUARDAR");
        });
    }

    @Test
    @DisplayName("Material novo acima do que está no caminhão é recusado quando a regra não permite")
    void recusaDevolucaoAcimaDoCaminhao() {
        when(saldoRepository.findByEstoqueIdAndMaterialIdAndCondicao(caminhao.getId(), cabo.getId(), CondicaoMaterial.NOVO))
                .thenReturn(Optional.of(saldo(caminhao, "2")));

        assertThatThrownBy(() -> useCases.registrarDevolucao(idEquipe, devolucao(
                item(CondicaoMaterial.NOVO, "5", BalcaoRequests.Destino.GUARDAR))))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("O caminhão tem só 2");
        verify(debitoSaldoService, never()).debitar(any(), any(), any(), any());
    }

    @Test
    @DisplayName("Sucata entra mesmo sem saldo no caminhão e o descarte gera baixa sem guardar")
    void sucataDescartada() {
        useCases.registrarDevolucao(idEquipe, devolucao(item(CondicaoMaterial.SUCATA, "3", BalcaoRequests.Destino.DESCARTAR)));

        ArgumentCaptor<MovimentacaoEstoque> movimentos = ArgumentCaptor.forClass(MovimentacaoEstoque.class);
        verify(movimentacaoRepository, times(2)).save(movimentos.capture());
        assertThat(movimentos.getAllValues()).extracting(MovimentacaoEstoque::getTipo)
                .containsExactly(TipoMovimentacao.DEVOLUCAO, TipoMovimentacao.BAIXA_AVULSA);
        verify(saldoRepository, never()).findWithLockByEstoqueIdAndMaterialIdAndCondicao(eq(almox.getId()), any(), any());
    }

    @Test
    @DisplayName("Sem foto, o balcão recusa quando a foto é exigida")
    void exigeFoto() {
        BalcaoRequests.RegistrarDevolucao semFoto = new BalcaoRequests.RegistrarDevolucao(almox.getId(),
                new BalcaoRequests.Comprovante(null, "12345", "data:image/png;base64,AAAA", null, null),
                List.of(item(CondicaoMaterial.SUCATA, "1", BalcaoRequests.Destino.GUARDAR)));

        assertThatThrownBy(() -> useCases.registrarDevolucao(idEquipe, semFoto))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("foto");
        verify(atendimentoRepository, never()).saveAndFlush(any(AtendimentoBalcao.class));
    }

    @Test
    @DisplayName("Matrícula desconhecida não deixa registrar")
    void matriculaDesconhecida() {
        BalcaoRequests.RegistrarDevolucao comMatriculaErrada = new BalcaoRequests.RegistrarDevolucao(almox.getId(),
                new BalcaoRequests.Comprovante(null, "99999", "FISICA", "data:image/jpeg;base64,AAAA", null),
                List.of(item(CondicaoMaterial.SUCATA, "1", BalcaoRequests.Destino.GUARDAR)));

        assertThatThrownBy(() -> useCases.registrarDevolucao(idEquipe, comMatriculaErrada))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("99999");
    }

    @Test
    @DisplayName("Quem não tem matrícula no cadastro não retira quando a regra exige")
    void pessoaSemMatriculaNoCadastro() {
        UUID deFora = UUID.randomUUID();
        BalcaoRequests.RegistrarDevolucao semMatricula = new BalcaoRequests.RegistrarDevolucao(almox.getId(),
                new BalcaoRequests.Comprovante(deFora, null, "FISICA", "data:image/jpeg;base64,AAAA", null),
                List.of(item(CondicaoMaterial.SUCATA, "1", BalcaoRequests.Destino.GUARDAR)));

        assertThatThrownBy(() -> useCases.registrarDevolucao(idEquipe, semMatricula))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("não tem matrícula no cadastro");
    }

    private BalcaoRequests.RegistrarDevolucao devolucao(BalcaoRequests.ItemDevolucao... itens) {
        return new BalcaoRequests.RegistrarDevolucao(almox.getId(),
                new BalcaoRequests.Comprovante(null, " 12345 ", "data:image/png;base64,AAAA", "data:image/jpeg;base64,AAAA", null),
                List.of(itens));
    }

    private BalcaoRequests.ItemDevolucao item(CondicaoMaterial condicao, String quantidade, BalcaoRequests.Destino destino) {
        return new BalcaoRequests.ItemDevolucao(cabo.getId(), condicao, idObra, new BigDecimal(quantidade), null, destino);
    }

    private EquipeResponse equipe() {
        return new EquipeResponse(idEquipe, "CON-TMN-01", null, null, null, null, null, null, null, true,
                List.of(new EquipeMembroResponse(UUID.randomUUID(), idEncarregado, "ELIENE MARIA DOS REIS",
                        EquipeMembro.FuncaoMembro.RESPONSAVEL, OffsetDateTime.now(), null, true)), null, null);
    }

    private Saldo saldo(Estoque estoque, String quantidade) {
        Saldo saldo = new Saldo(estoque, cabo, CondicaoMaterial.NOVO);
        saldo.adicionarQuantidade(new BigDecimal(quantidade));
        return saldo;
    }

    private static <T> T comId(T entidade) {
        ReflectionTestUtils.setField(entidade, "id", UUID.randomUUID());
        return entidade;
    }
}
