package com.nexo.app.modules.obras.domain;

import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DocumentacaoTecnicaTest {

    private static final UUID OBRA = UUID.randomUUID();
    private static final UUID PONTO = UUID.randomUUID();

    private static final EstruturaChecklist ESTRUTURA = new EstruturaChecklist(List.of(new EstruturaChecklist.Grupo("Acesso", List.of(
            new EstruturaChecklist.Pergunta("p1", "Acesso livre?", EstruturaChecklist.TipoPergunta.ESCOLHA_UNICA, true, false, List.of("Sim", "Não")),
            new EstruturaChecklist.Pergunta("p2", "Altura do poste", EstruturaChecklist.TipoPergunta.NUMERO, true, true, null),
            new EstruturaChecklist.Pergunta("p3", "Observação", EstruturaChecklist.TipoPergunta.TEXTO, false, false, null)))));

    private static RespostasChecklist.Informada resposta(String id, String valor, String... selecionadas) {
        return new RespostasChecklist.Informada(id, valor, List.of(selecionadas), false);
    }

    private static ModeloChecklistObra modelo(ModeloChecklistObra.Finalidade finalidade) {
        return new ModeloChecklistObra(finalidade, "Modelo", null, ESTRUTURA);
    }

    @Test
    void modeloExigeGruposPerguntasEOpcoes() {
        assertThatThrownBy(() -> new ModeloChecklistObra(ModeloChecklistObra.Finalidade.AS_BUILT, "M", null, new EstruturaChecklist(List.of())))
                .isInstanceOf(InvarianteVioladaException.class).hasMessageContaining("grupo");
        assertThatThrownBy(() -> new ModeloChecklistObra(ModeloChecklistObra.Finalidade.AS_BUILT, "M", null, new EstruturaChecklist(List.of(
                new EstruturaChecklist.Grupo("G", List.of(new EstruturaChecklist.Pergunta("p", "Tipo?", EstruturaChecklist.TipoPergunta.ESCOLHA_UNICA, true, false, List.of("Único"))))))))
                .isInstanceOf(InvarianteVioladaException.class).hasMessageContaining("duas opções");
        assertThatThrownBy(() -> new ModeloChecklistObra(ModeloChecklistObra.Finalidade.AS_BUILT, "M", null, new EstruturaChecklist(List.of(
                new EstruturaChecklist.Grupo("G", List.of(
                        new EstruturaChecklist.Pergunta("p", "A", EstruturaChecklist.TipoPergunta.TEXTO, true, false, null),
                        new EstruturaChecklist.Pergunta("p", "B", EstruturaChecklist.TipoPergunta.TEXTO, true, false, null)))))))
                .isInstanceOf(InvarianteVioladaException.class).hasMessageContaining("identificador");
    }

    @Test
    void respostasGuardamOTextoDaPerguntaEListamPendencias() {
        RespostasChecklist respostas = RespostasChecklist.de(ESTRUTURA, List.of(resposta("p1", null, "Sim")));

        assertThat(respostas.itens()).hasSize(3);
        assertThat(respostas.itens().get(0).enunciado()).isEqualTo("Acesso livre?");
        assertThat(respostas.itens().get(0).grupo()).isEqualTo("Acesso");
        assertThat(respostas.pendencias()).containsExactly("Altura do poste");
    }

    @Test
    void naoSeAplicaContaComoRespostaSoOndeOModeloAceita() {
        RespostasChecklist respostas = RespostasChecklist.de(ESTRUTURA, List.of(resposta("p1", null, "Não"),
                new RespostasChecklist.Informada("p2", null, List.of(), true)));

        assertThat(respostas.pendencias()).isEmpty();
        assertThat(respostas.itens().get(1).resposta()).isEqualTo("Não se aplica");
        assertThatThrownBy(() -> RespostasChecklist.de(ESTRUTURA, List.of(new RespostasChecklist.Informada("p1", null, List.of(), true))))
                .isInstanceOf(InvarianteVioladaException.class).hasMessageContaining("Não se aplica");
    }

    @Test
    void recusaRespostaInvalida() {
        assertThatThrownBy(() -> RespostasChecklist.de(ESTRUTURA, List.of(resposta("p1", null, "Talvez"))))
                .isInstanceOf(InvarianteVioladaException.class);
        assertThatThrownBy(() -> RespostasChecklist.de(ESTRUTURA, List.of(resposta("p2", "alto"))))
                .isInstanceOf(InvarianteVioladaException.class);
    }

    @Test
    void visitaSoSalvaCompletaEComModeloDeVisita() {
        ModeloChecklistObra modelo = modelo(ModeloChecklistObra.Finalidade.VISITA_PREVIA);
        RespostasChecklist incompleta = RespostasChecklist.de(ESTRUTURA, List.of());
        RespostasChecklist completa = RespostasChecklist.de(ESTRUTURA, List.of(resposta("p1", null, "Sim"), resposta("p2", "11")));

        assertThatThrownBy(() -> new VisitaPreviaObra(OBRA, modelo, LocalDate.now(), new VisitaPreviaObra.Responsavel(null, "Ana"), null, incompleta))
                .isInstanceOf(InvarianteVioladaException.class).hasMessageContaining("Acesso livre?");
        assertThatThrownBy(() -> new VisitaPreviaObra(OBRA, modelo(ModeloChecklistObra.Finalidade.AS_BUILT), LocalDate.now(), new VisitaPreviaObra.Responsavel(null, "Ana"), null, completa))
                .isInstanceOf(InvarianteVioladaException.class);
        assertThat(new VisitaPreviaObra(OBRA, modelo, LocalDate.now(), new VisitaPreviaObra.Responsavel(null, "Ana"), null, completa).getTituloModelo()).isEqualTo("Modelo");
    }

    @Test
    void fichaPodeFicarPelaMetadeESabeSeEstaCompleta() {
        ModeloChecklistObra modelo = modelo(ModeloChecklistObra.Finalidade.AS_BUILT);
        FichaAsBuilt ficha = new FichaAsBuilt(OBRA, PONTO, modelo, RespostasChecklist.de(ESTRUTURA, List.of(resposta("p1", null, "Sim"))));
        assertThat(ficha.isCompleta()).isFalse();

        ficha.preencher(modelo, RespostasChecklist.de(ESTRUTURA, List.of(resposta("p1", null, "Sim"), resposta("p2", "11"))));
        assertThat(ficha.isCompleta()).isTrue();
    }

    @Test
    void respostaDiferenteDaConformeViraNaoConformidade() {
        EstruturaChecklist estrutura = new EstruturaChecklist(List.of(new EstruturaChecklist.Grupo("Acesso", List.of(
                new EstruturaChecklist.Pergunta("a", "Há acesso para veículos?", EstruturaChecklist.TipoPergunta.ESCOLHA_UNICA, true, false, List.of("Sim", "Não"), "Sim"),
                new EstruturaChecklist.Pergunta("b", "Requer autorização?", EstruturaChecklist.TipoPergunta.ESCOLHA_UNICA, true, true, List.of("Sim", "Não"), "Não"),
                new EstruturaChecklist.Pergunta("c", "Zona", EstruturaChecklist.TipoPergunta.ESCOLHA_UNICA, true, false, List.of("Urbana", "Rural"))))));
        new ModeloChecklistObra(ModeloChecklistObra.Finalidade.VISITA_PREVIA, "Pré-vistoria", null, estrutura);

        RespostasChecklist respostas = RespostasChecklist.de(estrutura, List.of(resposta("a", null, "Não"),
                new RespostasChecklist.Informada("b", null, List.of(), true), resposta("c", null, "Rural")));

        assertThat(respostas.naoConformidades()).extracting(RespostasChecklist.Item::idPergunta).containsExactly("a");
    }

    @Test
    void respostaConformePrecisaEstarNasOpcoesDaEscolhaUnica() {
        assertThatThrownBy(() -> new ModeloChecklistObra(ModeloChecklistObra.Finalidade.VISITA_PREVIA, "M", null, new EstruturaChecklist(List.of(
                new EstruturaChecklist.Grupo("G", List.of(new EstruturaChecklist.Pergunta("p", "Poda?", EstruturaChecklist.TipoPergunta.ESCOLHA_UNICA, true, false, List.of("Sim", "Não"), "Talvez")))))))
                .isInstanceOf(InvarianteVioladaException.class).hasMessageContaining("conforme");
        assertThatThrownBy(() -> new ModeloChecklistObra(ModeloChecklistObra.Finalidade.VISITA_PREVIA, "M", null, new EstruturaChecklist(List.of(
                new EstruturaChecklist.Grupo("G", List.of(new EstruturaChecklist.Pergunta("p", "Obs", EstruturaChecklist.TipoPergunta.TEXTO, false, false, null, "Sim")))))))
                .isInstanceOf(InvarianteVioladaException.class).hasMessageContaining("escolha única");
    }

    @Test
    void visitaGuardaColaboradorENomeDoResponsavel() {
        UUID colaborador = UUID.randomUUID();
        RespostasChecklist completa = RespostasChecklist.de(ESTRUTURA, List.of(resposta("p1", null, "Sim"), resposta("p2", "9")));
        VisitaPreviaObra visita = new VisitaPreviaObra(OBRA, modelo(ModeloChecklistObra.Finalidade.VISITA_PREVIA), LocalDate.now(),
                new VisitaPreviaObra.Responsavel(colaborador, "  Ana Souza "), null, completa);

        assertThat(visita.getIdColaborador()).isEqualTo(colaborador);
        assertThat(visita.getResponsavel()).isEqualTo("Ana Souza");
        assertThatThrownBy(() -> new VisitaPreviaObra(OBRA, modelo(ModeloChecklistObra.Finalidade.VISITA_PREVIA), LocalDate.now(),
                new VisitaPreviaObra.Responsavel(colaborador, " "), null, completa)).isInstanceOf(InvarianteVioladaException.class);
    }

    @Test
    void evidenciaDaVisitaAceitaFotoOuPdfEGuardaAPergunta() {
        UUID visita = UUID.randomUUID();
        EvidenciaVisitaPrevia foto = new EvidenciaVisitaPrevia(OBRA, visita, new EvidenciaVisitaPrevia.Pergunta("p1", "Acesso livre?"), " Portão ",
                new EvidenciaVisitaPrevia.Arquivo("a.jpg", "image/jpeg", 10, "k", "m"));
        assertThat(foto.isFoto()).isTrue();
        assertThat(foto.getEnunciadoPergunta()).isEqualTo("Acesso livre?");
        assertThat(foto.getLegenda()).isEqualTo("Portão");

        EvidenciaVisitaPrevia pdf = new EvidenciaVisitaPrevia(OBRA, visita, null, null, new EvidenciaVisitaPrevia.Arquivo("a.pdf", "application/pdf", 10, "k", null));
        assertThat(pdf.isFoto()).isFalse();
        assertThat(pdf.getIdPergunta()).isNull();
        assertThatThrownBy(() -> new EvidenciaVisitaPrevia(OBRA, visita, null, null, new EvidenciaVisitaPrevia.Arquivo("a.gif", "image/gif", 10, "k", null)))
                .isInstanceOf(InvarianteVioladaException.class);
    }

    @Test
    void soReligadorTemTrafoAuxiliar() {
        assertThat(new EquipamentoObra(OBRA, PONTO, EquipamentoObra.Tipo.RELIGADOR, true, null).isTrafoAuxiliar()).isTrue();
        assertThatThrownBy(() -> new EquipamentoObra(OBRA, PONTO, EquipamentoObra.Tipo.REGULADOR, true, null))
                .isInstanceOf(InvarianteVioladaException.class);
    }

    @Test
    void momentoDaFotoNoModeloNaoContaComoMudancaDeEstrutura() throws Exception {
        EstruturaChecklist sem = new EstruturaChecklist(List.of(), List.of(new EstruturaChecklist.ItemEvidencia("foto-geral", "Vista geral", true)));
        EstruturaChecklist com = new EstruturaChecklist(List.of(),
                List.of(new EstruturaChecklist.ItemEvidencia("foto-geral", "Vista geral", true, EvidenciaPonto.Etapa.ANTES)));

        assertThat(com).isNotEqualTo(sem);
        assertThat(com.semMomentoDasFotos()).isEqualTo(sem.semMomentoDasFotos());

        // Modelo gravado antes do momento continua sendo lido (o JSON não tem o campo).
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        var lido = mapper.readValue("{\"id\":\"foto-geral\",\"titulo\":\"Vista geral\",\"obrigatoria\":true}", EstruturaChecklist.ItemEvidencia.class);
        assertThat(lido.etapa()).isNull();
        var comEtapa = mapper.readValue("{\"id\":\"a\",\"titulo\":\"A\",\"obrigatoria\":false,\"etapa\":\"DEPOIS\"}", EstruturaChecklist.ItemEvidencia.class);
        assertThat(comEtapa.etapa()).isEqualTo(EvidenciaPonto.Etapa.DEPOIS);
    }
}
