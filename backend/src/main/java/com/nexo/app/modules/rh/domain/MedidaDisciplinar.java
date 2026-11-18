package com.nexo.app.modules.rh.domain;

import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.infrastructure.persistence.CryptoConverterImpl;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Medida disciplinar aplicada a um colaborador, por qualquer motivo e de qualquer origem.
 *
 * <p>O lançamento acontece depois que a medida foi aplicada ao colaborador: ela já nasce
 * aplicada, com a data da aplicação. O documento assinado, se houver, vai como anexo. A medida
 * pode ser corrigida ou cancelada com justificativa; nunca é excluída, para o histórico
 * disciplinar ficar completo.</p>
 *
 * <p>A base é a do colaborador quando a medida foi registrada: a lista por base continua certa
 * depois de uma transferência. A origem de outro módulo (ex.: a multa da frota) é opaca.</p>
 */
@Entity
@Table(name = "rh_medidas_disciplinares")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MedidaDisciplinar extends BaseEntity {

    /** Limite da suspensão disciplinar (CLT, art. 474). */
    public static final int MAXIMO_DIAS_SUSPENSAO = 30;
    static final ZoneId FUSO = ZoneId.of("America/Sao_Paulo");

    @Column(name = "id_colaborador", nullable = false)
    private UUID idColaborador;

    @Column(name = "id_base_operacional")
    private UUID idBaseOperacional;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_tipo", nullable = false)
    private TipoMedidaDisciplinar tipo;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_motivo", nullable = false)
    private MotivoMedidaDisciplinar motivo;

    @Column(name = "data_fato", nullable = false)
    private LocalDate dataFato;

    @Column(name = "data_aplicacao", nullable = false)
    private LocalDate dataAplicacao;

    @Convert(converter = CryptoConverterImpl.class)
    @Column(name = "descricao", nullable = false, columnDefinition = "TEXT")
    private String descricao; // 🔒 Cifrado no banco

    @Column(name = "dias_suspensao")
    private Integer diasSuspensao;

    @Column(name = "inicio_suspensao")
    private LocalDate inicioSuspensao;

    @Column(name = "fim_suspensao")
    private LocalDate fimSuspensao;

    @Enumerated(EnumType.STRING)
    @Column(name = "situacao", nullable = false, length = 20)
    private SituacaoMedidaDisciplinar situacao;

    @Column(name = "id_usuario_aplicacao")
    private UUID idUsuarioAplicacao;

    @Column(name = "aplicada_em")
    private OffsetDateTime aplicadaEm;

    @Enumerated(EnumType.STRING)
    @Column(name = "origem", nullable = false, length = 20, updatable = false)
    private OrigemMedidaDisciplinar origem;

    @Column(name = "id_origem", updatable = false)
    private UUID idOrigem;

    @Column(name = "sistema_origem", length = 20, updatable = false)
    private String sistemaOrigem;

    @Column(name = "id_externo", length = 80, updatable = false)
    private String idExterno;

    @Column(name = "cancelada_em")
    private OffsetDateTime canceladaEm;

    @Column(name = "id_usuario_cancelamento")
    private UUID idUsuarioCancelamento;

    @Column(name = "justificativa_cancelamento", length = 500)
    private String justificativaCancelamento;

    /** O que o formulário informa; colaborador e base já conferidos pelo caso de uso. */
    public record Dados(UUID idColaborador, UUID idBaseOperacional, TipoMedidaDisciplinar tipo, MotivoMedidaDisciplinar motivo,
                        LocalDate dataFato, LocalDate dataAplicacao, String descricao, Integer diasSuspensao,
                        LocalDate inicioSuspensao) {
    }

    /** Lançada no RH depois de aplicada ao colaborador: nasce aplicada. */
    public static MedidaDisciplinar registrar(Dados dados, UUID idUsuario, OffsetDateTime agora) {
        var medida = new MedidaDisciplinar();
        medida.origem = OrigemMedidaDisciplinar.MANUAL;
        medida.situacao = SituacaoMedidaDisciplinar.APLICADA;
        medida.preencher(dados, agora.atZoneSameInstant(FUSO).toLocalDate());
        medida.idUsuarioAplicacao = idUsuario;
        medida.aplicadaEm = agora;
        return medida;
    }

    /** Pedida por outro módulo (ex.: a multa da frota). O id da origem é só repassado no evento. */
    public static MedidaDisciplinar registrarPorOrigem(Dados dados, OrigemMedidaDisciplinar origem, UUID idOrigem, UUID idUsuario,
                                                       OffsetDateTime agora) {
        if (origem == null || origem == OrigemMedidaDisciplinar.MANUAL || origem == OrigemMedidaDisciplinar.IMPORTACAO) {
            throw new InvarianteVioladaException("Origem da medida não aceita: " + origem + ".");
        }
        if (idOrigem == null) {
            throw new InvarianteVioladaException("Informe o registro de origem da medida.");
        }
        var medida = registrar(dados, idUsuario, agora);
        medida.origem = origem;
        medida.idOrigem = idOrigem;
        return medida;
    }

    /** Correção dos dados lançados; a cancelada fica como está. */
    public void editar(Dados dados, LocalDate hoje) {
        exigirNaoCancelada();
        preencher(dados, hoje);
    }

    /** Cancela com justificativa. A medida fica no histórico e deixa de contar para a reincidência. */
    public void cancelar(String justificativa, UUID idUsuario, OffsetDateTime agora) {
        if (situacao == SituacaoMedidaDisciplinar.CANCELADA) {
            throw new InvarianteVioladaException("Esta medida já foi cancelada.");
        }
        this.justificativaCancelamento = TextosRh.obrigatorio(justificativa, "Informe a justificativa do cancelamento.", 500);
        this.situacao = SituacaoMedidaDisciplinar.CANCELADA;
        this.canceladaEm = agora;
        this.idUsuarioCancelamento = idUsuario;
    }

    /** Dias entre o fato e a aplicação. */
    public long diasDesdeOFato() {
        return Math.max(0, ChronoUnit.DAYS.between(dataFato, dataAplicacao));
    }

    /** Aplicação longe do fato: risco de perdão tácito. Só avisa, nunca bloqueia. */
    public boolean foraDaImediatidade(int diasLimite) {
        return situacao != SituacaoMedidaDisciplinar.CANCELADA && diasDesdeOFato() > diasLimite;
    }

    public boolean contaParaReincidencia() {
        return situacao.contaParaReincidencia();
    }

    /** Correção e anexos valem enquanto a medida não foi cancelada. */
    public void exigirNaoCancelada() {
        if (situacao == SituacaoMedidaDisciplinar.CANCELADA) {
            throw new InvarianteVioladaException("Esta medida foi cancelada.");
        }
    }

    private void preencher(Dados d, LocalDate hoje) {
        if (d.idColaborador() == null) {
            throw new InvarianteVioladaException("Informe o colaborador.");
        }
        if (d.tipo() == null || !d.tipo().isAtivo()) {
            throw new InvarianteVioladaException("Escolha um tipo de medida ativo.");
        }
        if (d.motivo() == null || !d.motivo().isAtivo()) {
            throw new InvarianteVioladaException("Escolha um motivo ativo.");
        }
        if (d.dataFato() == null) {
            throw new InvarianteVioladaException("Informe a data do fato.");
        }
        if (d.dataFato().isAfter(hoje)) {
            throw new InvarianteVioladaException("A data do fato não pode ser no futuro.");
        }
        if (d.dataAplicacao() == null) {
            throw new InvarianteVioladaException("Informe a data em que a medida foi aplicada.");
        }
        if (d.dataAplicacao().isBefore(d.dataFato())) {
            throw new InvarianteVioladaException("A aplicação não pode ser antes do fato.");
        }
        if (d.dataAplicacao().isAfter(hoje)) {
            throw new InvarianteVioladaException("A data da aplicação não pode ser no futuro.");
        }
        String texto = TextosRh.obrigatorio(d.descricao(), "Descreva os fatos.", 4000);
        if (d.tipo().isExigePeriodo()) {
            preencherSuspensao(d.diasSuspensao(), d.inicioSuspensao(), d.dataFato());
        } else {
            this.diasSuspensao = null;
            this.inicioSuspensao = null;
            this.fimSuspensao = null;
        }
        this.idColaborador = d.idColaborador();
        this.idBaseOperacional = d.idBaseOperacional();
        this.tipo = d.tipo();
        this.motivo = d.motivo();
        this.dataFato = d.dataFato();
        this.dataAplicacao = d.dataAplicacao();
        this.descricao = texto;
    }

    private void preencherSuspensao(Integer dias, LocalDate inicio, LocalDate fato) {
        List<String> faltando = new ArrayList<>(2);
        if (dias == null) faltando.add("os dias");
        if (inicio == null) faltando.add("o início");
        if (!faltando.isEmpty()) {
            throw new InvarianteVioladaException("Na suspensão, informe " + String.join(" e ", faltando) + " da suspensão.");
        }
        if (dias < 1 || dias > MAXIMO_DIAS_SUSPENSAO) {
            throw new InvarianteVioladaException("A suspensão deve ter de 1 a " + MAXIMO_DIAS_SUSPENSAO + " dias.");
        }
        if (inicio.isBefore(fato)) {
            throw new InvarianteVioladaException("A suspensão não pode começar antes do fato.");
        }
        this.diasSuspensao = dias;
        this.inicioSuspensao = inicio;
        this.fimSuspensao = inicio.plusDays(dias - 1L);
    }
}
