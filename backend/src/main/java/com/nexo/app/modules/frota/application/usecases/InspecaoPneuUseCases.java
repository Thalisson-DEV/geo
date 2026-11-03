package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.FrotaOdometroApi;
import com.nexo.app.modules.frota.application.dto.InspecaoPneuRequest;
import com.nexo.app.modules.frota.application.dto.InspecaoPneuResponse;
import com.nexo.app.modules.frota.domain.DiagramaPneus;
import com.nexo.app.modules.frota.domain.EventoPneu;
import com.nexo.app.modules.frota.domain.FichaVeiculo;
import com.nexo.app.modules.frota.domain.InspecaoPneu;
import com.nexo.app.modules.frota.domain.ItemInspecaoPneu;
import com.nexo.app.modules.frota.domain.Pneu;
import com.nexo.app.modules.frota.domain.TipoEventoPneu;
import com.nexo.app.modules.frota.infrastructure.persistence.EventoPneuRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.FichaVeiculoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.InspecaoPneuRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.PneuRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.PneuSpecification;
import com.nexo.app.shared.application.dto.PageResponse;
import com.nexo.app.shared.application.dto.Paged;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.infrastructure.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Inspeção dos pneus montados num veículo: calibragem (pressão) e sulco por posição. O sulco
 * medido passa a ser o sulco atual do pneu; pressão fora da faixa e sulco no mínimo viram alerta.
 */
@Service
@RequiredArgsConstructor
public class InspecaoPneuUseCases {

    private static final ZoneId FUSO = ZoneId.of("America/Sao_Paulo");

    private final InspecaoPneuRepository repository;
    private final PneuRepository pneus;
    private final EventoPneuRepository eventos;
    private final FichaVeiculoRepository fichas;
    private final MontadorPneu montador;
    private final ReferenciasFrota referencias;
    private final FrotaOdometroApi odometro;

    @Transactional
    public InspecaoPneuResponse registrar(InspecaoPneuRequest r) {
        FichaVeiculo ficha = fichas.findByIdVeiculo(r.idVeiculo()).filter(FichaVeiculo::isAtivo)
                .orElseThrow(() -> new InvarianteVioladaException("Veículo não encontrado na frota."));
        if (r.idResponsavel() != null && !referencias.colaboradorAtivo(r.idResponsavel())) {
            throw new InvarianteVioladaException("Responsável não encontrado ou desativado no cadastro de colaboradores.");
        }
        var agora = OffsetDateTime.now();
        var quando = r.realizadaEm() == null ? agora : r.realizadaEm();
        Map<UUID, Pneu> porId = pneus.findAllWithLockByIdIn(r.itens().stream().map(InspecaoPneuRequest.Item::idPneu).toList()).stream()
                .collect(Collectors.toMap(Pneu::getId, Function.identity()));
        var medicoes = r.itens().stream().map(i -> {
            var pneu = porId.get(i.idPneu());
            if (pneu == null) {
                throw new InvarianteVioladaException("Pneu não encontrado. Atualize a tela.");
            }
            return new InspecaoPneu.Medicao(pneu, i.pressaoPsi(), i.sulcoMm(), i.observacao());
        }).toList();
        var inspecao = repository.saveAndFlush(InspecaoPneu.registrar(ficha, quando, r.km(), r.idResponsavel(), r.observacao(), medicoes, agora));
        if (r.km() != null && r.km() > odometro.kmAtual(ficha.getIdVeiculo()).orElse(-1L)) {
            odometro.registrarLeitura(ficha.getIdVeiculo(), r.km(), quando, FrotaOdometroApi.OrigemLeitura.MANUTENCAO, inspecao.getId(),
                    SecurityUtils.getUsuarioLogadoId());
        }
        for (ItemInspecaoPneu item : inspecao.getItens()) {
            var pneu = porId.get(item.getIdPneu());
            if (item.getSulcoMm() != null) {
                pneu.registrarSulco(item.getSulcoMm());
            }
            eventos.save(EventoPneu.de(pneu, TipoEventoPneu.INSPECAO, quando, descricao(item))
                    .comVeiculo(ficha.getIdVeiculo(), ficha.getPlaca(), item.getPosicao(), item.getPosicao(),
                            r.km() == null ? null : r.km().longValue())
                    .comMedicao(item.getSulcoMm(), item.getPressaoPsi(), inspecao.getId())
                    .noLote(inspecao.getId(), item.getObservacao()));
        }
        pneus.saveAll(porId.values());
        return montar(List.of(inspecao)).get(0);
    }

