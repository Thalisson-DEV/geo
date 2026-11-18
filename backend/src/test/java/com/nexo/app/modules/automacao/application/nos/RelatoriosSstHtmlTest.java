package com.nexo.app.modules.automacao.application.nos;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.nexo.app.modules.sst.SstRelatoriosApi.DesvioPendente;
import com.nexo.app.modules.sst.SstRelatoriosApi.MetaPessoa;
import com.nexo.app.modules.sst.SstRelatoriosApi.MetasDaSemana;

class RelatoriosSstHtmlTest {

    private static final LocalDate HOJE = LocalDate.of(2026, 10, 26);

    private static MetaPessoa pessoa(String nome, String base, String processo, int meta, long realizado, long semana, String situacao) {
        BigDecimal pct = BigDecimal.valueOf(100.0 * realizado / meta);
        return new MetaPessoa(UUID.randomUUID(), nome, UUID.randomUUID(), "Supervisor", base, processo, "Campo",
                LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 31), 5, meta, realizado, semana, pct, situacao);
    }

    @Test
    void rankingDaGestaoTrazPodioProcessoBaseEPessoa() {
        MetaPessoa ana = pessoa("Ana Souza", "Juazeiro", "Comercial", 20, 20, 4, "ATINGIDA");
        MetaPessoa bia = pessoa("Bia Lima", "Remanso", "Comercial", 20, 15, 3, "EM_ANDAMENTO");
        MetaPessoa caio = pessoa("Caio Reis", "Remanso", "Manutenção", 20, 5, 0, "EM_ANDAMENTO");
        MetaPessoa davi = pessoa("Davi Melo", "Juazeiro", "Manutenção", 20, 0, 0, "EM_ANDAMENTO");

        List<MetaPessoa> podio = RelatoriosSstHtml.podio(List.of(caio, davi, bia, ana));
        assertThat(podio).extracting(MetaPessoa::nome).containsExactly("Ana Souza", "Bia Lima", "Caio Reis");

        String html = RelatoriosSstHtml.metas(new MetasDaSemana(HOJE, LocalDate.of(2026, 10, 19), LocalDate.of(2026, 10, 25),
                List.of(ana, bia, caio, davi), List.of()));
        assertThat(html).contains("Período atual: outubro de 2026").contains("Pódio até agora")
                .contains("Por processo").contains("Por base").contains("Por pessoa")
                .contains("Faltam 6 dias para fechar o período, contando hoje.")
                .contains("Bateu a meta").contains("Nenhuma inspeção")
                .contains("não lançaram nenhuma inspeção na semana passada: Caio Reis, Davi Melo");
        // Comercial (35 de 40) vem antes de Manutenção (5 de 40) no ranking por processo.
        assertThat(html.indexOf(">Comercial<")).isLessThan(html.indexOf(">Manutenção<"));
    }

    @Test
    void situacaoComparaComORitmoDoPeriodo() {
        // 25 de 31 dias passados: o esperado é ~16 de 20.
        assertThat(RelatoriosSstHtml.situacao(pessoa("A", "B", "P", 20, 17, 0, "EM_ANDAMENTO"), HOJE)).isEqualTo("No ritmo");
        assertThat(RelatoriosSstHtml.situacao(pessoa("A", "B", "P", 20, 10, 0, "EM_ANDAMENTO"), HOJE)).isEqualTo("Abaixo do ritmo");
        MetaPessoa semUsuario = new MetaPessoa(UUID.randomUUID(), "Sem Acesso", null, null, null, null, "Campo",
                LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 31), 5, 20, 0, 0, BigDecimal.ZERO, "EM_ANDAMENTO");
        assertThat(RelatoriosSstHtml.situacao(semUsuario, HOJE)).isEqualTo("Sem usuário");
    }

    @Test
    void viradaDoMesMostraComoOMesAnteriorFechou() {
        MetaPessoa fechou = pessoa("Ana Souza", "Juazeiro", "Comercial", 20, 22, 2, "ATINGIDA");
        MetaPessoa novo = new MetaPessoa(UUID.randomUUID(), "Ana Souza", UUID.randomUUID(), null, "Juazeiro", "Comercial", "Campo",
                LocalDate.of(2026, 11, 1), LocalDate.of(2026, 11, 30), 29, 20, 0, 0, BigDecimal.ZERO, "EM_ANDAMENTO");
        String html = RelatoriosSstHtml.metas(new MetasDaSemana(LocalDate.of(2026, 11, 2), LocalDate.of(2026, 10, 26),
                LocalDate.of(2026, 11, 1), List.of(novo), List.of(fechou)));
        assertThat(html).contains("Como fechou outubro de 2026").contains("Pódio do período").contains("Começou novembro de 2026");
        assertThat(html.indexOf("Como fechou")).isLessThan(html.indexOf("Começou"));
    }

    private static DesvioPendente desvio(String inspetor, String base, String gravidade, LocalDate prazo, Integer atraso) {
        return new DesvioPendente(UUID.randomUUID(), UUID.randomUUID(), UUID.nameUUIDFromBytes(inspetor.getBytes()), inspetor, "Comercial",
                base, "EQ-01", "Inspeção de campo", "Usa os EPIs?", "Eletricista sem luva isolante", gravidade, "ABERTO",
                prazo, atraso != null, atraso, LocalDate.of(2026, 10, 10), List.of());
    }

    @Test
    void inspetorVeOsVencidosPrimeiro() {
        DesvioPendente semPrazo = desvio("JOSE SILVA", "Juazeiro", "BAIXA", null, null);
        DesvioPendente aVencer = desvio("JOSE SILVA", "Juazeiro", "MEDIA", HOJE.plusDays(3), null);
        DesvioPendente vencido = desvio("JOSE SILVA", "Juazeiro", "CRITICA", HOJE.minusDays(6), 6);

        String html = RelatoriosSstHtml.desviosDoInspetor("JOSE SILVA", List.of(semPrazo, aVencer, vencido), 40);
        assertThat(html).startsWith("<p").contains("Olá, Jose.").contains("Comece pelos vencidos").contains("Venceu há 6 dias");
        assertThat(html.indexOf("Venceu há")).isLessThan(html.indexOf("Vence 29/10")).isLessThan(html.indexOf("Sem prazo"));
    }

    @Test
    void gestaoVeRankingPorProcessoBaseEInspetor() {
        String html = RelatoriosSstHtml.desviosGeral(List.of(
                desvio("Ana", "Juazeiro", "ALTA", HOJE.minusDays(2), 2),
                desvio("Bia", "Remanso", "BAIXA", HOJE.plusDays(5), null),
                desvio("Bia", "Remanso", "BAIXA", null, null)), 1);
        assertThat(html).contains("Por base").contains("Por inspetor").contains("O desvio vencido")
                .contains("1 inspetor não tem e-mail cadastrado e recebe o aviso dos próprios desvios só pelo sininho");
        // Juazeiro tem o vencido e fica à frente de Remanso, mesmo com menos desvios.
        assertThat(html.indexOf(">Juazeiro<")).isLessThan(html.indexOf(">Remanso<"));
        assertThat(RelatoriosSstHtml.desviosGeral(List.of(), 0)).contains("Nenhum desvio em aberto");
    }

    @Test
    void recorteAceitaVariosValoresSemDiferenciarMaiusculas() {
        assertThat(NosSst.dentro("", "Juazeiro")).isTrue();
        assertThat(NosSst.dentro("juazeiro; Remanso", "JUAZEIRO")).isTrue();
        assertThat(NosSst.dentro("Remanso", "Juazeiro")).isFalse();
        assertThat(NosSst.dentro("Remanso", null)).isFalse();
    }
}
