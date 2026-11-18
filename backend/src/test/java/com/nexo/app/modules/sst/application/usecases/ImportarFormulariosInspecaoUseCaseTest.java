package com.nexo.app.modules.sst.application.usecases;

import com.nexo.app.modules.sst.application.dto.ConfirmarImportacaoFormularioInspecaoRequest;
import com.nexo.app.modules.sst.application.dto.CriarFormularioRequest;
import com.nexo.app.modules.sst.application.dto.FormularioInspecaoImportacaoDTO;
import com.nexo.app.modules.sst.domain.FormularioInspecao;
import com.nexo.app.modules.sst.domain.GravidadeDesvio;
import com.nexo.app.modules.sst.domain.TipoResposta;
import com.nexo.app.modules.sst.infrastructure.persistence.FormularioInspecaoRepository;
import com.nexo.app.shared.application.dto.ImportacaoStatus;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ImportarFormulariosInspecaoUseCaseTest {

    private static final String CABECALHO = "Formulário;Descrição;Grupo;Pergunta;Orientação;Tipo;Gravidade;Por colaborador;Obrigatória;Opções\n";

    @Mock
    private FormularioInspecaoUseCases formularioUseCases;
    @Mock
    private FormularioInspecaoRepository repository;
    @InjectMocks
    private ImportarFormulariosInspecaoUseCase useCase;

    @Test
    void deveValidarLinhasIgnorandoComentariosEApontarErros() {
        when(repository.findByTituloIgnoreCase(anyString())).thenReturn(Optional.empty());
        String csv = CABECALHO
                + "# comentário\n"
                + "Comercial;Equipe parada;EPI;Capacete com jugular;IND;;Alta;Sim;Sim;\n"
                + "Comercial;;Veículo;Pneus;;Checklist;Rara;Não;;\n"
                + "Comercial;;Conclusão;Conclusão da inspeção;;Escolha;;;;Liberada\n";

        var r = useCase.executarValidacao(new MockMultipartFile("arquivo", "f.csv", "text/csv", csv.getBytes(StandardCharsets.UTF_8)));

        assertThat(r.totalProcessados()).isEqualTo(3);
        assertThat(r.totalFalha()).isEqualTo(2);
        assertThat(r.registros()).extracting(FormularioInspecaoImportacaoDTO::status)
                .containsExactly(ImportacaoStatus.AGUARDANDO_PROCESSAMENTO, ImportacaoStatus.COM_ERRO, ImportacaoStatus.COM_ERRO);
        assertThat(r.registros().get(1).mensagemErro()).contains("Gravidade");
        assertThat(r.registros().get(2).mensagemErro()).contains("duas opções");
    }

    @Test
    void deveRecusarTituloJaCadastrado() {
        when(repository.findByTituloIgnoreCase("Leiturista")).thenReturn(Optional.of(mock(FormularioInspecao.class)));
        String csv = CABECALHO + "Leiturista;;EPI;Bota em perfeitas condições?;;;Alta;;;\n";

        var r = useCase.executarValidacao(new MockMultipartFile("arquivo", "f.csv", "text/csv", csv.getBytes(StandardCharsets.UTF_8)));

        assertThat(r.registros().get(0).status()).isEqualTo(ImportacaoStatus.COM_ERRO);
        assertThat(r.registros().get(0).mensagemErro()).contains("Já existe");
    }

    @Test
    void deveMontarChecklistComConformePadraoENaoConformeGerandoDesvio() {
        when(repository.findByTituloIgnoreCase(anyString())).thenReturn(Optional.empty());
        var linhas = List.of(
                linha(1, "Comercial", "EPI", "Capacete com jugular", "IND", "", "Alta", "Sim", ""),
                linha(2, "Comercial", "Veículo", "Pneus / estepe", "", "Checklist", "Média", "Não", ""),
                linha(3, "Comercial", "EPI", "Óculos incolor", "", "", "Baixa", "", ""),
                linha(4, "Comercial", "Conclusão", "Conclusão da inspeção", "", "Escolha", "", "", "Liberada sem notificação|Turma suspensa"));

        var r = useCase.confirmarImportacao(new ConfirmarImportacaoFormularioInspecaoRequest(linhas));

        ArgumentCaptor<CriarFormularioRequest> captor = ArgumentCaptor.forClass(CriarFormularioRequest.class);
        verify(formularioUseCases).criar(captor.capture());
        CriarFormularioRequest req = captor.getValue();
        assertThat(req.titulo()).isEqualTo("Comercial");
        assertThat(req.grupos()).extracting(CriarFormularioRequest.GrupoRequest::titulo).containsExactly("EPI", "Veículo", "Conclusão");
        assertThat(req.grupos().get(0).perguntas()).hasSize(2);

        var capacete = req.grupos().get(0).perguntas().get(0);
        assertThat(capacete.tipoResposta()).isEqualTo(TipoResposta.MULTIPLA_ESCOLHA);
        assertThat(capacete.orientacao()).isEqualTo("IND");
        assertThat(capacete.desvioPorColaborador()).isTrue();
        assertThat(capacete.opcoes()).extracting(CriarFormularioRequest.OpcaoRequest::texto)
                .containsExactly("Conforme", "Não conforme", "Não se aplica");
        assertThat(capacete.opcoes().get(0).padrao()).isTrue();
        assertThat(capacete.opcoes().get(1).geraDesvio()).isTrue();
        assertThat(capacete.opcoes().get(1).gravidade()).isEqualTo(GravidadeDesvio.ALTA);
        assertThat(capacete.opcoes().get(2).geraDesvio()).isFalse();

        var pneu = req.grupos().get(1).perguntas().get(0);
        assertThat(pneu.desvioPorColaborador()).isFalse();
        assertThat(pneu.opcoes().get(1).gravidade()).isEqualTo(GravidadeDesvio.MEDIA);

        var conclusao = req.grupos().get(2).perguntas().get(0);
        assertThat(conclusao.opcoes()).noneMatch(CriarFormularioRequest.OpcaoRequest::geraDesvio);
        assertThat(r.registros()).allMatch(l -> l.status() == ImportacaoStatus.CONCLUIDO);
    }

    @Test
    void naoDeveCriarFormularioComLinhaComErroMasDeveCriarOsDemais() {
        when(repository.findByTituloIgnoreCase(anyString())).thenReturn(Optional.empty());
        var linhas = List.of(
                linha(1, "Comercial", "EPI", "Capacete", "", "", "Alta", "", ""),
                linha(2, "Comercial", "EPI", "", "", "", "Alta", "", ""),
                linha(3, "Leiturista", "EPI", "Bota", "", "", "Alta", "", ""));

        var r = useCase.confirmarImportacao(new ConfirmarImportacaoFormularioInspecaoRequest(linhas));

        verify(formularioUseCases, times(1)).criar(any());
        assertThat(r.registros()).extracting(FormularioInspecaoImportacaoDTO::status)
                .containsExactly(ImportacaoStatus.COM_ERRO, ImportacaoStatus.COM_ERRO, ImportacaoStatus.CONCLUIDO);
        assertThat(r.registros().get(0).mensagemErro()).contains("Outra linha");
    }

    @Test
    void deveDevolverErroDoDominioNasLinhasDoFormulario() {
        when(repository.findByTituloIgnoreCase(anyString())).thenReturn(Optional.empty());
        when(formularioUseCases.criar(any())).thenThrow(new InvarianteVioladaException("Já existe um formulário de inspeção com este título."));

        var r = useCase.confirmarImportacao(new ConfirmarImportacaoFormularioInspecaoRequest(
                List.of(linha(1, "Comercial", "EPI", "Capacete", "", "", "Alta", "", ""))));

        assertThat(r.totalFalha()).isEqualTo(1);
        assertThat(r.registros().get(0).mensagemErro()).contains("Já existe");
    }

    @Test
    void deveRespeitarAspasNoCsv() {
        assertThat(ImportarFormulariosInspecaoUseCase.colunasCsv("a;\"b;c\";\"d \"\"e\"\"\""))
                .containsExactly("a", "b;c", "d \"e\"");
        verify(formularioUseCases, never()).criar(any());
    }

    private static FormularioInspecaoImportacaoDTO linha(int n, String form, String grupo, String pergunta, String orientacao,
                                                         String tipo, String gravidade, String porColaborador, String opcoes) {
        return new FormularioInspecaoImportacaoDTO(n, form, "", grupo, pergunta, orientacao, tipo, gravidade,
                porColaborador, "", opcoes, ImportacaoStatus.AGUARDANDO_PROCESSAMENTO, null);
    }
}
