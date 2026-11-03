package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.Column;
import jakarta.persistence.Embedded;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.Generated;
import org.hibernate.generator.EventType;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Pneu da frota, identificado pela marca de fogo. Fica no almoxarifado (disponível), montado
 * numa posição do diagrama de um veículo, no reparo, na reforma ou descartado.
 *
 * <p>O km da montagem é o acumulado do veículo (soma as trocas de painel), então o km rodado
 * continua certo mesmo se o painel for trocado com o pneu montado. A vida conta as reformas:
 * cada retorno de reforma soma uma vida e zera o km da vida.</p>
 */
@Entity
@Table(name = "frota_pneus")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Pneu extends BaseEntity {

    private static final Pattern DOT = Pattern.compile("^\\d{4}$");

    @Generated(event = EventType.INSERT)
    @Column(name = "numero", nullable = false, insertable = false, updatable = false)
    private Long numero;

    @Column(name = "marca_fogo", nullable = false, length = 30)
    private String marcaFogo;

    @Column(name = "numero_serie", length = 60)
    private String numeroSerie;

    @Column(name = "marca", nullable = false, length = 60)
    private String marca;

    @Column(name = "modelo", length = 80)
    private String modelo;

    @Column(name = "largura")
    private Integer largura;

    @Column(name = "perfil")
    private Integer perfil;

    @Column(name = "aro", length = 10)
    private String aro;

    @Column(name = "radial", nullable = false)
    private boolean radial = true;

    @Column(name = "com_camara", nullable = false)
    private boolean comCamara;

    @Column(name = "indice_carga", length = 10)
    private String indiceCarga;

    @Column(name = "indice_velocidade", length = 5)
    private String indiceVelocidade;

    @Column(name = "lonas")
    private Integer lonas;

    /** Semana e ano de fabricação (DOT), ex.: 2324. */
    @Column(name = "dot", length = 4)
    private String dot;

    @Column(name = "id_fornecedor")
    private UUID idFornecedor;

    @Column(name = "nota_fiscal", length = 60)
    private String notaFiscal;

    @Column(name = "data_compra")
    private LocalDate dataCompra;

    @Column(name = "valor_compra", precision = 14, scale = 2)
    private BigDecimal valorCompra;

    @Column(name = "sulco_inicial_mm", precision = 4, scale = 1)
    private BigDecimal sulcoInicialMm;

    @Column(name = "sulco_atual_mm", precision = 4, scale = 1)
    private BigDecimal sulcoAtualMm;

    @Column(name = "pressao_recomendada_psi")
    private Integer pressaoRecomendadaPsi;

    @Column(name = "vida", nullable = false)
    private int vida;

    /** km da vida atual até a última desmontagem (o trecho montado agora soma à parte). */
    @Column(name = "km_vida", nullable = false)
    private int kmVida;

    @Column(name = "km_total", nullable = false)
    private int kmTotal;

    @Enumerated(EnumType.STRING)
    @Column(name = "situacao", nullable = false, length = 20)
    private SituacaoPneu situacao;

    /** Almoxarifado da frota onde o pneu está guardado (módulo estoque). */
    @Column(name = "id_estoque")
    private UUID idEstoque;

    @Column(name = "id_veiculo")
    private UUID idVeiculo;

    @Column(name = "placa", length = 10)
    private String placa;

    @Column(name = "posicao", length = 5)
    private String posicao;

    @Column(name = "montado_em")
    private OffsetDateTime montadoEm;

    /** km acumulado do veículo na montagem. */
    @Column(name = "km_montagem")
    private Integer kmMontagem;

    @Column(name = "id_fornecedor_servico")
    private UUID idFornecedorServico;

    @Column(name = "enviado_em")
    private OffsetDateTime enviadoEm;

    @Column(name = "descartado_em")
    private OffsetDateTime descartadoEm;

    @Column(name = "motivo_descarte", length = 300)
    private String motivoDescarte;

    @Column(name = "observacao", length = 1000)
    private String observacao;

    @Embedded
    private ReferenciaExterna referenciaExterna;

    public record Dados(String marcaFogo, String numeroSerie, String marca, String modelo, Integer largura, Integer perfil,
                        String aro, boolean radial, boolean comCamara, String indiceCarga, String indiceVelocidade,
                        Integer lonas, String dot, UUID idFornecedor, String notaFiscal, LocalDate dataCompra,
                        BigDecimal valorCompra, BigDecimal sulcoInicialMm, Integer pressaoRecomendadaPsi, String observacao) {
    }

    /** Pneu novo (ou usado comprado), guardado num almoxarifado. */
    public static Pneu cadastrar(Dados dados, int vida, int kmVida, BigDecimal sulcoAtual, UUID idEstoque) {
        var pneu = new Pneu();
        pneu.preencher(dados);
        if (vida < 0 || kmVida < 0) {
            throw new InvarianteVioladaException("Vida e km da vida não podem ser negativos.");
        }
        pneu.vida = vida;
        pneu.kmVida = kmVida;
        pneu.kmTotal = kmVida;
        pneu.sulcoAtualMm = sulcoAtual != null ? medida(sulcoAtual, "sulco atual") : pneu.sulcoInicialMm;
        pneu.situacao = SituacaoPneu.DISPONIVEL;
        pneu.idEstoque = idEstoque;
        return pneu;
    }

    public void atualizar(Dados dados) {
        exigirNaoDescartado();
        preencher(dados);
    }

    public void vincularOrigemExterna(ReferenciaExterna referencia) {
        ReferenciaExterna.exigirVazia(referenciaExterna);
        this.referenciaExterna = referencia;
    }

    // ── Montagem ─────────────────────────────────────────────────────────────────────

    public void montar(FichaVeiculo ficha, String posicao, long kmAcumulado, OffsetDateTime quando) {
        if (situacao != SituacaoPneu.DISPONIVEL) {
            throw new InvarianteVioladaException("O pneu " + marcaFogo + " está " + situacao.getRotulo().toLowerCase(Locale.ROOT)
                    + " e não pode ser montado.");
        }
        var diagrama = ficha.diagrama();
        if (diagrama == null) {
            throw new InvarianteVioladaException("Defina o diagrama de pneus do " + ficha.getPlaca() + " antes de montar.");
        }
        this.posicao = diagrama.posicao(posicao).codigo();
        this.idVeiculo = ficha.getIdVeiculo();
        this.placa = ficha.getPlaca();
        this.kmMontagem = (int) kmAcumulado;
        this.montadoEm = quando;
        this.situacao = SituacaoPneu.EM_USO;
        this.idEstoque = null;
    }

    /**
     * Tira do veículo e soma o trecho rodado na vida e no total. Fica disponível até o destino
     * (almoxarifado, reparo, reforma, descarte ou outra posição).
     *
     * @return km rodado desde a montagem
     */
    public int desmontar(long kmAcumulado) {
        exigirEmUso();
        int rodado = kmRodadoMontado(kmAcumulado);
        if (kmAcumulado < kmMontagem) {
            throw new InvarianteVioladaException("O km informado (" + kmAcumulado + ") é menor que o da montagem do pneu "
                    + marcaFogo + " (" + kmMontagem + ").");
        }
        this.kmVida += rodado;
        this.kmTotal += rodado;
        this.idVeiculo = null;
        this.placa = null;
        this.posicao = null;
        this.montadoEm = null;
        this.kmMontagem = null;
        this.situacao = SituacaoPneu.DISPONIVEL;
        return rodado;
    }

    /** km rodado no trecho montado agora (zero se não está montado ou o km é anterior). */
    public int kmRodadoMontado(long kmAcumuladoAtual) {
        if (situacao != SituacaoPneu.EM_USO || kmMontagem == null) {
            return 0;
        }
        return (int) Math.max(0, kmAcumuladoAtual - kmMontagem);
    }

    public void guardar(UUID idEstoque) {
        exigirDisponivel("guardado");
        this.idEstoque = idEstoque;
    }

    // ── Reparo e reforma ─────────────────────────────────────────────────────────────

    public void enviarReparo(UUID idFornecedor, OffsetDateTime quando) {
        enviar(SituacaoPneu.EM_REPARO, idFornecedor, quando);
    }

    public void enviarReforma(UUID idFornecedor, OffsetDateTime quando) {
        enviar(SituacaoPneu.EM_REFORMA, idFornecedor, quando);
    }

    /** Volta do reparo para o almoxarifado; o sulco medido no retorno é opcional. */
    public void retornarReparo(UUID idEstoque, BigDecimal sulco) {
        exigirSituacao(SituacaoPneu.EM_REPARO, "voltar do reparo");
        if (sulco != null) {
            this.sulcoAtualMm = medida(sulco, "sulco");
        }
        voltarAoEstoque(idEstoque);
    }

    /** Volta da reforma (recapagem): nova vida, km da vida zerado e sulco novo. */
    public void retornarReforma(UUID idEstoque, BigDecimal sulcoNovo) {
        exigirSituacao(SituacaoPneu.EM_REFORMA, "voltar da reforma");
        if (sulcoNovo == null) {
            throw new InvarianteVioladaException("Informe o sulco do pneu reformado.");
        }
        this.vida += 1;
        this.kmVida = 0;
        this.sulcoAtualMm = medida(sulcoNovo, "sulco");
        voltarAoEstoque(idEstoque);
    }

    public void descartar(String motivo, OffsetDateTime quando) {
        if (situacao == SituacaoPneu.EM_USO) {
            throw new InvarianteVioladaException("Desmonte o pneu " + marcaFogo + " antes de descartar.");
        }
        exigirNaoDescartado();
        this.motivoDescarte = Textos.obrigatorio(motivo, "motivo do descarte", 300);
        this.descartadoEm = quando;
        this.situacao = SituacaoPneu.DESCARTADO;
        this.idEstoque = null;
        this.idFornecedorServico = null;
        this.enviadoEm = null;
    }

    /** Medição de sulco (inspeção): vale o menor sulco medido. */
    public void registrarSulco(BigDecimal sulco) {
        exigirNaoDescartado();
        this.sulcoAtualMm = medida(sulco, "sulco");
    }

    public boolean isSulcoNoLimite(BigDecimal minimo) {
        return sulcoAtualMm != null && minimo != null && sulcoAtualMm.compareTo(minimo) <= 0;
    }

    public String medida() {
        StringBuilder texto = new StringBuilder();
        if (largura != null) {
            texto.append(largura);
            if (perfil != null) {
                texto.append('/').append(perfil);
            }
        }
        if (aro != null) {
            texto.append(texto.isEmpty() ? "" : " ").append(radial ? "R" : "").append(aro);
        }
        return texto.isEmpty() ? null : texto.toString();
    }

    // ── Apoio ────────────────────────────────────────────────────────────────────────

    private void enviar(SituacaoPneu destino, UUID idFornecedor, OffsetDateTime quando) {
        exigirDisponivel(destino == SituacaoPneu.EM_REPARO ? "enviado ao reparo" : "enviado à reforma");
        this.situacao = destino;
        this.idFornecedorServico = idFornecedor;
        this.enviadoEm = quando;
        this.idEstoque = null;
    }

    private void voltarAoEstoque(UUID idEstoque) {
        this.situacao = SituacaoPneu.DISPONIVEL;
        this.idEstoque = idEstoque;
        this.idFornecedorServico = null;
        this.enviadoEm = null;
    }

    private void preencher(Dados d) {
        this.marcaFogo = Textos.obrigatorio(d.marcaFogo(), "marca de fogo", 30).toUpperCase(Locale.ROOT);
        this.numeroSerie = Textos.opcional(d.numeroSerie(), 60);
        this.marca = Textos.obrigatorio(d.marca(), "marca do pneu", 60);
        this.modelo = Textos.opcional(d.modelo(), 80);
        this.largura = positivo(d.largura(), "largura");
        this.perfil = positivo(d.perfil(), "perfil");
        this.aro = Textos.opcional(d.aro(), 10);
        this.radial = d.radial();
        this.comCamara = d.comCamara();
        this.indiceCarga = Textos.opcional(d.indiceCarga(), 10);
        this.indiceVelocidade = maiusculo(Textos.opcional(d.indiceVelocidade(), 5));
        this.lonas = positivo(d.lonas(), "lonas");
        String dotInformado = Textos.opcional(d.dot(), 4);
        if (dotInformado != null && !DOT.matcher(dotInformado).matches()) {
            throw new InvarianteVioladaException("O DOT tem 4 números: semana e ano (ex.: 2324).");
        }
        this.dot = dotInformado;
        this.idFornecedor = d.idFornecedor();
        this.notaFiscal = Textos.opcional(d.notaFiscal(), 60);
        this.dataCompra = d.dataCompra();
        if (d.valorCompra() != null && d.valorCompra().signum() < 0) {
            throw new InvarianteVioladaException("O valor de compra não pode ser negativo.");
        }
        this.valorCompra = d.valorCompra();
        this.sulcoInicialMm = d.sulcoInicialMm() == null ? null : medida(d.sulcoInicialMm(), "sulco inicial");
        this.pressaoRecomendadaPsi = positivo(d.pressaoRecomendadaPsi(), "pressão recomendada");
        this.observacao = Textos.opcional(d.observacao(), 1000);
    }

    private void exigirEmUso() {
        exigirSituacao(SituacaoPneu.EM_USO, "ser desmontado");
    }

    private void exigirDisponivel(String acao) {
        if (situacao != SituacaoPneu.DISPONIVEL) {
            throw new InvarianteVioladaException("O pneu " + marcaFogo + " está " + situacao.getRotulo().toLowerCase(Locale.ROOT)
                    + " e não pode ser " + acao + ".");
        }
    }

    private void exigirSituacao(SituacaoPneu esperada, String acao) {
        if (situacao != esperada) {
            throw new InvarianteVioladaException("O pneu " + marcaFogo + " está " + situacao.getRotulo().toLowerCase(Locale.ROOT)
                    + " e não pode " + acao + ".");
        }
    }

    private void exigirNaoDescartado() {
        if (situacao == SituacaoPneu.DESCARTADO) {
            throw new InvarianteVioladaException("O pneu " + marcaFogo + " foi descartado.");
        }
    }

    private static BigDecimal medida(BigDecimal valor, String campo) {
        if (valor.signum() < 0 || valor.compareTo(new BigDecimal("40")) > 0) {
            throw new InvarianteVioladaException("O " + campo + " deve estar entre 0 e 40 mm.");
        }
        return valor;
    }

    private static Integer positivo(Integer valor, String campo) {
        if (valor != null && valor <= 0) {
            throw new InvarianteVioladaException("Informe " + campo + " maior que zero.");
        }
        return valor;
    }

    private static String maiusculo(String valor) {
        return valor == null ? null : valor.toUpperCase(Locale.ROOT);
    }
}
