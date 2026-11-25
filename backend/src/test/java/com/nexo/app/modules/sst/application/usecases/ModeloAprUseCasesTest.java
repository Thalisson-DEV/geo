package com.nexo.app.modules.sst.application.usecases;

import com.nexo.app.modules.sst.AprApi;
import com.nexo.app.modules.sst.application.dto.ModeloAprRequest;
import com.nexo.app.modules.sst.domain.CondicaoApr;
import com.nexo.app.modules.sst.domain.EstruturaApr;
import com.nexo.app.modules.sst.domain.ModeloApr;
import com.nexo.app.modules.sst.infrastructure.persistence.ModeloAprRepository;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static com.nexo.app.modules.sst.domain.CondicaoApr.DESLIGAMENTO;
import static com.nexo.app.modules.sst.domain.CondicaoApr.LINHA_VIVA;
import static com.nexo.app.modules.sst.domain.CondicaoApr.SEMPRE;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ModeloAprUseCasesTest {

    @Mock ModeloAprRepository repository;
    @InjectMocks ModeloAprUseCases useCases;

    private static EstruturaApr estrutura() {
        return new EstruturaApr(
                List.of(new EstruturaApr.Risco("r1", "Choque elétrico", List.of(DESLIGAMENTO, LINHA_VIVA), List.of("m1")),
                        new EstruturaApr.Risco("r2", "Queda de altura", List.of(), List.of())),
                List.of(new EstruturaApr.Medida("m1", "EPI e EPC", List.of(SEMPRE)),
                        new EstruturaApr.Medida("m2", "Desenergização", List.of(DESLIGAMENTO))),
                List.of(new EstruturaApr.Verificacao("v1", "EPI em bom estado", List.of()),
                        new EstruturaApr.Verificacao("v2", "Desligamento confirmado", List.of(DESLIGAMENTO))));
    }

    @Test
    void montaParaOAppAsSugestoesPorCondicaoAsMedidasDoRiscoEAsVerificacoesCondicionais() {
        when(repository.findFirstByAtivoTrueOrderByDataCriacaoAsc()).thenReturn(Optional.of(new ModeloApr(estrutura())));

        AprApi.OpcoesAprCampo m = useCases.opcoesParaCampo();

        assertThat(m.riscos()).containsExactly("Choque elétrico", "Queda de altura");
        assertThat(m.sugestoes().get("DESLIGAMENTO").riscos()).containsExactly("Choque elétrico");
        assertThat(m.sugestoes().get("DESLIGAMENTO").medidas()).containsExactly("Desenergização");
        assertThat(m.sugestoes().get("SEMPRE").medidas()).containsExactly("EPI e EPC");
        assertThat(m.sugestoes()).doesNotContainKey("PODA");
        assertThat(m.medidasDoRisco()).containsEntry("Choque elétrico", List.of("EPI e EPC")).doesNotContainKey("Queda de altura");
        assertThat(m.condicoesDasVerificacoes()).containsEntry("Desligamento confirmado", List.of("DESLIGAMENTO"))
                .doesNotContainKey("EPI em bom estado");
    }

    @Test
    void salvarAlteraOCadastroExistenteComTextosLimpos() {
        ModeloApr atual = new ModeloApr(estrutura());
        when(repository.findFirstByAtivoTrueOrderByDataCriacaoAsc()).thenReturn(Optional.of(atual));
        when(repository.saveAndFlush(any())).thenAnswer(i -> i.getArgument(0));
        EstruturaApr nova = new EstruturaApr(
                List.of(new EstruturaApr.Risco("r9", "  Ruído   excessivo ", List.of(CondicaoApr.POSTE), List.of())),
                estrutura().medidas(), estrutura().verificacoes());

        var resposta = useCases.salvar(new ModeloAprRequest(nova));

        assertThat(resposta.estrutura().riscos()).extracting(EstruturaApr.Risco::texto).containsExactly("Ruído excessivo");
        assertThat(resposta.condicoes()).hasSize(CondicaoApr.values().length);
    }

    @Test
    void recusaTextoRepetidoMedidaInexistenteEListaVazia() {
        EstruturaApr base = estrutura();
        assertThatThrownBy(() -> new ModeloApr(new EstruturaApr(List.of(
                new EstruturaApr.Risco("a", "Escavação", List.of(), List.of()),
                new EstruturaApr.Risco("b", "escavação", List.of(), List.of())), base.medidas(), base.verificacoes())))
                .isInstanceOf(InvarianteVioladaException.class).hasMessageContaining("duas vezes");
        assertThatThrownBy(() -> new ModeloApr(new EstruturaApr(List.of(
                new EstruturaApr.Risco("a", "Escavação", List.of(), List.of("nao-existe"))), base.medidas(), base.verificacoes())))
                .isInstanceOf(InvarianteVioladaException.class).hasMessageContaining("medida que não existe");
        assertThatThrownBy(() -> new ModeloApr(new EstruturaApr(base.riscos(), base.medidas(), List.of())))
                .isInstanceOf(InvarianteVioladaException.class).hasMessageContaining("verificação");
    }

    @Test
    void semCadastroAvisaEmVezDeInventarOpcoes() {
        when(repository.findFirstByAtivoTrueOrderByDataCriacaoAsc()).thenReturn(Optional.empty());
        assertThatThrownBy(() -> useCases.opcoesParaCampo()).isInstanceOf(RecursoNaoEncontradoException.class);
    }
}
