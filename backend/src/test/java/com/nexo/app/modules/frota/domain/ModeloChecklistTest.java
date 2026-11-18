package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ModeloChecklistTest {

    private static final UUID CAMINHONETE = UUID.randomUUID();
    private static final UUID CESTO = UUID.randomUUID();

    private static ModeloChecklist.DadosPergunta farois(UUID id) {
        return new ModeloChecklist.DadosPergunta(id, "Iluminação", "Faróis", TipoRespostaChecklist.OK_NOK, ModoFotoPergunta.NAO_OK, null,
                List.of(new ModeloChecklist.DadosAlternativa(null, "Queimado", false),
                        new ModeloChecklist.DadosAlternativa(null, "Quebrado", false)));
    }

    private static ModeloChecklist.DadosPergunta pneus(UUID id) {
        return new ModeloChecklist.DadosPergunta(id, null, "Estado dos pneus", TipoRespostaChecklist.OPCOES, ModoFotoPergunta.NAO_OK,
                List.of(new ModeloChecklist.DadosAlternativa(null, "Bom", false),
                        new ModeloChecklist.DadosAlternativa(null, "Careca", true)), null);
    }

    private static ModeloChecklist.Dados principal(List<ModeloChecklist.DadosPergunta> perguntas) {
        return new ModeloChecklist.Dados("Caminhonete", TipoModeloChecklist.PRINCIPAL, "Confira com o veículo parado", false,
                Set.of(CAMINHONETE), Set.of(), perguntas,
                List.of(new ModeloChecklist.DadosFotoRecebimento(null, "Frente"),
                        new ModeloChecklist.DadosFotoRecebimento(null, "Painel")));
    }

    /** Simula o id que o JPA daria ao gravar. */
    private static void gravar(ModeloChecklist modelo) {
        modelo.getPerguntas().forEach(p -> {
            if (p.getId() == null) ReflectionTestUtils.setField(p, "id", UUID.randomUUID());
            p.getAlternativas().forEach(a -> {
                if (a.getId() == null) ReflectionTestUtils.setField(a, "id", UUID.randomUUID());
            });
        });
        modelo.getFotosRecebimento().forEach(f -> {
            if (f.getId() == null) ReflectionTestUtils.setField(f, "id", UUID.randomUUID());
        });
    }

    @Test
    void criaModeloComPerguntasMotivosEFotos() {
        var modelo = new ModeloChecklist(principal(List.of(farois(null), pneus(null))));

        assertThat(modelo.perguntasAtivas()).extracting(PerguntaChecklist::getTexto).containsExactly("Faróis", "Estado dos pneus");
        var farois = modelo.perguntasAtivas().getFirst();
        assertThat(farois.isFotoNoNaoOk()).isTrue();
        assertThat(farois.alternativasAtivas(TipoAlternativaChecklist.MOTIVO)).extracting(AlternativaChecklist::getTexto)
                .containsExactly("Queimado", "Quebrado");
        var pneus = modelo.perguntasAtivas().get(1);
        assertThat(pneus.isFotoNoNaoOk()).as("foto no Não OK só vale para OK/Não OK").isFalse();
        assertThat(pneus.alternativasAtivas(TipoAlternativaChecklist.OPCAO)).extracting(AlternativaChecklist::isIndicaProblema)
                .containsExactly(false, true);
        assertThat(modelo.fotosRecebimentoAtivas()).extracting(FotoRecebimentoChecklist::getDescricao).containsExactly("Frente", "Painel");
    }

    @Test
    void editarDesativaPerguntaRetiradaEMantemAEnviadaComId() {
        var modelo = new ModeloChecklist(principal(List.of(farois(null), pneus(null))));
        gravar(modelo);
        var idFarois = modelo.perguntasAtivas().getFirst().getId();
        var idPneus = modelo.perguntasAtivas().get(1).getId();

        var nova = new ModeloChecklist.DadosPergunta(null, null, "Extintor", TipoRespostaChecklist.OK_NOK, ModoFotoPergunta.NUNCA, null, null);
        modelo.atualizar(principal(List.of(nova, farois(idFarois))));

        assertThat(modelo.perguntasAtivas()).extracting(PerguntaChecklist::getTexto).containsExactly("Extintor", "Faróis");
        assertThat(modelo.pergunta(idFarois)).get().extracting(PerguntaChecklist::getOrdem).isEqualTo(1);
        assertThat(modelo.pergunta(idPneus)).as("continua existindo para o histórico").get()
                .extracting(PerguntaChecklist::isAtivo).isEqualTo(false);
    }

    @Test
    void opcoesExigemDuasAlternativas() {
        var umaOpcao = new ModeloChecklist.DadosPergunta(null, null, "Nível do óleo", TipoRespostaChecklist.OPCOES, ModoFotoPergunta.NUNCA,
                List.of(new ModeloChecklist.DadosAlternativa(null, "Normal", false)), null);

        assertThatThrownBy(() -> new ModeloChecklist(principal(List.of(umaOpcao))))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("pelo menos 2 opções");
    }

    @Test
    void adicionalExigeTipoDeImplemento() {
        var dados = new ModeloChecklist.Dados("Cesto aéreo", TipoModeloChecklist.ADICIONAL, null, false,
                Set.of(), Set.of(), List.of(farois(null)), null);

        assertThatThrownBy(() -> new ModeloChecklist(dados))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("tipos de implemento");
    }

    @Test
    void modeloSemPerguntaERecusado() {
        assertThatThrownBy(() -> new ModeloChecklist(principal(List.of())))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("pelo menos uma pergunta");
    }

    @Test
    void resolveOPrincipalMaisEspecificoEOsAdicionaisDosImplementos() {
        var generico = new ModeloChecklist(new ModeloChecklist.Dados("Geral", TipoModeloChecklist.PRINCIPAL, null, false,
                Set.of(), Set.of(), List.of(farois(null)), null));
        var caminhonete = new ModeloChecklist(principal(List.of(farois(null))));
        var cesto = new ModeloChecklist(new ModeloChecklist.Dados("Cesto aéreo", TipoModeloChecklist.ADICIONAL, null, false,
                Set.of(), Set.of(CESTO), List.of(farois(null)), null));
        var modelos = List.of(generico, caminhonete, cesto);

        var daCaminhonete = ResolucaoModeloChecklist.resolver(modelos, CAMINHONETE, Set.of(CESTO));
        assertThat(daCaminhonete.principais()).containsExactly(caminhonete);
        assertThat(daCaminhonete.adicionais()).containsExactly(cesto);
        assertThat(daCaminhonete.exigeEscolha()).isFalse();

        var doCompressor = ResolucaoModeloChecklist.resolver(modelos, UUID.randomUUID(), Set.of());
        assertThat(doCompressor.principais()).as("sem modelo do tipo, vale o genérico").containsExactly(generico);
        assertThat(doCompressor.adicionais()).isEmpty();
    }

    @Test
    void modeloDesativadoNaoEntraNaResolucao() {
        var caminhonete = new ModeloChecklist(principal(List.of(farois(null))));
        caminhonete.desativar();

        assertThat(ResolucaoModeloChecklist.resolver(List.of(caminhonete), CAMINHONETE, Set.of()).semModelo()).isTrue();
    }
}
