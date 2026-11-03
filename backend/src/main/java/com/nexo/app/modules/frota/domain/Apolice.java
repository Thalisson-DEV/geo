package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

/**
 * Apólice de seguro da frota: seguradora e corretor (fornecedores do financeiro), vigência,
 * valor, franquia, os veículos cobertos em cada período e as parcelas pagas pelo financeiro.
 *
 * <p>Coberturas e parcelas saem por exclusão lógica. A parcela com pagamento pedido ou aprovado
 * não muda nem sai, e a apólice com uma delas não pode ser excluída.</p>
 */
@Entity
@Table(name = "frota_apolices")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Apolice extends BaseEntity {

    static final int MAXIMO_PARCELAS = 24;
    private static final DateTimeFormatter DATA = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    @Column(name = "numero", nullable = false, length = 60)
    private String numero;

    @Column(name = "id_seguradora", nullable = false)
    private UUID idSeguradora;

    @Column(name = "id_corretor")
    private UUID idCorretor;

    @Column(name = "segurado", length = 150)
    private String segurado;

    @Column(name = "id_base_operacional")
    private UUID idBaseOperacional;

    @Column(name = "id_processo")
    private UUID idProcesso;

    @Column(name = "vigencia_inicio", nullable = false)
    private LocalDate vigenciaInicio;

    @Column(name = "vigencia_fim", nullable = false)
    private LocalDate vigenciaFim;

    /** Prêmio total da apólice. */
    @Column(name = "valor", nullable = false, precision = 14, scale = 2)
    private BigDecimal valor;

    @Column(name = "franquia", precision = 14, scale = 2)
    private BigDecimal franquia;

    @Column(name = "observacao", length = 1000)
    private String observacao;

    @OneToMany(mappedBy = "apolice", cascade = CascadeType.ALL)
    @OrderBy("inicio ASC")
    private List<CoberturaApolice> coberturas = new ArrayList<>();

    @OneToMany(mappedBy = "apolice", cascade = CascadeType.ALL)
    @OrderBy("numero ASC")
    private List<ParcelaApolice> parcelas = new ArrayList<>();

    public record Dados(String numero, UUID idSeguradora, UUID idCorretor, String segurado, UUID idBaseOperacional,
                        UUID idProcesso, LocalDate vigenciaInicio, LocalDate vigenciaFim, BigDecimal valor,
                        BigDecimal franquia, String observacao) {
    }

    public static Apolice cadastrar(Dados dados) {
        var apolice = new Apolice();
        apolice.preencher(dados);
        return apolice;
    }

    /** A vigência nova precisa conter as coberturas e as parcelas já lançadas não mudam por aqui. */
    public void atualizar(Dados dados) {
        exigirAtiva();
        if (dados.vigenciaInicio() != null && dados.vigenciaFim() != null) {
            for (CoberturaApolice c : getCoberturasAtivas()) {
                if (c.getInicio().isBefore(dados.vigenciaInicio()) || c.fimEfetivo(dados.vigenciaFim()).isAfter(dados.vigenciaFim())
                        || (c.getFim() == null && dados.vigenciaFim().isBefore(c.getInicio()))) {
                    throw new InvarianteVioladaException("A cobertura de um veículo (desde " + c.getInicio().format(DATA)
                            + ") fica fora da nova vigência. Ajuste ou retire o veículo antes.");
                }
            }
        }
        preencher(dados);
    }

    public void excluir() {
        exigirAtiva();
        if (getParcelasAtivas().stream().anyMatch(ParcelaApolice::pagamentoEmAndamento)) {
            throw new InvarianteVioladaException("A apólice tem parcela com pagamento pedido ou aprovado no financeiro e não pode ser excluída.");
        }
        getCoberturasAtivas().forEach(CoberturaApolice::desativar);
        getParcelasAtivas().forEach(ParcelaApolice::desativar);
        desativar();
    }

    // ── Veículos cobertos ──────────────────────────────────────────────────────────

    /** Inclui o veículo; sem início, desde o começo da vigência; sem fim, até o fim dela. */
    public CoberturaApolice incluirVeiculo(UUID idVeiculo, LocalDate inicio, LocalDate fim) {
        exigirAtiva();
        if (idVeiculo == null) {
            throw new InvarianteVioladaException("Escolha o veículo coberto.");
        }
        LocalDate de = inicio == null ? vigenciaInicio : inicio;
        exigirPeriodoNaVigencia(de, fim);
        LocalDate ate = fim == null ? vigenciaFim : fim;
        boolean sobrepoe = getCoberturasAtivas().stream()
                .filter(c -> c.getIdVeiculo().equals(idVeiculo))
                .anyMatch(c -> !c.getInicio().isAfter(ate) && !c.fimEfetivo(vigenciaFim).isBefore(de));
        if (sobrepoe) {
            throw new InvarianteVioladaException("O veículo já está coberto por esta apólice nesse período.");
        }
        var cobertura = new CoberturaApolice(this, idVeiculo, de, fim);
        coberturas.add(cobertura);
        return cobertura;
    }

    /** O veículo saiu da apólice (venda, devolução, troca): a cobertura vale até a data informada. */
    public void encerrarCobertura(UUID idCobertura, LocalDate fim, MotivoEncerramentoCobertura motivo, String observacao) {
        exigirAtiva();
        var cobertura = cobertura(idCobertura);
        if (fim == null) {
            throw new InvarianteVioladaException("Informe até quando o veículo ficou coberto.");
        }
        if (motivo == null) {
            throw new InvarianteVioladaException("Informe por que o veículo saiu da apólice.");
        }
        if (motivo == MotivoEncerramentoCobertura.OUTRO && (observacao == null || observacao.isBlank())) {
            throw new InvarianteVioladaException("Descreva o motivo da saída do veículo.");
        }
        exigirPeriodoNaVigencia(cobertura.getInicio(), fim);
        cobertura.encerrar(fim, motivo, observacao);
    }

    /** Lançada por engano: sai da apólice. */
    public void removerCobertura(UUID idCobertura) {
        exigirAtiva();
        cobertura(idCobertura).desativar();
    }

    public List<CoberturaApolice> getCoberturasAtivas() {
        return coberturas.stream().filter(CoberturaApolice::isAtivo).toList();
    }

    /** Se o veículo está coberto na data (para acionar a apólice num sinistro). */
    public boolean cobre(UUID idVeiculo, LocalDate data) {
        return isAtivo() && !data.isBefore(vigenciaInicio) && !data.isAfter(vigenciaFim)
                && getCoberturasAtivas().stream().anyMatch(c -> c.getIdVeiculo().equals(idVeiculo) && c.cobre(data, vigenciaFim));
    }

    /**
     * Períodos [início, fim] em que o veículo está de fato coberto (cobertura recortada pela
     * vigência); vazio se ele não está nesta apólice.
     */
    public List<LocalDate[]> periodosCobertos(UUID idVeiculo) {
        if (!isAtivo()) return List.of();
        return getCoberturasAtivas().stream().filter(c -> c.getIdVeiculo().equals(idVeiculo))
                .map(c -> new LocalDate[]{c.getInicio().isBefore(vigenciaInicio) ? vigenciaInicio : c.getInicio(),
                        c.fimEfetivo(vigenciaFim).isAfter(vigenciaFim) ? vigenciaFim : c.fimEfetivo(vigenciaFim)})
                .filter(p -> !p[1].isBefore(p[0])).toList();
    }

    /** Veículos ainda cobertos no último dia da vigência (os que a renovação precisa levar). */
    public List<UUID> veiculosNoFimDaVigencia() {
        return getCoberturasAtivas().stream().filter(c -> c.cobre(vigenciaFim, vigenciaFim))
                .map(CoberturaApolice::getIdVeiculo).distinct().toList();
    }

    // ── Parcelas ───────────────────────────────────────────────────────────────────

    /**
     * Divide o valor em parcelas mensais a partir do primeiro vencimento; a diferença dos
     * centavos fica na primeira. Substitui as parcelas que ainda não foram ao financeiro.
     */
    public void gerarParcelas(int quantidade, LocalDate primeiroVencimento, BigDecimal valorTotal) {
        exigirAtiva();
        if (quantidade < 1 || quantidade > MAXIMO_PARCELAS) {
            throw new InvarianteVioladaException("Informe de 1 a " + MAXIMO_PARCELAS + " parcelas.");
        }
        if (primeiroVencimento == null) {
            throw new InvarianteVioladaException("Informe o vencimento da primeira parcela.");
        }
        if (getParcelasAtivas().stream().anyMatch(p -> p.getSituacaoPagamento() != null)) {
            throw new InvarianteVioladaException("Já há parcela enviada ao financeiro. Ajuste as parcelas uma a uma.");
        }
        BigDecimal total = (valorTotal == null ? valor : valorTotal).setScale(2, RoundingMode.HALF_UP);
        if (total.signum() <= 0) {
            throw new InvarianteVioladaException("Informe o valor a parcelar.");
        }
        BigDecimal cada = total.divide(BigDecimal.valueOf(quantidade), 2, RoundingMode.DOWN);
        BigDecimal primeira = total.subtract(cada.multiply(BigDecimal.valueOf(quantidade - 1)));
        getParcelasAtivas().forEach(ParcelaApolice::desativar);
        for (int i = 0; i < quantidade; i++) {
            parcelas.add(new ParcelaApolice(this, i + 1, primeiroVencimento.plusMonths(i), i == 0 ? primeira : cada));
        }
    }

    public ParcelaApolice incluirParcela(LocalDate vencimento, BigDecimal valorParcela) {
        exigirAtiva();
        if (getParcelasAtivas().size() >= MAXIMO_PARCELAS) {
            throw new InvarianteVioladaException("A apólice aceita no máximo " + MAXIMO_PARCELAS + " parcelas.");
        }
        int proximo = getParcelasAtivas().stream().mapToInt(ParcelaApolice::getNumero).max().orElse(0) + 1;
        var parcela = new ParcelaApolice(this, proximo, vencimento, valorParcela);
        parcelas.add(parcela);
        return parcela;
    }

    public void alterarParcela(UUID idParcela, LocalDate vencimento, BigDecimal valorParcela) {
        exigirAtiva();
        parcela(idParcela).alterar(vencimento, valorParcela);
    }

    public void removerParcela(UUID idParcela) {
        exigirAtiva();
        parcela(idParcela).remover();
    }

    public List<ParcelaApolice> getParcelasAtivas() {
        return parcelas.stream().filter(ParcelaApolice::isAtivo).sorted(Comparator.comparing(ParcelaApolice::getNumero)).toList();
    }

    public ParcelaApolice parcela(UUID idParcela) {
        return parcelas.stream().filter(ParcelaApolice::isAtivo).filter(p -> p.getId().equals(idParcela)).findFirst()
                .orElseThrow(() -> new InvarianteVioladaException("Parcela não encontrada nesta apólice."));
    }

    public BigDecimal totalParcelas() {
        return getParcelasAtivas().stream().map(ParcelaApolice::getValor).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /** "Apólice 123/2026". */
    public String descricao() {
        return "Apólice " + numero;
    }

    private CoberturaApolice cobertura(UUID idCobertura) {
        return coberturas.stream().filter(CoberturaApolice::isAtivo).filter(c -> c.getId().equals(idCobertura)).findFirst()
                .orElseThrow(() -> new InvarianteVioladaException("Veículo não encontrado nesta apólice."));
    }

    private void exigirPeriodoNaVigencia(LocalDate inicio, LocalDate fim) {
        if (inicio.isBefore(vigenciaInicio) || inicio.isAfter(vigenciaFim)) {
            throw new InvarianteVioladaException("O início da cobertura precisa estar na vigência da apólice ("
                    + vigenciaInicio.format(DATA) + " a " + vigenciaFim.format(DATA) + ").");
        }
        if (fim != null && (fim.isBefore(inicio) || fim.isAfter(vigenciaFim))) {
            throw new InvarianteVioladaException("O fim da cobertura precisa estar entre o início dela e o fim da vigência ("
                    + vigenciaFim.format(DATA) + ").");
        }
    }

    private void exigirAtiva() {
        if (!isAtivo()) {
            throw new InvarianteVioladaException("Esta apólice foi excluída.");
        }
    }

    private void preencher(Dados d) {
        if (d.idSeguradora() == null) {
            throw new InvarianteVioladaException("Escolha a seguradora.");
        }
        if (d.vigenciaInicio() == null || d.vigenciaFim() == null) {
            throw new InvarianteVioladaException("Informe o início e o fim da vigência.");
        }
        if (d.vigenciaFim().isBefore(d.vigenciaInicio())) {
            throw new InvarianteVioladaException("O fim da vigência não pode ser antes do início.");
        }
        if (d.valor() == null || d.valor().signum() < 0) {
            throw new InvarianteVioladaException("Informe o valor da apólice.");
        }
        if (d.franquia() != null && d.franquia().signum() < 0) {
            throw new InvarianteVioladaException("A franquia não pode ser negativa.");
        }
        if (d.idCorretor() != null && d.idCorretor().equals(d.idSeguradora())) {
            throw new InvarianteVioladaException("O corretor não pode ser a própria seguradora. Deixe em branco se não houver.");
        }
        this.numero = Textos.obrigatorio(d.numero(), "número da apólice", 60);
        this.idSeguradora = d.idSeguradora();
        this.idCorretor = d.idCorretor();
        this.segurado = Textos.opcional(d.segurado(), 150);
        this.idBaseOperacional = d.idBaseOperacional();
        this.idProcesso = d.idProcesso();
        this.vigenciaInicio = d.vigenciaInicio();
        this.vigenciaFim = d.vigenciaFim();
        this.valor = d.valor().setScale(2, RoundingMode.HALF_UP);
        this.franquia = d.franquia() == null ? null : d.franquia().setScale(2, RoundingMode.HALF_UP);
        this.observacao = Textos.opcional(d.observacao(), 1000);
    }
}
