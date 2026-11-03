package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.OrigemCondutorTelemetria;
import com.nexo.app.modules.frota.domain.ProvedorTelemetria;
import com.nexo.app.modules.frota.domain.SituacaoRastreador;
import com.nexo.app.modules.frota.domain.SituacaoSincronizacaoTelemetria;
import com.nexo.app.modules.frota.domain.TipoEventoTelemetria;
import com.nexo.app.modules.frota.domain.UnidadeMedicao;
import com.nexo.app.shared.application.SelecaoMultipla;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** Contratos de {@code /v1/frota/telemetria}. */
public final class TelemetriaFrotaDtos {

    private TelemetriaFrotaDtos() {
    }

    // ── Situação ────────────────────────────────────────────────────────────────────

    public record SituacaoResponse(List<ProvedorSituacao> provedores, Resumo resumo) {
    }

    public record ProvedorSituacao(ProvedorTelemetria provedor, String rotulo, boolean configurado, Rotina veiculos,
                                   Rotina eventos) {
    }

    /** @param itens veículos lidos (rotina de veículos) ou eventos novos (rotina de eventos) na última rodada */
    public record Rotina(SituacaoSincronizacaoTelemetria situacao, String situacaoRotulo, OffsetDateTime ultimaExecucao,
                         OffsetDateTime ultimoSucesso, String mensagem, int falhasSeguidas, int itens) {
    }

    /** @param semComunicacao vinculados sem posição nas últimas 24 horas */
    public record Resumo(long vinculados, long semVeiculo, long ignorados, long semComunicacao, long eventos24h) {
    }

    // ── Rastreadores ────────────────────────────────────────────────────────────────

    public record RastreadorFilter(String busca, List<ProvedorTelemetria> provedores, List<SituacaoRastreador> situacoes,
                                   Boolean semComunicacao, List<UUID> idsBase) {
        public RastreadorFilter {
            provedores = SelecaoMultipla.normalizar(provedores);
            situacoes = SelecaoMultipla.normalizar(situacoes);
            idsBase = SelecaoMultipla.normalizar(idsBase);
        }
    }

    /**
     * @param placa          placa da frota (vínculo); a do provedor fica em {@code placaProvedor}
     * @param odometroKm     odômetro do rastreador (não é o km do painel)
     * @param condutor       condutor da frota casado com o motorista do provedor
     * @param semComunicacao sem posição nas últimas 24 horas
     */
    public record RastreadorResponse(UUID id, ProvedorTelemetria provedor, String provedorRotulo, String idExterno,
                                     String placaProvedor, String nomeProvedor, SituacaoRastreador situacao,
                                     String situacaoRotulo, boolean vinculoManual, UUID idVeiculo, String placa, String base,
                                     OffsetDateTime ultimaComunicacao, Double latitude, Double longitude,
                                     BigDecimal velocidadeKmh, Boolean ignicao, BigDecimal odometroKm,
                                     BigDecimal horimetroHoras, String motoristaNome, UUID idColaboradorMotorista,
                                     String condutor, boolean semComunicacao) {
    }

    public record VincularRequest(@NotNull(message = "Informe o veículo.") UUID idVeiculo) {
    }

    // ── Eventos ─────────────────────────────────────────────────────────────────────

    public record EventoFilter(String busca, List<TipoEventoTelemetria> tipos, List<ProvedorTelemetria> provedores,
                               UUID idVeiculo, UUID idColaborador, List<UUID> idsBase, Boolean semCondutor,
                               OffsetDateTime de, OffsetDateTime ate) {
        public EventoFilter {
            tipos = SelecaoMultipla.normalizar(tipos);
            provedores = SelecaoMultipla.normalizar(provedores);
            idsBase = SelecaoMultipla.normalizar(idsBase);
        }
    }

    /** @param motoristaNome nome que o provedor mandou, para conferir o casamento */
    public record EventoResponse(UUID id, ProvedorTelemetria provedor, String provedorRotulo, TipoEventoTelemetria tipo,
                                 String tipoRotulo, OffsetDateTime ocorridoEm, UUID idVeiculo, String placa, String base,
                                 Double latitude, Double longitude, String endereco, BigDecimal velocidadeKmh,
                                 BigDecimal limiteKmh, Integer duracaoSegundos, String descricao, String detalhe,
                                 String motoristaNome, UUID idColaborador, String condutor,
                                 OrigemCondutorTelemetria origemCondutor, String origemCondutorRotulo) {
    }

    // ── Veículo ─────────────────────────────────────────────────────────────────────

    /**
     * Resumo para a aba Telemetria da ficha do veículo. Rodado e consumo na unidade do veículo
     * (km e km/l, ou horas e l/h).
     *
     * @param consumo30d nulo sem ao menos dois abastecimentos e 100 km (ou 10 h) no período
     */
    public record VeiculoResponse(boolean rastreado, RastreadorResponse rastreador, List<RastreadorResponse> outros,
                                  UnidadeMedicao unidade, Double rodado7d, Double rodado30d, BigDecimal litros30d,
                                  Double consumo30d, List<ContagemTipo> eventos30d, List<EventoResponse> ultimosEventos) {
    }

    public record ContagemTipo(TipoEventoTelemetria tipo, String rotulo, long total) {
    }

