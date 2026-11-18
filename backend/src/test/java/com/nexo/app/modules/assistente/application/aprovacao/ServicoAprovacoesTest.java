package com.nexo.app.modules.assistente.application.aprovacao;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nexo.app.modules.assistente.application.agent.AcaoComPrevia.PreviaAcao;
import com.nexo.app.modules.assistente.application.agent.AcaoComPrevia.ResultadoAcao;
import com.nexo.app.shared.application.analytics.SemanticQueryContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Decisao em lote: cada solicitacao e conferida antes (existe, aguarda, valor confere, permissao) e so o que
 * confere e decidido, no nome de quem confirmou.
 */
class ServicoAprovacoesTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final UUID gestor = UUID.randomUUID();
    private final SemanticQueryContext ambos = new SemanticQueryContext(gestor,
            Set.of("financeiro:compra:aprovar", "financeiro:pagamento:aprovar"));
    private FilaFalsa pagamentos;
    private FilaFalsa compras;
    private ServicoAprovacoes servico;

    @BeforeEach
    void montar() {
        pagamentos = new FilaFalsa("pagamento", "Solicitação de pagamento", "financeiro:pagamento:aprovar")
                .com(1234, "Oficina Central", "1450.00", true)
                .com(1235, "Posto Juazeiro", "320.50", true)
                .com(1200, "Papelaria Bahia", "90.00", false);
        compras = new FilaFalsa("compra", "Solicitação de compra", "financeiro:compra:aprovar")
                .com(77, "Ferragens Sul", "5000.00", true)
                .com(1235, "Ferragens Sul", "150.00", true);
        servico = new ServicoAprovacoes(List.of(compras, pagamentos), mapper);
    }

    private JsonNode json(String texto) throws Exception {
        return mapper.readTree(texto);
    }

    @Test
    void soEntraNaDecisaoOQueConfere() throws Exception {
        PreviaAcao previa = servico.preparar(json("""
                {"itens":[
                  {"tipo":"pagamento","numero":1234,"valor_solicitado":1450},
                  {"tipo":"pagamento","numero":1235,"valor_solicitado":"R$ 999,00"},
                  {"tipo":"pagamento","numero":1200},
                  {"tipo":"pagamento","numero":9999}
                ]}"""), ambos);

        JsonNode itens = previa.exibicao().path("itens");
        assertThat(previa.pronta()).isTrue();
        assertThat(previa.exibicao().path("total").asInt()).isEqualTo(1);
        assertThat(itens.get(0).has("problema")).isFalse();
        assertThat(itens.get(0).path("fornecedor").asText()).isEqualTo("Oficina Central");
        assertThat(itens.get(1).path("problema").asText()).contains("R$ 320,50").contains("Confira");
        assertThat(itens.get(2).path("problema").asText()).contains("aprovada");
        assertThat(itens.get(3).path("problema").asText()).contains("não encontrada");
        assertThat(previa.paraModelo()).contains("Pagamento nº 1234 · Oficina Central · R$ 1.450,00");
    }

    @Test
    void confirmarDecideSoAsQueConferemNoNomeDoGestor() throws Exception {
        PreviaAcao previa = servico.preparar(json("""
                {"itens":[{"tipo":"pagamento","numero":1234},{"tipo":"pagamento","numero":1200},
                          {"tipo":"compra","numero":77,"valor_aprovado":4000,"observacao":"Só o essencial"}]}"""), ambos);

        ResultadoAcao resultado = servico.confirmar(previa.argumentos(), null, ambos);

        assertThat(resultado.sucesso()).isTrue();
        assertThat(pagamentos.decididas).extracting(FilaFalsa.Decidida::numero).containsExactly(1234L);
        assertThat(compras.decididas).singleElement().satisfies(d -> {
            assertThat(d.decisao().valorAprovado()).isEqualByComparingTo(new BigDecimal("4000"));
            assertThat(d.decisao().texto()).isEqualTo("Só o essencial");
            assertThat(d.usuario()).isEqualTo(gestor);
        });
        assertThat(resultado.paraModelo())
                .contains("Pagamento nº 1234 · Oficina Central · R$ 1.450,00 · solicitante Maria Souza: APROVADA")
                .contains("Compra nº 77").contains("APROVADA (R$ 4.000,00)")
                .contains("Pagamento nº 1200").contains("fora da decisao");
    }

    @Test
    void rejeitarSemMotivoFicaPendenteAteOCartaoInformar() throws Exception {
        PreviaAcao previa = servico.preparar(json("""
                {"itens":[{"tipo":"pagamento","numero":1234,"decisao":"rejeitar"}]}"""), ambos);
        assertThat(previa.pronta()).isFalse();
        assertThat(previa.exibicao().path("itens").get(0).path("falta").asText()).contains("motivo");

        ResultadoAcao semMotivo = servico.confirmar(previa.argumentos(), null, ambos);
        assertThat(semMotivo.pendente()).isTrue();
        assertThat(pagamentos.decididas).isEmpty();

        JsonNode motivo = json("[{\"registro\":0,\"caminho\":\"observacao\",\"valor\":\"Sem orçamento\"}]");
        ResultadoAcao comMotivo = servico.confirmar(previa.argumentos(), motivo, ambos);
        assertThat(comMotivo.sucesso()).isTrue();
        assertThat(pagamentos.decididas).singleElement()
                .satisfies(d -> assertThat(d.decisao().acao()).isEqualTo(Decisao.Acao.REJEITAR));
    }

    @Test
    void cartaoTiraUmaSolicitacaoDaDecisao() throws Exception {
        PreviaAcao previa = servico.preparar(json("""
                {"itens":[{"tipo":"pagamento","numero":1234},{"tipo":"compra","numero":77}]}"""), ambos);

        PreviaAcao revisada = servico.revisar(previa.argumentos(), json("[{\"registro\":1,\"remover\":true}]"), ambos);
        assertThat(revisada.exibicao().path("itens")).hasSize(1);

        servico.confirmar(revisada.argumentos(), null, ambos);
        assertThat(compras.decididas).isEmpty();
        assertThat(pagamentos.decididas).hasSize(1);
    }

    @Test
    void semTipoAchaQuandoSoUmaAguardaEPerguntaQuandoHaDuas() throws Exception {
        PreviaAcao unica = servico.preparar(json("{\"itens\":[{\"numero\":77}]}"), ambos);
        assertThat(unica.exibicao().path("itens").get(0).path("tipo").asText()).isEqualTo("compra");

        PreviaAcao dupla = servico.preparar(json("{\"itens\":[{\"numero\":1235}]}"), ambos);
        assertThat(dupla.pronta()).isFalse();
        assertThat(dupla.exibicao().path("itens").get(0).path("problema").asText()).contains("Diga qual");
    }

    @Test
    void semPermissaoNaoDecide() throws Exception {
        SemanticQueryContext soCompras = new SemanticQueryContext(gestor, Set.of("financeiro:compra:aprovar"));
        PreviaAcao previa = servico.preparar(json("{\"itens\":[{\"tipo\":\"pagamento\",\"numero\":1234}]}"), soCompras);

        assertThat(previa.pronta()).isFalse();
        assertThat(previa.exibicao().path("itens").get(0).path("problema").asText()).contains("permissão");
        assertThat(servico.pendentes(soCompras, null, null)).allMatch(p -> p.provedor() == compras);
    }

    @Test
    void recusaDoModuloNaoImpedeAsDemais() throws Exception {
        pagamentos.recusar.add(1234L);
        PreviaAcao previa = servico.preparar(json("""
                {"itens":[{"tipo":"pagamento","numero":1234},{"tipo":"pagamento","numero":1235}]}"""), ambos);

        ResultadoAcao resultado = servico.confirmar(previa.argumentos(), null, ambos);

        assertThat(resultado.sucesso()).isTrue();
        assertThat(resultado.resultado().path("decididas").asInt()).isEqualTo(1);
        assertThat(resultado.resultado().path("falhas").asInt()).isEqualTo(1);
        assertThat(resultado.paraModelo()).contains("Pagamento nº 1234").contains("NAO DECIDIDA (Solicitação já decidida");
    }

    @Test
    void filaFiltraPorBuscaETipo() {
        assertThat(servico.pendentes(ambos, null, null)).hasSize(4);
        assertThat(servico.pendentes(ambos, "pagamentos", null)).hasSize(2);
        assertThat(servico.pendentes(ambos, null, "ferragens")).hasSize(2);
        assertThat(servico.pendentes(ambos, null, "1234")).singleElement()
                .satisfies(p -> assertThat(p.solicitacao().fornecedor()).isEqualTo("Oficina Central"));
    }
}
