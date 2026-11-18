package com.nexo.app.modules.frota.infrastructure.telemetria;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nexo.app.modules.frota.application.TelemetriaFrotaProperties;
import com.nexo.app.modules.frota.domain.TipoEventoTelemetria;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Leitura das respostas dos provedores (formatos das especificações em docs/integracoes/telemetria). */
class FontesTelemetriaTest {

    private final ObjectMapper json = new ObjectMapper();

    private JsonNode ler(String texto) throws Exception {
        return json.readTree(texto.replace('\'', '"'));
    }

    @Test
    void ubicalyLeVeiculosComOdometroEmMetrosEPosicao() throws Exception {
        var corpo = ler("""
                [{'vehicleId': 17, 'name': 'Picape 03', 'plate': 'ABC-1D23',
                  'odo': {'ts': 1761480000000, 'value': 120045300},
                  'pos': {'lat': -12.25, 'lng': -38.96, 'spd': 54.5, 'ts': 1761480060000, 'reTs': 1761480061000}},
                 {'vehicleId': 18, 'plate': 'SEM1S11', 'odo': {'ts': 0, 'value': 0}, 'pos': {'ts': 0}}]
                """);

        var veiculos = UbicalyFonteTelemetria.lerVeiculos(corpo);

        assertThat(veiculos).hasSize(2);
        var v = veiculos.get(0);
        assertThat(v.idExterno()).isEqualTo("17");
        assertThat(v.placa()).isEqualTo("ABC-1D23");
        assertThat(v.leitura().lidoEm()).isEqualTo(Instant.ofEpochMilli(1761480060000L).atOffset(ZoneOffset.UTC));
        assertThat(v.leitura().odometroMetros()).isEqualTo(120045300L);
        assertThat(v.leitura().velocidadeKmh()).isEqualTo(54.5);
        assertThat(veiculos.get(1).leitura()).as("sem nenhum dado gravado").isNull();
    }

    @Test
    void ubicalyTiraEventosDosTrajetosEncerradosESeguraOCursorNoTrajetoEmAndamento() throws Exception {
        var corpo = ler("""
                [{'trackId': 900, 'startTs': 1761480000000, 'endTs': 1761483600000, 'driverId': 5, 'driverName': 'MARIA SOUZA',
                  'track': {'dpa': {'over_speed': [[1761481000000, -12.2, -38.9, 98, 80]],
                                    'hard_braking': [[1761482000000, -12.3, -38.8, 40, 0.6]]}}},
                 {'trackId': 901, 'startTs': 1761485000000, 'endTs': 0, 'driverId': 0,
                  'track': {'dpa': {'over_speed': [[1761485500000, -12.2, -38.9, 110, 80]]}}}]
                """);
        var ate = OffsetDateTime.parse("2026-10-26T15:00:00Z");

        var lidos = UbicalyFonteTelemetria.lerTrajetos("17", corpo, ate);

        assertThat(lidos.eventos()).extracting(e -> e.tipo())
                .containsExactlyInAnyOrder(TipoEventoTelemetria.EXCESSO_VELOCIDADE, TipoEventoTelemetria.FRENAGEM_BRUSCA);
        var excesso = lidos.eventos().stream().filter(e -> e.tipo() == TipoEventoTelemetria.EXCESSO_VELOCIDADE).findFirst().orElseThrow();
        assertThat(excesso.idExterno()).isEqualTo("900:over_speed:1761481000000");
        assertThat(excesso.velocidadeKmh()).isEqualTo(98.0);
        assertThat(excesso.limiteKmh()).isEqualTo(80.0);
        assertThat(excesso.motorista().nome()).isEqualTo("MARIA SOUZA");
        assertThat(lidos.lidosAte()).containsEntry("17", Instant.ofEpochMilli(1761485000000L).atOffset(ZoneOffset.UTC));
    }

