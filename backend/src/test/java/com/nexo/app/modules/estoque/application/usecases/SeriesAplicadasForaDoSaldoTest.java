package com.nexo.app.modules.estoque.application.usecases;

import com.nexo.app.modules.estoque.application.dto.ConciliarSerieAplicadaRequest;
import com.nexo.app.modules.estoque.application.dto.MovimentacaoBulkRequest;
import com.nexo.app.modules.estoque.application.dto.MovimentacaoBulkRequest.ItemMovimentacaoRequest;
import com.nexo.app.modules.estoque.application.dto.SeriesAConferirResponse;
import com.nexo.app.modules.estoque.application.services.AssinaturaTransferenciaService;
import com.nexo.app.modules.estoque.application.services.DebitoSaldoService;
import com.nexo.app.modules.estoque.domain.*;
import com.nexo.app.modules.estoque.infrastructure.persistence.*;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * Séries aplicadas em campo que não estavam no caminhão: a que chega depois de aplicada sai
 * da equipe na chegada; a que nunca chegou é conciliada pelo almoxarifado.
 */
@SpringBootTest
@Transactional
class SeriesAplicadasForaDoSaldoTest {

    @Autowired private MovimentacaoEstoqueUseCases movimentacaoUseCases;
    @Autowired private SeriesAConferirUseCases seriesAConferir;
    @Autowired private DebitoSaldoService debitoSaldoService;
    @Autowired private TipoEstoqueRepository tipoEstoqueRepository;
    @Autowired private EstoqueRepository estoqueRepository;
    @Autowired private MaterialRepository materialRepository;
    @Autowired private MovimentacaoEstoqueRepository movimentacaoRepository;
    @Autowired private SaldoRepository saldoRepository;
    @Autowired private SaldoSerieRepository serieRepository;

    @MockitoBean private AssinaturaTransferenciaService assinaturaTransferenciaService;

    private final UUID idOperador = UUID.randomUUID();

    @Test
    void serieAplicadaAntesDaTransferenciaChegaJaBaixada() {
        Cenario c = cenario();
        entrada(c.almoxarifado(), c.material(), "5269950597", "5269950600");
        aplicar(c.equipe(), c.material(), "5269950597");
        when(assinaturaTransferenciaService.armazenar(any(), any(), any()))
                .thenReturn(new AssinaturaTransferenciaService.AssinaturasTransferenciaArmazenadas(null, null));

        movimentacaoUseCases.transferenciaLote(new MovimentacaoBulkRequest(c.almoxarifado().getId(), c.equipe().getId(), List.of(
                item(c.material(), "5269950597"), item(c.material(), "5269950600"))), idOperador);

        assertThat(serieAtiva(c.equipe(), c.material(), "5269950597")).isFalse();
        assertThat(serieAtiva(c.equipe(), c.material(), "5269950600")).isTrue();
        // -1 da aplicação +2 da transferência: a quantidade bate com a única série que ficou.
        assertThat(quantidade(c.equipe(), c.material())).isEqualByComparingTo("1");
    }

    @Test
    void serieAplicadaAntesDaEntradaAvulsaEntraJaBaixada() {
        Cenario c = cenario();
        aplicar(c.equipe(), c.material(), "6260031056");

        entrada(c.equipe(), c.material(), "6260031056", "6260031057");

        assertThat(serieAtiva(c.equipe(), c.material(), "6260031056")).isFalse();
        assertThat(serieAtiva(c.equipe(), c.material(), "6260031057")).isTrue();
        assertThat(quantidade(c.equipe(), c.material())).isEqualByComparingTo("1");
    }

    @Test
    void serieQueEntrouAntesDaAplicacaoNaoEhTocadaNaChegadaDeOutra() {
        Cenario c = cenario();
        entrada(c.equipe(), c.material(), "1000000001");
        aplicar(c.equipe(), c.material(), "1000000001");
        entrada(c.equipe(), c.material(), "1000000002");

        assertThat(serieAtiva(c.equipe(), c.material(), "1000000001")).isFalse();
        assertThat(serieAtiva(c.equipe(), c.material(), "1000000002")).isTrue();
        assertThat(seriesAConferir.listar(c.equipe().getId()).materiais()).isEmpty();
    }

    @Test
    void serieQueNuncaEntrouEhConciliadaComASerieDoCaminhao() {
        Cenario c = cenario();
        entrada(c.equipe(), c.material(), "5269948100", "5269952450");
        aplicar(c.equipe(), c.material(), "5269948109");

        SeriesAConferirResponse antes = seriesAConferir.listar(c.equipe().getId());
        assertThat(antes.materiais()).hasSize(1);
        SeriesAConferirResponse.MaterialAConferir material = antes.materiais().getFirst();
        assertThat(material.quantidadeSaldo()).isEqualByComparingTo("1");
        assertThat(material.seriesNoSaldo()).isEqualTo(2);
        assertThat(material.seriesSobrando()).isEqualTo(1);
        assertThat(material.aplicadas()).singleElement().satisfies(a -> {
            assertThat(a.numSerie()).isEqualTo("5269948109");
            assertThat(a.sugestao()).isEqualTo("5269948100");
        });

        SeriesAConferirResponse depois = seriesAConferir.conciliar(c.equipe().getId(), new ConciliarSerieAplicadaRequest(
                material.aplicadas().getFirst().idMovimentacao(), "5269948100"), idOperador);

        assertThat(depois.materiais()).isEmpty();
        assertThat(serieAtiva(c.equipe(), c.material(), "5269948100")).isFalse();
        assertThat(serieAtiva(c.equipe(), c.material(), "5269952450")).isTrue();
        assertThat(quantidade(c.equipe(), c.material())).isEqualByComparingTo("1");

        // Se a série aplicada aparecer depois, já foi casada: entra normalmente.
        entrada(c.equipe(), c.material(), "5269948109");
        assertThat(serieAtiva(c.equipe(), c.material(), "5269948109")).isTrue();
    }

