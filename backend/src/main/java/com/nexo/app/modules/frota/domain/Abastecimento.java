package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Solicitação de abastecimento: a equipe pede pelo app, o gestor da placa aprova, o
 * administrativo libera e avisa o posto, a equipe registra o realizado.
 *
 * <p>Aprovada ou liberada e não realizada até o fim do dia (Brasília), vence. Antes da
 * liberação a equipe cancela; depois, só o administrativo.</p>
 */
@Entity
@Table(name = "frota_abastecimentos")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Abastecimento extends BaseEntity {

    public static final ZoneId FUSO = ZoneId.of("America/Sao_Paulo");

    @Column(name = "id_aparelho", nullable = false, updatable = false)
    private UUID idAparelho;

    @Column(name = "id_veiculo", nullable = false, updatable = false)
    private UUID idVeiculo;

    @Column(name = "id_base_operacional", updatable = false)
    private UUID idBaseOperacional;

    @Column(name = "id_condutor", nullable = false, updatable = false)
    private UUID idCondutor;

    @Column(name = "id_usuario_solicitante", nullable = false, updatable = false)
    private UUID idUsuarioSolicitante;

    @Column(name = "id_equipe", updatable = false)
    private UUID idEquipe;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_posto", nullable = false)
    private PostoAbastecimento posto;

    @Enumerated(EnumType.STRING)
    @Column(name = "situacao", nullable = false, length = 25)
    private SituacaoAbastecimento situacao;

    @Column(name = "solicitado_em", nullable = false, updatable = false)
    private OffsetDateTime solicitadoEm;

    /** Pedido pelo app ou avulso, lançado na web já aprovado. */
    @Enumerated(EnumType.STRING)
    @Column(name = "origem", nullable = false, length = 10, updatable = false)
    private OrigemAbastecimento origem = OrigemAbastecimento.APP;

    /** Opcional só no avulso: quem lança na web nem sempre está com o veículo. */
    @Column(name = "medicao_solicitacao", precision = 12, scale = 1, updatable = false)
    private BigDecimal medicaoSolicitacao;

    @Column(name = "observacao", length = 500, updatable = false)
    private String observacao;

    /** Para onde o veículo vai: a gestão define a quantidade por ele. Nulo nos pedidos antigos. */
    @Column(name = "destino", length = 200, updatable = false)
    private String destino;

    @Column(name = "id_usuario_aprovacao")
    private UUID idUsuarioAprovacao;

    @Column(name = "aprovado_em")
    private OffsetDateTime aprovadoEm;

    @Column(name = "motivo_reprovacao", length = 500)
    private String motivoReprovacao;

    @Column(name = "id_usuario_liberacao")
    private UUID idUsuarioLiberacao;

    @Column(name = "liberado_em")
    private OffsetDateTime liberadoEm;

    @Column(name = "vence_em")
    private OffsetDateTime venceEm;

    @Column(name = "id_usuario_cancelamento")
    private UUID idUsuarioCancelamento;

    @Column(name = "cancelado_em")
    private OffsetDateTime canceladoEm;

    @Column(name = "motivo_cancelamento", length = 500)
    private String motivoCancelamento;

    @Column(name = "realizado_em")
    private OffsetDateTime realizadoEm;

    @Column(name = "medicao_realizado", precision = 12, scale = 1)
    private BigDecimal medicaoRealizado;

    @Column(name = "id_leitura_odometro")
    private UUID idLeituraOdometro;

    @Column(name = "id_fatura")
    private UUID idFatura;

    @OneToMany(mappedBy = "abastecimento", cascade = CascadeType.ALL)
    @OrderBy("ordem ASC")
    private List<ItemAbastecimento> itens = new ArrayList<>();

    @OneToMany(mappedBy = "abastecimento", cascade = CascadeType.ALL)
    private List<FotoAbastecimento> fotos = new ArrayList<>();

    @OneToMany(mappedBy = "abastecimento", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<AlertaAbastecimento> alertas = new ArrayList<>();

    /** @param quantidade só nos pedidos importados; a equipe pede só o produto */
    public record ItemPedido(ProdutoAbastecimento produto, BigDecimal quantidade) {
        public ItemPedido(ProdutoAbastecimento produto) {
            this(produto, null);
        }
    }

    public record Solicitacao(UUID idAparelho, UUID idVeiculo, UUID idBaseOperacional, UUID idCondutor, UUID idSolicitante,
                              UUID idEquipe, PostoAbastecimento posto, BigDecimal medicao, String destino, String observacao,
                              List<ItemPedido> itens, UUID idFotoPainel, OffsetDateTime agora) {
    }

    /**
     * @param valorTotal  digitado só quando o posto não tem preço do produto
     * @param precoPosto  preço vigente do produto efetivo no posto (nulo sem cadastro)
     */
    public record ItemRealizado(UUID idItem, ProdutoAbastecimento produto, BigDecimal quantidade, BigDecimal valorTotal,
                                BigDecimal precoPosto, Boolean tanqueCheio) {
    }

    public record Realizado(BigDecimal medicao, List<ItemRealizado> itens, UUID idFotoPainel, UUID idFotoCupom,
                            OffsetDateTime realizadoEm) {
    }

    /** Item do avulso: o produto e a quantidade que quem aprova já autoriza. */
    public record ItemAvulso(ProdutoAbastecimento produto, BigDecimal quantidade) {
    }

    /**
     * Abastecimento avulso, lançado na web por quem aprova a placa (como a solicitação direta
     * do comercial): nasce aprovado por quem lançou, sem foto do painel e com KM opcional.
     */
    public record Avulso(UUID idVeiculo, UUID idBaseOperacional, UUID idCondutor, UUID idAprovador, PostoAbastecimento posto,
                         BigDecimal medicao, String destino, String observacao, List<ItemAvulso> itens, OffsetDateTime agora) {
    }

    public static Abastecimento solicitar(Solicitacao s) {
        var a = new Abastecimento();
        a.idAparelho = obrigatorio(s.idAparelho(), "o id do aparelho");
        a.idVeiculo = obrigatorio(s.idVeiculo(), "o veículo");
        a.idCondutor = obrigatorio(s.idCondutor(), "o condutor");
        a.idUsuarioSolicitante = obrigatorio(s.idSolicitante(), "quem solicitou");
        a.idBaseOperacional = s.idBaseOperacional();
        a.idEquipe = s.idEquipe();
        a.posto = postoAtivo(s.posto());
        a.medicaoSolicitacao = medicao(s.medicao());
        a.destino = Textos.obrigatorio(s.destino(), "destino", 200);
        a.observacao = Textos.opcional(s.observacao(), 500);
        a.solicitadoEm = obrigatorio(s.agora(), "o instante da solicitação");
        a.situacao = SituacaoAbastecimento.AGUARDANDO_APROVACAO;
        if (s.itens() == null || s.itens().isEmpty()) {
            throw new InvarianteVioladaException("Informe ao menos um item: combustível, ARLA, óleo ou fluido.");
        }
        var produtos = new HashSet<UUID>();
        int combustiveis = 0;
        for (var pedido : s.itens()) {
            if (pedido.produto() == null) {
                throw new InvarianteVioladaException("Produto do abastecimento não encontrado ou desativado.");
            }
            if (!produtos.add(pedido.produto().getId())) {
                throw new InvarianteVioladaException(pedido.produto().getNome() + " aparece mais de uma vez.");
            }
            if (pedido.produto().isCombustivel() && ++combustiveis > 1) {
                throw new InvarianteVioladaException("Peça um combustível por solicitação.");
            }
            a.itens.add(new ItemAbastecimento(a, a.itens.size() + 1, pedido.produto(), pedido.quantidade()));
        }
        a.fotos.add(new FotoAbastecimento(a, obrigatorio(s.idFotoPainel(), "a foto do painel"), TipoFotoAbastecimento.PAINEL_ANTES));
        return a;
    }

    public static Abastecimento avulso(Avulso s) {
        var a = new Abastecimento();
        a.origem = OrigemAbastecimento.AVULSA;
        // Não vem de aparelho: o id só cumpre a unicidade da coluna.
        a.idAparelho = UUID.randomUUID();
        a.idVeiculo = obrigatorio(s.idVeiculo(), "o veículo");
        a.idCondutor = obrigatorio(s.idCondutor(), "o condutor");
        a.idUsuarioSolicitante = obrigatorio(s.idAprovador(), "quem lançou");
        a.idBaseOperacional = s.idBaseOperacional();
        a.posto = postoAtivo(s.posto());
        a.medicaoSolicitacao = s.medicao() == null ? null : medicao(s.medicao());
        a.destino = Textos.obrigatorio(s.destino(), "destino", 200);
        a.observacao = Textos.opcional(s.observacao(), 500);
        a.solicitadoEm = obrigatorio(s.agora(), "o instante da solicitação");
        if (s.itens() == null || s.itens().isEmpty()) {
            throw new InvarianteVioladaException("Informe ao menos um item: combustível, ARLA, óleo ou fluido.");
        }
        var produtos = new HashSet<UUID>();
        int combustiveis = 0;
        for (var pedido : s.itens()) {
            if (pedido.produto() == null) {
                throw new InvarianteVioladaException("Produto do abastecimento não encontrado ou desativado.");
            }
            if (!produtos.add(pedido.produto().getId())) {
                throw new InvarianteVioladaException(pedido.produto().getNome() + " aparece mais de uma vez.");
            }
            if (pedido.produto().isCombustivel() && ++combustiveis > 1) {
                throw new InvarianteVioladaException("Lance um combustível por abastecimento.");
            }
            var item = new ItemAbastecimento(a, a.itens.size() + 1, pedido.produto(), null);
            item.aprovar(pedido.quantidade());
            a.itens.add(item);
        }
        if (a.itens.stream().allMatch(ItemAbastecimento::isRetirado)) {
            throw new InvarianteVioladaException("Informe a quantidade de ao menos um item.");
        }
        a.idUsuarioAprovacao = a.idUsuarioSolicitante;
        a.aprovadoEm = a.solicitadoEm;
        a.venceEm = fimDoDia(a.solicitadoEm);
        a.situacao = SituacaoAbastecimento.APROVADA;
        return a;
    }

    public boolean isAvulso() {
        return origem == OrigemAbastecimento.AVULSA;
    }

    /**
     * O aprovador define quanto de cada item (id do item → quantidade). Zero tira o item, mas
     * ao menos um precisa ficar.
     */
    public void aprovar(UUID idUsuario, Map<UUID, BigDecimal> quantidades, OffsetDateTime agora) {
        exigir(SituacaoAbastecimento.AGUARDANDO_APROVACAO, "aprovar");
        var informadas = quantidades == null ? Map.<UUID, BigDecimal>of() : quantidades;
        for (var item : itens) {
            var quantidade = informadas.get(item.getId());
            if (quantidade == null) {
                throw new InvarianteVioladaException("Informe quanto de " + item.getProdutoPedido().getNome() + " aprovar.");
            }
            item.aprovar(quantidade);
        }
        informadas.keySet().forEach(this::item);
        if (itens.stream().allMatch(ItemAbastecimento::isRetirado)) {
            throw new InvarianteVioladaException("Aprove ao menos um item com quantidade. Se nada deve ser abastecido, reprove.");
        }
        this.idUsuarioAprovacao = obrigatorio(idUsuario, "quem aprovou");
        this.aprovadoEm = agora;
        this.venceEm = fimDoDia(agora);
        this.situacao = SituacaoAbastecimento.APROVADA;
    }

    public void reprovar(UUID idUsuario, String motivo, OffsetDateTime agora) {
        exigir(SituacaoAbastecimento.AGUARDANDO_APROVACAO, "reprovar");
        this.motivoReprovacao = Textos.obrigatorio(motivo, "motivo da reprovação", 500);
        this.idUsuarioAprovacao = obrigatorio(idUsuario, "quem reprovou");
        this.aprovadoEm = agora;
        this.situacao = SituacaoAbastecimento.REPROVADA;
    }

    /**
     * O administrativo libera, podendo trocar o posto e ajustar as quantidades aprovadas
     * (id do item → nova quantidade). O aprovado continua guardado.
     */
    public void liberar(UUID idUsuario, PostoAbastecimento outroPosto, Map<UUID, BigDecimal> quantidades, OffsetDateTime agora) {
        exigir(SituacaoAbastecimento.APROVADA, "liberar");
        if (venceEm != null && !agora.isBefore(venceEm)) {
            throw new InvarianteVioladaException("A aprovação venceu no fim do dia. A equipe precisa pedir de novo.");
        }
        if (outroPosto != null) {
            this.posto = postoAtivo(outroPosto);
        }
        var ajustes = quantidades == null ? Map.<UUID, BigDecimal>of() : quantidades;
        ajustes.keySet().forEach(this::item);
        itens.forEach(i -> i.liberar(ajustes.get(i.getId())));
        if (itens.stream().allMatch(ItemAbastecimento::isRetirado)) {
            throw new InvarianteVioladaException("Libere ao menos um item com quantidade. Se nada deve ser abastecido, cancele.");
        }
        this.idUsuarioLiberacao = obrigatorio(idUsuario, "quem liberou");
        this.liberadoEm = agora;
        this.situacao = SituacaoAbastecimento.LIBERADA;
    }

    /**
     * Antes da liberação, a equipe cancela; depois, só quem libera, com motivo.
     *
     * @param podeCancelarLiberada quem cancela tem a permissão de liberar
     */
    public void cancelar(UUID idUsuario, String motivo, boolean podeCancelarLiberada, OffsetDateTime agora) {
        if (!situacao.emAndamento()) {
            throw new InvarianteVioladaException("Este abastecimento está " + situacao.getRotulo().toLowerCase() + " e não pode ser cancelado.");
        }
        if (situacao == SituacaoAbastecimento.LIBERADA) {
            if (!podeCancelarLiberada) {
                throw new InvarianteVioladaException("O abastecimento já foi liberado. Peça o cancelamento ao administrativo.");
            }
            this.motivoCancelamento = Textos.obrigatorio(motivo, "motivo do cancelamento", 500);
        } else {
            this.motivoCancelamento = Textos.opcional(motivo, 500);
        }
        this.idUsuarioCancelamento = obrigatorio(idUsuario, "quem cancelou");
        this.canceladoEm = agora;
        this.situacao = SituacaoAbastecimento.CANCELADA;
    }

    public void realizar(Realizado r) {
        exigir(SituacaoAbastecimento.LIBERADA, "registrar o realizado de");
        var realizados = r.itens() == null ? List.<ItemRealizado>of() : r.itens();
        var informados = new HashSet<UUID>();
        realizados.forEach(ir -> informados.add(item(ir.idItem()).getId()));
        itens.stream().filter(i -> !informados.contains(i.getId()) && !i.isRetirado()).findFirst().ifPresent(i -> {
            throw new InvarianteVioladaException("Informe o que foi entregue de " + i.getProdutoPedido().getNome() + " (zero se não veio).");
        });
        itens.stream().filter(i -> !informados.contains(i.getId())).forEach(ItemAbastecimento::naoEntregue);
        realizados.forEach(ir -> item(ir.idItem()).realizar(ir.produto(), ir.quantidade(), ir.valorTotal(), ir.precoPosto(),
                ir.tanqueCheio()));
        if (itens.stream().allMatch(i -> i.getQuantidade().signum() == 0)) {
            throw new InvarianteVioladaException("Nenhum item foi entregue. Se não abasteceu, peça o cancelamento.");
        }
        this.medicaoRealizado = medicao(r.medicao());
        if (fotos.stream().noneMatch(f -> f.getTipo() == TipoFotoAbastecimento.PAINEL_DEPOIS)) {
            fotos.add(new FotoAbastecimento(this, obrigatorio(r.idFotoPainel(), "a foto do painel depois do abastecimento"),
                    TipoFotoAbastecimento.PAINEL_DEPOIS));
        }
        if (fotos.stream().noneMatch(f -> f.getTipo() == TipoFotoAbastecimento.CUPOM)) {
            fotos.add(new FotoAbastecimento(this, obrigatorio(r.idFotoCupom(), "a foto do cupom ou da nota"), TipoFotoAbastecimento.CUPOM));
        }
        this.realizadoEm = obrigatorio(r.realizadoEm(), "o instante do abastecimento");
        this.situacao = SituacaoAbastecimento.REALIZADA;
    }

    /** @return falso quando ainda não venceu ou já não estava em aberto */
    public boolean vencer(OffsetDateTime agora) {
        if ((situacao != SituacaoAbastecimento.APROVADA && situacao != SituacaoAbastecimento.LIBERADA)
                || venceEm == null || agora.isBefore(venceEm)) {
            return false;
        }
        this.situacao = SituacaoAbastecimento.VENCIDA;
        return true;
    }

    public void vincularLeitura(UUID idLeitura) {
        this.idLeituraOdometro = idLeitura;
    }

    public void faturar(UUID idFatura) {
        if (situacao != SituacaoAbastecimento.REALIZADA) {
            throw new InvarianteVioladaException("Só abastecimento realizado entra em fatura.");
        }
        if (this.idFatura != null && !this.idFatura.equals(idFatura)) {
            throw new InvarianteVioladaException("Este abastecimento já está em outra fatura.");
        }
        this.idFatura = idFatura;
    }

    public void retirarDaFatura() {
        this.idFatura = null;
    }

    /** Troca os alertas da etapa pelos recalculados. */
    public void registrarAlertas(EtapaAlertaAbastecimento etapa, List<AnaliseAbastecimento.Alerta> novos) {
        alertas.removeIf(a -> a.getEtapa() == etapa && a.getOrigem() == OrigemAlertaAbastecimento.PROGRAMATICO);
        novos.forEach(n -> alertas.add(new AlertaAbastecimento(this, etapa, n)));
    }

    public Optional<FotoAbastecimento> foto(UUID idAparelho) {
        return fotos.stream().filter(f -> f.getIdAparelho().equals(idAparelho)).findFirst();
    }

    public List<UUID> fotosPendentes() {
        return fotos.stream().filter(f -> !f.isRecebida()).map(FotoAbastecimento::getIdAparelho).toList();
    }

    /** Valor total entregue (soma dos itens realizados). */
    public BigDecimal valorTotal() {
        return itens.stream().map(ItemAbastecimento::getValorTotal).filter(java.util.Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    public Optional<ItemAbastecimento> itemCombustivelEntregue() {
        return itens.stream().filter(ItemAbastecimento::isCombustivelEntregue).findFirst();
    }

    public boolean liberadoParaOPosto() {
        return liberadoEm != null;
    }

    public ItemAbastecimento item(UUID idItem) {
        return itens.stream().filter(i -> i.getId().equals(idItem)).findFirst()
                .orElseThrow(() -> new InvarianteVioladaException("Item do abastecimento não encontrado."));
    }

    static OffsetDateTime fimDoDia(OffsetDateTime instante) {
        return instante.atZoneSameInstant(FUSO).toLocalDate().plusDays(1).atStartOfDay(FUSO).toOffsetDateTime();
    }

    private void exigir(SituacaoAbastecimento esperada, String acao) {
        if (situacao != esperada) {
            throw new InvarianteVioladaException("Não é possível " + acao + " um abastecimento " + situacao.getRotulo().toLowerCase() + ".");
        }
    }

    private static PostoAbastecimento postoAtivo(PostoAbastecimento posto) {
        if (posto == null || !posto.isAtivo()) {
            throw new InvarianteVioladaException("Posto não encontrado ou desativado.");
        }
        return posto;
    }

    private static BigDecimal medicao(BigDecimal valor) {
        if (valor == null || valor.signum() < 0) {
            throw new InvarianteVioladaException("Informe o KM ou as horas do painel.");
        }
        return valor.setScale(1, RoundingMode.HALF_UP);
    }

    private static <T> T obrigatorio(T valor, String campo) {
        if (valor == null) {
            throw new InvarianteVioladaException("Informe " + campo + ".");
        }
        return valor;
    }
}