    @Test
    void ubicalyPedeTrajetosComChaveBearerEJanelaLimitada() throws Exception {
        var props = new TelemetriaFrotaProperties();
        props.getUbicaly().setChave("abc");
        var http = mock(ClienteHttpTelemetria.class);
        when(http.get(any(), any(), any())).thenReturn(ler("[]"));
        var fonte = new UbicalyFonteTelemetria(props, http);
        var ate = OffsetDateTime.parse("2026-10-26T15:00:00Z");

        fonte.eventos(Map.of("17", ate.minusDays(30)), ate);

        long inicio = ate.minus(UbicalyFonteTelemetria.JANELA_MAXIMA).toInstant().toEpochMilli();
        verify(http).get(argThat(uri -> uri.toString().equals("https://panel.ubicaly.com/v3/company/vehicles/id/17/historical/tracks?from_ts="
                + inicio + "&to_ts=" + ate.toInstant().toEpochMilli())), eq("Bearer abc"), eq(UbicalyFonteTelemetria.VARIAVEL));
    }

    @Test
    void zuqLeTempoRealComOdometroEmKmEMotoristaComCpf() throws Exception {
        var corpo = ler("""
                [{'vehicle': {'id': 4410, 'code': 'PIC-07', 'licensePlate': 'XYZ9A87'},
                  'driver': {'id': 77, 'name': 'João Lima', 'taxpayerId': '123.456.789-09'},
                  'latitude': -12.9, 'longitude': -38.5, 'gpsTime': 1761480060000, 'ignition': true,
                  'speedKMH': 62.0, 'odometer': 84512, 'hourmeter': 0}]
                """);

        var v = ZuqFonteTelemetria.lerTempoReal(corpo).get(0);

        assertThat(v.idExterno()).isEqualTo("4410");
        assertThat(v.placa()).isEqualTo("XYZ9A87");
        assertThat(v.leitura().odometroMetros()).isEqualTo(84_512_000L);
        assertThat(v.leitura().horimetroHoras()).isNull();
        assertThat(v.leitura().ignicao()).isTrue();
        assertThat(v.leitura().motorista().cpf()).isEqualTo("12345678909");
    }

    @Test
    void zuqImportaSoEventosDeConducaoEClassificaADirigibilidade() throws Exception {
        var itens = ler("""
                [{'id': 1, 'eventDate': '2026-10-26T10:15:00-03:00', 'vehicle': {'id': 4410, 'licensePlate': 'XYZ9A87'},
                  'rule': {'name': 'Velocidade acima de 80 km/h', 'property': 'SPEED'}, 'newValue': 97, 'address': 'BR-324'},
                 {'id': 2, 'eventDate': '2026-10-26T10:20:00', 'vehicle': {'id': 4410},
                  'rule': {'name': 'Frenagem brusca', 'property': 'ALERT'}},
                 {'id': 3, 'eventDate': '2026-10-26T10:30:00-03:00', 'vehicle': {'id': 4410},
                  'rule': {'name': 'Ignição', 'property': 'IGNITION'}},
                 {'id': 4, 'eventDate': '2026-10-26T11:00:00-03:00', 'vehicle': {'id': 4410}, 'seconds': 720,
                  'rule': {'name': 'Parado ligado', 'property': 'STOPPED_IGNITION'}}]
                """);

        var eventos = ZuqFonteTelemetria.lerNotificacoes(itens);

        assertThat(eventos).extracting(e -> e.tipo()).containsExactly(TipoEventoTelemetria.EXCESSO_VELOCIDADE,
                TipoEventoTelemetria.FRENAGEM_BRUSCA, TipoEventoTelemetria.MOTOR_LIGADO_PARADO);
        assertThat(eventos.get(0).velocidadeKmh()).isEqualTo(97.0);
        assertThat(eventos.get(0).limiteKmh()).isEqualTo(80.0);
        assertThat(eventos.get(0).endereco()).isEqualTo("BR-324");
        assertThat(eventos.get(1).ocorridoEm()).as("sem fuso: horário de Brasília")
                .isEqualTo(OffsetDateTime.parse("2026-10-26T10:20:00-03:00"));
        assertThat(eventos.get(2).duracaoSegundos()).isEqualTo(720);
    }

