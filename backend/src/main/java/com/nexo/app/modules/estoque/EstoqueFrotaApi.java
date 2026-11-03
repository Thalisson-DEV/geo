package com.nexo.app.modules.estoque;

import com.nexo.app.shared.application.dto.PageResponse;
import org.springframework.data.domain.Pageable;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Porta pública do estoque da oficina da frota: almoxarifados do tipo FROTA, catálogo de peças
 * FROTA, saldos com custo médio e movimentações. Só enxerga o domínio FROTA; o almoxarifado
 * operacional nunca aparece aqui, e as telas operacionais nunca mostram o que passa por aqui.
 */
public interface EstoqueFrotaApi {

    // ── Almoxarifados ────────────────────────────────────────────────────────────────
    List<Almoxarifado> almoxarifados();

    Almoxarifado criarAlmoxarifado(String nome, UUID idBaseOperacional);

    Almoxarifado atualizarAlmoxarifado(UUID id, String nome, UUID idBaseOperacional);

    /** Só sem saldo. */
    void desativarAlmoxarifado(UUID id);

    /** Lança {@code RecursoNaoEncontradoException} se não for um almoxarifado ativo da frota. */
    Almoxarifado almoxarifado(UUID id);

    // ── Catálogo ─────────────────────────────────────────────────────────────────────
    PageResponse<Peca> pecas(String busca, String grupo, Boolean ativo, Pageable pageable);

    Peca peca(UUID id);

    Peca criarPeca(DadosPeca dados);

    Peca atualizarPeca(UUID id, DadosPeca dados);

    /** Só sem saldo em nenhum almoxarifado. */
    void desativarPeca(UUID id);

    List<String> grupos();

    // ── Saldos ───────────────────────────────────────────────────────────────────────
    /** Saldos de um almoxarifado (ou de todos, com {@code idEstoque} nulo), com custo, mínimo e localização. */
    List<SaldoPeca> saldos(UUID idEstoque);

    /** Cria o saldo zerado, se preciso, para o mínimo e a localização valerem antes da primeira entrada. */
    SaldoPeca definirParametros(UUID idEstoque, UUID idMaterial, BigDecimal estoqueMinimo, String localizacao);

    Resumo resumo(UUID idEstoque, OffsetDateTime desde);

    // ── Movimentações ────────────────────────────────────────────────────────────────
    PageResponse<Movimento> movimentos(FiltroMovimentos filtro, Pageable pageable);

    List<Movimento> movimentosDaReferencia(UUID idReferencia);

    /** Entrada com custo (compra, devolução...). Devolve o lote (referência comum aos itens). */
    UUID entrada(UUID idEstoque, List<ItemEntrada> itens, Contexto contexto, UUID idUsuario, OffsetDateTime dataHora);

    /** Saída pelo custo médio; nunca deixa o saldo negativo. */
    List<Movimento> saida(UUID idEstoque, List<ItemSaida> itens, Contexto contexto, UUID idUsuario, OffsetDateTime dataHora);

    /** Transferência entre almoxarifados da frota, levando o custo médio. */
    UUID transferencia(UUID idOrigem, UUID idDestino, List<ItemSaida> itens, String observacao, UUID idUsuario, OffsetDateTime dataHora);

    /** Ajuste de inventário: lança a diferença entre o contado e o saldo. Nulo se não houver diferença. */
    Movimento ajuste(UUID idEstoque, UUID idMaterial, BigDecimal quantidadeContada, String observacao, UUID idUsuario, OffsetDateTime dataHora);

    /** Devolve ao almoxarifado uma saída (ex.: peça retirada da OS), pelo mesmo valor da saída. */
    Movimento estornarSaida(UUID idMovimentacao, String observacao, UUID idUsuario, OffsetDateTime dataHora);

    // ── Tipos ────────────────────────────────────────────────────────────────────────
    record Almoxarifado(UUID id, String nome, UUID idBaseOperacional, boolean ativo) {
    }

    record DadosPeca(String codigo, String descricao, String unidade, String grupo) {
    }

    record Peca(UUID id, String codigo, String descricao, String unidade, String grupo, boolean ativo,
                BigDecimal saldoTotal) {
    }

    record SaldoPeca(UUID idEstoque, String estoque, UUID idMaterial, String codigo, String descricao, String unidade,
                     String grupo, BigDecimal quantidade, BigDecimal custoMedio, BigDecimal valorTotal,
                     BigDecimal estoqueMinimo, String localizacao, boolean abaixoMinimo) {
    }

    record Resumo(long itens, BigDecimal valorTotal, BigDecimal entradas, BigDecimal saidas, long abaixoMinimo,
                  long semSaldo) {
    }

    /**
     * @param motivo     um dos {@link Motivo}
     * @param documento  nota fiscal ou recibo da entrada
     * @param idVeiculo  veículo que recebeu a peça (saída)
     * @param idReferencia ordem de serviço (saída) ou outra referência do chamador
     */
    record Contexto(Motivo motivo, String documento, String observacao, UUID idVeiculo, UUID idFornecedor,
                    UUID idReferencia) {
    }

    record ItemEntrada(UUID idMaterial, BigDecimal quantidade, BigDecimal valorUnitario) {
    }

    record ItemSaida(UUID idMaterial, BigDecimal quantidade) {
    }

    record FiltroMovimentos(UUID idEstoque, UUID idMaterial, UUID idVeiculo, UUID idReferencia, List<String> tipos,
                            String busca, OffsetDateTime de, OffsetDateTime ate) {
    }

    /**
     * @param tipo        ENTRADA, SAIDA, TRANSFERENCIA, AJUSTE ou ESTORNO
     * @param quantidade  positiva; o sentido vem do tipo e de origem/destino
     */
    record Movimento(UUID id, OffsetDateTime dataHora, String tipo, Motivo motivo, UUID idEstoqueOrigem, String estoqueOrigem,
                     UUID idEstoqueDestino, String estoqueDestino, UUID idMaterial, String codigo, String descricao,
                     String unidade, BigDecimal quantidade, BigDecimal valorUnitario, BigDecimal valorTotal,
                     String documento, String observacao, UUID idVeiculo, UUID idFornecedor, UUID idReferencia,
                     UUID idUsuario, boolean estornado) {
    }

    enum Motivo {
        COMPRA("Compra"),
        DEVOLUCAO("Devolução"),
        ORDEM_SERVICO("Ordem de serviço"),
        USO_OFICINA("Uso na oficina"),
        VEICULO("Retirada para veículo"),
        TRANSFERENCIA("Transferência"),
        AJUSTE_INVENTARIO("Ajuste de inventário"),
        PERDA("Perda ou avaria"),
        VENDA("Venda"),
        ESTORNO("Estorno"),
        SALDO_INICIAL("Saldo inicial");

        private final String rotulo;

        Motivo(String rotulo) {
            this.rotulo = rotulo;
        }

        public String getRotulo() {
            return rotulo;
        }

        public boolean isEntrada() {
            return this == COMPRA || this == DEVOLUCAO || this == SALDO_INICIAL;
        }

        public boolean isSaida() {
            return this == ORDEM_SERVICO || this == USO_OFICINA || this == VEICULO || this == PERDA || this == VENDA;
        }
    }
}
