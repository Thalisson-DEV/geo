package com.nexo.app.modules.frota.application.mappers;

import com.nexo.app.modules.frota.application.dto.AbastecimentoAppResponse;
import com.nexo.app.modules.frota.domain.Abastecimento;
import com.nexo.app.modules.frota.domain.ItemAbastecimento;
import org.mapstruct.Mapper;
import org.mapstruct.ReportingPolicy;

import java.math.BigDecimal;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.Locale;
import java.util.stream.Collectors;

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.IGNORE)
public interface AbastecimentoMapper {

    default AbastecimentoAppResponse toAppResponse(Abastecimento a, String placa, String condutor, boolean podeCancelar,
                                                   boolean medicaoValida, String motivoMedicao,
                                                   java.util.Map<java.util.UUID, String> pessoas) {
        return new AbastecimentoAppResponse(
                a.getId(), a.getIdAparelho(), a.getIdVeiculo(), placa, a.getSituacao(), a.getSituacao().getRotulo(),
                a.getPosto().getId(), a.getPosto().getNome(), condutor, a.getMedicaoSolicitacao(),
                a.getSolicitadoEm(), a.getAprovadoEm(), a.getLiberadoEm(), a.getVenceEm(), a.getRealizadoEm(),
                a.getMotivoReprovacao(), a.getMotivoCancelamento(),
                a.getItens().stream().map(this::toItem).toList(),
                a.fotosPendentes(), podeCancelar, medicaoValida, motivoMedicao,
                a.getFotos().stream().map(f -> new AbastecimentoAppResponse.Foto(f.getIdAparelho(), f.getTipo(),
                        f.getTipo().getRotulo(), f.isRecebida())).toList(),
                a.getIdUsuarioAprovacao() == null ? null : pessoas.get(a.getIdUsuarioAprovacao()),
                a.getIdUsuarioLiberacao() == null ? null : pessoas.get(a.getIdUsuarioLiberacao()),
                a.getDestino());
    }

    default AbastecimentoAppResponse.Item toItem(ItemAbastecimento i) {
        var pedido = i.getProdutoPedido();
        var entregue = i.getProduto();
        return new AbastecimentoAppResponse.Item(i.getId(), pedido.getCategoria(), pedido.getId(), pedido.getNome(),
                i.getQuantidadePedida(), pedido.getUnidade().getSigla(),
                entregue == null ? null : entregue.getId(), entregue == null ? null : entregue.getNome(),
                i.getQuantidade(), i.getValorTotal(), i.getValorUnitario(), i.getTanqueCheio(), i.getQuantidadeAprovada(),
                i.getQuantidadeLiberada(), i.quantidadeAutorizada());
    }

    /**
     * "Diesel S10 60 l, ARLA 32 20 l" para avisos e mensagens ao posto: o entregue, senão o
     * autorizado. Antes da aprovação só há produtos ("Diesel S10, ARLA 32"); item retirado sai.
     */
    default String resumoItens(Abastecimento a) {
        var formato = new DecimalFormat("#,##0.##", DecimalFormatSymbols.getInstance(Locale.of("pt", "BR")));
        return a.getItens().stream().filter(i -> i.getQuantidade() != null ? i.getQuantidade().signum() > 0 : !i.isRetirado())
                .map(i -> {
                    BigDecimal quantidade = i.getQuantidade() != null ? i.getQuantidade() : i.quantidadeAutorizada();
                    var produto = i.getProduto() != null ? i.getProduto() : i.getProdutoPedido();
                    return quantidade == null ? produto.getNome()
                            : produto.getNome() + " " + formato.format(quantidade) + " " + produto.getUnidade().getSigla();
                }).collect(Collectors.joining(", "));
    }
}
