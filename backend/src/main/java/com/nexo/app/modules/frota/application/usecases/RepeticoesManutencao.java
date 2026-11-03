package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.domain.ItemManutencao;
import com.nexo.app.modules.frota.domain.ItemOrdemServico;
import com.nexo.app.modules.frota.domain.OrdemServico;
import com.nexo.app.modules.frota.domain.SituacaoOrdemServico;
import com.nexo.app.modules.frota.domain.TipoManutencao;
import com.nexo.app.modules.frota.infrastructure.persistence.ItemOrdemServicoRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import java.util.UUID;

/**
 * Procura a última vez que o mesmo item foi feito na mesma placa: a OS concluída mais
 * recente com o item, terminada dentro da janela antes da referência.
 */
@Component
@RequiredArgsConstructor
class RepeticoesManutencao {

    private static final ZoneId FUSO = ZoneId.of("America/Sao_Paulo");
    private static final UUID NENHUMA = new UUID(0, 0);

    private final ItemOrdemServicoRepository itens;
    private final ParametrosFrotaUseCases parametros;

    /** OS anterior encontrada, com o intervalo em dias de calendário e a janela usada. */
    record Anterior(UUID idOs, Long numero, OffsetDateTime fimReal, int dias, int janelaDias) {
    }

    Optional<Anterior> anterior(UUID idVeiculo, ItemManutencao item, UUID idIgnorar, OffsetDateTime referencia) {
        return anterior(idVeiculo, item, idIgnorar, referencia, parametros.janelaRepeticaoDias());
    }

    Optional<Anterior> anterior(UUID idVeiculo, ItemManutencao item, UUID idIgnorar, OffsetDateTime referencia,
                                int janelaPadrao) {
        int janela = item.janelaRepeticao(janelaPadrao);
        return itens.buscarAnteriores(idVeiculo, item.getId(), idIgnorar == null ? NENHUMA : idIgnorar,
                        referencia.minusDays(janela), referencia, SituacaoOrdemServico.CONCLUIDA, PageRequest.of(0, 1))
                .stream()
                .findFirst()
                .map(ItemOrdemServico::getOrdem)
                .map(os -> new Anterior(os.getId(), os.getNumero(), os.getFimReal(),
                        dias(os.getFimReal(), referencia), janela));
    }

    /**
     * A OS conta na repetição por placa: sem veículo não há placa, e a preventiva é planejada — trocar
     * na revisão o que quebrou há pouco não é retrabalho. A corretiva depois da preventiva continua contando.
     */
    static boolean contaRepeticao(OrdemServico os) {
        return os.isVeicular() && os.getTipoManutencao() != TipoManutencao.PREVENTIVA;
    }

    /** Grava, em cada item da OS concluída, a repetição encontrada. Devolve os itens repetidos. */
    java.util.List<ItemOrdemServico> registrar(OrdemServico os) {
        if (!contaRepeticao(os)) return java.util.List.of();
        int janelaPadrao = parametros.janelaRepeticaoDias();
        var repetidos = new java.util.ArrayList<ItemOrdemServico>();
        for (ItemOrdemServico item : os.getItens()) {
            anterior(os.getIdVeiculo(), item.getItem(), os.getId(), os.getFimReal(), janelaPadrao).ifPresent(a -> {
                item.registrarRepeticao(a.idOs(), a.numero(), a.dias());
                repetidos.add(item);
            });
        }
        return repetidos;
    }

    private static int dias(OffsetDateTime de, OffsetDateTime ate) {
        return (int) ChronoUnit.DAYS.between(de.atZoneSameInstant(FUSO).toLocalDate(),
                ate.atZoneSameInstant(FUSO).toLocalDate());
    }
}
