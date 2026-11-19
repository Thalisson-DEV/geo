package com.nexo.app.modules.estoque.domain;

import com.fasterxml.jackson.annotation.JsonManagedReference;
import com.nexo.app.shared.domain.AuditIgnore;
import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.infrastructure.persistence.CryptoConverterImpl;
import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

import com.nexo.app.modules.obras.ObraApi.ObraPublica;
import com.nexo.app.modules.obras.ObraApi.OcorrenciaPublica;

/**
 * Representa um pedido de materiais feito por uma equipe ou setor ao almoxarifado.
 * Segue um fluxo de aprovação e entrega com assinaturas eletrônicas cifradas.
 */
@Entity
@Table(name = "solicitacoes_material")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SolicitacaoMaterial extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_estoque_origem")
    private Estoque estoqueOrigem;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_estoque_destino")
    private Estoque estoqueDestino;

    @Enumerated(EnumType.STRING)
    @Column(name = "contexto", length = 20)
    private ContextoSolicitacaoMaterial contexto = ContextoSolicitacaoMaterial.COMERCIAL;

    @Convert(converter = TipoSolicitacaoTecnicaConverter.class)
    @Column(name = "tipo_tecnico", length = 3)
    private TipoSolicitacaoTecnica tipoTecnico = TipoSolicitacaoTecnica.ADICAO_COMUM;

    @Column(name = "id_obra")
    private UUID idObra;

    @Enumerated(EnumType.STRING)
    @Column(name = "tipo_obra_snapshot", length = 20)
    private TipoObraSnapshot tipoObraSnapshot;

    @Column(name = "id_ocorrencia")
    private UUID idOcorrencia;

    @Column(name = "codigo_ocorrencia_snapshot", length = 100)
    private String ocorrencia;

    /** Programação de obra que gerou a solicitação; nula na solicitação manual. */
    @Column(name = "id_programacao")
    private UUID idProgramacao;

    @Column(name = "numero_programacao")
    private Long numeroProgramacao;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_almoxarifado_atendimento")
    private Estoque almoxarifadoAtendimento;

    @Column(name = "id_equipe_saque")
    private UUID idEquipeSaque;

    @Column(name = "id_colaborador_saque")
    private UUID idColaboradorSaque;

    @Column(name = "saque_fora_equipe", nullable = false)
    private boolean saqueForaEquipe;

    @Column(name = "data_prevista_retirada")
    private LocalDate dataPrevistaRetirada;

    @Column(name = "observacao", length = 1000)
    private String observacao;

    @Enumerated(EnumType.STRING)
    @Column(name = "status_separacao", length = 30)
    private StatusSeparacao statusSeparacao;

    @Column(name = "separacao_iniciada_em")
    private OffsetDateTime separacaoIniciadaEm;

    @Column(name = "id_usuario_inicio_separacao")
    private UUID idUsuarioInicioSeparacao;

    @Column(name = "separacao_concluida_em")
    private OffsetDateTime separacaoConcluidaEm;

    @Column(name = "id_usuario_conclusao_separacao")
    private UUID idUsuarioConclusaoSeparacao;

    @Column(name = "encerrada_em")
    private OffsetDateTime encerradaEm;

    @Column(name = "id_usuario_encerramento")
    private UUID idUsuarioEncerramento;

    @Column(name = "motivo_encerramento", length = 500)
    private String motivoEncerramento;

    @NotNull(message = "O requisitante é obrigatório")
    @Column(name = "id_requisitante", nullable = false)
    private UUID idRequisitante;

    @Column(name = "id_aprovador")
    private UUID idAprovador;

    @Column(name = "id_entregador_almox")
    private UUID idEntregadorAlmox;

    @NotNull(message = "O status da solicitação é obrigatório")
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private StatusSolicitacao status;

    @AuditIgnore
    @Convert(converter = CryptoConverterImpl.class)
    @Column(name = "assinatura_almox")
    private String assinaturaAlmox; // 🔒 Cifrada

    @AuditIgnore
    @Convert(converter = CryptoConverterImpl.class)
    @Column(name = "assinatura_equipe")
    private String assinaturaEquipe; // 🔒 Cifrada

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_motivo_rejeicao")
    private MotivoRejeicao motivoRejeicao;

    @Column(name = "justificativa_rejeicao", columnDefinition = "TEXT")
    private String justificativaRejeicao;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_motivo_pendencia")
    private MotivoPendencia motivoPendencia;

    @Column(name = "justificativa_pendencia", length = 2000)
    private String justificativaPendencia;

    @NotNull(message = "A data de solicitação é obrigatória")
    @Column(name = "data_solicitacao", nullable = false)
    private OffsetDateTime dataSolicitacao;

    @Column(name = "data_verificacao")
    private OffsetDateTime dataVerificacao;

    @Column(name = "data_entrega")
    private OffsetDateTime dataEntrega;

    @JsonManagedReference
    @OneToMany(mappedBy = "solicitacao", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<ItemSolicitacao> itens = new ArrayList<>();

    @OneToOne(mappedBy = "solicitacao", fetch = FetchType.LAZY)
    private ReservaSolicitacaoTecnica reserva;

    // --- Encerramento de obra -------------------------------------------------

    @Column(name = "id_encarregado")
    private UUID idEncarregado;

    @Column(name = "id_supervisor")
    private UUID idSupervisor;

    @Column(name = "prazo_reserva_ate")
    private OffsetDateTime prazoReservaAte;

    @Column(name = "prazo_movimentacao_ate")
    private OffsetDateTime prazoMovimentacaoAte;

    @Column(name = "reserva_cumprida_em")
    private OffsetDateTime reservaCumpridaEm;

    @Column(name = "movimentacao_concluida_em")
    private OffsetDateTime movimentacaoConcluidaEm;

    @Enumerated(EnumType.STRING)
    @Column(name = "situacao_fechamento", length = 30)
    private SituacaoFechamentoSolicitacao situacaoFechamento;

    /** Limite do prazo em curso; nulo quando não há prazo correndo. Mantido para filtrar e ordenar. */
    @Column(name = "prazo_vigente_ate")
    private OffsetDateTime prazoVigenteAte;

    @Column(name = "cancelada_em")
    private OffsetDateTime canceladaEm;

    @Column(name = "id_usuario_cancelamento")
    private UUID idUsuarioCancelamento;

    @Column(name = "motivo_cancelamento", length = 500)
    private String motivoCancelamento;

    public enum StatusSolicitacao {
        PENDENTE, 
        APROVADO, 
        REJEITADO,
        ENTREGUE_PARCIAL,
        ENTREGUE,
        DEVOLVIDO_PARCIAL,
        DEVOLVIDO,
        ESTORNADO,
        CANCELADO
    }

    public boolean possuiPendencia() {
        if (itens != null && !itens.isEmpty()) {
            return itens.stream().anyMatch(ItemSolicitacao::possuiPendencia);
        }
        return motivoPendencia != null;
    }

    /** Nomes distintos dos motivos de pendência abertos (da solicitação e dos itens), em ordem alfabética. */
    public List<String> nomesMotivosPendencia() {
        java.util.stream.Stream<MotivoPendencia> dosItens = itens == null
                ? java.util.stream.Stream.empty()
                : itens.stream().map(ItemSolicitacao::getMotivoPendencia);
        return java.util.stream.Stream.concat(java.util.stream.Stream.ofNullable(motivoPendencia), dosItens)
                .filter(Objects::nonNull)
                .map(MotivoPendencia::getNome)
                .filter(Objects::nonNull)
                .distinct()
                .sorted()
                .toList();
    }

    public void registrarPendencia(MotivoPendencia motivo) {
        validarMotivo(motivo);
        this.motivoPendencia = motivo;
        this.justificativaPendencia = null;
    }

    public void registrarPendencia(MotivoPendencia motivo, String justificativa) {
        if (justificativa == null || justificativa.isBlank()) {
            registrarPendencia(motivo);
            return;
        }
        validarPendencia(motivo, justificativa);
        this.motivoPendencia = motivo;
        this.justificativaPendencia = justificativa.trim();
    }

    public void removerPendencia() {
        this.motivoPendencia = null;
        this.justificativaPendencia = null;
    }

    public MotivoPendencia getMotivoPendencia() {
        if (itens != null && !itens.isEmpty()) {
            boolean temItemComPendencia = itens.stream().anyMatch(ItemSolicitacao::possuiPendencia);
            if (!temItemComPendencia) {
                return null;
            }
            if (this.motivoPendencia != null) {
                return this.motivoPendencia;
            }
            return itens.stream()
                    .filter(ItemSolicitacao::possuiPendencia)
                    .map(ItemSolicitacao::getMotivoPendencia)
                    .filter(Objects::nonNull)
                    .findFirst()
                    .orElse(null);
        }
        return this.motivoPendencia;
    }

    public String getJustificativaPendencia() {
        if (itens != null && !itens.isEmpty()) {
            boolean temItemComPendencia = itens.stream().anyMatch(ItemSolicitacao::possuiPendencia);
            if (!temItemComPendencia) {
                return null;
            }
            if (this.justificativaPendencia != null) {
                return this.justificativaPendencia;
            }
            return itens.stream()
                    .filter(ItemSolicitacao::possuiPendencia)
                    .map(ItemSolicitacao::getJustificativaPendencia)
                    .filter(Objects::nonNull)
                    .findFirst()
                    .orElse(null);
        }
        return this.justificativaPendencia;
    }

    static void validarMotivo(MotivoPendencia motivo) {
        if (motivo == null || !motivo.isAtivo()) {
            throw new InvarianteVioladaException("Informe um motivo ativo.");
        }
    }

    static void validarPendencia(MotivoPendencia motivo, String justificativa) {
        validarMotivo(motivo);
        if (justificativa == null || justificativa.trim().length() < 5 || justificativa.trim().length() > 2000) {
            throw new InvarianteVioladaException("Informe um motivo ativo e uma justificativa de 5 a 2000 caracteres.");
        }
    }

    public SolicitacaoMaterial(Estoque estoqueOrigem, Estoque estoqueDestino, UUID idRequisitante) {
        validarEstoque(estoqueOrigem);
        validarEstoque(estoqueDestino);
        if (estoqueOrigem.getId().equals(estoqueDestino.getId())) {
            throw new InvarianteVioladaException("O estoque de origem e destino não podem ser o mesmo.");
        }
        this.estoqueOrigem = estoqueOrigem;
        this.estoqueDestino = estoqueDestino;
        this.idRequisitante = Objects.requireNonNull(idRequisitante, "ID do requisitante é obrigatório");
        this.contexto = ContextoSolicitacaoMaterial.COMERCIAL;
        this.tipoTecnico = TipoSolicitacaoTecnica.ADICAO_COMUM;
        this.status = StatusSolicitacao.PENDENTE;
        this.dataSolicitacao = OffsetDateTime.now();
    }

    public SolicitacaoMaterial(
            Estoque estoqueOrigem,
            Estoque estoqueDestino,
            UUID idRequisitante,
            LocalDate dataPrevistaRetirada) {
        this(estoqueOrigem, estoqueDestino, idRequisitante, dataPrevistaRetirada,
                estoqueDestino == null ? null : estoqueDestino.getIdEquipe(), null, false);
    }

    public SolicitacaoMaterial(
            Estoque estoqueOrigem,
            Estoque estoqueDestino,
            UUID idRequisitante,
            LocalDate dataPrevistaRetirada,
            UUID idEquipeSaque,
            UUID idColaboradorSaque,
            boolean saqueForaEquipe) {
        this(estoqueOrigem, estoqueDestino, idRequisitante);
        this.dataPrevistaRetirada = Objects.requireNonNull(
                dataPrevistaRetirada, "A data prevista de saque e obrigatoria");
        this.idEquipeSaque = Objects.requireNonNull(
                idEquipeSaque, "A equipe de saque e obrigatoria");
        this.idColaboradorSaque = idColaboradorSaque;
        this.saqueForaEquipe = idColaboradorSaque != null && saqueForaEquipe;
    }

    public void definirObservacaoComercial(String valor) {
        if (contexto != ContextoSolicitacaoMaterial.COMERCIAL) {
            throw new InvarianteVioladaException("A observacao comercial exige solicitacao comercial.");
        }
        if (valor != null && valor.length() > 1000) {
            throw new InvarianteVioladaException("A observacao deve ter ate 1000 caracteres.");
        }
        this.observacao = valor == null || valor.isBlank() ? null : valor.trim();
    }

    /**
     * Comercial: quem aprova ou entrega pode trocar o almoxarifado que atende. Só antes da
     * primeira saída: o estorno devolve o material à origem da solicitação.
     */
    public void trocarEstoqueOrigemComercial(Estoque novaOrigem) {
        if (contexto != ContextoSolicitacaoMaterial.COMERCIAL) {
            throw new InvarianteVioladaException("A troca de origem exige solicitacao comercial.");
        }
        Objects.requireNonNull(novaOrigem, "O estoque de origem e obrigatorio");
        if (estoqueOrigem != null && novaOrigem.getId().equals(estoqueOrigem.getId())) {
            return;
        }
        if (!novaOrigem.isAtivo()
                || novaOrigem.getTipoEstoque() == null
                || !"FISICO".equalsIgnoreCase(novaOrigem.getTipoEstoque().getNome())) {
            throw new InvarianteVioladaException("O estoque de origem deve estar ativo e ser do tipo FISICO.");
        }
        if (estoqueDestino != null && novaOrigem.getId().equals(estoqueDestino.getId())) {
            throw new InvarianteVioladaException("O estoque de origem e destino não podem ser o mesmo.");
        }
        if (itens.stream().anyMatch(item -> item.getQuantidadeEntregaLiquida().signum() > 0)) {
            throw new InvarianteVioladaException(
                    "Já saiu material desta origem. A origem só pode mudar antes da primeira entrega.");
        }
        this.estoqueOrigem = novaOrigem;
    }

    public void reagendarSaqueComercial(LocalDate novaData) {
        if (contexto != ContextoSolicitacaoMaterial.COMERCIAL) {
            throw new InvarianteVioladaException("O reagendamento do saque exige solicitacao comercial.");
        }
        this.dataPrevistaRetirada = Objects.requireNonNull(novaData, "A data prevista de saque e obrigatoria");
    }

    /** Cria uma solicitacao tecnica independente, sem raiz de agrupamento. */
    public static SolicitacaoMaterial criarTecnica(
            ObraPublica obra,
            OcorrenciaPublica ocorrencia,
            TipoSolicitacaoTecnica tipoTecnico,
            Estoque estoqueObra,
            Estoque almoxarifadoAtendimento,
            UUID idEquipeSaque,
            LocalDate dataPrevistaRetirada,
            String observacao,
            UUID idRequisitante
    ) {
        return criarTecnica(
                obra, ocorrencia, tipoTecnico, estoqueObra, almoxarifadoAtendimento,
                idEquipeSaque, null, false, dataPrevistaRetirada, observacao, idRequisitante);
    }

    public static SolicitacaoMaterial criarTecnica(
            ObraPublica obra,
            OcorrenciaPublica ocorrencia,
            TipoSolicitacaoTecnica tipoTecnico,
            Estoque estoqueObra,
            Estoque almoxarifadoAtendimento,
            UUID idEquipeSaque,
            UUID idColaboradorSaque,
            boolean saqueForaEquipe,
            LocalDate dataPrevistaRetirada,
            String observacao,
            UUID idRequisitante
    ) {
        SolicitacaoMaterial solicitacao = new SolicitacaoMaterial();
        solicitacao.contexto = ContextoSolicitacaoMaterial.TECNICO;
        solicitacao.tipoTecnico = Objects.requireNonNull(tipoTecnico, "O tipo tecnico e obrigatorio");
        solicitacao.idObra = Objects.requireNonNull(
                Objects.requireNonNull(obra, "A obra e obrigatoria").id(), "O ID da obra e obrigatorio");
        solicitacao.tipoObraSnapshot = TipoObraSnapshot.valueOf(obra.tipoObra().name());
        solicitacao.idOcorrencia = ocorrencia == null ? null : ocorrencia.id();
        solicitacao.ocorrencia = ocorrencia == null ? null : ocorrencia.codigo();
        solicitacao.almoxarifadoAtendimento = Objects.requireNonNull(
                almoxarifadoAtendimento, "O almoxarifado de atendimento e obrigatorio");
        solicitacao.idEquipeSaque = idEquipeSaque;
        solicitacao.idColaboradorSaque = idColaboradorSaque;
        solicitacao.saqueForaEquipe = saqueForaEquipe;
        solicitacao.dataPrevistaRetirada = dataPrevistaRetirada;
        solicitacao.observacao = observacao == null || observacao.isBlank() ? null : observacao.trim();
        solicitacao.idRequisitante = Objects.requireNonNull(idRequisitante, "O requisitante e obrigatorio");
        solicitacao.status = StatusSolicitacao.APROVADO;
        solicitacao.dataSolicitacao = OffsetDateTime.now();
        if (tipoTecnico.isAdicao()) {
            solicitacao.estoqueDestino = Objects.requireNonNull(estoqueObra, "O estoque da obra e obrigatorio");
            solicitacao.statusSeparacao = dataPrevistaRetirada == null
                    ? StatusSeparacao.AGUARDANDO_AGENDAMENTO : StatusSeparacao.PRONTO_PARA_SEPARACAO;
        } else {
            solicitacao.estoqueOrigem = Objects.requireNonNull(estoqueObra, "O estoque da obra e obrigatorio");
            solicitacao.statusSeparacao = null;
        }
        return solicitacao;
    }

    /**
     * Cria uma solicitação de encerramento: regulariza o saldo da obra, sem agendamento,
     * separação ou assinatura. Nasce aguardando reserva, com 48 horas úteis para recebê-la.
     */
    public static SolicitacaoMaterial criarFechamento(
            ObraPublica obra,
            TipoSolicitacaoTecnica tipo,
            Estoque estoqueObra,
            Estoque almoxarifadoAtendimento,
            UUID idEncarregado,
            UUID idSupervisor,
            String observacao,
            UUID idRequisitante
    ) {
        SolicitacaoMaterial solicitacao = new SolicitacaoMaterial();
        solicitacao.contexto = ContextoSolicitacaoMaterial.FECHAMENTO;
        solicitacao.tipoTecnico = Objects.requireNonNull(tipo, "O tipo e obrigatorio");
        solicitacao.idObra = Objects.requireNonNull(
                Objects.requireNonNull(obra, "A obra e obrigatoria").id(), "O ID da obra e obrigatorio");
        solicitacao.tipoObraSnapshot = TipoObraSnapshot.valueOf(obra.tipoObra().name());
        solicitacao.almoxarifadoAtendimento = Objects.requireNonNull(
                almoxarifadoAtendimento, "O almoxarifado de atendimento e obrigatorio");
        Objects.requireNonNull(estoqueObra, "O estoque da obra e obrigatorio");
        if (tipo.isAdicao()) {
            solicitacao.estoqueOrigem = almoxarifadoAtendimento;
            solicitacao.estoqueDestino = estoqueObra;
        } else {
            solicitacao.estoqueOrigem = estoqueObra;
            solicitacao.estoqueDestino = almoxarifadoAtendimento;
        }
        solicitacao.idEncarregado = idEncarregado;
        solicitacao.idSupervisor = idSupervisor;
        solicitacao.observacao = limparObservacao(observacao);
        solicitacao.idRequisitante = Objects.requireNonNull(idRequisitante, "O solicitante e obrigatorio");
        solicitacao.status = StatusSolicitacao.APROVADO;
        solicitacao.dataSolicitacao = OffsetDateTime.now();
        solicitacao.prazoReservaAte = com.nexo.app.shared.domain.HorasUteis.somar(
                solicitacao.dataSolicitacao, SituacaoPrazoFechamento.HORAS_UTEIS_PRAZO);
        solicitacao.recalcularFechamento();
        return solicitacao;
    }

    public boolean isFechamento() {
        return contexto == ContextoSolicitacaoMaterial.FECHAMENTO;
    }

    public ItemSolicitacao adicionarItemFechamento(Material material, BigDecimal quantidade) {
        exigirFechamentoEditavel();
        Objects.requireNonNull(material, "O material e obrigatorio");
        if (quantidade == null || quantidade.signum() <= 0) {
            throw new InvarianteVioladaException("A quantidade do material " + material.getCodigo() + " deve ser positiva.");
        }
        boolean repetido = itens.stream().anyMatch(item -> Objects.equals(item.getMaterial().getId(), material.getId()));
        if (repetido) {
            throw new InvarianteVioladaException("O material " + material.getCodigo() + " já está na solicitação.");
        }
        ItemSolicitacao item = new ItemSolicitacao(this, material, quantidade);
        itens.add(item);
        recalcularFechamento();
        return item;
    }

    public void alterarQuantidadeItemFechamento(UUID idItem, BigDecimal quantidade) {
        exigirFechamentoEditavel();
        ItemSolicitacao item = itemFechamento(idItem);
        if (quantidade == null || quantidade.signum() <= 0) {
            throw new InvarianteVioladaException("A quantidade deve ser positiva.");
        }
        BigDecimal movimentada = item.getQuantidadeOperadaLiquida();
        if (quantidade.compareTo(movimentada) < 0) {
            throw new InvarianteVioladaException("Já foram movimentados " + movimentada.stripTrailingZeros().toPlainString()
                    + " deste material. A quantidade mínima é " + movimentada.stripTrailingZeros().toPlainString() + ".");
        }
        item.replanejar(item.getMaterial(), quantidade);
        recalcularFechamento();
    }

    public ItemSolicitacao removerItemFechamento(UUID idItem) {
        exigirFechamentoEditavel();
        ItemSolicitacao item = itemFechamento(idItem);
        if (item.possuiFatoOperacional()) {
            throw new InvarianteVioladaException("Material com movimentação registrada não pode ser removido.");
        }
        if (itens.size() == 1) {
            throw new InvarianteVioladaException("A solicitação precisa de ao menos um material. Para desistir, cancele.");
        }
        itens.remove(item);
        recalcularFechamento();
        return item;
    }

    public void definirResponsaveisFechamento(UUID idEncarregado, UUID idSupervisor) {
        exigirFechamentoEditavel();
        this.idEncarregado = idEncarregado;
        this.idSupervisor = idSupervisor;
    }

    public void definirObservacaoFechamento(String valor) {
        exigirFechamentoEditavel();
        this.observacao = limparObservacao(valor);
    }

    /** Reserva registrada (ou corrigida). O prazo de movimentação corre só do primeiro registro. */
    public void reservaRegistradaNoFechamento(OffsetDateTime instante) {
        exigirFechamento();
        if (prazoMovimentacaoAte == null) {
            OffsetDateTime registro = Objects.requireNonNull(instante, "O instante do registro e obrigatorio");
            this.reservaCumpridaEm = registro;
            this.prazoMovimentacaoAte = com.nexo.app.shared.domain.HorasUteis.somar(
                    registro, SituacaoPrazoFechamento.HORAS_UTEIS_PRAZO);
        }
        recalcularFechamento();
    }

    /** Reserva pode ser trocada até a primeira movimentação não estornada (no fechamento). */
    public boolean reservaBloqueadaParaAlteracao() {
        if (isFechamento()) {
            return possuiQuantidadeMovimentadaFechamento();
        }
        return possuiFatoOperacional();
    }

    public boolean possuiQuantidadeMovimentadaFechamento() {
        return itens.stream().anyMatch(item -> item.getQuantidadeOperadaLiquida().signum() > 0);
    }

    public void exigirMovimentavelNoFechamento() {
        exigirFechamento();
        if (status == StatusSolicitacao.CANCELADO) {
            throw new InvarianteVioladaException("A solicitação está cancelada.");
        }
        if (reserva == null) {
            throw new InvarianteVioladaException("Falta a reserva. Registre o número da reserva antes de movimentar.");
        }
    }

    /** Atualiza a situação depois de movimentação, estorno ou troca de efeito. */
    public void aplicarMovimentacaoFechamento(OffsetDateTime instante) {
        exigirFechamento();
        boolean concluida = !itens.isEmpty() && itens.stream().allMatch(ItemSolicitacao::isTotalmenteEntregue);
        if (concluida && movimentacaoConcluidaEm == null) {
            this.movimentacaoConcluidaEm = Objects.requireNonNull(instante, "O instante e obrigatorio");
            this.dataEntrega = instante;
        } else if (!concluida) {
            this.movimentacaoConcluidaEm = null;
        }
        recalcularFechamento();
    }

    /** Quem abriu a solicitação: a única pessoa que pode cancelar um fechamento. */
    public boolean abertaPor(UUID idUsuario) {
        return idUsuario != null && idUsuario.equals(idRequisitante);
    }

    public void cancelarFechamento(UUID idUsuario, String motivo) {
        exigirFechamento();
        if (!abertaPor(idUsuario)) {
            throw new InvarianteVioladaException("Só quem abriu a solicitação pode cancelar.");
        }
        if (status == StatusSolicitacao.CANCELADO) {
            throw new InvarianteVioladaException("A solicitação já está cancelada.");
        }
        if (possuiQuantidadeMovimentadaFechamento()) {
            throw new InvarianteVioladaException(
                    "Há quantidade movimentada nesta solicitação. Estorne as movimentações antes de cancelar.");
        }
        if (motivo == null || motivo.isBlank()) {
            throw new InvarianteVioladaException("Informe o motivo do cancelamento.");
        }
        if (motivo.trim().length() > 500) {
            throw new InvarianteVioladaException("O motivo deve ter até 500 caracteres.");
        }
        this.status = StatusSolicitacao.CANCELADO;
        this.canceladaEm = OffsetDateTime.now();
        this.idUsuarioCancelamento = Objects.requireNonNull(idUsuario, "O usuario e obrigatorio");
        this.motivoCancelamento = motivo.trim();
        recalcularFechamento();
    }

    public void registrarPendenciaGeralFechamento(MotivoPendencia motivo, String justificativa) {
        exigirFechamentoAberto();
        if (justificativa == null || justificativa.isBlank()) {
            validarMotivo(motivo);
            this.justificativaPendencia = null;
        } else {
            validarPendencia(motivo, justificativa);
            this.justificativaPendencia = justificativa.trim();
        }
        this.motivoPendencia = motivo;
    }

    public void removerPendenciaGeralFechamento() {
        exigirFechamentoAberto();
        this.motivoPendencia = null;
        this.justificativaPendencia = null;
    }

    public void registrarPendenciaItemFechamento(UUID idItem, MotivoPendencia motivo, String justificativa) {
        exigirFechamentoAberto();
        itemFechamento(idItem).registrarPendencia(motivo, justificativa);
    }

    public void removerPendenciaItemFechamento(UUID idItem) {
        exigirFechamentoAberto();
        itemFechamento(idItem).removerPendencia();
    }

    /** Pendência registrada na solicitação inteira (sem olhar os itens). */
    public MotivoPendencia getMotivoPendenciaGeral() {
        return motivoPendencia;
    }

    public String getJustificativaPendenciaGeral() {
        return justificativaPendencia;
    }

    public boolean possuiPendenciaFechamento() {
        return motivoPendencia != null || itens.stream().anyMatch(ItemSolicitacao::possuiPendencia);
    }

    public SituacaoPrazoFechamento situacaoPrazoReserva(OffsetDateTime agora) {
        if (!isFechamento() || prazoReservaAte == null) {
            return null;
        }
        if (reservaCumpridaEm != null) {
            return SituacaoPrazoFechamento.cumprido(prazoReservaAte, reservaCumpridaEm);
        }
        return status == StatusSolicitacao.CANCELADO ? null : SituacaoPrazoFechamento.emCurso(prazoReservaAte, agora);
    }

    public SituacaoPrazoFechamento situacaoPrazoMovimentacao(OffsetDateTime agora) {
        if (!isFechamento() || prazoMovimentacaoAte == null) {
            return null;
        }
        if (movimentacaoConcluidaEm != null) {
            return SituacaoPrazoFechamento.cumprido(prazoMovimentacaoAte, movimentacaoConcluidaEm);
        }
        return status == StatusSolicitacao.CANCELADO ? null : SituacaoPrazoFechamento.emCurso(prazoMovimentacaoAte, agora);
    }

    /** Prazo em curso: o da reserva enquanto ela falta, depois o da movimentação. */
    public SituacaoPrazoFechamento situacaoPrazoVigente(OffsetDateTime agora) {
        if (situacaoFechamento == SituacaoFechamentoSolicitacao.AGUARDANDO_RESERVA) {
            return situacaoPrazoReserva(agora);
        }
        if (situacaoFechamento == SituacaoFechamentoSolicitacao.CANCELADA) {
            return null;
        }
        return situacaoPrazoMovimentacao(agora);
    }

    private void recalcularFechamento() {
        if (!isFechamento()) {
            return;
        }
        SituacaoFechamentoSolicitacao situacao;
        if (status == StatusSolicitacao.CANCELADO) {
            situacao = SituacaoFechamentoSolicitacao.CANCELADA;
        } else if (reserva == null) {
            situacao = SituacaoFechamentoSolicitacao.AGUARDANDO_RESERVA;
        } else if (!itens.isEmpty() && itens.stream().allMatch(ItemSolicitacao::isTotalmenteEntregue)) {
            situacao = SituacaoFechamentoSolicitacao.MOVIMENTADA;
        } else if (possuiQuantidadeMovimentadaFechamento()) {
            situacao = SituacaoFechamentoSolicitacao.MOVIMENTADA_PARCIALMENTE;
        } else {
            situacao = SituacaoFechamentoSolicitacao.AGUARDANDO_MOVIMENTACAO;
        }
        this.situacaoFechamento = situacao;
        this.prazoVigenteAte = switch (situacao) {
            case AGUARDANDO_RESERVA -> prazoReservaAte;
            case AGUARDANDO_MOVIMENTACAO, MOVIMENTADA_PARCIALMENTE -> prazoMovimentacaoAte;
            case MOVIMENTADA, CANCELADA -> null;
        };
        if (status != StatusSolicitacao.CANCELADO) {
            this.status = situacao == SituacaoFechamentoSolicitacao.MOVIMENTADA
                    ? StatusSolicitacao.ENTREGUE : StatusSolicitacao.APROVADO;
        }
    }

    private ItemSolicitacao itemFechamento(UUID idItem) {
        return itens.stream()
                .filter(item -> Objects.equals(item.getId(), idItem))
                .findFirst()
                .orElseThrow(() -> new InvarianteVioladaException("Material não encontrado nesta solicitação."));
    }

    private void exigirFechamento() {
        if (!isFechamento()) {
            throw new InvarianteVioladaException("O comando exige uma solicitação de encerramento.");
        }
    }

    private void exigirFechamentoAberto() {
        exigirFechamento();
        if (status == StatusSolicitacao.CANCELADO) {
            throw new InvarianteVioladaException("A solicitação está cancelada.");
        }
    }

    private void exigirFechamentoEditavel() {
        exigirFechamentoAberto();
        if (situacaoFechamento == SituacaoFechamentoSolicitacao.MOVIMENTADA) {
            throw new InvarianteVioladaException(
                    "A solicitação já foi toda movimentada. Para alterar, estorne a movimentação antes.");
        }
    }

    private static String limparObservacao(String valor) {
        if (valor != null && valor.trim().length() > 1000) {
            throw new InvarianteVioladaException("A observação deve ter até 1000 caracteres.");
        }
        return valor == null || valor.isBlank() ? null : valor.trim();
    }

    public void adicionarItem(Material material, java.math.BigDecimal quantidade) {
        if (this.status != StatusSolicitacao.PENDENTE && this.status != StatusSolicitacao.APROVADO && this.status != StatusSolicitacao.ENTREGUE_PARCIAL) {
            throw new InvarianteVioladaException("Não é possível adicionar itens com status: " + this.status);
        }
        if (material == null) throw new IllegalArgumentException("Material é obrigatório");
        if (quantidade == null || quantidade.compareTo(java.math.BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Quantidade deve ser positiva");
        }
        this.itens.add(new ItemSolicitacao(this, material, quantidade));
    }

    public ItemSolicitacao adicionarItemTecnico(Material material, BigDecimal quantidade) {
        if (contexto != ContextoSolicitacaoMaterial.TECNICO) {
            throw new InvarianteVioladaException("Itens tecnicos exigem uma solicitacao tecnica.");
        }
        if (quantidade == null || quantidade.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Quantidade deve ser positiva");
        }
        ItemSolicitacao item = new ItemSolicitacao(this, material, quantidade);
        this.itens.add(item);
        return item;
    }

    public void substituirPlanejamentoTecnico(
            ObraPublica obra,
            OcorrenciaPublica ocorrencia,
            Estoque estoqueObra,
            Estoque almoxarifadoAtendimento,
            UUID idEquipeSaque,
            UUID idColaboradorSaque,
            boolean saqueForaEquipe,
            LocalDate dataPrevistaRetirada,
            String observacao
    ) {
        if (contexto != ContextoSolicitacaoMaterial.TECNICO) {
            throw new InvarianteVioladaException("O replanejamento exige uma solicitacao tecnica.");
        }
        this.idObra = Objects.requireNonNull(
                Objects.requireNonNull(obra, "A obra e obrigatoria").id(), "O ID da obra e obrigatorio");
        this.tipoObraSnapshot = TipoObraSnapshot.valueOf(obra.tipoObra().name());
        this.idOcorrencia = ocorrencia == null ? null : ocorrencia.id();
        this.ocorrencia = ocorrencia == null ? null : ocorrencia.codigo();
        this.almoxarifadoAtendimento = Objects.requireNonNull(
                almoxarifadoAtendimento, "O almoxarifado de atendimento e obrigatorio");
        this.idEquipeSaque = idEquipeSaque;
        this.idColaboradorSaque = idColaboradorSaque;
        this.saqueForaEquipe = saqueForaEquipe;
        this.dataPrevistaRetirada = dataPrevistaRetirada;
        this.observacao = observacao == null || observacao.isBlank() ? null : observacao.trim();
        if (tipoTecnico.isAdicao()) {
            this.estoqueOrigem = null;
            this.estoqueDestino = Objects.requireNonNull(estoqueObra, "O estoque da obra e obrigatorio");
            atualizarProntidaoPorData();
        } else {
            this.estoqueOrigem = Objects.requireNonNull(estoqueObra, "O estoque da obra e obrigatorio");
            this.estoqueDestino = null;
            this.statusSeparacao = null;
        }
    }

    public void substituirPlanejamentoTecnico(
            ObraPublica obra,
            OcorrenciaPublica ocorrencia,
            Estoque estoqueObra,
            Estoque almoxarifadoAtendimento,
            UUID idEquipeSaque,
            LocalDate dataPrevistaRetirada,
            String observacao
    ) {
        substituirPlanejamentoTecnico(
                obra, ocorrencia, estoqueObra, almoxarifadoAtendimento,
                idEquipeSaque, null, false, dataPrevistaRetirada, observacao);
    }

    /**
     * Troca a OS/OC da solicitação técnica, inclusive depois da entrega: a equipe às vezes recebe
     * o material para uma ocorrência e, a caminho, ela muda. Saldo e operações não mudam.
     */
    public void trocarOcorrencia(OcorrenciaPublica nova) {
        if (contexto != ContextoSolicitacaoMaterial.TECNICO) {
            throw new InvarianteVioladaException("A troca da OS/OC se aplica somente a solicitacao tecnica.");
        }
        if (status == StatusSolicitacao.CANCELADO) {
            throw new InvarianteVioladaException("A solicitacao foi cancelada; a OS/OC nao pode mais mudar.");
        }
        Objects.requireNonNull(nova, "A nova OS/OC e obrigatoria");
        if (!Objects.equals(nova.idObra(), idObra)) {
            throw new InvarianteVioladaException("A nova OS/OC precisa ser da mesma obra.");
        }
        if (Objects.equals(nova.id(), idOcorrencia)) {
            throw new InvarianteVioladaException("A solicitacao ja esta com essa OS/OC.");
        }
        this.idOcorrencia = nova.id();
        this.ocorrencia = nova.codigo();
    }

    /** Marca a solicitação técnica como gerada pela programação da obra. */
    public void vincularProgramacao(UUID idProgramacao, Long numeroProgramacao) {
        if (contexto != ContextoSolicitacaoMaterial.TECNICO) {
            throw new InvarianteVioladaException("Somente a solicitacao tecnica pode vir de uma programacao.");
        }
        this.idProgramacao = Objects.requireNonNull(idProgramacao, "A programacao e obrigatoria");
        this.numeroProgramacao = numeroProgramacao;
    }

    public boolean geradaPorProgramacao() {
        return idProgramacao != null;
    }

    /**
     * A programação ainda manda na solicitação enquanto nada aconteceu com o material: aprovada, sem
     * operação, sem reserva e sem separação iniciada. Depois disso, mudanças passam pelo almoxarifado.
     */
    public boolean acompanhaProgramacao() {
        return geradaPorProgramacao()
                && isAtivo()
                && status == StatusSolicitacao.APROVADO
                && !estaEncerrada()
                && !possuiFatoOperacional()
                && reserva == null
                && statusSeparacao != StatusSeparacao.EM_SEPARACAO
                && statusSeparacao != StatusSeparacao.SEPARADO;
    }

    /** Reprogramação: a data prevista de saque e a equipe seguem a programação. */
    public void acompanharReprogramacao(LocalDate novaData, UUID novaEquipe) {
        if (!acompanhaProgramacao()) {
            throw new InvarianteVioladaException("A solicitacao ja esta em atendimento e nao segue mais a programacao.");
        }
        this.dataPrevistaRetirada = Objects.requireNonNull(novaData, "A data prevista de saque e obrigatoria");
        if (novaEquipe != null && !novaEquipe.equals(idEquipeSaque)) {
            this.idEquipeSaque = novaEquipe;
            this.idColaboradorSaque = null;
            this.saqueForaEquipe = false;
        }
        atualizarProntidaoPorData();
    }

    /** Programação cancelada ou excluída antes de o material andar: a solicitação deixa de valer. */
    public void cancelarPorProgramacao(UUID idUsuario, String motivo) {
        if (!acompanhaProgramacao()) {
            throw new InvarianteVioladaException("A solicitacao ja esta em atendimento e nao pode ser cancelada pela programacao.");
        }
        this.status = StatusSolicitacao.CANCELADO;
        this.statusSeparacao = null;
        this.canceladaEm = OffsetDateTime.now();
        this.idUsuarioCancelamento = Objects.requireNonNull(idUsuario, "O usuario e obrigatorio");
        String texto = motivo == null || motivo.isBlank() ? "Programacao cancelada." : motivo.trim();
        this.motivoCancelamento = texto.length() > 500 ? texto.substring(0, 500) : texto;
    }

    public void invalidarSeparacao() {
        if (tipoTecnico != null && tipoTecnico.isAdicao()) {
            this.statusSeparacao = dataPrevistaRetirada == null
                    ? StatusSeparacao.AGUARDANDO_AGENDAMENTO
                    : StatusSeparacao.PRONTO_PARA_SEPARACAO;
        }
    }

    public void iniciarSeparacao(UUID idUsuario) {
        exigirSeparacaoAplicavel();
        if (statusSeparacao != StatusSeparacao.PRONTO_PARA_SEPARACAO) {
            throw new InvarianteVioladaException("A solicitacao nao esta pronta para separacao.");
        }
        this.statusSeparacao = StatusSeparacao.EM_SEPARACAO;
        this.idUsuarioInicioSeparacao = Objects.requireNonNull(idUsuario, "O usuario e obrigatorio");
        this.separacaoIniciadaEm = OffsetDateTime.now();
    }

    public void concluirSeparacao(UUID idUsuario) {
        exigirSeparacaoAplicavel();
        if (statusSeparacao != StatusSeparacao.EM_SEPARACAO) {
            throw new InvarianteVioladaException("A solicitacao nao possui separacao em andamento.");
        }
        this.statusSeparacao = StatusSeparacao.SEPARADO;
        this.idUsuarioConclusaoSeparacao = Objects.requireNonNull(idUsuario, "O usuario e obrigatorio");
        this.separacaoConcluidaEm = OffsetDateTime.now();
    }

    public void pularSeparacao(UUID idUsuario) {
        exigirSeparacaoAplicavel();
        if (statusSeparacao != StatusSeparacao.PRONTO_PARA_SEPARACAO && statusSeparacao != StatusSeparacao.EM_SEPARACAO) {
            throw new InvarianteVioladaException("A solicitacao nao esta pronta para separacao.");
        }
        if (this.idUsuarioInicioSeparacao == null) {
            this.idUsuarioInicioSeparacao = Objects.requireNonNull(idUsuario, "O usuario e obrigatorio");
            this.separacaoIniciadaEm = OffsetDateTime.now();
        }
        this.statusSeparacao = StatusSeparacao.SEPARADO;
        this.idUsuarioConclusaoSeparacao = Objects.requireNonNull(idUsuario, "O usuario e obrigatorio");
        this.separacaoConcluidaEm = OffsetDateTime.now();
    }

    public void registrarEquipeEfetivaSeAusente(UUID idEquipe, UUID idColaboradorSaque, boolean saqueForaEquipe) {
        if (this.idEquipeSaque == null) {
            this.idEquipeSaque = idEquipe;
        }
        if (this.idColaboradorSaque == null) {
            this.idColaboradorSaque = idColaboradorSaque;
            this.saqueForaEquipe = saqueForaEquipe;
        }
    }

    public void encerrarSaldoPendente(UUID idUsuario, String motivo) {
        if (contexto != ContextoSolicitacaoMaterial.TECNICO) {
            throw new InvarianteVioladaException("O encerramento de saldo se aplica somente a solicitacao tecnica.");
        }
        if (encerradaEm != null) {
            throw new InvarianteVioladaException("O saldo pendente ja foi encerrado.");
        }
        if (!possuiFatoOperacional() || itens.stream().noneMatch(item -> item.getQuantidadePendente().signum() > 0)) {
            throw new InvarianteVioladaException("O encerramento exige saldo pendente apos uma operacao parcial.");
        }
        if (motivo == null || motivo.isBlank()) {
            throw new InvarianteVioladaException("Informe o motivo do encerramento do saldo pendente.");
        }
        this.idUsuarioEncerramento = Objects.requireNonNull(idUsuario, "O usuario e obrigatorio");
        this.motivoEncerramento = motivo.trim();
        this.encerradaEm = OffsetDateTime.now();
    }

    /** Séries só ficam reservadas enquanto a solicitação comercial ainda pode ser entregue. */
    public boolean aceitaReservaDeSerie() {
        return isAtivo()
                && contexto == ContextoSolicitacaoMaterial.COMERCIAL
                && !estaEncerrada()
                && (status == StatusSolicitacao.APROVADO || status == StatusSolicitacao.ENTREGUE_PARCIAL
                        || status == StatusSolicitacao.ESTORNADO);
    }

    /** Saldo encerrado (ex.: parcial expirada em 72h) não aceita nova entrega. */
    public void exigirSaldoAberto() {
        if (estaEncerrada()) {
            throw new InvarianteVioladaException(
                    "O saldo pendente desta solicitação foi encerrado; ela não aceita novas entregas.");
        }
    }

    public boolean estaEncerrada() {
        return encerradaEm != null;
    }

    public boolean isEncerrada() {
        return estaEncerrada();
    }

    public boolean isForaPrazoSaque() {
        return dataPrevistaRetirada != null
                && dataSolicitacao != null
                && dataPrevistaRetirada.isBefore(dataSolicitacao.toLocalDate().plusDays(2));
    }

    private void exigirSeparacaoAplicavel() {
        if (contexto != ContextoSolicitacaoMaterial.TECNICO) {
            throw new InvarianteVioladaException("Separacao se aplica somente a solicitacoes tecnicas.");
        }
        if (tipoTecnico == null || !tipoTecnico.isAdicao()) {
            throw new InvarianteVioladaException("Separacao se aplica somente a adicoes tecnicas.");
        }
        if (status != StatusSolicitacao.APROVADO && status != StatusSolicitacao.ENTREGUE_PARCIAL) {
            throw new InvarianteVioladaException("O status atual nao permite separacao.");
        }
        if (estaEncerrada()) {
            throw new InvarianteVioladaException("A solicitacao possui saldo pendente encerrado.");
        }
        if (dataPrevistaRetirada == null) {
            throw new InvarianteVioladaException("Defina a data prevista antes de iniciar a separacao.");
        }
    }

    /** Atualiza somente a fila ainda não iniciada; etapas físicas já registradas são fatos. */
    private void atualizarProntidaoPorData() {
        if (statusSeparacao == StatusSeparacao.EM_SEPARACAO || statusSeparacao == StatusSeparacao.SEPARADO) {
            return;
        }
        this.statusSeparacao = dataPrevistaRetirada == null
                ? StatusSeparacao.AGUARDANDO_AGENDAMENTO
                : StatusSeparacao.PRONTO_PARA_SEPARACAO;
    }

    public boolean possuiFatoOperacional() {
        return itens.stream().anyMatch(ItemSolicitacao::possuiFatoOperacional);
    }

    public ItemSolicitacao removerItemTecnico(UUID idItem) {
        ItemSolicitacao item = itens.stream()
                .filter(existente -> Objects.equals(existente.getId(), idItem))
                .findFirst()
                .orElseThrow(() -> new InvarianteVioladaException("Item tecnico nao encontrado: " + idItem));
        if (item.possuiFatoOperacional()) {
            throw new InvarianteVioladaException("Item com fato operacional nao pode ser removido.");
        }
        itens.remove(item);
        if (!possuiPendencia()) {
            removerPendencia();
        }
        return item;
    }

    public void associarReserva(ReservaSolicitacaoTecnica novaReserva) {
        Objects.requireNonNull(novaReserva, "Reserva e obrigatoria");
        if (this.reserva != null && this.reserva != novaReserva) {
            throw new InvarianteVioladaException("A solicitacao tecnica ja possui uma reserva associada.");
        }
        this.reserva = novaReserva;
        recalcularFechamento();
    }

    public boolean isExcecaoReserva() {
        return (tipoObraSnapshot != null && (tipoObraSnapshot == TipoObraSnapshot.CORRETIVA || tipoObraSnapshot == TipoObraSnapshot.PREVENTIVA))
                || (ocorrencia != null && !ocorrencia.isBlank())
                || idOcorrencia != null;
    }

    /** A reserva externa é requisito de confirmação, não de separação ou saldo. */
    public ReservaSolicitacaoTecnica exigirReservaParaMovimentacaoTecnica() {
        if (contexto != ContextoSolicitacaoMaterial.TECNICO && contexto != ContextoSolicitacaoMaterial.FECHAMENTO) {
            throw new InvarianteVioladaException("Reserva externa se aplica somente a movimentacao tecnica.");
        }
        if (reserva == null) {
            if (contexto == ContextoSolicitacaoMaterial.TECNICO && isExcecaoReserva()) {
                return null;
            }
            throw new InvarianteVioladaException(
                    "Registre uma reserva valida antes de confirmar a movimentacao tecnica.");
        }
        return reserva;
    }

    public void confirmarEntregaTecnica() {
        exigirOperacaoTecnica(TipoSolicitacaoTecnica::isAdicao, "Entrega se aplica somente a adicoes tecnicas.");
        this.status = itens.stream().allMatch(ItemSolicitacao::isTotalmenteEntregue)
                ? StatusSolicitacao.ENTREGUE
                : StatusSolicitacao.ENTREGUE_PARCIAL;
        this.dataEntrega = OffsetDateTime.now();
    }

    public void confirmarDevolucaoTecnica() {
        exigirOperacaoTecnica(TipoSolicitacaoTecnica::isDevolucao, "Devolucao se aplica somente a devolucoes tecnicas.");
        this.status = itens.stream().allMatch(ItemSolicitacao::isTotalmenteEntregue)
                ? StatusSolicitacao.DEVOLVIDO
                : StatusSolicitacao.DEVOLVIDO_PARCIAL;
    }

    /** Atualiza a projeção de status sem apagar a operação original ou seu estorno. */
    public void confirmarEstornoTecnico() {
        if (contexto != ContextoSolicitacaoMaterial.TECNICO || tipoTecnico == null) {
            throw new InvarianteVioladaException("O estorno exige solicitacao tecnica.");
        }
        boolean semQuantidadeLiquida = itens.stream()
                .allMatch(item -> item.getQuantidadeOperadaLiquida().signum() == 0);
        if (semQuantidadeLiquida) {
            this.status = StatusSolicitacao.ESTORNADO;
            return;
        }
        boolean concluida = itens.stream().allMatch(ItemSolicitacao::isTotalmenteEntregue);
        this.status = tipoTecnico.isAdicao()
                ? concluida ? StatusSolicitacao.ENTREGUE : StatusSolicitacao.ENTREGUE_PARCIAL
                : concluida ? StatusSolicitacao.DEVOLVIDO : StatusSolicitacao.DEVOLVIDO_PARCIAL;
    }

    private void exigirOperacaoTecnica(
            java.util.function.Predicate<TipoSolicitacaoTecnica> tipoPermitido,
            String mensagemTipo
    ) {
        if (contexto != ContextoSolicitacaoMaterial.TECNICO || tipoTecnico == null || !tipoPermitido.test(tipoTecnico)) {
            throw new InvarianteVioladaException(mensagemTipo);
        }
        if (estaEncerrada()) {
            throw new InvarianteVioladaException("A solicitacao possui saldo pendente encerrado.");
        }
        if (status != StatusSolicitacao.APROVADO && status != StatusSolicitacao.ENTREGUE_PARCIAL
                && status != StatusSolicitacao.DEVOLVIDO_PARCIAL
                && status != StatusSolicitacao.ESTORNADO) {
            throw new InvarianteVioladaException("O status atual nao permite confirmar a movimentacao tecnica.");
        }
    }

    public void removerItem(UUID itemId) {
        if (this.status != StatusSolicitacao.PENDENTE && this.status != StatusSolicitacao.APROVADO && this.status != StatusSolicitacao.ENTREGUE_PARCIAL) {
            throw new InvarianteVioladaException("A remoção de itens só é permitida antes do encerramento da solicitação.");
        }
        
        ItemSolicitacao item = this.itens.stream()
            .filter(i -> i.getId().equals(itemId))
            .findFirst()
            .orElseThrow(() -> new InvarianteVioladaException("Item não encontrado para remoção: " + itemId));

        if (item.possuiFatoOperacional()) {
            throw new InvarianteVioladaException("Não é possível remover um item que já possui operações registradas: " + item.getMaterial().getCodigo());
        }
        
        this.itens.remove(item);
        if (!possuiPendencia()) {
            removerPendencia();
        }
    }

    public void aprovar(UUID idAprovador) {
        if (this.status != StatusSolicitacao.PENDENTE && this.status != StatusSolicitacao.APROVADO) {
            throw new InvarianteVioladaException("Status inválido para aprovação: " + this.status);
        }
        if (this.itens.isEmpty()) {
            throw new InvarianteVioladaException("Não é possível aprovar uma solicitação sem itens.");
        }
        this.idAprovador = Objects.requireNonNull(idAprovador, "ID do aprovador é obrigatório");
        this.dataVerificacao = OffsetDateTime.now();
        this.status = StatusSolicitacao.APROVADO;
    }

    public void rejeitar(MotivoRejeicao motivo, String justificativa) {
        if (this.contexto == ContextoSolicitacaoMaterial.TECNICO) {
            if (this.status != StatusSolicitacao.APROVADO) {
                throw new InvarianteVioladaException("Apenas solicitações técnicas aprovadas podem ser rejeitadas.");
            }
            if (estaEncerrada()) {
                throw new InvarianteVioladaException("A solicitação técnica já está encerrada.");
            }
            if (possuiFatoOperacional()) {
                throw new InvarianteVioladaException("Não é possível rejeitar solicitação com entrega confirmada.");
            }
            if (this.statusSeparacao == null
                    || this.statusSeparacao == StatusSeparacao.AGUARDANDO_AGENDAMENTO) {
                throw new InvarianteVioladaException("Apenas solicitações técnicas já planejadas podem ser rejeitadas.");
            }
        } else {
            if (this.status != StatusSolicitacao.PENDENTE && this.status != StatusSolicitacao.APROVADO) {
                throw new InvarianteVioladaException("Apenas solicitações PENDENTES ou APROVADAS podem ser rejeitadas.");
            }
        }
        if (motivo == null) {
            throw new IllegalArgumentException("O motivo da rejeição é obrigatório.");
        }
        if (justificativa == null || justificativa.isBlank()) {
            throw new IllegalArgumentException("A justificativa da rejeição é obrigatória.");
        }
        if (!motivo.isAtivo()) {
            throw new InvarianteVioladaException("O motivo de rejeição informado está desativado.");
        }
        this.motivoRejeicao = motivo;
        this.justificativaRejeicao = justificativa.trim();
        this.dataVerificacao = OffsetDateTime.now();
        this.status = StatusSolicitacao.REJEITADO;
        this.statusSeparacao = null;
    }

    public void registrarEntrega(UUID idEntregador, String assinaturaAlmox, String assinaturaEquipe, 
                                 java.util.Map<UUID, ItemEntregaInfo> entregas,
                                 java.util.List<NovoItemEntregaInfo> novosItens) {
        if (this.status != StatusSolicitacao.APROVADO && this.status != StatusSolicitacao.ENTREGUE_PARCIAL
                && this.status != StatusSolicitacao.ESTORNADO) {
            throw new InvarianteVioladaException("Apenas solicitações aprovadas, parcialmente entregues ou estornadas podem ser entregues.");
        }
        exigirSaldoAberto();
        this.idEntregadorAlmox = Objects.requireNonNull(idEntregador, "ID do entregador é obrigatório");
        this.assinaturaAlmox = Objects.requireNonNull(assinaturaAlmox, "Assinatura do almoxarifado é obrigatória");
        this.assinaturaEquipe = Objects.requireNonNull(assinaturaEquipe, "Assinatura da equipe é obrigatória");
        
        // Processa itens novos (adicionados no balcão)
        if (novosItens != null) {
            for (NovoItemEntregaInfo novo : novosItens) {
                ItemSolicitacao novoItem = new ItemSolicitacao(this, novo.material(), novo.quantidadeSolicitada());
                this.itens.add(novoItem);
                if (novo.quantidadeEntregue() != null && novo.quantidadeEntregue().compareTo(BigDecimal.ZERO) > 0) {
                    novoItem.registrarEntrega(novo.quantidadeEntregue(), novo.numSerie());
                }
            }
        }

        // Processa itens existentes
        if (entregas != null) {
            entregas.forEach((idItem, info) -> {
                ItemSolicitacao item = this.itens.stream()
                    .filter(i -> i.getId().equals(idItem))
                    .findFirst()
                    .orElseThrow(() -> new InvarianteVioladaException("Item não encontrado nesta solicitação: " + idItem));
                
                if (info.novaQuantidadeSolicitada() != null) {
                    item.atualizarQuantidade(info.novaQuantidadeSolicitada());
                }

                if (info.quantidade() != null && info.quantidade().compareTo(BigDecimal.ZERO) > 0) {
                    item.registrarEntrega(info.quantidade(), info.numSerie());
                }
            });
        }

        if (this.itens.isEmpty()) {
            throw new InvarianteVioladaException("Não é possível registrar entrega sem itens.");
        }

        atualizarStatusEntrega();
        this.dataEntrega = OffsetDateTime.now();
    }

    public void registrarResponsavelSaqueComercial(UUID idColaboradorSaque, boolean saqueForaEquipe) {
        if (contexto != ContextoSolicitacaoMaterial.COMERCIAL) {
            throw new InvarianteVioladaException("O responsavel comercial pelo saque exige uma solicitacao comercial.");
        }
        this.idColaboradorSaque = Objects.requireNonNull(
                idColaboradorSaque, "O colaborador responsavel pelo saque e obrigatorio");
        this.saqueForaEquipe = saqueForaEquipe;
    }

    /**
     * Informação para novos itens adicionados durante a entrega física.
     */
    public record NovoItemEntregaInfo(
        Material material,
        BigDecimal quantidadeSolicitada,
        BigDecimal quantidadeEntregue,
        String numSerie
    ) {
        public NovoItemEntregaInfo {
            Objects.requireNonNull(material, "O material é obrigatório");
            if (quantidadeSolicitada == null || quantidadeSolicitada.signum() <= 0) {
                throw new IllegalArgumentException("A quantidade solicitada deve ser positiva");
            }
            if (quantidadeEntregue == null || quantidadeEntregue.signum() <= 0) {
                throw new IllegalArgumentException("A quantidade entregue deve ser positiva");
            }
            if (quantidadeEntregue.compareTo(quantidadeSolicitada) > 0) {
                throw new InvarianteVioladaException(
                        "A quantidade entregue não pode ultrapassar a quantidade solicitada do novo material.");
            }
        }
    }

    /**
     * Objeto de transferência interno para o domínio processar a entrega.
     */
    public record ItemEntregaInfo(
        java.math.BigDecimal quantidade,
        java.math.BigDecimal novaQuantidadeSolicitada,
        String numSerie
    ) {}

    private void atualizarStatusEntrega() {
        boolean todosEntregues = this.itens.stream().allMatch(ItemSolicitacao::isTotalmenteEntregue);
        this.status = todosEntregues ? StatusSolicitacao.ENTREGUE : StatusSolicitacao.ENTREGUE_PARCIAL;
    }

    public void encerrarEntregaParcialExpirada() {
        if (this.status != StatusSolicitacao.ENTREGUE_PARCIAL) {
            throw new InvarianteVioladaException("Apenas solicitações com entrega parcial podem ser encerradas por expiração.");
        }
        if (this.encerradaEm == null) {
            this.encerradaEm = OffsetDateTime.now();
            this.motivoEncerramento = "Entrega parcial encerrada automaticamente apos 72 horas.";
        }
    }

    public void estornar() {
        if (this.status != StatusSolicitacao.ENTREGUE && this.status != StatusSolicitacao.ENTREGUE_PARCIAL) {
            throw new InvarianteVioladaException("O estorno só é permitido para solicitações que já foram entregues.");
        }
        this.itens.forEach(item -> {
            BigDecimal quantidadeLiquida = item.getQuantidadeEntregaLiquida();
            if (quantidadeLiquida.signum() > 0) {
                item.registrarEstorno(quantidadeLiquida);
            }
        });
        this.status = StatusSolicitacao.ESTORNADO;
    }

    public void registrarEstornoParcial(java.util.Map<UUID, java.math.BigDecimal> estornos) {
        if (this.status != StatusSolicitacao.ENTREGUE && this.status != StatusSolicitacao.ENTREGUE_PARCIAL) {
            throw new InvarianteVioladaException("O estorno parcial só é permitido para solicitações com entregas registradas.");
        }
        if (estornos == null || estornos.isEmpty()) {
            throw new IllegalArgumentException("É necessário informar ao menos um item para estorno.");
        }

        estornos.forEach((idItem, qtd) -> {
            ItemSolicitacao item = this.itens.stream()
                .filter(i -> i.getId().equals(idItem))
                .findFirst()
                .orElseThrow(() -> new InvarianteVioladaException("Item não encontrado nesta solicitação para estorno: " + idItem));
            
            item.registrarEstorno(qtd);
        });

        atualizarStatusAposEstorno();
    }

    private void atualizarStatusAposEstorno() {
        BigDecimal totalEntregue = this.itens.stream()
            .map(ItemSolicitacao::getQuantidadeEntregaLiquida)
            .reduce(BigDecimal.ZERO, BigDecimal::add);

        if (totalEntregue.compareTo(BigDecimal.ZERO) == 0) {
            this.status = StatusSolicitacao.ESTORNADO;
        } else {
            boolean todosEntregues = this.itens.stream().allMatch(ItemSolicitacao::isTotalmenteEntregue);
            this.status = todosEntregues ? StatusSolicitacao.ENTREGUE : StatusSolicitacao.ENTREGUE_PARCIAL;
        }
    }

    private void validarEstoque(Estoque estoque) {
        if (estoque == null) throw new IllegalArgumentException("Estoque de destino é obrigatório");
        if (!estoque.isAtivo()) throw new InvarianteVioladaException("Estoque de destino está desativado.");
    }

    private void validarStatusParaAlteracao() {
        if (this.status != StatusSolicitacao.PENDENTE) {
            throw new InvarianteVioladaException("A solicitação não pode mais ser alterada (Status: " + this.status + ")");
        }
    }
}