    public record TrajetoResponse(List<Ponto> pontos, boolean truncado) {
    }

    public record Ponto(OffsetDateTime lidoEm, Double latitude, Double longitude, Double velocidadeKmh, Boolean ignicao) {
    }

    // ── Mapa da frota ───────────────────────────────────────────────────────────────

    /** Estado do veículo no mapa, pelo último estado do rastreador. */
    public enum EstadoMapa {
        EM_MOVIMENTO("Em movimento"),
        LIGADO_PARADO("Ligado parado"),
        DESLIGADO("Parado ou desligado"),
        SEM_SINAL("Sem sinal há mais de 24 h");

        private final String rotulo;

        EstadoMapa(String rotulo) {
            this.rotulo = rotulo;
        }

        public String getRotulo() {
            return rotulo;
        }
    }

    /**
     * Um veículo rastreado no mapa, com o que a frota sabe dele.
     *
     * @param condutor          motorista informado pelo rastreador e casado com a frota
     * @param condutorVinculado quem está vinculado ao veículo agora (checklist ou manual)
     * @param kmAtual           medição atual do livro-razão, na unidade do veículo
     * @param eventos24h        eventos de condução nas últimas 24 horas
     * @param vinculado         casado com um veículo da frota; sem vínculo, placa e nome são os do provedor
     * @param atencao           o que pede uma decisão sobre o veículo agora (OS, checklist, CNH, abastecimento, expediente)
     */
    public record VeiculoMapa(UUID idVeiculo, String placa, String modelo, String fabricante,
                              String tipoVeiculo, UUID idBaseOperacional, String base,
                              com.nexo.app.modules.frota.domain.SituacaoOperacional situacaoOperacional,
                              String situacaoOperacionalRotulo, double latitude, double longitude,
                              BigDecimal velocidadeKmh, Boolean ignicao, OffsetDateTime ultimaComunicacao, EstadoMapa estado,
                              String estadoRotulo, String condutor, String condutorVinculado,
                              Long kmAtual, UnidadeMedicao unidade, long eventos24h, long documentosVencidos,
                              AtencaoVeiculoMapa atencao) {
    }

    /**
     * O que pede decisão sobre o veículo do mapa, para a tela levar direto ao lugar certo.
     *
     * @param idCondutor           quem está vinculado ao veículo agora
     * @param cnhVencida           a CNH desse condutor está vencida hoje
     * @param os                   a OS aberta mais urgente (parada em curso e prazo estourado primeiro); nula sem OS aberta
     * @param osAbertas            total de OS abertas do veículo
     * @param pendenciasChecklist  itens apontados no checklist ainda sem decisão
     * @param semChecklistHoje     usado hoje sem o checklist do dia
     * @param abastecimento        pedido de abastecimento em andamento; nulo sem pedido
     * @param foraDoExpediente     andando agora, fora do expediente configurado
     */
    public record AtencaoVeiculoMapa(UUID idCondutor, boolean cnhVencida, OsMapa os, long osAbertas, long pendenciasChecklist,
                                     boolean semChecklistHoje, AbastecimentoMapa abastecimento, boolean foraDoExpediente) {
    }

    /** @param atrasada em andamento com a previsão de término já passada */
    public record OsMapa(UUID id, Long numero, String situacaoRotulo, boolean veiculoParado, boolean atrasada) {
    }

    public record AbastecimentoMapa(UUID id, com.nexo.app.modules.frota.domain.SituacaoAbastecimento situacao, String situacaoRotulo) {
    }

    /**
     * @param semPosicao             veículos rastreados que ainda não mandaram coordenadas
     * @param posicoesAtrasadasDesde as posições pararam de chegar desde este instante (nulo quando chegam em dia);
     *                               a tela mostra um aviso só nesse caso, sem detalhe técnico
     */
    public record MapaResponse(List<VeiculoMapa> veiculos, long semPosicao, OffsetDateTime geradoEm,
                               OffsetDateTime posicoesAtrasadasDesde) {
    }

    // ── Abastecimento ───────────────────────────────────────────────────────────────

    /**
     * Consumo do intervalo entre o abastecimento anterior realizado e este, pela telemetria.
     *
     * @param motivo     por que não há número, quando {@code disponivel} é falso
     * @param consumo    km/l (ou l/h no veículo por horas)
     */
    public record ConsumoAbastecimentoResponse(boolean disponivel, String motivo, UnidadeMedicao unidade,
                                               OffsetDateTime anteriorEm, Double rodado, BigDecimal litros,
                                               Double consumo, LocalAbastecimento local) {

        public ConsumoAbastecimentoResponse comLocal(LocalAbastecimento local) {
            return new ConsumoAbastecimentoResponse(disponivel, motivo, unidade, anteriorEm, rodado, litros, consumo, local);
        }
    }

    /**
     * Onde o rastreador mostra o veículo no instante do abastecimento e o lugar do posto, aprendido
     * pelos abastecimentos anteriores (nulo enquanto o posto não tem referência).
     */
    public record LocalAbastecimento(double latitude, double longitude, Double latitudePosto, Double longitudePosto,
                                     Integer distanciaPostoMetros, boolean longeDoPosto) {
    }
}