    @Test
    void zuqCompletaAComCnhPeloCadastroDeMotoristas() throws Exception {
        var props = new TelemetriaFrotaProperties();
        props.getZuq().setChave("tok");
        var http = mock(ClienteHttpTelemetria.class);
        when(http.get(argThat(u -> u != null && u.getPath().equals("/api/realtime/vehicles")), any(), any())).thenReturn(ler("""
                [{'vehicle': {'id': 1, 'licensePlate': 'XYZ9A87'}, 'driver': {'id': 77, 'name': 'João', 'taxpayerId': '12345678909'},
                  'gpsTime': 1761480060000, 'odometer': 100}]
                """));
        when(http.get(argThat(u -> u != null && u.getPath().equals("/api/contact/drivers/v2/list")), any(), any())).thenReturn(ler("""
                {'hasNext': false, 'content': [{'name': 'João', 'cpf': '123.456.789-09', 'cnh': {'numero': '0123456789-0'}}]}
                """));
        var fonte = new ZuqFonteTelemetria(props, http);

        var motorista = fonte.veiculos().get(0).leitura().motorista();

        assertThat(motorista.cnh()).isEqualTo("01234567890");
        verify(http).get(argThat(u -> u != null && u.toString().contains("cpf=12345678909")), eq("tok"), eq(ZuqFonteTelemetria.VARIAVEL));
    }

    @Test
    void zuqLeLimiteDoNomeDaRegra() {
        assertThat(ZuqFonteTelemetria.limite("Excesso 110km/h rodovia")).isEqualTo(110.0);
        assertThat(ZuqFonteTelemetria.limite("Velocidade")).isNull();
        assertThat(ZuqFonteTelemetria.tipo("ALERT", "Curva acentuada", null)).isEqualTo(TipoEventoTelemetria.CURVA_BRUSCA);
        assertThat(ZuqFonteTelemetria.tipo("ALERT", "Dirigibilidade", "Aceleração brusca")).isEqualTo(TipoEventoTelemetria.ACELERACAO_BRUSCA);
        assertThat(ZuqFonteTelemetria.tipo("ALERT", "Dirigibilidade", null)).isEqualTo(TipoEventoTelemetria.CONDUCAO_AGRESSIVA);
        assertThat(ZuqFonteTelemetria.tipo("FENCE", "Cerca", null)).isNull();
    }

    @Test
    void zuqLeOsPontosDoHistoricoPelaPlacaNaHoraDeBrasiliaEmJanelasDeTresDias() throws Exception {
        var props = new TelemetriaFrotaProperties();
        props.getZuq().setChave("tok");
        var http = mock(ClienteHttpTelemetria.class);
        when(http.get(any(), any(), any())).thenReturn(ler("[{'lat':-12.1,'lng':-38.9,'gpsTime':1793060131000,'ignition':true,'speedKMH':42.5},"
                + "{'lat':0,'lng':0,'gpsTime':1793060161000},{'lat':-12.2,'lng':-38.8,'gpsTime':1793060100000}]"));
        var fonte = new ZuqFonteTelemetria(props, http);
        var de = OffsetDateTime.parse("2026-10-20T03:00:00Z");

        var leituras = fonte.historico("9", "TDU8F84", de, de.plusDays(5));

        verify(http).get(argThat(uri -> uri.toString().equals("https://app.zuq.com.br/api/realtime/vehicle/p2p?vehicle=TDU8F84"
                + "&start=2026-10-20T00:00:00&end=2026-10-23T00:00:00")), eq("tok"), eq(ZuqFonteTelemetria.VARIAVEL));
        verify(http).get(argThat(uri -> uri.toString().endsWith("&start=2026-10-23T00:00:00&end=2026-10-25T00:00:00")), eq("tok"), any());
        assertThat(leituras).as("sem o ponto zerado nem instante repetido, em ordem de tempo").hasSize(2);
        assertThat(leituras.getFirst().latitude()).isEqualTo(-12.2);
        assertThat(leituras.get(1).velocidadeKmh()).isEqualTo(42.5);
        assertThat(leituras.get(1).ignicao()).isTrue();
    }

    @Test
    void ubicalyLeAsPosicoesDoHistoricoSoComGps() throws Exception {
        var leituras = UbicalyFonteTelemetria.lerPosicoes(ler("[{'ts':1793060131000,'lat':-10.6,'lng':-37.4,'spd':31,'src':1},"
                + "{'ts':1793060161000,'lat':-10.7,'lng':-37.5,'spd':0,'src':3},{'ts':0,'lat':0,'lng':0,'spd':0,'src':0}]"));
        assertThat(leituras).hasSize(1);
        assertThat(leituras.getFirst().velocidadeKmh()).isEqualTo(31.0);
    }
}