    @Test
    void semCorrespondenteSaiDaListaSemMexerNoEstoque() {
        Cenario c = cenario();
        entrada(c.equipe(), c.material(), "7000000001", "7000000002");
        aplicar(c.equipe(), c.material(), "9999999999");
        var aplicacao = seriesAConferir.listar(c.equipe().getId()).materiais().getFirst().aplicadas().getFirst();
        assertThat(aplicacao.sugestao()).isNull();

        var depois = seriesAConferir.conciliar(c.equipe().getId(),
                new ConciliarSerieAplicadaRequest(aplicacao.idMovimentacao(), null), idOperador);

        assertThat(depois.materiais()).isEmpty();
        assertThat(serieAtiva(c.equipe(), c.material(), "7000000001")).isTrue();
        assertThat(serieAtiva(c.equipe(), c.material(), "7000000002")).isTrue();
        assertThatThrownBy(() -> seriesAConferir.conciliar(c.equipe().getId(),
                new ConciliarSerieAplicadaRequest(aplicacao.idMovimentacao(), null), idOperador))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("já foi conferida");
    }

    @Test
    void recusaSerieQueNaoEstaNoCaminhaoDaEquipe() {
        Cenario c = cenario();
        entrada(c.equipe(), c.material(), "8000000001");
        entrada(c.almoxarifado(), c.material(), "8000000002");
        aplicar(c.equipe(), c.material(), "8000000009");
        var aplicacao = seriesAConferir.listar(c.equipe().getId()).materiais().getFirst().aplicadas().getFirst();

        assertThatThrownBy(() -> seriesAConferir.conciliar(c.equipe().getId(),
                new ConciliarSerieAplicadaRequest(aplicacao.idMovimentacao(), "8000000002"), idOperador))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("não está no estoque da equipe");
        assertThat(serieAtiva(c.almoxarifado(), c.material(), "8000000002")).isTrue();
    }

    @Test
    void sugestaoSoComDiferencaPequenaESemEmpate() {
        assertThat(SeriesAConferirUseCases.sugerir("5269950597", List.of("5269950598", "6260031056"))).isEqualTo("5269950598");
        assertThat(SeriesAConferirUseCases.sugerir("5269950597", List.of("5269950598", "5269950596"))).isNull();
        assertThat(SeriesAConferirUseCases.sugerir("5269950597", List.of("6260031056"))).isNull();
    }

    private void entrada(Estoque estoque, Material material, String... series) {
        movimentacaoUseCases.entradaLote(new MovimentacaoBulkRequest(null, estoque.getId(),
                java.util.Arrays.stream(series).map(s -> item(material, s)).toList()), idOperador);
    }

    /** O que o processamento da nota faz: registra a aplicação e debita, mesmo sem a série no caminhão. */
    private void aplicar(Estoque equipe, Material material, String numSerie) {
        movimentacaoRepository.save(new MovimentacaoEstoque(equipe, null, material, BigDecimal.ONE,
                MovimentacaoEstoque.TipoMovimentacao.APLICACAO, CondicaoMaterial.NOVO, idOperador, UUID.randomUUID(),
                numSerie, OffsetDateTime.now()));
        debitoSaldoService.debitar(equipe, material, CondicaoMaterial.NOVO, BigDecimal.ONE);
        serieRepository.findByEstoqueIdAndMaterialIdAndNumSerieAndCondicaoAndAtivoTrue(
                equipe.getId(), material.getId(), numSerie, CondicaoMaterial.NOVO).ifPresent(s -> {
            s.desativar();
            serieRepository.save(s);
        });
    }

    private ItemMovimentacaoRequest item(Material material, String numSerie) {
        return new ItemMovimentacaoRequest(material.getId(), BigDecimal.ONE, numSerie, CondicaoMaterial.NOVO);
    }

    private boolean serieAtiva(Estoque estoque, Material material, String numSerie) {
        return serieRepository.existsByEstoqueIdAndMaterialIdAndNumSerieAndAtivoTrue(estoque.getId(), material.getId(), numSerie);
    }

    private BigDecimal quantidade(Estoque estoque, Material material) {
        return saldoRepository.findByEstoqueIdAndMaterialIdAndCondicao(estoque.getId(), material.getId(), CondicaoMaterial.NOVO)
                .map(Saldo::getQuantidade).orElse(BigDecimal.ZERO);
    }

    private Cenario cenario() {
        String sufixo = UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        TipoEstoque fisico = tipoEstoqueRepository.findByNomeIgnoreCase("FISICO")
                .orElseGet(() -> tipoEstoqueRepository.saveAndFlush(new TipoEstoque("FISICO")));
        TipoEstoque campo = tipoEstoqueRepository.findByNomeIgnoreCase("CAMPO")
                .orElseGet(() -> tipoEstoqueRepository.saveAndFlush(new TipoEstoque("CAMPO")));
        Estoque almoxarifado = estoqueRepository.saveAndFlush(new Estoque("ALMOX " + sufixo, fisico));
        Estoque equipe = new Estoque("EQUIPE " + sufixo, campo);
        equipe.vincularEquipe(UUID.randomUUID());
        equipe = estoqueRepository.saveAndFlush(equipe);
        Material material = materialRepository.saveAndFlush(new Material(
                "MED-" + sufixo, "Medidor seriado", "UN", "MATR", null, null, true, UUID.randomUUID()));
        return new Cenario(almoxarifado, equipe, material);
    }

    private record Cenario(Estoque almoxarifado, Estoque equipe, Material material) {
    }
}
