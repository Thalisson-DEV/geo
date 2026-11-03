package com.nexo.app.modules.frota.domain;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.function.Predicate;

/**
 * Regras que transformam a série de posições de um rastreador em trechos (andando, ligado parado,
 * desligado), paradas e resumos. Funções puras: a série chega em ordem e nada é gravado aqui.
 *
 * <p>A série grava toda leitura com o veículo andando ou mudando a ignição, e no máximo a cada
 * 30 minutos parado ({@link RastreadorTelemetria#deveGravarPosicao}). Por isso o estado de um
 * trecho é o do ponto que o abre: ele vale até a próxima mudança gravada.</p>
 */
public final class AnaliseTrajeto {

    /**
     * Sem posição por mais que isto, o tempo ligado ou andando para de contar: o rastreador
     * perdeu o sinal e não se sabe o que aconteceu no intervalo. O km do odômetro continua valendo.
     */
    public static final Duration LACUNA_MAXIMA = Duration.ofMinutes(40);
    /**
     * A velocidade de um ponto descreve o veículo só até a próxima leitura (a cada 2 minutos). Num
     * intervalo maior, quem diz se ele andou é o deslocamento: a última leitura a 6 km/h antes de
     * uma hora sem sinal não é uma hora andando.
     */
    public static final Duration VALIDADE_VELOCIDADE = Duration.ofMinutes(5);
    /** Parada menor que isto é trânsito (semáforo, manobra), não parada. */
    public static final Duration PARADA_MINIMA = Duration.ofMinutes(3);
    /** Velocidade acima da qual um odômetro que avançou é descartado como salto de calibração. */
    private static final double VELOCIDADE_MAXIMA_KMH = 200;
    /** Deslocamento mínimo entre dois pontos para contar como andando sem a velocidade informada. */
    private static final double DESLOCAMENTO_MINIMO_METROS = 200;
    /** Deslocamento em linha reta abaixo disto é tremor do GPS com o veículo parado. */
    private static final double RUIDO_GPS_METROS = 50;
    private static final double RAIO_TERRA_METROS = 6_371_000;
    /** Intervalo da série gravada aqui com o veículo andando; a leitura densa é espaçada até ele. */
    private static final Duration INTERVALO_SERIE = Duration.ofMinutes(2);

    public enum Estado { MOVIMENTO, LIGADO_PARADO, DESLIGADO }

    /** Ponto da série, já em ordem cronológica. Odômetro em metros, quando o provedor informa. */
    public record Ponto(OffsetDateTime em, Double latitude, Double longitude, Double velocidadeKmh, Boolean ignicao,
                        Long odometroMetros) {

        public boolean temCoordenada() {
            return latitude != null && longitude != null;
        }
    }

    /** Intervalo entre dois pontos. {@code minutos} já descontou as lacunas de sinal. */
    public record Trecho(Ponto inicio, Ponto fim, Estado estado, double metros, double minutos) {

        public OffsetDateTime meio() {
            return inicio.em().plus(Duration.between(inicio.em(), fim.em()).dividedBy(2));
        }
    }

    /** Tempo parado num lugar: a posição é a do ponto onde o veículo parou. */
    public record Parada(OffsetDateTime de, OffsetDateTime ate, double latitude, double longitude,
                         double minutos, double minutosLigado) {
    }

    public record Resumo(double km, double minutosMovimento, double minutosLigadoParado, double kmForaExpediente,
                         double minutosForaExpediente, OffsetDateTime primeiraPartida, OffsetDateTime ultimaParada) {
    }

    /** Posição estimada num instante: interpolada entre dois pontos próximos, ou a do ponto mais perto. */
    public record PosicaoNoInstante(double latitude, double longitude, Double velocidadeKmh) {
    }

    private AnaliseTrajeto() {
    }

