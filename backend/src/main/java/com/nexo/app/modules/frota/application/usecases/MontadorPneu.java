package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.estoque.EstoqueFrotaApi;
import com.nexo.app.modules.financeiro.FinanceiroApi;
import com.nexo.app.modules.frota.FrotaOdometroApi;
import com.nexo.app.modules.frota.application.dto.EventoPneuResponse;
import com.nexo.app.modules.frota.application.dto.PneuResponse;
import com.nexo.app.modules.frota.domain.DiagramaPneus;
import com.nexo.app.modules.frota.domain.EventoPneu;
import com.nexo.app.modules.frota.domain.Pneu;
import com.nexo.app.modules.frota.domain.SituacaoPneu;
import com.nexo.app.modules.frota.domain.TipoEventoPneu;
import com.nexo.app.modules.frota.infrastructure.persistence.EventoPneuRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Monta a resposta do pneu com os nomes, o km do trecho montado (pelo odômetro do veículo), o
 * custo por km e os alertas de sulco, pressão e serviço parado.
 */
@Component
@RequiredArgsConstructor
class MontadorPneu {

    /** Sulco "de atenção": até 1,5 mm acima do mínimo. */
    private static final BigDecimal FAIXA_ATENCAO = new BigDecimal("1.5");
    private static final Duration SERVICO_LONGO = Duration.ofDays(30);
    /** Pressão fora de ±10% da recomendada. */
    private static final BigDecimal TOLERANCIA_PRESSAO = new BigDecimal("0.10");

    private final EventoPneuRepository eventos;
    private final EstoqueFrotaApi estoque;
    private final FinanceiroApi financeiro;
    private final FrotaOdometroApi odometro;
    private final ReferenciasFrota referencias;
    private final ParametrosFrotaUseCases parametros;

    BigDecimal sulcoMinimo() {
        return parametros.obter().getSulcoMinimoMm();
    }

    List<PneuResponse> montar(List<Pneu> pneus) {
        if (pneus.isEmpty()) {
            return List.of();
        }
        BigDecimal minimo = sulcoMinimo();
        var ids = pneus.stream().map(Pneu::getId).toList();
        Map<UUID, List<EventoPneu>> porPneu = eventos.findAllByIdPneuIn(ids).stream().collect(Collectors.groupingBy(EventoPneu::getIdPneu));
        Map<UUID, String> fornecedores = financeiro.nomesFornecedores(pneus.stream()
                .flatMap(p -> Stream.of(p.getIdFornecedor(), p.getIdFornecedorServico())).filter(Objects::nonNull).distinct().toList());
        Map<UUID, String> almoxarifados = pneus.stream().anyMatch(p -> p.getIdEstoque() != null)
                ? estoque.almoxarifados().stream().collect(Collectors.toMap(EstoqueFrotaApi.Almoxarifado::id, EstoqueFrotaApi.Almoxarifado::nome))
                : Map.of();
        Map<UUID, Long> acumulados = acumulados(pneus.stream().map(Pneu::getIdVeiculo).filter(Objects::nonNull).distinct().toList());
        OffsetDateTime agora = OffsetDateTime.now();
        return pneus.stream().map(p -> montar(p, porPneu.getOrDefault(p.getId(), List.of()), fornecedores, almoxarifados,
                acumulados, minimo, agora)).toList();
    }

    PneuResponse montar(Pneu pneu) {
        return montar(List.of(pneu)).get(0);
    }

    List<EventoPneuResponse> eventos(List<EventoPneu> lista, Map<UUID, String> marcasFogo) {
        var fornecedores = financeiro.nomesFornecedores(lista.stream().map(EventoPneu::getIdFornecedor).filter(Objects::nonNull).distinct().toList());
        var usuarios = referencias.nomesPessoasUsuarios(lista.stream().map(e -> usuario(e.getUsuarioCriacao())).filter(Objects::nonNull).distinct().toList());
        return lista.stream().map(e -> new EventoPneuResponse(e.getId(), e.getIdPneu(), marcasFogo.get(e.getIdPneu()), e.getTipo(),
                e.getTipo().getRotulo(), e.getOcorridoEm(), e.getIdVeiculo(), e.getPlaca(), e.getPosicaoOrigem(),
                DiagramaPneus.rotulo(e.getPosicaoOrigem()), e.getPosicaoDestino(), DiagramaPneus.rotulo(e.getPosicaoDestino()),
                e.getKmVeiculo(), e.getKmRodado(), e.getVida(), e.getSulcoMm(), e.getPressaoPsi(), e.getValor(),
                e.getIdFornecedor() == null ? null : fornecedores.get(e.getIdFornecedor()), e.getDocumento(), e.getDescricao(),
                e.getObservacao(), nomeUsuario(e.getUsuarioCriacao(), usuarios))).toList();
    }

