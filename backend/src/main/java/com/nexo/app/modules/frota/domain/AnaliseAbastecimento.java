package com.nexo.app.modules.frota.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Alertas de aderência do abastecimento, calculados com o histórico que o caso de uso
 * reúne. Só apontam: quem aprova e quem libera decide.
 *
 * <p>As médias só valem com histórico suficiente ({@link #MINIMO_HISTORICO} tanques cheios ou
 * intervalos), para não acusar veículo novo no sistema.</p>
 */
public final class AnaliseAbastecimento {

    /** Desvio aceito no consumo em relação à média (±20%, ADR 0001). */
    static final BigDecimal TOLERANCIA_CONSUMO = new BigDecimal("0.20");
    /** R$/l acima da média da base que vira alerta. */
    static final BigDecimal TOLERANCIA_PRECO = new BigDecimal("0.10");
    public static final int MINIMO_HISTORICO = 3;

    public record Alerta(TipoAlertaAbastecimento tipo, String mensagem) {
    }

    /**
     * @param medicaoAnterior      última leitura válida do veículo antes desta
     * @param intervaloMedianoHoras intervalo usual entre abastecimentos do veículo (null sem histórico)
     * @param horasDesdeUltimo     horas desde o último abastecimento realizado (null se nunca abasteceu)
     * @param fotosRepetidas       fotos desta solicitação já usadas em outro abastecimento
     */
    public record DadosSolicitacao(UnidadeMedicao unidade, BigDecimal medicao, BigDecimal medicaoAnterior,
                                   Long intervaloMedianoHoras, Long horasDesdeUltimo, int fotosRepetidas) {
    }

    /**
     * @param litros                    combustível entregue agora
     * @param tanqueCheio               se completou o tanque
     * @param medicaoUltimoTanqueCheio  medição do último tanque cheio anterior (null se não houver)
     * @param litrosDesdeUltimoCheio    litros dos abastecimentos parciais entre o último tanque cheio e este
     * @param rendimentosAnteriores     km/l (ou l/h) dos últimos tanques cheios, do mais recente para o mais antigo
     * @param consumoReferencia         consumo de referência da ficha (km/l), usado quando falta histórico
     * @param precoUnitario             R$/l pago agora no combustível
     * @param precoMedioBase            média de R$/l do mesmo produto na base nos últimos 30 dias (null sem dados)
     */
    public record DadosRealizado(UnidadeMedicao unidade, BigDecimal medicao, BigDecimal medicaoAnterior,
                                 BigDecimal capacidadeTanque, BigDecimal litros, Boolean tanqueCheio,
                                 BigDecimal medicaoUltimoTanqueCheio, BigDecimal litrosDesdeUltimoCheio,
                                 List<BigDecimal> rendimentosAnteriores, BigDecimal consumoReferencia,
                                 String produto, BigDecimal precoUnitario, BigDecimal precoMedioBase, int fotosRepetidas) {
    }

    private AnaliseAbastecimento() {
    }

    public static List<Alerta> analisarSolicitacao(DadosSolicitacao d) {
        var alertas = new ArrayList<Alerta>();
        medicaoMenor(d.unidade(), d.medicao(), d.medicaoAnterior()).ifPresent(alertas::add);
        if (d.intervaloMedianoHoras() != null && d.horasDesdeUltimo() != null && d.intervaloMedianoHoras() > 0
                && d.horasDesdeUltimo() * 2 < d.intervaloMedianoHoras()) {
            alertas.add(new Alerta(TipoAlertaAbastecimento.FREQUENCIA_ALTA,
                    "Último abastecimento há " + duracao(d.horasDesdeUltimo()) + "; o usual deste veículo é a cada "
                            + duracao(d.intervaloMedianoHoras()) + "."));
        }
        fotoRepetida(d.fotosRepetidas()).ifPresent(alertas::add);
        return alertas;
    }

    /** Na aprovação: o combustível aprovado não pode passar do tanque sem alguém ver. */
    public static List<Alerta> analisarAprovacao(BigDecimal litrosAprovados, BigDecimal capacidadeTanque) {
        var alertas = new ArrayList<Alerta>();
        if (litrosAprovados != null && capacidadeTanque != null && capacidadeTanque.signum() > 0
                && litrosAprovados.compareTo(capacidadeTanque) > 0) {
            alertas.add(new Alerta(TipoAlertaAbastecimento.VOLUME_ACIMA_TANQUE,
                    "Aprovado " + numero(litrosAprovados, 2) + " l para um tanque de " + numero(capacidadeTanque, 0) + " l."));
        }
        return alertas;
    }

    /** Produto entregue sem preço no posto: o valor foi digitado e o cadastro precisa do preço. */
    public static Alerta postoSemPreco(String produto, String posto) {
        return new Alerta(TipoAlertaAbastecimento.POSTO_SEM_PRECO,
                "O " + posto + " não tem preço de " + produto + " cadastrado; o valor foi informado por quem abasteceu.");
    }

    public static List<Alerta> analisarRealizado(DadosRealizado d) {
        var alertas = new ArrayList<Alerta>();
        medicaoMenor(d.unidade(), d.medicao(), d.medicaoAnterior()).ifPresent(alertas::add);
        if (d.litros() != null && d.capacidadeTanque() != null && d.capacidadeTanque().signum() > 0
                && d.litros().compareTo(d.capacidadeTanque()) > 0) {
            alertas.add(new Alerta(TipoAlertaAbastecimento.VOLUME_ACIMA_TANQUE,
                    "Volume acima da capacidade do tanque: " + numero(d.litros(), 2) + " l para um tanque de "
                            + numero(d.capacidadeTanque(), 0) + " l."));
        }
        consumo(d).ifPresent(alertas::add);
        if (d.precoUnitario() != null && d.precoMedioBase() != null && d.precoMedioBase().signum() > 0) {
            var limite = d.precoMedioBase().multiply(BigDecimal.ONE.add(TOLERANCIA_PRECO));
            if (d.precoUnitario().compareTo(limite) > 0) {
                alertas.add(new Alerta(TipoAlertaAbastecimento.PRECO_ACIMA_MEDIA,
                        d.produto() + " a R$ " + numero(d.precoUnitario(), 3) + "/l, " + percentual(d.precoUnitario(), d.precoMedioBase())
                                + " acima da média da base (R$ " + numero(d.precoMedioBase(), 3) + "/l)."));
            }
        }
        fotoRepetida(d.fotosRepetidas()).ifPresent(alertas::add);
        return alertas;
    }

    /**
     * Rendimento do tanque cheio: medição percorrida desde o último tanque cheio pelos litros
     * colocados desde então (este incluído). Em veículos por horas, litros por hora.
     */
    public static BigDecimal rendimento(UnidadeMedicao unidade, BigDecimal percorrido, BigDecimal litros) {
        if (percorrido == null || litros == null || percorrido.signum() <= 0 || litros.signum() <= 0) {
            return null;
        }
        return unidade == UnidadeMedicao.HORAS
                ? litros.divide(percorrido, 2, RoundingMode.HALF_UP)
                : percorrido.divide(litros, 2, RoundingMode.HALF_UP);
    }

    private static java.util.Optional<Alerta> consumo(DadosRealizado d) {
        if (!Boolean.TRUE.equals(d.tanqueCheio()) || d.medicaoUltimoTanqueCheio() == null || d.medicao() == null) {
            return java.util.Optional.empty();
        }
        var litros = d.litros().add(d.litrosDesdeUltimoCheio() == null ? BigDecimal.ZERO : d.litrosDesdeUltimoCheio());
        var atual = rendimento(d.unidade(), d.medicao().subtract(d.medicaoUltimoTanqueCheio()), litros);
        if (atual == null) {
            return java.util.Optional.empty();
        }
        var base = referencia(d);
        if (base == null || base.signum() <= 0) {
            return java.util.Optional.empty();
        }
        var desvio = atual.subtract(base).divide(base, 4, RoundingMode.HALF_UP);
        if (desvio.abs().compareTo(TOLERANCIA_CONSUMO) <= 0) {
            return java.util.Optional.empty();
        }
        var unidade = d.unidade() == UnidadeMedicao.HORAS ? "l/h" : "km/l";
        var sentido = desvio.signum() < 0 ? "abaixo" : "acima";
        return java.util.Optional.of(new Alerta(TipoAlertaAbastecimento.CONSUMO_FORA_PADRAO,
                "Consumo de " + numero(atual, 2) + " " + unidade + ", " + numero(desvio.abs().movePointRight(2), 0) + "% " + sentido
                        + " da média (" + numero(base, 2) + " " + unidade + ")."));
    }

    /** Média dos últimos 5 tanques cheios; sem histórico suficiente, o consumo de referência da ficha (só km/l). */
    private static BigDecimal referencia(DadosRealizado d) {
        var historico = d.rendimentosAnteriores() == null ? List.<BigDecimal>of()
                : d.rendimentosAnteriores().stream().filter(java.util.Objects::nonNull).limit(5).toList();
        if (historico.size() >= MINIMO_HISTORICO) {
            return historico.stream().reduce(BigDecimal.ZERO, BigDecimal::add)
                    .divide(BigDecimal.valueOf(historico.size()), 2, RoundingMode.HALF_UP);
        }
        return d.unidade() == UnidadeMedicao.HORAS ? null : d.consumoReferencia();
    }

    private static java.util.Optional<Alerta> medicaoMenor(UnidadeMedicao unidade, BigDecimal medicao, BigDecimal anterior) {
        if (medicao == null || anterior == null || medicao.compareTo(anterior) >= 0) {
            return java.util.Optional.empty();
        }
        var sufixo = unidade == UnidadeMedicao.HORAS ? " h" : " km";
        return java.util.Optional.of(new Alerta(TipoAlertaAbastecimento.MEDICAO_MENOR,
                "Medição informada (" + numero(medicao, 0) + sufixo + ") menor que a última registrada (" + numero(anterior, 0) + sufixo + ")."));
    }

    private static java.util.Optional<Alerta> fotoRepetida(int repetidas) {
        return repetidas <= 0 ? java.util.Optional.empty() : java.util.Optional.of(new Alerta(TipoAlertaAbastecimento.FOTO_REPETIDA,
                repetidas == 1 ? "Uma foto já foi usada em outro abastecimento." : repetidas + " fotos já foram usadas em outros abastecimentos."));
    }

    private static String duracao(long horas) {
        if (horas < 48) {
            return horas == 1 ? "1 hora" : horas + " horas";
        }
        long dias = Math.round(horas / 24.0);
        return dias + " dias";
    }

    private static String percentual(BigDecimal valor, BigDecimal media) {
        return numero(valor.subtract(media).divide(media, 4, RoundingMode.HALF_UP).movePointRight(2), 0) + "%";
    }

    static String numero(BigDecimal valor, int casas) {
        var formato = new DecimalFormat(casas == 0 ? "#,##0" : "#,##0." + "0".repeat(casas), DecimalFormatSymbols.getInstance(Locale.of("pt", "BR")));
        return formato.format(valor.setScale(casas, RoundingMode.HALF_UP));
    }
}
