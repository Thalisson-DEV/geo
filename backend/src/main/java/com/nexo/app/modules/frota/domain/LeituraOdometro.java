package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

/**
 * Uma leitura do odômetro ou do horímetro, a fonte única de uso da frota.
 *
 * <p>O registro é somente inserção: checklist, abastecimento, manutenção, telemetria e
 * lançamento manual gravam aqui. Leitura incoerente com as vizinhas não é descartada —
 * fica {@link SituacaoLeituraOdometro#INCONSISTENTE} com o motivo, porque dado de campo
 * offline não pode se perder. Uma leitura errada é anulada com justificativa, nunca
 * apagada.</p>
 *
 * <p>A coluna {@code km} guarda o valor lido na {@link #unidade} do veículo (km ou horas).
 * Uma {@link TipoLeituraOdometro#TROCA_PAINEL} abre um novo trecho: o valor dela é o
 * inicial do painel novo, e as leituras só são comparadas dentro do mesmo trecho.</p>
 */
@Entity
@Table(name = "frota_leituras_odometro")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class LeituraOdometro extends BaseEntity {

    /** Leituras com hora no futuro além disto são recusadas (relógio do aparelho errado). */
    private static final Duration TOLERANCIA_FUTURO = Duration.ofMinutes(10);
    private static final long KM_MAXIMO = 9_999_999L;
    private static final java.time.ZoneId FUSO = java.time.ZoneId.of("America/Sao_Paulo");
    private static final java.time.format.DateTimeFormatter FORMATO_DATA =
            java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");

    @Column(name = "id_veiculo", nullable = false, updatable = false)
    private UUID idVeiculo;

    /** Valor lido, na {@link #unidade} da leitura. */
    @Column(name = "km", nullable = false, updatable = false)
    private Long km;

    @Enumerated(EnumType.STRING)
    @Column(name = "unidade", nullable = false, length = 10, updatable = false)
    private UnidadeMedicao unidade = UnidadeMedicao.KM;

    @Enumerated(EnumType.STRING)
    @Column(name = "tipo", nullable = false, length = 20, updatable = false)
    private TipoLeituraOdometro tipo = TipoLeituraOdometro.LEITURA;

    /** Na troca de painel: último valor do painel antigo menos o inicial do novo. */
    @Column(name = "deslocamento", updatable = false)
    private Long deslocamento;

    @Column(name = "lido_em", nullable = false, updatable = false)
    private OffsetDateTime lidoEm;

    @Enumerated(EnumType.STRING)
    @Column(name = "origem", nullable = false, length = 20, updatable = false)
    private OrigemLeituraOdometro origem;

    @Column(name = "id_origem", updatable = false)
    private UUID idOrigem;

    @Column(name = "id_usuario_registro", updatable = false)
    private UUID idUsuarioRegistro;

    @Enumerated(EnumType.STRING)
    @Column(name = "situacao", nullable = false, length = 20)
    private SituacaoLeituraOdometro situacao;

    @Column(name = "motivo_situacao", length = 500)
    private String motivoSituacao;

    /** Valor da leitura válida imediatamente anterior, no mesmo trecho, no momento do registro. */
    @Column(name = "km_anterior", updatable = false)
    private Long kmAnterior;

    /** Justificativa do gestor para o lançamento manual acima do limite de salto. */
    @Column(name = "justificativa_salto", length = 400)
    private String justificativaSalto;

    @Column(name = "data_anulacao")
    private OffsetDateTime dataAnulacao;

    @Column(name = "id_usuario_anulacao")
    private UUID idUsuarioAnulacao;

    @Column(name = "justificativa_anulacao", length = 1000)
    private String justificativaAnulacao;

    /**
     * Registra uma leitura classificando-a contra as leituras válidas vizinhas do mesmo trecho.
     *
     * @param unidade   unidade de medição do veículo
     * @param anterior  última leitura válida do trecho com {@code lidoEm} até o instante desta, ou nulo
     * @param posterior primeira leitura válida do trecho depois do instante desta, ou nulo (chegada fora de ordem)
     * @param limiteDia média diária, na unidade, acima da qual o salto é considerado incoerente
     */
    public static LeituraOdometro registrar(UUID idVeiculo, UnidadeMedicao unidade, long km, OffsetDateTime lidoEm,
                                            OrigemLeituraOdometro origem, UUID idOrigem, UUID idUsuario,
                                            LeituraOdometro anterior, LeituraOdometro posterior,
                                            int limiteDia) {
        if (idVeiculo == null) throw new InvarianteVioladaException("Informe o veículo.");
        Objects.requireNonNull(unidade, "A unidade da leitura é obrigatória");
        Objects.requireNonNull(origem, "A origem da leitura é obrigatória");
        if (km < 0 || km > KM_MAXIMO) {
            throw new InvarianteVioladaException(unidade == UnidadeMedicao.HORAS
                    ? "Horímetro inválido." : "Quilometragem inválida.");
        }
        if (lidoEm == null) throw new InvarianteVioladaException("Informe a data e hora da leitura.");
        if (lidoEm.isAfter(OffsetDateTime.now().plus(TOLERANCIA_FUTURO))) {
            throw new InvarianteVioladaException("A data da leitura não pode estar no futuro.");
        }
        if (origem != OrigemLeituraOdometro.MANUAL && idOrigem == null) {
            throw new InvarianteVioladaException("Leituras automáticas precisam do registro de origem.");
        }

        var leitura = new LeituraOdometro();
        leitura.idVeiculo = idVeiculo;
        leitura.km = km;
        leitura.unidade = unidade;
        leitura.lidoEm = lidoEm;
        leitura.origem = origem;
        leitura.idOrigem = idOrigem;
        leitura.idUsuarioRegistro = idUsuario;
        leitura.kmAnterior = anterior == null ? null : anterior.km;
        leitura.classificar(anterior, posterior, limiteDia);
        return leitura;
    }

    /**
     * Registra a troca de painel: o valor desta linha é o inicial do painel novo e abre um
     * trecho. O deslocamento guarda o que o painel antigo já tinha rodado para o acumulado.
     *
     * @param fechamento    último valor do painel antigo
     * @param inicial       valor do painel novo no momento da troca
     * @param unidadeNova   unidade do painel novo (a troca é o único jeito de mudar a unidade com leituras)
     * @param ultimaValida  maior leitura válida do trecho atual, ou nula se o veículo não tem leituras
     */
    public static LeituraOdometro registrarTrocaPainel(UUID idVeiculo, UnidadeMedicao unidadeNova, long fechamento,
                                                       long inicial, OffsetDateTime lidoEm, UUID idUsuario,
                                                       LeituraOdometro ultimaValida, String observacao) {
        if (idVeiculo == null) throw new InvarianteVioladaException("Informe o veículo.");
        Objects.requireNonNull(unidadeNova, "A unidade do painel novo é obrigatória");
        if (fechamento < 0 || fechamento > KM_MAXIMO || inicial < 0 || inicial > KM_MAXIMO) {
            throw new InvarianteVioladaException("Valor de painel inválido.");
        }
        if (lidoEm == null) throw new InvarianteVioladaException("Informe a data e hora da troca.");
        if (lidoEm.isAfter(OffsetDateTime.now().plus(TOLERANCIA_FUTURO))) {
            throw new InvarianteVioladaException("A data da troca não pode estar no futuro.");
        }
        boolean mesmaUnidade = ultimaValida == null || ultimaValida.unidade == unidadeNova;
        if (ultimaValida != null) {
            if (!lidoEm.isAfter(ultimaValida.lidoEm)) {
                throw new InvarianteVioladaException("A troca precisa ser depois da última leitura válida ("
                        + ultimaValida.km + " " + ultimaValida.unidade.sufixo() + " em "
                        + formatar(ultimaValida.lidoEm) + ").");
            }
            if (fechamento < ultimaValida.km) {
                throw new InvarianteVioladaException("O último valor do painel antigo não pode ser menor que a última leitura válida ("
                        + ultimaValida.km + " " + ultimaValida.unidade.sufixo() + ").");
            }
        }
        if (mesmaUnidade && inicial > fechamento) {
            throw new InvarianteVioladaException("O painel novo não pode começar acima do último valor do painel antigo.");
        }

        var troca = new LeituraOdometro();
        troca.idVeiculo = idVeiculo;
        troca.km = inicial;
        troca.unidade = unidadeNova;
        troca.tipo = TipoLeituraOdometro.TROCA_PAINEL;
        troca.lidoEm = lidoEm;
        troca.origem = OrigemLeituraOdometro.MANUAL;
        troca.idUsuarioRegistro = idUsuario;
        troca.kmAnterior = fechamento;
        // Em unidade nova o acumulado recomeça: somar km com horas não faz sentido.
        troca.deslocamento = mesmaUnidade ? fechamento - inicial : null;
        troca.situacao = SituacaoLeituraOdometro.VALIDA;
        String texto = Textos.opcional(observacao, 300);
        troca.motivoSituacao = "Troca de painel. Painel antigo encerrado em " + fechamento + " "
                + (ultimaValida == null ? unidadeNova : ultimaValida.unidade).sufixo()
                + (mesmaUnidade ? "" : "; unidade alterada para " + unidadeNova.sufixo())
                + (texto == null ? "." : ". " + texto);
        return troca;
    }

    /** Último valor do painel antigo, para a linha de troca. */
    public Long getFechamentoPainel() {
        return isTrocaPainel() ? kmAnterior : null;
    }

    public boolean isValida() {
        return situacao == SituacaoLeituraOdometro.VALIDA;
    }

    public boolean isInconsistente() {
        return situacao == SituacaoLeituraOdometro.INCONSISTENTE;
    }

    /** Descarta a leitura do cálculo de KM, guardando quem e por quê. */
    public void anular(UUID idUsuario, String justificativa) {
        if (situacao == SituacaoLeituraOdometro.ANULADA) {
            throw new InvarianteVioladaException("Esta leitura já foi anulada.");
        }
        this.justificativaAnulacao = Textos.obrigatorio(justificativa, "justificativa da anulação", 1000);
        this.situacao = SituacaoLeituraOdometro.ANULADA;
        this.dataAnulacao = OffsetDateTime.now();
        this.idUsuarioAnulacao = idUsuario;
    }

    /**
     * Lançamento manual acima do limite de salto (ex.: viagem longa sem lançamentos): o gestor
     * justifica e a leitura passa a valer. Valor menor que o anterior não entra por aqui.
     */
    public void aceitarSalto(String justificativa) {
        this.justificativaSalto = Textos.obrigatorio(justificativa, "justificativa do salto", 400);
        this.situacao = SituacaoLeituraOdometro.VALIDA;
        this.motivoSituacao = "Salto lançado pelo gestor: " + justificativaSalto;
    }

    /** Gestor conferiu a leitura inconsistente e a considera correta. */
    public void confirmar(String justificativa) {
        if (situacao != SituacaoLeituraOdometro.INCONSISTENTE) {
            throw new InvarianteVioladaException("Só leituras inconsistentes podem ser confirmadas.");
        }
        this.situacao = SituacaoLeituraOdometro.VALIDA;
        this.motivoSituacao = "Confirmada pelo gestor: "
                + Textos.obrigatorio(justificativa, "justificativa da confirmação", 400);
    }

    public boolean isTrocaPainel() {
        return tipo == TipoLeituraOdometro.TROCA_PAINEL;
    }

    private void classificar(LeituraOdometro anterior, LeituraOdometro posterior, int limiteDia) {
        String rotulo = unidade.rotulo();
        String sufixo = unidade.sufixo();
        if (anterior != null && km < anterior.km) {
            marcarInconsistente(rotulo + " menor que a leitura anterior (" + anterior.km + " " + sufixo
                    + " em " + formatar(anterior.lidoEm) + ").");
            return;
        }
        if (posterior != null && km > posterior.km) {
            marcarInconsistente(rotulo + " maior que a leitura seguinte (" + posterior.km + " " + sufixo
                    + " em " + formatar(posterior.lidoEm) + ").");
            return;
        }
        if (anterior != null && limiteDia > 0) {
            long rodado = km - anterior.km;
            double dias = Math.max(1.0, Duration.between(anterior.lidoEm, lidoEm).toMinutes() / 1440.0);
            if (rodado / dias > limiteDia) {
                marcarInconsistente(String.format(java.util.Locale.ROOT,
                        "Salto de %d %s desde a leitura anterior, acima do limite de %d %s por dia.",
                        rodado, sufixo, limiteDia, sufixo));
                return;
            }
        }
        this.situacao = SituacaoLeituraOdometro.VALIDA;
        this.motivoSituacao = null;
    }

    private static String formatar(OffsetDateTime instante) {
        return FORMATO_DATA.format(instante.atZoneSameInstant(FUSO));
    }

    private void marcarInconsistente(String motivo) {
        this.situacao = SituacaoLeituraOdometro.INCONSISTENTE;
        this.motivoSituacao = motivo;
    }
}