    /** km acumulado atual de cada veículo (soma das trocas de painel). */
    Map<UUID, Long> acumulados(Collection<UUID> idsVeiculo) {
        Map<UUID, Long> mapa = new HashMap<>();
        idsVeiculo.forEach(id -> odometro.medicaoAtual(id).ifPresent(m -> mapa.put(id, m.acumulado())));
        return mapa;
    }

    static boolean pressaoFora(Integer medida, Integer recomendada) {
        if (medida == null || recomendada == null || recomendada <= 0) {
            return false;
        }
        BigDecimal diferenca = BigDecimal.valueOf(Math.abs(medida - recomendada));
        return diferenca.compareTo(BigDecimal.valueOf(recomendada).multiply(TOLERANCIA_PRESSAO)) > 0;
    }

    private PneuResponse montar(Pneu p, List<EventoPneu> historico, Map<UUID, String> fornecedores, Map<UUID, String> almoxarifados,
                                Map<UUID, Long> acumulados, BigDecimal minimo, OffsetDateTime agora) {
        int trecho = p.getIdVeiculo() == null ? 0 : p.kmRodadoMontado(acumulados.getOrDefault(p.getIdVeiculo(), 0L));
        int kmVida = p.getKmVida() + trecho;
        int kmTotal = p.getKmTotal() + trecho;
        BigDecimal custo = historico.stream().filter(e -> e.getTipo().isCusto() && e.getValor() != null)
                .map(EventoPneu::getValor).reduce(p.getValorCompra() == null ? BigDecimal.ZERO : p.getValorCompra(), BigDecimal::add);
        BigDecimal porKm = kmTotal > 0 && custo.signum() > 0 ? custo.divide(BigDecimal.valueOf(kmTotal), 4, RoundingMode.HALF_UP) : null;
        Integer ultimaPressao = historico.stream().filter(e -> e.getTipo() == TipoEventoPneu.INSPECAO && e.getPressaoPsi() != null)
                .max(Comparator.comparing(EventoPneu::getOcorridoEm)).map(EventoPneu::getPressaoPsi).orElse(null);
        List<String> alertas = new ArrayList<>();
        if (p.getSituacao() != SituacaoPneu.DESCARTADO && p.getSulcoAtualMm() != null) {
            if (p.isSulcoNoLimite(minimo)) {
                alertas.add("SULCO_BAIXO");
            } else if (p.getSulcoAtualMm().compareTo(minimo.add(FAIXA_ATENCAO)) <= 0) {
                alertas.add("SULCO_ATENCAO");
            }
        }
        if (p.getSituacao().isEmServico() && p.getEnviadoEm() != null && p.getEnviadoEm().plus(SERVICO_LONGO).isBefore(agora)) {
            alertas.add("SERVICO_ATRASADO");
        }
        if (p.getSituacao() == SituacaoPneu.EM_USO && pressaoFora(ultimaPressao, p.getPressaoRecomendadaPsi())) {
            alertas.add("PRESSAO_FORA");
        }
        return new PneuResponse(p.getId(), p.getNumero(), p.getMarcaFogo(), p.getNumeroSerie(), p.getMarca(), p.getModelo(), p.medida(),
                p.getLargura(), p.getPerfil(), p.getAro(), p.isRadial(), p.isComCamara(), p.getIndiceCarga(), p.getIndiceVelocidade(),
                p.getLonas(), p.getDot(), p.getIdFornecedor(), p.getIdFornecedor() == null ? null : fornecedores.get(p.getIdFornecedor()),
                p.getNotaFiscal(), p.getDataCompra(), p.getValorCompra(), p.getSulcoInicialMm(), p.getSulcoAtualMm(),
                p.getPressaoRecomendadaPsi(), ultimaPressao, p.getVida(), kmVida, kmTotal, p.getSituacao(), p.getSituacao().getRotulo(),
                p.getIdEstoque(), p.getIdEstoque() == null ? null : almoxarifados.get(p.getIdEstoque()), p.getIdVeiculo(), p.getPlaca(),
                p.getPosicao(), DiagramaPneus.rotulo(p.getPosicao()), p.getMontadoEm(), p.getIdFornecedorServico(),
                p.getIdFornecedorServico() == null ? null : fornecedores.get(p.getIdFornecedorServico()), p.getEnviadoEm(),
                p.getDescartadoEm(), p.getMotivoDescarte(), p.getObservacao(), custo.setScale(2, RoundingMode.HALF_UP), porKm, alertas);
    }

    private static UUID usuario(String auditoria) {
        try {
            return auditoria == null ? null : UUID.fromString(auditoria);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static String nomeUsuario(String auditoria, Map<UUID, String> nomes) {
        UUID id = usuario(auditoria);
        return id == null ? auditoria : nomes.getOrDefault(id, null);
    }
}
