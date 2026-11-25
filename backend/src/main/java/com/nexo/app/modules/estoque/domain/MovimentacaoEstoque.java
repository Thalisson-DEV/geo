package com.nexo.app.modules.estoque.domain;

import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.AuditIgnore;
import com.nexo.app.shared.infrastructure.persistence.CryptoConverterImpl;
import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

/**
 * Registra o histórico detalhado de todas as entradas, saídas e transferências de materiais.
 * Atua como uma trilha de auditoria para os saldos.
 */
@Entity
@Table(name = "movimentacoes_estoque")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MovimentacaoEstoque extends BaseEntity {

    private static final int TAMANHO_OBSERVACAO = 1000;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_estoque_origem")
    private Estoque estoqueOrigem;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_estoque_destino")
    private Estoque estoqueDestino;

    @NotNull(message = "O material é obrigatório")
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_material", nullable = false)
    private Material material;

    @NotNull(message = "A quantidade é obrigatória")
    @Column(name = "quantidade", nullable = false, precision = 12, scale = 3)
    private BigDecimal quantidade;

    /** O que a pessoa digitou, quando usou uma unidade equivalente; {@link #quantidade} é o convertido. */
    @Column(name = "quantidade_informada", precision = 14, scale = 6)
    private BigDecimal quantidadeInformada;

    @Column(name = "unidade_informada", length = 10)
    private String unidadeInformada;

    @NotNull(message = "O tipo de movimentação é obrigatório")
    @Enumerated(EnumType.STRING)
    @Column(name = "tipo_movimentacao", nullable = false, length = 30)
    private TipoMovimentacao tipo;

    @NotNull(message = "O usuário operador é obrigatório")
    @Column(name = "id_usuario_operador", nullable = false)
    private UUID idUsuarioOperador;

    @Column(name = "id_referencia_operacao")
    private UUID idReferenciaOperacao;

    @Column(name = "data_hora", nullable = false)
    private OffsetDateTime dataHora;

    @Column(name = "num_serie")
    private String numSerie;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_solicitacao")
    private SolicitacaoMaterial solicitacao;

    @Convert(converter = TipoSolicitacaoTecnicaConverter.class)
    @Column(name = "tipo_tecnico", length = 3)
    private TipoSolicitacaoTecnica tipoTecnico;

    @Enumerated(EnumType.STRING)
    @Column(name = "tipo_obra_snapshot", length = 20)
    private TipoObraSnapshot tipoObraSnapshot;

    @Column(name = "id_ocorrencia")
    private UUID idOcorrencia;

    @Column(name = "codigo_ocorrencia_snapshot", length = 100)
    private String ocorrencia;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_reserva")
    private ReservaSolicitacaoTecnica reserva;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_operacao")
    private OperacaoSolicitacaoMaterial operacaoSolicitacao;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_item_operacao")
    private ItemOperacaoSolicitacao itemOperacao;

    @Column(name = "id_obra")
    private UUID idObra;

    @Column(name = "id_equipe")
    private UUID idEquipe;

    /** Obra de onde o material saiu quando ele passa de uma obra para outra (empréstimo ou remanejamento). */
    @Column(name = "id_obra_origem")
    private UUID idObraOrigem;

    @NotNull(message = "A condição do material é obrigatória")
    @Enumerated(EnumType.STRING)
    @Column(name = "condicao", nullable = false, length = 20)
    private CondicaoMaterial condicao;

    /** Código do motivo no cadastro de motivos de entrada e baixa avulsa (lista configurável). */
    @Column(name = "motivo", length = 30)
    private String motivo;

    @Column(name = "observacao", length = 1000)
    private String observacao;

    @AuditIgnore
    @Convert(converter = CryptoConverterImpl.class)
    @Column(name = "assinatura_entregador", columnDefinition = "TEXT")
    private String assinaturaEntregador;

    @AuditIgnore
    @Convert(converter = CryptoConverterImpl.class)
    @Column(name = "assinatura_recebedor", columnDefinition = "TEXT")
    private String assinaturaRecebedor;

    public void registrarAssinaturas(String assinaturaEntregador, String assinaturaRecebedor) {
        this.assinaturaEntregador = assinaturaEntregador;
        this.assinaturaRecebedor = assinaturaRecebedor;
    }

    /** Guarda o que foi digitado em outra unidade; a quantidade da movimentação já é a convertida. */
    public void registrarQuantidadeInformada(QuantidadeConvertida convertida) {
        if (convertida == null || !convertida.convertida()) {
            return;
        }
        if (convertida.base().compareTo(quantidade) != 0) {
            throw new InvarianteVioladaException("A quantidade convertida não confere com a movimentação.");
        }
        this.quantidadeInformada = convertida.informada();
        this.unidadeInformada = convertida.unidadeInformada();
    }

    public void registrarJustificativa(String motivo, String observacao) {
        String texto = observacao == null || observacao.isBlank() ? null : observacao.trim();
        if (texto != null && texto.length() > TAMANHO_OBSERVACAO) {
            throw new InvarianteVioladaException("A observação deve ter até 1000 caracteres.");
        }
        this.motivo = motivo;
        this.observacao = texto;
    }

    public enum TipoMovimentacao {
        ENTRADA_AVULSA, 
        BAIXA_AVULSA, 
        TRANSFERENCIA,
        ENTREGA,
        ESTORNO,
        APLICACAO,
        RETIRADA,
        DEVOLUCAO,
        /** Material muda de obra (ou fica livre) sem mudar de local; leva a obra de origem e a de destino. */
        REMANEJAMENTO
    }

    public MovimentacaoEstoque(Estoque origem, Estoque destino, Material material, BigDecimal quantidade, 
                               TipoMovimentacao tipo, CondicaoMaterial condicao, UUID idUsuarioOperador, UUID idReferenciaOperacao, String numSerie) {
        this(origem, destino, material, quantidade, tipo, condicao, idUsuarioOperador, idReferenciaOperacao, numSerie, OffsetDateTime.now());
    }

    public MovimentacaoEstoque(Estoque origem, Estoque destino, Material material, BigDecimal quantidade, 
                               TipoMovimentacao tipo, CondicaoMaterial condicao, UUID idUsuarioOperador, UUID idReferenciaOperacao, String numSerie, OffsetDateTime dataHora) {
        validarMovimentacao(origem, destino, material, quantidade, tipo, condicao, idUsuarioOperador, numSerie);
        this.estoqueOrigem = origem;
        this.estoqueDestino = destino;
        this.material = material;
        this.quantidade = quantidade;
        this.tipo = tipo;
        this.condicao = condicao != null ? condicao : CondicaoMaterial.NOVO;
        this.idUsuarioOperador = idUsuarioOperador;
        this.idReferenciaOperacao = idReferenciaOperacao != null ? idReferenciaOperacao : UUID.randomUUID();
        this.numSerie = numSerie;
        this.dataHora = dataHora != null ? dataHora : OffsetDateTime.now();
    }

    /**
     * Movimento do estoque por obra (aplicação pelo apontamento, rastro entre obras, canteiro, devolução de sobra).
     * Controla quantidade: como no fechamento, não exige número de série, nem em material seriado.
     */
    public static MovimentacaoEstoque criarPorObra(
            Estoque origem,
            Estoque destino,
            Material material,
            BigDecimal quantidade,
            TipoMovimentacao tipo,
            CondicaoMaterial condicao,
            UUID idObra,
            UUID idObraOrigem,
            UUID idEquipe,
            UUID idUsuarioOperador,
            UUID idReferencia,
            String observacao
    ) {
        if (quantidade == null || quantidade.signum() <= 0) {
            throw new IllegalArgumentException("A quantidade deve ser positiva");
        }
        MovimentacaoEstoque movimentacao = new MovimentacaoEstoque();
        movimentacao.estoqueOrigem = origem;
        movimentacao.estoqueDestino = destino;
        movimentacao.material = Objects.requireNonNull(material, "O material e obrigatorio");
        movimentacao.quantidade = quantidade;
        movimentacao.tipo = Objects.requireNonNull(tipo, "O tipo e obrigatorio");
        movimentacao.condicao = Objects.requireNonNullElse(condicao, CondicaoMaterial.NOVO);
        movimentacao.idObra = idObra;
        movimentacao.idObraOrigem = idObraOrigem;
        movimentacao.idEquipe = idEquipe;
        movimentacao.idUsuarioOperador = Objects.requireNonNull(idUsuarioOperador, "O usuario operador e obrigatorio");
        movimentacao.idReferenciaOperacao = idReferencia;
        movimentacao.dataHora = OffsetDateTime.now();
        movimentacao.observacao = observacao == null || observacao.isBlank() ? null
                : observacao.trim().substring(0, Math.min(observacao.trim().length(), TAMANHO_OBSERVACAO));
        return movimentacao;
    }

    /** Série do material quando o movimento por obra leva um item seriado (ex.: devolução no balcão). */
    public void registrarSerie(String numeroSerie) {
        if (numeroSerie != null && !numeroSerie.isBlank()) {
            this.numSerie = numeroSerie.trim();
        }
    }

    public static MovimentacaoEstoque criarTecnica(
            Estoque origem,
            Estoque destino,
            ItemOperacaoSolicitacao itemOperacao,
            TipoMovimentacao tipo,
            UUID idUsuarioOperador
    ) {
        return criarTecnica(origem, destino, itemOperacao, tipo,
                itemOperacao == null ? CondicaoMaterial.NOVO : itemOperacao.getCondicao(),
                idUsuarioOperador);
    }

    public static MovimentacaoEstoque criarTecnica(
            Estoque origem,
            Estoque destino,
            ItemOperacaoSolicitacao itemOperacao,
            TipoMovimentacao tipo,
            CondicaoMaterial condicao,
            UUID idUsuarioOperador
    ) {
        OperacaoSolicitacaoMaterial operacao = Objects.requireNonNull(
                itemOperacao, "O item operacional e obrigatorio").getOperacao();
        MovimentacaoEstoque movimentacao = new MovimentacaoEstoque(
                origem, destino, itemOperacao.getMaterial(), itemOperacao.getQuantidade(), tipo,
                Objects.requireNonNullElse(condicao, CondicaoMaterial.NOVO),
                idUsuarioOperador, operacao.getId(), itemOperacao.getNumeroSerie());
        movimentacao.solicitacao = operacao.getSolicitacao();
        movimentacao.tipoTecnico = operacao.getTipoTecnico();
        movimentacao.tipoObraSnapshot = operacao.getTipoObraSnapshot();
        movimentacao.idOcorrencia = operacao.getIdOcorrencia();
        movimentacao.ocorrencia = operacao.getOcorrencia();
        movimentacao.reserva = operacao.getReserva();
        movimentacao.operacaoSolicitacao = operacao;
        movimentacao.itemOperacao = itemOperacao;
        movimentacao.idObra = operacao.getIdObra();
        movimentacao.idEquipe = operacao.getIdEquipe();
        return movimentacao;
    }

    /**
     * Movimentação de fechamento: como a técnica, mas com a quantidade explícita, porque a
     * troca de efeito move só o que sobrou da movimentação depois dos estornos.
     */
    public static MovimentacaoEstoque criarFechamento(
            Estoque origem,
            Estoque destino,
            ItemOperacaoSolicitacao itemOperacao,
            java.math.BigDecimal quantidade,
            TipoMovimentacao tipo,
            UUID idUsuarioOperador
    ) {
        OperacaoSolicitacaoMaterial operacao = Objects.requireNonNull(
                itemOperacao, "O item operacional e obrigatorio").getOperacao();
        if (quantidade == null || quantidade.signum() <= 0) {
            throw new IllegalArgumentException("A quantidade deve ser positiva");
        }
        // Fechamento regulariza quantidade: não rastreia número de série, nem em material seriado.
        MovimentacaoEstoque movimentacao = new MovimentacaoEstoque();
        movimentacao.estoqueOrigem = origem;
        movimentacao.estoqueDestino = destino;
        movimentacao.material = itemOperacao.getMaterial();
        movimentacao.quantidade = quantidade;
        movimentacao.tipo = Objects.requireNonNull(tipo, "O tipo e obrigatorio");
        movimentacao.condicao = CondicaoMaterial.NOVO;
        movimentacao.idUsuarioOperador = Objects.requireNonNull(idUsuarioOperador, "O operador e obrigatorio");
        movimentacao.idReferenciaOperacao = operacao.getId();
        movimentacao.dataHora = OffsetDateTime.now();
        movimentacao.solicitacao = operacao.getSolicitacao();
        movimentacao.tipoTecnico = operacao.getTipoTecnico();
        movimentacao.tipoObraSnapshot = operacao.getTipoObraSnapshot();
        movimentacao.reserva = operacao.getReserva();
        movimentacao.operacaoSolicitacao = operacao;
        movimentacao.itemOperacao = itemOperacao;
        movimentacao.idObra = operacao.getIdObra();
        return movimentacao;
    }

    public static MovimentacaoEstoque criarComercial(
            SolicitacaoMaterial solicitacao,
            Estoque origem,
            Estoque destino,
            Material material,
            BigDecimal quantidade,
            TipoMovimentacao tipo,
            UUID idUsuarioOperador,
            UUID idReferenciaOperacao,
            String numeroSerie
    ) {
        if (solicitacao == null || solicitacao.getContexto() != ContextoSolicitacaoMaterial.COMERCIAL) {
            throw new InvarianteVioladaException("A movimentacao comercial exige uma solicitacao comercial.");
        }
        MovimentacaoEstoque movimentacao = new MovimentacaoEstoque(
                origem, destino, material, quantidade, tipo, CondicaoMaterial.NOVO,
                idUsuarioOperador, idReferenciaOperacao, numeroSerie);
        movimentacao.solicitacao = solicitacao;
        movimentacao.tipoTecnico = solicitacao.getTipoTecnico();
        movimentacao.idEquipe = solicitacao.getIdEquipeSaque();
        return movimentacao;
    }

    public static MovimentacaoEstoque criarDevolucaoComercial(
            Estoque origemCampo,
            Estoque destinoFisico,
            Material material,
            BigDecimal quantidade,
            CondicaoMaterial condicao,
            UUID idEquipe,
            UUID idUsuarioOperador,
            UUID idReferenciaOperacao,
            String numeroSerie
    ) {
        MovimentacaoEstoque movimentacao = new MovimentacaoEstoque(
                origemCampo, destinoFisico, material, quantidade, TipoMovimentacao.DEVOLUCAO,
                condicao != null ? condicao : CondicaoMaterial.NOVO,
                idUsuarioOperador, idReferenciaOperacao, numeroSerie);
        movimentacao.tipoTecnico = TipoSolicitacaoTecnica.DEVOLUCAO_COMUM;
        movimentacao.idEquipe = idEquipe;
        return movimentacao;
    }

    public static MovimentacaoEstoque criarDevolucaoTecnica(
            Estoque origemObra,
            Estoque destinoFisico,
            Material material,
            BigDecimal quantidade,
            CondicaoMaterial condicao,
            ContextoDevolucaoTecnica contexto,
            UUID idUsuarioOperador,
            UUID idReferenciaOperacao,
            String numeroSerie
    ) {
        MovimentacaoEstoque movimentacao = new MovimentacaoEstoque(
                origemObra, destinoFisico, material, quantidade, TipoMovimentacao.DEVOLUCAO, condicao,
                idUsuarioOperador, idReferenciaOperacao, numeroSerie);
        movimentacao.aplicar(contexto);
        return movimentacao;
    }

    /** Material devolvido que o sistema não sabia estar na obra: entra nela antes de sair. */
    public static MovimentacaoEstoque criarEntradaPorDevolucaoTecnica(
            Estoque estoqueObra,
            Material material,
            BigDecimal quantidade,
            CondicaoMaterial condicao,
            ContextoDevolucaoTecnica contexto,
            UUID idUsuarioOperador,
            UUID idReferenciaOperacao,
            String numeroSerie
    ) {
        MovimentacaoEstoque movimentacao = new MovimentacaoEstoque(
                null, estoqueObra, material, quantidade, TipoMovimentacao.ENTRADA_AVULSA, condicao,
                idUsuarioOperador, idReferenciaOperacao, numeroSerie);
        movimentacao.aplicar(contexto);
        return movimentacao;
    }

    private void aplicar(ContextoDevolucaoTecnica contexto) {
        this.tipoTecnico = contexto.tipoTecnico();
        this.idObra = contexto.idObra();
        this.tipoObraSnapshot = contexto.tipoObra();
        this.idOcorrencia = contexto.idOcorrencia();
        this.ocorrencia = contexto.ocorrencia();
        this.idEquipe = contexto.idEquipe();
    }

    /** O que liga a movimentação direta à obra, já que não há solicitação por trás. */
    public record ContextoDevolucaoTecnica(
            TipoSolicitacaoTecnica tipoTecnico,
            UUID idObra,
            TipoObraSnapshot tipoObra,
            UUID idOcorrencia,
            String ocorrencia,
            UUID idEquipe
    ) {
    }

    private void validarMovimentacao(Estoque origem, Estoque destino, Material material, BigDecimal quantidade, 
                                     TipoMovimentacao tipo, CondicaoMaterial condicao, UUID idUsuarioOperador, String numSerie) {
        if (material == null) throw new IllegalArgumentException("Material é obrigatório");
        if (condicao == null) throw new IllegalArgumentException("Condição do material é obrigatória");
        if (quantidade == null || quantidade.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("A quantidade deve ser positiva");
        }
        if (tipo == null) throw new IllegalArgumentException("Tipo de movimentação é obrigatório");
        if (idUsuarioOperador == null) throw new IllegalArgumentException("ID do usuário operador é obrigatório");
        exigirMesmoCatalogo(origem, material);
        exigirMesmoCatalogo(destino, material);

        // Regra de Série: Se detalha série, exige número. Se não, proíbe.
        if (material.isDetalhaSerie()) {
            if (numSerie == null || numSerie.isBlank()) {
                throw new InvarianteVioladaException("O material '" + material.getCodigo() + "' exige número de série.");
            }
            if (quantidade.compareTo(BigDecimal.ONE) != 0) {
                throw new InvarianteVioladaException("Materiais com controle de série devem ser movimentados um a um.");
            }
        } else if (numSerie != null && !numSerie.isBlank()) {
            throw new InvarianteVioladaException("O material '" + material.getCodigo() + "' não permite número de série.");
        }

        if (tipo == TipoMovimentacao.TRANSFERENCIA) {
            if (origem == null || destino == null) {
                throw new IllegalArgumentException("Origem e Destino são obrigatórios para transferências");
            }
            if (origem.getId() != null && Objects.equals(origem.getId(), destino.getId())) {
                throw new IllegalArgumentException("Origem e Destino não podem ser iguais");
            }
        }
        if (tipo == TipoMovimentacao.ENTREGA && destino == null) {
            throw new IllegalArgumentException("Destino é obrigatório para entrega");
        }
        // RETIRADA é o material retirado em campo pela equipe: entra no estoque
        // da equipe (destino) como sucata; não há estoque de origem.
        if (tipo == TipoMovimentacao.RETIRADA && destino == null) {
            throw new IllegalArgumentException("Destino é obrigatório para retirada de campo");
        }
        if (tipo == TipoMovimentacao.DEVOLUCAO) {
            if (origem == null || destino == null) {
                throw new IllegalArgumentException("Origem e Destino são obrigatórios para devolução");
            }
            if (origem.getId() != null && Objects.equals(origem.getId(), destino.getId())) {
                throw new IllegalArgumentException("Origem e Destino não podem ser iguais");
            }
        }
    }
    // ── Contexto da movimentação com custo (estoque da frota) ─────────────────────
    @Column(name = "valor_unitario", precision = 14, scale = 4)
    private BigDecimal valorUnitario;

    /** Motivo próprio da frota; o {@code motivo} acima é o das entradas e baixas avulsas. */
    @Column(name = "motivo_frota", length = 40)
    private String motivoFrota;

    @Column(name = "documento", length = 60)
    private String documento;

    /** Veículo que recebeu a peça (módulo frota). */
    @Column(name = "id_veiculo")
    private UUID idVeiculo;

    /** Fornecedor da entrada (módulo financeiro). */
    @Column(name = "id_fornecedor")
    private UUID idFornecedor;

    /** Movimentação de peça da frota, com custo e contexto. A OS vai em {@code idReferenciaOperacao}. */
    public static MovimentacaoEstoque criarFrota(Estoque origem, Estoque destino, Material material, BigDecimal quantidade,
                                                 TipoMovimentacao tipo, BigDecimal valorUnitario, ContextoFrota contexto,
                                                 UUID idUsuarioOperador, OffsetDateTime dataHora) {
        material.exigirCatalogoFrota();
        var movimentacao = new MovimentacaoEstoque(origem, destino, material, quantidade, tipo, CondicaoMaterial.NOVO,
                idUsuarioOperador, contexto.idReferencia(), null, dataHora);
        movimentacao.valorUnitario = valorUnitario;
        movimentacao.motivoFrota = contexto.motivo();
        movimentacao.documento = texto(contexto.documento(), 60);
        movimentacao.observacao = texto(contexto.observacao(), 500);
        movimentacao.idVeiculo = contexto.idVeiculo();
        movimentacao.idFornecedor = contexto.idFornecedor();
        return movimentacao;
    }

    /** Motivo, documento (NF), observação, veículo, fornecedor e a referência (OS) da movimentação da frota. */
    public record ContextoFrota(String motivo, String documento, String observacao, UUID idVeiculo, UUID idFornecedor,
                                UUID idReferencia) {
    }

    private static String texto(String valor, int max) {
        if (valor == null || valor.isBlank()) {
            return null;
        }
        String limpo = valor.trim();
        if (limpo.length() > max) {
            throw new InvarianteVioladaException("Texto acima de " + max + " caracteres.");
        }
        return limpo;
    }


    /**
     * Isolamento entre o estoque da frota e o operacional: peça da frota só em estoque FROTA, e
     * estoque FROTA só com peça da frota.
     */
    private static void exigirMesmoCatalogo(Estoque estoque, Material material) {
        if (estoque == null) {
            return;
        }
        if (estoque.isTipoFrota() && !material.isCatalogoFrota()) {
            throw new InvarianteVioladaException("O " + estoque.getNomeIdentificador()
                    + " é da frota e só movimenta peças da oficina.");
        }
        if (!estoque.isTipoFrota() && material.isCatalogoFrota()) {
            throw new InvarianteVioladaException("A peça " + material.getCodigo()
                    + " é da frota e só movimenta nos almoxarifados da oficina.");
        }
    }
}
