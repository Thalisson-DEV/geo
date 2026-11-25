package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Embedded;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.Generated;
import org.hibernate.generator.EventType;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Ordem de serviço de manutenção de um veículo.
 *
 * <p>Ciclo {@code PENDENTE → AGENDADA → EM_ANDAMENTO → CONCLUIDA}, com {@code CANCELADA}
 * a partir de qualquer situação aberta. Concluir direto de pendente ou agendada cobre o
 * lançamento de um serviço que já aconteceu. As datas reais e o período de veículo
 * parado são o que a Fase 6 usa para MTBF, MTTR e disponibilidade.</p>
 *
 * <p>Placa e base são as do veículo na abertura: a OS pertence ao local onde foi
 * tratada, mesmo que o veículo mude de base depois.</p>
 */
@Entity
@Table(name = "frota_ordens_servico")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OrdemServico extends BaseEntity {

    /** Folga para relógios de aparelhos diferentes ao comparar com "agora". */
    private static final Duration TOLERANCIA_FUTURO = Duration.ofMinutes(10);

    @Generated(event = EventType.INSERT)
    @Column(name = "numero", nullable = false, insertable = false, updatable = false)
    private Long numero;

    /** Nulo na OS não veicular (ferramental, oficina, equipamento sem placa). */
    @Column(name = "id_veiculo", updatable = false)
    private UUID idVeiculo;

    @Column(name = "placa", length = 10, updatable = false)
    private String placa;

    @Column(name = "veicular", nullable = false, updatable = false)
    private boolean veicular = true;

    /** O que está em manutenção quando a OS não é de veículo. */
    @Column(name = "descricao_equipamento", length = 150)
    private String descricaoEquipamento;

    @Column(name = "id_base_operacional", updatable = false)
    private UUID idBaseOperacional;

    @Enumerated(EnumType.STRING)
    @Column(name = "tipo_manutencao", nullable = false, length = 20)
    private TipoManutencao tipoManutencao;

    @Enumerated(EnumType.STRING)
    @Column(name = "origem", nullable = false, length = 20)
    private OrigemOrdemServico origem;

    @Enumerated(EnumType.STRING)
    @Column(name = "criticidade", nullable = false, length = 20)
    private Criticidade criticidade;

    @Enumerated(EnumType.STRING)
    @Column(name = "motivo", length = 30)
    private MotivoServico motivo;

    @Column(name = "descricao", nullable = false, length = 2000)
    private String descricao;

    /** Colaborador que dirigia o veículo na abertura. */
    @Column(name = "id_condutor")
    private UUID idCondutor;

    @Column(name = "aberta_em", nullable = false, updatable = false)
    private OffsetDateTime abertaEm;

    @Column(name = "id_usuario_abertura", updatable = false)
    private UUID idUsuarioAbertura;

    @Column(name = "km_abertura", updatable = false)
    private Long kmAbertura;

    /** Unidade de {@code kmAbertura} e {@code kmEncerramento}: a do veículo na abertura. */
    @Enumerated(EnumType.STRING)
    @Column(name = "unidade_medicao", nullable = false, length = 10, updatable = false)
    private UnidadeMedicao unidadeMedicao = UnidadeMedicao.KM;

    @Enumerated(EnumType.STRING)
    @Column(name = "situacao", nullable = false, length = 20)
    private SituacaoOrdemServico situacao;

    // ── Oficina ────────────────────────────────────────────────────────────────────
    @Enumerated(EnumType.STRING)
    @Column(name = "tipo_oficina", nullable = false, length = 20)
    private TipoOficina tipoOficina;

    /** Fornecedor do financeiro, quando a oficina externa está cadastrada. */
    @Column(name = "id_fornecedor")
    private UUID idFornecedor;

    /** Nome livre da oficina: interna (ex.: "Oficina da base") ou externa não cadastrada. */
    @Column(name = "oficina_nome", length = 150)
    private String oficinaNome;

    // ── Agenda e execução ──────────────────────────────────────────────────────────
    @Column(name = "agendada_para")
    private OffsetDateTime agendadaPara;

    @Column(name = "local_agendamento", length = 200)
    private String localAgendamento;

    @Column(name = "inicio_real")
    private OffsetDateTime inicioReal;

    @Column(name = "previsao_termino")
    private OffsetDateTime previsaoTermino;

    @Column(name = "fim_real")
    private OffsetDateTime fimReal;

    /** Previsão de término que já gerou aviso de prazo estourado. */
    @Column(name = "prazo_avisado_para")
    private OffsetDateTime prazoAvisadoPara;

    // ── Veículo parado ─────────────────────────────────────────────────────────────
    @Column(name = "veiculo_parado", nullable = false)
    private boolean veiculoParado;

    @Column(name = "parado_desde")
    private OffsetDateTime paradoDesde;

    @Column(name = "liberado_em")
    private OffsetDateTime liberadoEm;

    // ── Encerramento ───────────────────────────────────────────────────────────────
    @Column(name = "descricao_servico", length = 4000)
    private String descricaoServico;

    @Column(name = "itens_substituidos", length = 4000)
    private String itensSubstituidos;

    @Column(name = "valor_total", precision = 14, scale = 2)
    private BigDecimal valorTotal;

    /** Obrigatória para concluir (exceto OS importada). */
    @Column(name = "causa", length = 30)
    private String causa;

    @Column(name = "desconto", nullable = false, precision = 14, scale = 2)
    private BigDecimal desconto = BigDecimal.ZERO;

    @Column(name = "acrescimo", nullable = false, precision = 14, scale = 2)
    private BigDecimal acrescimo = BigDecimal.ZERO;

    @Column(name = "km_encerramento")
    private Long kmEncerramento;

    /**
     * Quando a OS concluída ficou com todos os valores lançados (e a causa e o serviço realizado).
     * Nula enquanto falta algum valor: a OS fica com "valores pendentes" e ainda aceita lançamentos
     * na execução. Ninguém "dá baixa": ela muda sozinha quando o último valor entra.
     */
    @Column(name = "finalizada_em")
    private OffsetDateTime finalizadaEm;

    @Column(name = "id_usuario_finalizacao")
    private UUID idUsuarioFinalizacao;

    /** Id de origem da leitura de odômetro do encerramento (a da abertura usa o id da OS). */
    @Column(name = "id_leitura_encerramento", nullable = false, updatable = false)
    private UUID idLeituraEncerramento;

    // ── Cancelamento ───────────────────────────────────────────────────────────────
    @Column(name = "cancelada_em")
    private OffsetDateTime canceladaEm;

    @Column(name = "motivo_cancelamento", length = 1000)
    private String motivoCancelamento;

    /** Preenchida só no que veio de importação (ex.: OS do EXP). */
    @Embedded
    private ReferenciaExterna referenciaExterna;

    @OneToMany(mappedBy = "ordem", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("dataCriacao ASC")
    private List<ItemOrdemServico> itens = new ArrayList<>();

    // ── Execução: mão de obra e peças ──────────────────────────────────────────────
    @OneToMany(mappedBy = "ordem", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("dataCriacao ASC")
    private List<ServicoOrdemServico> servicos = new ArrayList<>();

    @OneToMany(mappedBy = "ordem", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("dataCriacao ASC")
    private List<PecaOrdemServico> pecas = new ArrayList<>();

    /** Dados informados na abertura. {@code veiculoParado} nulo segue a sugestão da criticidade. */
    public record Abertura(
            TipoManutencao tipoManutencao,
            OrigemOrdemServico origem,
            Criticidade criticidade,
            MotivoServico motivo,
            String descricao,
            UUID idCondutor,
            OffsetDateTime abertaEm,
            Long kmAbertura,
            TipoOficina tipoOficina,
            UUID idFornecedor,
            String oficinaNome,
            Boolean veiculoParado
    ) {
    }

    /** Dados editáveis enquanto a OS está aberta. */
    public record Edicao(
            TipoManutencao tipoManutencao,
            OrigemOrdemServico origem,
            Criticidade criticidade,
            MotivoServico motivo,
            String descricao,
            UUID idCondutor,
            TipoOficina tipoOficina,
            UUID idFornecedor,
            String oficinaNome
    ) {
    }

    /**
     * Mão de obra. {@code idMecanico} é o colaborador (oficina interna); {@code mecanicoNome},
     * o nome livre (oficina externa). O item do catálogo é opcional.
     */
    public record DadosServico(
            String descricao,
            ItemManutencao item,
            UUID idMecanico,
            String mecanicoNome,
            BigDecimal quantidade,
            BigDecimal valorUnitario
    ) {
    }

    /** Peça ou consumível usado na OS. */
    public record DadosPeca(
            String descricao,
            String codigo,
            OrigemPeca origem,
            BigDecimal quantidade,
            String unidade,
            BigDecimal valorUnitario
    ) {
    }

    /**
     * Dados do encerramento. Início real nulo mantém o já registrado no início da execução.
     * {@code baixa} nula conclui só com as datas e a medição: a OS fica com a baixa pendente.
     */
    public record Encerramento(
            OffsetDateTime inicioReal,
            OffsetDateTime fimReal,
            Long kmEncerramento,
            Baixa baixa
    ) {
        /** Conclusão com a baixa no mesmo passo (o formato de antes da baixa pendente). */
        public Encerramento(OffsetDateTime inicioReal, OffsetDateTime fimReal, String descricaoServico,
                            String itensSubstituidos, BigDecimal valorTotal, Long kmEncerramento,
                            TipoOficina tipoOficina, UUID idFornecedor, String oficinaNome, String causa) {
            this(inicioReal, fimReal, kmEncerramento, new Baixa(descricaoServico, itensSubstituidos, valorTotal,
                    tipoOficina, idFornecedor, oficinaNome, causa));
        }
    }

    /** A baixa: por que a manutenção aconteceu, o que foi feito, onde e quanto custou. */
    public record Baixa(
            String descricaoServico,
            String itensSubstituidos,
            BigDecimal valorTotal,
            TipoOficina tipoOficina,
            UUID idFornecedor,
            String oficinaNome,
            String causa
    ) {
    }

    /** Soma da mão de obra e das peças, ajustes e total da OS. */
    /**
     * Totais da execução. {@code pecasEstoque} é a parte das peças que saiu do almoxarifado da
     * oficina: já foi comprada quando entrou no estoque, então não entra no {@code aComprar}
     * (o que a compra no financeiro ainda precisa pagar).
     */
    public record Totais(BigDecimal servicos, BigDecimal pecas, BigDecimal desconto, BigDecimal acrescimo,
                         BigDecimal total, BigDecimal pecasEstoque, BigDecimal aComprar) {
    }

    public static OrdemServico abrir(FichaVeiculo ficha, Abertura dados, List<ItemManutencao> itens, UUID idUsuario) {
        if (ficha == null || !ficha.isAtivo() || ficha.getSituacao() == SituacaoOperacional.BAIXADO) {
            throw new InvarianteVioladaException("Só é possível abrir OS para veículo ativo e não baixado.");
        }
        if (dados.abertaEm() == null) {
            throw new InvarianteVioladaException("Informe a data de abertura da OS.");
        }
        exigirNaoFuturo(dados.abertaEm(), "A data de abertura");
        if (dados.kmAbertura() != null && dados.kmAbertura() < 0) {
            throw new InvarianteVioladaException(ficha.getUnidadeMedicao().rotulo() + " não pode ser negativo.");
        }
        var os = new OrdemServico();
        os.unidadeMedicao = ficha.getUnidadeMedicao();
        os.idVeiculo = ficha.getIdVeiculo();
        os.placa = ficha.getPlaca();
        os.idBaseOperacional = ficha.getIdBaseOperacional();
        os.abertaEm = dados.abertaEm();
        os.idUsuarioAbertura = idUsuario;
        os.kmAbertura = dados.kmAbertura();
        os.situacao = SituacaoOrdemServico.PENDENTE;
        os.idLeituraEncerramento = UUID.randomUUID();
        os.preencher(new Edicao(dados.tipoManutencao(), dados.origem(), dados.criticidade(), dados.motivo(),
                dados.descricao(), dados.idCondutor(), dados.tipoOficina(), dados.idFornecedor(), dados.oficinaNome()));
        os.definirItens(itens);
        boolean parado = dados.veiculoParado() != null ? dados.veiculoParado() : os.criticidade.sugereVeiculoParado();
        if (parado) {
            os.veiculoParado = true;
            os.paradoDesde = dados.abertaEm();
        }
        return os;
    }

    /**
     * OS não veicular: ferramental, oficina ou equipamento sem placa. Fica na base informada,
     * sem medição, condutor ou veículo parado, e fora da repetição por placa.
     */
    public static OrdemServico abrirSemVeiculo(UUID idBaseOperacional, String equipamento, Abertura dados,
                                               List<ItemManutencao> itens, UUID idUsuario) {
        if (idBaseOperacional == null) {
            throw new InvarianteVioladaException("Informe a base da manutenção sem veículo.");
        }
        if (dados.abertaEm() == null) {
            throw new InvarianteVioladaException("Informe a data de abertura da OS.");
        }
        exigirNaoFuturo(dados.abertaEm(), "A data de abertura");
        if (dados.kmAbertura() != null) {
            throw new InvarianteVioladaException("Manutenção sem veículo não registra KM nem horímetro.");
        }
        if (Boolean.TRUE.equals(dados.veiculoParado())) {
            throw new InvarianteVioladaException("Manutenção sem veículo não marca veículo parado.");
        }
        var os = new OrdemServico();
        os.veicular = false;
        os.descricaoEquipamento = Textos.obrigatorio(equipamento, "nome do equipamento", 150);
        os.idBaseOperacional = idBaseOperacional;
        os.abertaEm = dados.abertaEm();
        os.idUsuarioAbertura = idUsuario;
        os.situacao = SituacaoOrdemServico.PENDENTE;
        os.idLeituraEncerramento = UUID.randomUUID();
        os.preencher(new Edicao(dados.tipoManutencao(), dados.origem(), dados.criticidade(), dados.motivo(),
                dados.descricao(), dados.idCondutor(), dados.tipoOficina(), dados.idFornecedor(), dados.oficinaNome()));
        os.definirItens(itens);
        return os;
    }

    /** Placa do veículo ou, na OS sem veículo, o equipamento: o que identifica a OS nas listas e avisos. */
    public String identificacao() {
        return veicular ? placa : descricaoEquipamento;
    }

    public void editar(Edicao dados, List<ItemManutencao> itens) {
        exigirAberta("editada");
        preencher(dados);
        definirItens(itens);
    }

    /**
     * Junta outro plano preventivo do mesmo veículo a esta OS, enquanto a oficina ainda não começou:
     * entram os itens do plano, a descrição passa a citar todos os planos e a criticidade sobe se o
     * plano novo for mais grave. Evita duas OS para a mesma ida à oficina.
     */
    public boolean aceitaOutraPreventiva() {
        return isAtivo() && tipoManutencao == TipoManutencao.PREVENTIVA
                && (situacao == SituacaoOrdemServico.PENDENTE || situacao == SituacaoOrdemServico.AGENDADA);
    }

    public void incluirPreventiva(List<ItemManutencao> novosItens, String novaDescricao, Criticidade criticidadePlano) {
        if (!aceitaOutraPreventiva()) {
            throw new InvarianteVioladaException("A OS " + (numero == null ? "" : numero + " ")
                    + "só recebe outro plano preventivo enquanto estiver pendente ou agendada.");
        }
        var todos = new java.util.ArrayList<ItemManutencao>(itens.stream().map(ItemOrdemServico::getItem).toList());
        todos.addAll(novosItens);
        definirItens(todos);
        this.descricao = Textos.obrigatorio(novaDescricao, "descrição do problema", 2000);
        if (criticidadePlano != null && criticidadePlano.compareTo(criticidade) < 0) {
            this.criticidade = criticidadePlano;
        }
    }

    public void agendar(OffsetDateTime data, String local) {
        if (situacao != SituacaoOrdemServico.PENDENTE && situacao != SituacaoOrdemServico.AGENDADA) {
            throw new InvarianteVioladaException("Só OS pendente ou agendada pode ser agendada.");
        }
        if (data == null) {
            throw new InvarianteVioladaException("Informe a data do agendamento.");
        }
        if (data.isBefore(abertaEm)) {
            throw new InvarianteVioladaException("O agendamento não pode ser anterior à abertura da OS.");
        }
        this.agendadaPara = data;
        this.localAgendamento = Textos.opcional(local, 200);
        this.situacao = SituacaoOrdemServico.AGENDADA;
    }

    public void iniciar(OffsetDateTime inicio, OffsetDateTime previsao) {
        if (situacao != SituacaoOrdemServico.PENDENTE && situacao != SituacaoOrdemServico.AGENDADA) {
            throw new InvarianteVioladaException("Só OS pendente ou agendada pode ser iniciada.");
        }
        if (inicio == null) {
            throw new InvarianteVioladaException("Informe o início real do serviço.");
        }
        exigirNaoFuturo(inicio, "O início real");
        this.inicioReal = inicio;
        definirPrevisao(previsao);
        this.situacao = SituacaoOrdemServico.EM_ANDAMENTO;
        pararPeloServico(inicio);
    }

    /**
     * OS em andamento conta o veículo como parado sem depender de alguém marcar: a parada
     * começa no início real (ou continua a que já estava aberta). Liberar à mão segue possível.
     */
    private void pararPeloServico(OffsetDateTime inicio) {
        if (!veicular || isParadaEmCurso()) return;
        if (!veiculoParado) {
            this.veiculoParado = true;
            this.paradoDesde = inicio.isBefore(abertaEm) ? abertaEm : inicio;
        }
        this.liberadoEm = null;
    }

    public void alterarPrevisao(OffsetDateTime previsao) {
        if (situacao != SituacaoOrdemServico.EM_ANDAMENTO) {
            throw new InvarianteVioladaException("Só OS em andamento tem previsão de término.");
        }
        definirPrevisao(previsao);
    }

    public void concluir(Encerramento dados) {
        exigirAberta("concluída");
        OffsetDateTime inicio = dados.inicioReal() != null ? dados.inicioReal() : this.inicioReal;
        if (inicio == null || dados.fimReal() == null) {
            throw new InvarianteVioladaException("Informe o início e o fim reais do serviço.");
        }
        if (dados.fimReal().isBefore(inicio)) {
            throw new InvarianteVioladaException("O fim real não pode ser anterior ao início real.");
        }
        exigirNaoFuturo(dados.fimReal(), "O fim real");
        if (dados.kmEncerramento() != null && dados.kmEncerramento() < 0) {
            throw new InvarianteVioladaException(unidadeMedicao.rotulo() + " não pode ser negativo.");
        }
        if (!veicular && dados.kmEncerramento() != null) {
            throw new InvarianteVioladaException("Manutenção sem veículo não registra KM nem horímetro.");
        }
        if (dados.baixa() != null) {
            validarBaixa(dados.baixa());
        }
        this.inicioReal = inicio;
        this.fimReal = dados.fimReal();
        this.kmEncerramento = dados.kmEncerramento();
        // O tempo de oficina é tempo parado: quem concluiu direto (serviço já feito) também conta.
        if (veicular && !veiculoParado) {
            this.veiculoParado = true;
            this.paradoDesde = inicio.isBefore(abertaEm) ? abertaEm : inicio;
            this.liberadoEm = dados.fimReal().isBefore(paradoDesde) ? paradoDesde : dados.fimReal();
        } else if (veiculoParado && liberadoEm == null) {
            this.liberadoEm = dados.fimReal().isBefore(paradoDesde) ? paradoDesde : dados.fimReal();
        }
        this.situacao = SituacaoOrdemServico.CONCLUIDA;
        if (dados.baixa() != null) {
            aplicarBaixa(dados.baixa());
        } else {
            this.valorTotal = temLancamentos() ? totais().total() : this.valorTotal;
        }
        // Com todos os valores já lançados, concluir é finalizar; senão, fica com valores pendentes.
        this.finalizadaEm = pendencias().isEmpty() ? OffsetDateTime.now() : null;
    }

    /** Registra quem finalizou a OS junto com a conclusão. */
    public void registrarFinalizacao(UUID idUsuario) {
        if (finalizadaEm != null) this.idUsuarioFinalizacao = idUsuario;
    }

    /**
     * Completa a conclusão de uma OS com valores pendentes: causa, serviço realizado, oficina e,
     * sem lançamentos na execução, o valor. Com tudo lançado, a OS fica finalizada (devolve verdadeiro).
     */
    public boolean completarConclusao(Baixa dados, UUID idUsuario) {
        if (!isBaixaPendente()) {
            throw new InvarianteVioladaException("Só a OS concluída com valores pendentes pode ser completada.");
        }
        if (dados == null) {
            throw new InvarianteVioladaException("Informe a causa e o serviço realizado.");
        }
        validarBaixa(dados);
        aplicarBaixa(dados);
        return finalizarSeCompleta(idUsuario);
    }

    /** Ajusta os itens quando o serviço feito foi diferente do previsto na abertura. */
    public void trocarItensNaBaixa(List<ItemManutencao> novos) {
        if (!isBaixaPendente()) {
            throw new InvarianteVioladaException("Só a OS com valores pendentes troca os itens depois de concluída.");
        }
        definirItens(novos);
    }

    /**
     * OS concluída sem pendências fica finalizada, com o usuário do último lançamento. Devolve
     * verdadeiro quando ela acabou de ser finalizada, para o histórico.
     */
    public boolean finalizarSeCompleta(UUID idUsuario) {
        if (!isBaixaPendente() || !pendencias().isEmpty()) return false;
        this.finalizadaEm = OffsetDateTime.now();
        this.idUsuarioFinalizacao = idUsuario;
        return true;
    }

    /**
     * O que falta para a OS concluída ficar finalizada: serviço ou peça com valor zero (sem a
     * marca "sem custo"), o valor da OS sem lançamentos e, nas concluídas antes desta regra, a
     * causa e o serviço realizado. Na oficina interna a mão de obra pode ficar zerada (é da casa).
     */
    public List<String> pendencias() {
        List<String> faltam = new ArrayList<>();
        if (descricaoServico == null || (causa == null && origem != OrigemOrdemServico.IMPORTACAO)) {
            faltam.add("Causa e serviço realizado");
        }
        if (!temLancamentos()) {
            if (valorTotal == null) faltam.add("Valor da OS");
            return faltam;
        }
        boolean interna = tipoOficina == TipoOficina.INTERNA;
        servicos.stream().filter(s -> s.isSemValor() && !interna)
                .forEach(s -> faltam.add("Serviço: " + s.getDescricao()));
        pecas.stream().filter(PecaOrdemServico::isSemValor)
                .forEach(p -> faltam.add("Peça: " + p.getDescricao()));
        return faltam;
    }

    /**
     * Devolve a OS concluída para em andamento (o veículo voltou com problema no teste). A
     * baixa, se houve, é desfeita para ser revista na nova conclusão, e a parada volta a contar.
     */
    public void reabrir() {
        if (situacao != SituacaoOrdemServico.CONCLUIDA) {
            throw new InvarianteVioladaException("Só a OS concluída pode voltar para em andamento.");
        }
        this.situacao = SituacaoOrdemServico.EM_ANDAMENTO;
        this.fimReal = null;
        this.finalizadaEm = null;
        this.idUsuarioFinalizacao = null;
        this.prazoAvisadoPara = null;
        if (veicular) {
            if (!veiculoParado) {
                this.veiculoParado = true;
                this.paradoDesde = OffsetDateTime.now();
            }
            this.liberadoEm = null;
        }
    }

    /** Concluída, mas ainda com valores pendentes (ver {@link #pendencias()}). */
    public boolean isBaixaPendente() {
        return situacao == SituacaoOrdemServico.CONCLUIDA && finalizadaEm == null;
    }

    private void validarBaixa(Baixa dados) {
        if (dados.valorTotal() != null && dados.valorTotal().signum() < 0) {
            throw new InvarianteVioladaException("O valor do serviço não pode ser negativo.");
        }
        if (dados.causa() == null && origem != OrigemOrdemServico.IMPORTACAO) {
            throw new InvarianteVioladaException("Informe a causa da manutenção.");
        }
        Textos.obrigatorio(dados.descricaoServico(), "descrição do serviço realizado", 4000);
        TipoOficina tipo = dados.tipoOficina() == null ? TipoOficina.EXTERNA : dados.tipoOficina();
        if (tipo == TipoOficina.EXTERNA && dados.idFornecedor() == null && Textos.opcional(dados.oficinaNome(), 150) == null) {
            throw new InvarianteVioladaException("Informe o fornecedor ou o nome da oficina externa.");
        }
        if (tipo == TipoOficina.INTERNA && servicos.stream().anyMatch(s -> !s.temMecanicoColaborador())) {
            throw new InvarianteVioladaException(
                    "Na oficina interna, todo serviço precisa de um mecânico colaborador. Revise a execução.");
        }
        if (temLancamentos() && totais().total().signum() < 0) {
            throw new InvarianteVioladaException("O desconto é maior que o valor dos serviços e das peças.");
        }
    }

    private void aplicarBaixa(Baixa dados) {
        definirOficina(dados.tipoOficina(), dados.idFornecedor(), dados.oficinaNome());
        this.descricaoServico = Textos.obrigatorio(dados.descricaoServico(), "descrição do serviço realizado", 4000);
        this.itensSubstituidos = Textos.opcional(dados.itensSubstituidos(), 4000);
        // Com lançamentos, o valor é o calculado; sem eles, vale o digitado (lançamento rápido).
        this.valorTotal = temLancamentos() ? totais().total() : dados.valorTotal();
        this.causa = dados.causa();
    }

    public void cancelar(String motivo, OffsetDateTime instante) {
        exigirAberta("cancelada");
        this.motivoCancelamento = Textos.obrigatorio(motivo, "motivo do cancelamento", 1000);
        this.canceladaEm = instante;
        if (veiculoParado && liberadoEm == null) {
            this.liberadoEm = instante.isBefore(paradoDesde) ? paradoDesde : instante;
        }
        this.situacao = SituacaoOrdemServico.CANCELADA;
    }

    /**
     * Marca o veículo como parado. Remarcar depois de uma liberação reabre o mesmo
     * período: a OS guarda um único intervalo de parada.
     */
    public void marcarVeiculoParado(OffsetDateTime instante) {
        exigirAberta("alterada");
        if (!veicular) {
            throw new InvarianteVioladaException("Manutenção sem veículo não marca veículo parado.");
        }
        if (isParadaEmCurso()) return;
        if (!veiculoParado) {
            exigirNaoFuturo(instante, "O início da parada");
            this.paradoDesde = instante.isBefore(abertaEm) ? abertaEm : instante;
        }
        this.veiculoParado = true;
        this.liberadoEm = null;
    }

    public void liberarVeiculo(OffsetDateTime instante) {
        exigirAberta("alterada");
        if (!isParadaEmCurso()) {
            throw new InvarianteVioladaException("O veículo não está parado por esta OS.");
        }
        exigirNaoFuturo(instante, "A liberação");
        if (instante.isBefore(paradoDesde)) {
            throw new InvarianteVioladaException("A liberação não pode ser anterior ao início da parada.");
        }
        this.liberadoEm = instante;
    }

    // ── Execução ───────────────────────────────────────────────────────────────────

    public ServicoOrdemServico lancarServico(DadosServico dados) {
        exigirLancavel();
        exigirMecanicoCoerente(dados.idMecanico());
        var servico = new ServicoOrdemServico(this);
        servico.preencher(dados);
        servicos.add(servico);
        return servico;
    }

    public ServicoOrdemServico alterarServico(UUID idServico, DadosServico dados) {
        exigirLancavel();
        exigirMecanicoCoerente(dados.idMecanico());
        var servico = buscarServico(idServico);
        servico.preencher(dados);
        exigirDescontoCabe(BigDecimal.ZERO);
        return servico;
    }

    public ServicoOrdemServico excluirServico(UUID idServico) {
        exigirLancavel();
        var servico = buscarServico(idServico);
        exigirDescontoCabe(servico.getSubtotal());
        servicos.remove(servico);
        return servico;
    }

    /** "Mesmo mecânico para todos": aplica o colaborador (ou o nome) a todos os serviços. */
    public void definirMecanicoParaTodos(UUID idMecanico, String mecanicoNome) {
        exigirLancavel();
        if (servicos.isEmpty()) {
            throw new InvarianteVioladaException("Lance ao menos um serviço antes de definir o mecânico.");
        }
        exigirMecanicoCoerente(idMecanico);
        if (idMecanico == null && Textos.opcional(mecanicoNome, 120) == null) {
            throw new InvarianteVioladaException("Informe o mecânico.");
        }
        servicos.forEach(s -> s.definirMecanico(idMecanico, mecanicoNome));
    }

    public PecaOrdemServico lancarPeca(DadosPeca dados) {
        exigirLancavel();
        var peca = new PecaOrdemServico(this);
        peca.preencher(dados);
        pecas.add(peca);
        return peca;
    }

    public PecaOrdemServico alterarPeca(UUID idPeca, DadosPeca dados) {
        exigirLancavel();
        var peca = buscarPeca(idPeca);
        peca.preencher(dados);
        exigirDescontoCabe(BigDecimal.ZERO);
        return peca;
    }

    /** Marca (ou desmarca) o serviço de valor zero como "sem custo" (garantia, cortesia). */
    public void definirSemCusto(ServicoOrdemServico servico, boolean semCusto) {
        exigirLancavel();
        servico.definirSemCusto(semCusto);
    }

    /** Marca (ou desmarca) a peça de valor zero como "sem custo" (garantia, cortesia). */
    public void definirSemCusto(PecaOrdemServico peca, boolean semCusto) {
        exigirLancavel();
        peca.definirSemCusto(semCusto);
    }

    /** Liga a peça ao item de manutenção (tipo peça) de onde veio o nome, ou desliga com nulo. */
    public void vincularPecaAoItem(PecaOrdemServico peca, UUID idItemManutencao) {
        exigirLancavel();
        peca.vincularItem(idItemManutencao);
    }

    public void vincularPecaAoItem(UUID idPeca, UUID idItemManutencao) {
        vincularPecaAoItem(buscarPeca(idPeca), idItemManutencao);
    }

    /**
     * OS aberta pelo plano preventivo: cada item vira lançamento com valor zero, peça ou mão de
     * obra conforme o cadastro, para a oficina só completar quantidades, valores e o mecânico.
     * Item que já está lançado não se repete.
     */
    public void preLancarItens(List<ItemManutencao> itensPlano) {
        exigirLancavel();
        for (ItemManutencao item : itensPlano) {
            if (item.isPeca()) {
                boolean jaTem = pecas.stream().anyMatch(p -> item.getId().equals(p.getIdItemManutencao()));
                if (jaTem) continue;
                var peca = new PecaOrdemServico(this);
                peca.preencher(new DadosPeca(item.getNome(), null, OrigemPeca.COMPRA, BigDecimal.ONE, "UN", BigDecimal.ZERO));
                peca.vincularItem(item.getId());
                pecas.add(peca);
            } else {
                boolean jaTem = servicos.stream().anyMatch(s -> s.getItem() != null && item.getId().equals(s.getItem().getId()));
                if (jaTem) continue;
                // Sem mecânico ainda: na oficina interna ele é exigido na conclusão ("mesmo mecânico para todos").
                var servico = new ServicoOrdemServico(this);
                servico.preencher(new DadosServico(item.getNome(), item, null, null, BigDecimal.ONE, BigDecimal.ZERO));
                servicos.add(servico);
            }
        }
    }

    /** Peça que saiu do almoxarifado da frota, já ligada à saída. */
    public PecaOrdemServico lancarPecaDoEstoque(DadosPeca dados, UUID idMaterial, UUID idEstoque, UUID idMovimentacao) {
        var peca = lancarPeca(dados);
        peca.vincularEstoque(idMaterial, idEstoque, idMovimentacao);
        return peca;
    }

    /** Liga a peça à saída do almoxarifado da frota (ou desliga, com material nulo). */
    public void vincularPecaAoEstoque(UUID idPeca, UUID idMaterial, UUID idEstoque, UUID idMovimentacao) {
        exigirLancavel();
        var peca = buscarPeca(idPeca);
        if (idMaterial == null) {
            peca.desvincularEstoque();
        } else {
            peca.vincularEstoque(idMaterial, idEstoque, idMovimentacao);
        }
    }

    public PecaOrdemServico excluirPeca(UUID idPeca) {
        exigirLancavel();
        var peca = buscarPeca(idPeca);
        exigirDescontoCabe(peca.getSubtotal());
        pecas.remove(peca);
        return peca;
    }

    /** Desconto e acréscimo sobre a soma dos lançamentos. */
    public void definirAjustes(BigDecimal desconto, BigDecimal acrescimo) {
        exigirLancavel();
        BigDecimal novoDesconto = ajuste(desconto, "desconto");
        BigDecimal novoAcrescimo = ajuste(acrescimo, "acréscimo");
        if ((novoDesconto.signum() > 0 || novoAcrescimo.signum() > 0) && !temLancamentos()) {
            throw new InvarianteVioladaException("Lance serviços ou peças antes de aplicar desconto ou acréscimo.");
        }
        if (novoDesconto.compareTo(somaLancamentos()) > 0) {
            throw new InvarianteVioladaException("O desconto não pode ser maior que o valor dos serviços e das peças.");
        }
        this.desconto = novoDesconto;
        this.acrescimo = novoAcrescimo;
    }

    public boolean temLancamentos() {
        return !servicos.isEmpty() || !pecas.isEmpty();
    }

    public Totais totais() {
        BigDecimal maoDeObra = servicos.stream().map(ServicoOrdemServico::getSubtotal).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal emPecas = pecas.stream().map(PecaOrdemServico::getSubtotal).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal total = maoDeObra.add(emPecas).subtract(desconto).add(acrescimo);
        BigDecimal doEstoque = pecas.stream().filter(p -> p.getOrigem() == OrigemPeca.ESTOQUE)
                .map(PecaOrdemServico::getSubtotal).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal aComprar = total.subtract(doEstoque).max(BigDecimal.ZERO);
        return new Totais(maoDeObra, emPecas, desconto, acrescimo, total, doEstoque, aComprar);
    }

    /** Excluir um lançamento não pode deixar o desconto maior que o que sobra. */
    private void exigirDescontoCabe(BigDecimal removido) {
        if (desconto.compareTo(somaLancamentos().subtract(removido)) > 0) {
            throw new InvarianteVioladaException("O desconto ficaria maior que o valor dos lançamentos. Reduza o desconto antes.");
        }
    }

    private BigDecimal somaLancamentos() {
        Totais t = totais();
        return t.servicos().add(t.pecas());
    }

    private static BigDecimal ajuste(BigDecimal valor, String campo) {
        BigDecimal ajuste = valor == null ? BigDecimal.ZERO : valor;
        if (ajuste.signum() < 0 || ajuste.stripTrailingZeros().scale() > 2) {
            throw new InvarianteVioladaException("O " + campo + " deve ser zero ou mais, com até 2 casas decimais.");
        }
        return ajuste.setScale(2, java.math.RoundingMode.UNNECESSARY);
    }

    public List<ServicoOrdemServico> getServicos() {
        return Collections.unmodifiableList(servicos);
    }

    public List<PecaOrdemServico> getPecas() {
        return Collections.unmodifiableList(pecas);
    }

    /** Registra que o aviso de prazo estourado foi dado para a previsão atual. */
    public void registrarAvisoPrazo() {
        this.prazoAvisadoPara = previsaoTermino;
    }

    /** Marca o registro como importado; só pode ser feito uma vez. */
    public void registrarReferenciaExterna(ReferenciaExterna referencia) {
        ReferenciaExterna.exigirVazia(this.referenciaExterna);
        this.referenciaExterna = referencia;
    }

    public boolean isParadaEmCurso() {
        return veiculoParado && liberadoEm == null && situacao.isAberta();
    }

    public boolean isAtrasada(OffsetDateTime agora) {
        return situacao == SituacaoOrdemServico.EM_ANDAMENTO && previsaoTermino != null
                && previsaoTermino.isBefore(agora);
    }

    public boolean precisaAvisarPrazo(OffsetDateTime agora) {
        return isAtrasada(agora) && !previsaoTermino.equals(prazoAvisadoPara);
    }

    /**
     * Compra e pagamento podem vir antes ou depois do serviço: compra grande é aprovada antes,
     * a pequena muitas vezes só chega depois de a OS ser concluída. Só a OS cancelada recusa.
     */
    public boolean aceitaOrcamento() {
        return situacao != SituacaoOrdemServico.CANCELADA;
    }

    public List<ItemOrdemServico> getItens() {
        return Collections.unmodifiableList(itens);
    }

    public List<ItemManutencao> itensManutencao() {
        return itens.stream().map(ItemOrdemServico::getItem).toList();
    }

    private void preencher(Edicao dados) {
        if (dados.tipoManutencao() == null || dados.origem() == null || dados.criticidade() == null) {
            throw new InvarianteVioladaException("Informe o tipo de manutenção, a origem e a criticidade da OS.");
        }
        this.tipoManutencao = dados.tipoManutencao();
        this.origem = dados.origem();
        this.criticidade = dados.criticidade();
        this.motivo = dados.motivo();
        this.descricao = Textos.obrigatorio(dados.descricao(), "descrição do problema", 2000);
        if (!veicular && dados.idCondutor() != null) {
            throw new InvarianteVioladaException("Manutenção sem veículo não tem condutor.");
        }
        this.idCondutor = dados.idCondutor();
        definirOficina(dados.tipoOficina(), dados.idFornecedor(), dados.oficinaNome());
    }

    private void definirOficina(TipoOficina tipo, UUID fornecedor, String nome) {
        this.tipoOficina = tipo == null ? TipoOficina.EXTERNA : tipo;
        this.idFornecedor = this.tipoOficina == TipoOficina.EXTERNA ? fornecedor : null;
        this.oficinaNome = Textos.opcional(nome, 150);
    }

    /**
     * Troca os itens preservando os que continuam (e a repetição já gravada neles). A
     * ordem informada é mantida e itens repetidos na lista contam uma vez.
     */
    private void definirItens(List<ItemManutencao> novos) {
        if (novos == null || novos.isEmpty()) {
            throw new InvarianteVioladaException("Informe ao menos um item de manutenção.");
        }
        Map<UUID, ItemManutencao> unicos = new LinkedHashMap<>();
        for (ItemManutencao item : novos) {
            unicos.putIfAbsent(item.getId(), item);
        }
        Map<UUID, ItemOrdemServico> atuais = new LinkedHashMap<>();
        itens.forEach(i -> atuais.put(i.getItem().getId(), i));
        for (ItemManutencao item : unicos.values()) {
            if (!atuais.containsKey(item.getId()) && !item.isAtivo()) {
                throw new InvarianteVioladaException("O item de manutenção " + item.getNome() + " está desativado.");
            }
        }
        itens.removeIf(i -> !unicos.containsKey(i.getItem().getId()));
        for (ItemManutencao item : unicos.values()) {
            if (!atuais.containsKey(item.getId())) {
                itens.add(new ItemOrdemServico(this, item));
            }
        }
    }

    /**
     * Na oficina interna o mecânico é um colaborador do RH (o caso de uso confere se ele
     * existe e está ativo). Na externa, a responsabilidade é do fornecedor: só nome livre.
     */
    private void exigirMecanicoCoerente(UUID idMecanico) {
        if (tipoOficina == TipoOficina.INTERNA && idMecanico == null) {
            throw new InvarianteVioladaException("Na oficina interna, escolha o mecânico entre os colaboradores.");
        }
        if (tipoOficina == TipoOficina.EXTERNA && idMecanico != null) {
            throw new InvarianteVioladaException("Na oficina externa, informe o mecânico pelo nome (opcional).");
        }
    }

    private ServicoOrdemServico buscarServico(UUID id) {
        return servicos.stream().filter(s -> s.getId() != null && s.getId().equals(id)).findFirst()
                .orElseThrow(() -> new InvarianteVioladaException("Serviço não encontrado nesta OS."));
    }

    private PecaOrdemServico buscarPeca(UUID id) {
        return pecas.stream().filter(p -> p.getId() != null && p.getId().equals(id)).findFirst()
                .orElseThrow(() -> new InvarianteVioladaException("Peça não encontrada nesta OS."));
    }

    private void definirPrevisao(OffsetDateTime previsao) {
        if (previsao != null && inicioReal != null && previsao.isBefore(inicioReal)) {
            throw new InvarianteVioladaException("A previsão de término não pode ser anterior ao início.");
        }
        this.previsaoTermino = previsao;
    }

    /** Antes de mexer no estoque pela OS: a OS precisa estar aberta. */
    public void exigirPodeLancar() {
        exigirLancavel();
    }

    /**
     * Serviços, peças e ajustes: enquanto a OS está aberta ou concluída com valores pendentes
     * (a peça pequena muitas vezes só é informada depois do serviço). O valor da OS concluída
     * acompanha os lançamentos.
     */
    private void exigirLancavel() {
        if (isBaixaPendente()) return;
        if (situacao == SituacaoOrdemServico.CONCLUIDA) {
            throw new InvarianteVioladaException("A OS " + (numero == null ? "" : numero + " ")
                    + "já está finalizada. Volte a OS para em andamento para mudar a execução.");
        }
        exigirAberta("alterada");
    }

    /** Na OS concluída com valores pendentes, o valor segue os lançamentos. */
    public void atualizarValorPelaExecucao() {
        if (isBaixaPendente() && temLancamentos()) {
            this.valorTotal = totais().total();
        }
    }

    private void exigirAberta(String acao) {
        if (!situacao.isAberta()) {
            throw new InvarianteVioladaException(
                    "A OS " + (numero == null ? "" : numero + " ") + "está " + situacao.getRotulo().toLowerCase()
                            + " e não pode ser " + acao + ".");
        }
    }

    private static void exigirNaoFuturo(OffsetDateTime instante, String campo) {
        if (instante != null && instante.isAfter(OffsetDateTime.now().plus(TOLERANCIA_FUTURO))) {
            throw new InvarianteVioladaException(campo + " não pode estar no futuro.");
        }
    }
}