    @Transactional(readOnly = true)
    public PageResponse<InspecaoPneuResponse> listar(UUID idVeiculo, LocalDate de, LocalDate ate, Pageable pageable) {
        Page<InspecaoPneu> pagina = repository.findAll(PneuSpecification.inspecoes(idVeiculo, inicio(de),
                ate == null ? null : inicio(ate.plusDays(1))), pageable);
        return new PageResponse<>(montar(pagina.getContent()),
                new Paged(pagina.getSize(), pagina.getNumber(), pagina.getTotalElements(), pagina.getTotalPages()));
    }

    private List<InspecaoPneuResponse> montar(List<InspecaoPneu> lista) {
        BigDecimal minimo = montador.sulcoMinimo();
        Map<UUID, Pneu> porId = pneus.findAllById(lista.stream().flatMap(i -> i.getItens().stream()).map(ItemInspecaoPneu::getIdPneu)
                .distinct().toList()).stream().collect(Collectors.toMap(Pneu::getId, Function.identity()));
        var responsaveis = referencias.nomesColaboradores(lista.stream().map(InspecaoPneu::getIdResponsavel).filter(Objects::nonNull).distinct().toList());
        return lista.stream().map(i -> {
            var itens = i.getItens().stream().map(item -> {
                var pneu = porId.get(item.getIdPneu());
                Integer recomendada = pneu == null ? null : pneu.getPressaoRecomendadaPsi();
                boolean fora = MontadorPneu.pressaoFora(item.getPressaoPsi(), recomendada);
                boolean baixo = item.getSulcoMm() != null && item.getSulcoMm().compareTo(minimo) <= 0;
                return new InspecaoPneuResponse.Item(item.getIdPneu(), pneu == null ? null : pneu.getMarcaFogo(), item.getPosicao(),
                        DiagramaPneus.rotulo(item.getPosicao()), item.getPressaoPsi(), recomendada, fora, item.getSulcoMm(), baixo,
                        item.getObservacao());
            }).toList();
            int alertas = (int) itens.stream().filter(x -> x.pressaoFora() || x.sulcoBaixo()).count();
            return new InspecaoPneuResponse(i.getId(), i.getIdVeiculo(), i.getPlaca(), i.getRealizadaEm(), i.getKm(), i.getIdResponsavel(),
                    i.getIdResponsavel() == null ? null : responsaveis.get(i.getIdResponsavel()), i.getObservacao(), i.getUsuarioCriacao(),
                    alertas, itens);
        }).toList();
    }

    private static String descricao(ItemInspecaoPneu item) {
        StringBuilder texto = new StringBuilder("Inspeção");
        if (item.getPressaoPsi() != null) {
            texto.append(": ").append(item.getPressaoPsi()).append(" psi");
        }
        if (item.getSulcoMm() != null) {
            texto.append(item.getPressaoPsi() == null ? ": sulco " : ", sulco ").append(item.getSulcoMm().stripTrailingZeros().toPlainString())
                    .append(" mm");
        }
        return texto.append('.').toString();
    }

    private static OffsetDateTime inicio(LocalDate dia) {
        return dia == null ? null : dia.atStartOfDay(FUSO).toOffsetDateTime();
    }
}