    /**
     * Leitura densa do histórico do provedor (uma a cada poucos segundos) no ritmo da série gravada:
     * fica o ponto que se afastou mais que o ruído do GPS, o que mudou ignição ou movimento e um a
     * cada 2 minutos parado, além do último. Sem isso, cada par de pontos a 6 s fica abaixo do
     * ruído e o km some.
     */
    public static List<Ponto> espacarLeituraDensa(List<Ponto> pontos) {
        if (pontos.size() <= 2) return pontos;
        var resultado = new ArrayList<Ponto>();
        Ponto ultimo = null;
        for (int i = 0; i < pontos.size(); i++) {
            Ponto p = pontos.get(i);
            if (!p.temCoordenada()) continue;
            boolean manter = ultimo == null || i == pontos.size() - 1
                    || Duration.between(ultimo.em(), p.em()).compareTo(INTERVALO_SERIE) >= 0
                    || distanciaMetros(ultimo.latitude(), ultimo.longitude(), p.latitude(), p.longitude()) >= RUIDO_GPS_METROS
                    || !java.util.Objects.equals(ultimo.ignicao(), p.ignicao())
                    || andando(ultimo) != andando(p);
            if (manter) {
                resultado.add(p);
                ultimo = p;
            }
        }
        return resultado;
    }

    private static boolean andando(Ponto p) {
        return p.velocidadeKmh() != null && p.velocidadeKmh() > RastreadorTelemetria.VELOCIDADE_MOVIMENTO_KMH;
    }

    public static List<Trecho> trechos(List<Ponto> pontos) {
        var trechos = new ArrayList<Trecho>();
        for (int i = 1; i < pontos.size(); i++) {
            Ponto a = pontos.get(i - 1);
            Ponto b = pontos.get(i);
            Duration dt = Duration.between(a.em(), b.em());
            if (dt.isNegative() || dt.isZero()) continue;
            double horas = dt.toMillis() / 3_600_000.0;
            double metros = metros(a, b, horas);
            boolean velocidadeVale = dt.compareTo(VALIDADE_VELOCIDADE) <= 0
                    && a.velocidadeKmh() != null && a.velocidadeKmh() > RastreadorTelemetria.VELOCIDADE_MOVIMENTO_KMH;
            boolean andando = velocidadeVale
                    || (metros > DESLOCAMENTO_MINIMO_METROS && metros / 1000 / horas > RastreadorTelemetria.VELOCIDADE_MOVIMENTO_KMH);
            Estado estado = andando ? Estado.MOVIMENTO
                    : Boolean.TRUE.equals(a.ignicao()) ? Estado.LIGADO_PARADO : Estado.DESLIGADO;
            double minutos = dt.toMillis() / 60_000.0;
            if (estado != Estado.DESLIGADO && dt.compareTo(LACUNA_MAXIMA) > 0) {
                minutos = LACUNA_MAXIMA.toMinutes();
            }
            trechos.add(new Trecho(a, b, estado, metros, minutos));
        }
        return trechos;
    }

    /**
     * Odômetro quando os dois pontos têm e ele avançou de forma plausível; senão, a distância em
     * linha reta. Há rastreador que segura o odômetro por vários minutos com o veículo andando:
     * odômetro parado não é prova de veículo parado. A linha reta abaixo do ruído do GPS é zero.
     */
    private static double metros(Ponto a, Ponto b, double horas) {
        if (a.odometroMetros() != null && b.odometroMetros() != null) {
            long delta = b.odometroMetros() - a.odometroMetros();
            if (delta > 0 && delta / 1000.0 <= Math.max(horas, 1.0 / 60) * VELOCIDADE_MAXIMA_KMH) {
                return delta;
            }
        }
        if (!a.temCoordenada() || !b.temCoordenada()) return 0;
        double reta = distanciaMetros(a.latitude(), a.longitude(), b.latitude(), b.longitude());
        return reta < RUIDO_GPS_METROS ? 0 : reta;
    }

    /** Resumo dos trechos; o expediente decide o que conta como fora de hora (pelo meio do trecho). */
    public static Resumo resumir(List<Trecho> trechos, Predicate<OffsetDateTime> dentroDoExpediente) {
        double metros = 0;
        double movimento = 0;
        double ligado = 0;
        double metrosFora = 0;
        double minutosFora = 0;
        OffsetDateTime partida = null;
        OffsetDateTime parada = null;
        for (Trecho t : trechos) {
            metros += t.metros();
            switch (t.estado()) {
                case MOVIMENTO -> {
                    movimento += t.minutos();
                    if (partida == null) partida = t.inicio().em();
                    parada = t.fim().em();
                    if (!dentroDoExpediente.test(t.meio())) {
                        metrosFora += t.metros();
                        minutosFora += t.minutos();
                    }
                }
                case LIGADO_PARADO -> ligado += t.minutos();
                case DESLIGADO -> { }
            }
        }
        return new Resumo(metros / 1000, movimento, ligado, metrosFora / 1000, minutosFora, partida, parada);
    }

