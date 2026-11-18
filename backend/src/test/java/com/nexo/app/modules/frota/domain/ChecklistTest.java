package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ChecklistTest {

    private static final OffsetDateTime AGORA = OffsetDateTime.now();

    private final FichaVeiculo ficha = FichaVeiculo.provisionar(UUID.randomUUID(), "ABC1D23", UUID.randomUUID());
    private final ModeloChecklist caminhonete = gravado(new ModeloChecklist(new ModeloChecklist.Dados(
            "Caminhonete", TipoModeloChecklist.PRINCIPAL, null, false, Set.of(), Set.of(),
            List.of(new ModeloChecklist.DadosPergunta(null, "Iluminação", "Faróis", TipoRespostaChecklist.OK_NOK, ModoFotoPergunta.NAO_OK, null,
                            List.of(new ModeloChecklist.DadosAlternativa(null, "Queimado", false))),
                    new ModeloChecklist.DadosPergunta(null, null, "Pneus", TipoRespostaChecklist.OPCOES, ModoFotoPergunta.NUNCA,
                            List.of(new ModeloChecklist.DadosAlternativa(null, "Bom", false),
                                    new ModeloChecklist.DadosAlternativa(null, "Careca", true)), null),
                    new ModeloChecklist.DadosPergunta(null, null, "Observações", TipoRespostaChecklist.TEXTO, ModoFotoPergunta.NUNCA, null, null)),
            List.of(new ModeloChecklist.DadosFotoRecebimento(null, "Frente"),
                    new ModeloChecklist.DadosFotoRecebimento(null, "Painel")))));
    private final ModeloChecklist cesto = gravado(new ModeloChecklist(new ModeloChecklist.Dados(
            "Cesto aéreo", TipoModeloChecklist.ADICIONAL, null, false, Set.of(), Set.of(UUID.randomUUID()),
            List.of(new ModeloChecklist.DadosPergunta(null, null, "Patolas", TipoRespostaChecklist.OK_NOK, ModoFotoPergunta.NUNCA, null, null)),
            null)));

    private static ModeloChecklist gravado(ModeloChecklist modelo) {
        ReflectionTestUtils.setField(modelo, "id", UUID.randomUUID());
        modelo.getPerguntas().forEach(p -> {
            ReflectionTestUtils.setField(p, "id", UUID.randomUUID());
            p.getAlternativas().forEach(a -> ReflectionTestUtils.setField(a, "id", UUID.randomUUID()));
        });
        modelo.getFotosRecebimento().forEach(f -> ReflectionTestUtils.setField(f, "id", UUID.randomUUID()));
        return modelo;
    }

    private PerguntaChecklist pergunta(ModeloChecklist modelo, int i) {
        return modelo.perguntasAtivas().get(i);
    }

    private UUID alternativa(int pergunta, String texto) {
        return pergunta(caminhonete, pergunta).getAlternativas().stream()
                .filter(a -> a.getTexto().equals(texto)).findFirst().orElseThrow().getId();
    }

    private List<Checklist.RespostaInformada> tudoOk() {
        var lista = new ArrayList<Checklist.RespostaInformada>();
        lista.add(new Checklist.RespostaInformada(pergunta(caminhonete, 0).getId(), true, null, null, null, null));
        lista.add(new Checklist.RespostaInformada(pergunta(caminhonete, 1).getId(), null, alternativa(1, "Bom"), null, null, null));
        lista.add(new Checklist.RespostaInformada(pergunta(caminhonete, 2).getId(), null, null, "Sem observações", null, null));
        return lista;
    }

    private Checklist.Registro registro(List<Checklist.RespostaInformada> respostas, List<Checklist.FotoRecebimentoInformada> fotos) {
        return new Checklist.Registro(UUID.randomUUID(), FinalidadeChecklist.USO, UUID.randomUUID(), UUID.randomUUID(), AGORA.minusMinutes(5),
                12_000L, null, false, respostas, fotos);
    }

    @Test
    void registraChecklistSemProblemaCopiandoAsPerguntas() {
        var checklist = Checklist.registrar(registro(tudoOk(), null), ficha, caminhonete, List.of(), false, AGORA);

        assertThat(checklist.getPlaca()).isEqualTo("ABC1D23");
        assertThat(checklist.getModeloNome()).isEqualTo("Caminhonete");
        assertThat(checklist.getRespostas()).extracting(RespostaChecklist::resumo)
                .containsExactly("Faróis — OK", "Pneus — Bom", "Observações — Sem observações");
        assertThat(checklist.problemas()).isEmpty();
        assertThat(checklist.isPassagemVeiculo()).isFalse();
    }

    @Test
    void naoOkComMotivoEOpcaoQueIndicaProblemaViramProblemas() {
        var respostas = tudoOk();
        var idFoto = UUID.randomUUID();
        respostas.set(0, new Checklist.RespostaInformada(pergunta(caminhonete, 0).getId(), false, alternativa(0, "Queimado"),
                null, "Lado esquerdo", List.of(idFoto)));
        respostas.set(1, new Checklist.RespostaInformada(pergunta(caminhonete, 1).getId(), null, alternativa(1, "Careca"),
                null, null, null));

        var checklist = Checklist.registrar(registro(respostas, null), ficha, caminhonete, List.of(), false, AGORA);

        assertThat(checklist.problemas()).extracting(RespostaChecklist::resumo)
                .containsExactly("Faróis — Queimado", "Pneus — Careca");
        assertThat(checklist.fotosPendentes()).extracting(FotoChecklist::getIdAparelho).containsExactly(idFoto);
    }

    @Test
    void naoOkSemFotoExigidaERecusado() {
        var respostas = tudoOk();
        respostas.set(0, new Checklist.RespostaInformada(pergunta(caminhonete, 0).getId(), false, null, null, null, null));

        assertThatThrownBy(() -> Checklist.registrar(registro(respostas, null), ficha, caminhonete, List.of(), false, AGORA))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("Tire a foto do item \"Faróis\"");
    }

    @Test
    void perguntaSemRespostaERecusada() {
        var respostas = tudoOk();
        respostas.remove(2);

        assertThatThrownBy(() -> Checklist.registrar(registro(respostas, null), ficha, caminhonete, List.of(), false, AGORA))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("Responda a pergunta \"Observações\"");
    }

    @Test
    void adicionalDoImplementoTambemPrecisaSerRespondido() {
        assertThatThrownBy(() -> Checklist.registrar(registro(tudoOk(), null), ficha, caminhonete, List.of(cesto), false, AGORA))
                .hasMessageContaining("Patolas");

        var respostas = tudoOk();
        respostas.add(new Checklist.RespostaInformada(pergunta(cesto, 0).getId(), true, null, null, null, null));
        var checklist = Checklist.registrar(registro(respostas, null), ficha, caminhonete, List.of(cesto), false, AGORA);
        assertThat(checklist.getRespostas().getLast().getGrupo()).as("sem grupo, vale o nome do adicional").isEqualTo("Cesto aéreo");
    }

    @Test
    void trocaDeCondutorExigeAsFotosDeRecebimento() {
        assertThatThrownBy(() -> Checklist.registrar(registro(tudoOk(), null), ficha, caminhonete, List.of(), true, AGORA))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("recebendo o veículo de outro condutor")
                .hasMessageContaining("Frente, Painel");

        var fotos = caminhonete.fotosRecebimentoAtivas().stream()
                .map(f -> new Checklist.FotoRecebimentoInformada(f.getId(), UUID.randomUUID())).toList();
        var checklist = Checklist.registrar(registro(tudoOk(), fotos), ficha, caminhonete, List.of(), true, AGORA);
        assertThat(checklist.isPassagemVeiculo()).isTrue();
        assertThat(checklist.fotosPendentes()).extracting(FotoChecklist::getDescricao).containsExactly("Frente", "Painel");
    }

    @Test
    void recusaDataNoFuturoEMedicaoAusente() {
        var futuro = new Checklist.Registro(UUID.randomUUID(), FinalidadeChecklist.USO, UUID.randomUUID(), UUID.randomUUID(), AGORA.plusHours(2),
                12_000L, null, false, tudoOk(), null);
        assertThatThrownBy(() -> Checklist.registrar(futuro, ficha, caminhonete, List.of(), false, AGORA))
                .hasMessageContaining("futuro");

        var semMedicao = new Checklist.Registro(UUID.randomUUID(), FinalidadeChecklist.USO, UUID.randomUUID(), UUID.randomUUID(), AGORA,
                null, null, false, tudoOk(), null);
        assertThatThrownBy(() -> Checklist.registrar(semMedicao, ficha, caminhonete, List.of(), false, AGORA))
                .hasMessageContaining("KM do painel");
    }

    @Test
    void fotoReenviadaNaoMudaAQueJaChegou() {
        var respostas = tudoOk();
        var idFoto = UUID.randomUUID();
        respostas.set(0, new Checklist.RespostaInformada(pergunta(caminhonete, 0).getId(), false, null, null, null, List.of(idFoto)));
        var foto = Checklist.registrar(registro(respostas, null), ficha, caminhonete, List.of(), false, AGORA).foto(idFoto).orElseThrow();

        assertThat(foto.anexar("a.jpg", "a.jpg", "image/jpeg", 10, AGORA)).isTrue();
        assertThat(foto.anexar("b.jpg", "b.jpg", "image/jpeg", 10, AGORA)).isFalse();
        assertThat(foto.getArquivoChave()).isEqualTo("a.jpg");
    }
}