    /** Paradas de pelo menos {@link #PARADA_MINIMA}: trechos seguidos sem movimento, no lugar onde começaram. */
    public static List<Parada> paradas(List<Trecho> trechos) {
        var paradas = new ArrayList<Parada>();
        Ponto inicio = null;
        OffsetDateTime ate = null;
        double minutos = 0;
        double ligado = 0;
        for (Trecho t : trechos) {
            if (t.estado() == Estado.MOVIMENTO) {
                fechar(paradas, inicio, ate, minutos, ligado);
                inicio = null;
                minutos = 0;
                ligado = 0;
                continue;
            }
            if (inicio == null) inicio = t.inicio();
            ate = t.fim().em();
            minutos += t.minutos();
            if (t.estado() == Estado.LIGADO_PARADO) ligado += t.minutos();
        }
        fechar(paradas, inicio, ate, minutos, ligado);
        return paradas;
    }

    private static void fechar(List<Parada> paradas, Ponto inicio, OffsetDateTime ate, double minutos, double ligado) {
        if (inicio == null || !inicio.temCoordenada() || minutos < PARADA_MINIMA.toMinutes()) return;
        paradas.add(new Parada(inicio.em(), ate, inicio.latitude(), inicio.longitude(), minutos, ligado));
    }

    /**
     * Onde o veículo estava no instante: entre dois pontos dentro da tolerância, interpola; senão, o
     * ponto mais perto dentro dela. Sem ponto na tolerância, vazio (sem dado, não irregular).
     */
    public static Optional<PosicaoNoInstante> posicaoEm(List<Ponto> pontos, OffsetDateTime instante, Duration tolerancia) {
        Ponto antes = null;
        Ponto depois = null;
        for (Ponto p : pontos) {
            if (!p.temCoordenada()) continue;
            if (!p.em().isAfter(instante)) {
                antes = p;
            } else {
                depois = p;
                break;
            }
        }
        boolean antesPerto = antes != null && Duration.between(antes.em(), instante).compareTo(tolerancia) <= 0;
        boolean depoisPerto = depois != null && Duration.between(instante, depois.em()).compareTo(tolerancia) <= 0;
        if (antesPerto && depoisPerto) {
            double total = Duration.between(antes.em(), depois.em()).toMillis();
            double f = total <= 0 ? 0 : Duration.between(antes.em(), instante).toMillis() / total;
            Ponto perto = f <= 0.5 ? antes : depois;
            return Optional.of(new PosicaoNoInstante(
                    antes.latitude() + (depois.latitude() - antes.latitude()) * f,
                    antes.longitude() + (depois.longitude() - antes.longitude()) * f,
                    perto.velocidadeKmh()));
        }
        Ponto unico = antesPerto ? antes : depoisPerto ? depois : null;
        return Optional.ofNullable(unico).map(p -> new PosicaoNoInstante(p.latitude(), p.longitude(), p.velocidadeKmh()));
    }

    /** Distância em metros entre duas coordenadas (haversine). */
    public static double distanciaMetros(double lat1, double lng1, double lat2, double lng2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 2 * RAIO_TERRA_METROS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    /** Lugar típico de um conjunto de posições ({latitude, longitude}): a mediana de cada eixo, robusta a poucos pontos fora. */
    public static Optional<double[]> centro(List<double[]> posicoes) {
        if (posicoes.isEmpty()) return Optional.empty();
        return Optional.of(new double[]{mediana(posicoes.stream().map(p -> p[0]).toList()),
                mediana(posicoes.stream().map(p -> p[1]).toList())});
    }

    public static double mediana(List<Double> valores) {
        var ordenados = valores.stream().sorted(Comparator.naturalOrder()).toList();
        int n = ordenados.size();
        if (n == 0) return 0;
        return n % 2 == 1 ? ordenados.get(n / 2) : (ordenados.get(n / 2 - 1) + ordenados.get(n / 2)) / 2;
    }
}
