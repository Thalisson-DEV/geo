package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.CategoriaProdutoAbastecimento;
import com.nexo.app.modules.frota.domain.SituacaoAbastecimento;
import com.nexo.app.modules.frota.domain.TipoFotoAbastecimento;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Abastecimento como o app mostra: situação, itens pedidos e entregues, o que ainda falta
 * enviar e se a equipe ainda pode cancelar.
 *
 * @param medicaoValida  falso quando a medição do realizado ficou inconsistente no livro-razão
 * @param fotosPendentes fotos esperadas que ainda não chegaram (ids do aparelho)
 * @param fotos          todas as fotos do pedido, pelo id do aparelho, para o detalhe mostrar
 * @param aprovador      quem aprovou ou reprovou
 * @param liberador      quem liberou
 */
public record AbastecimentoAppResponse(
        UUID id,
        UUID idAparelho,
        UUID idVeiculo,
        String placa,
        SituacaoAbastecimento situacao,
        String situacaoRotulo,
        UUID idPosto,
        String posto,
        String condutor,
        BigDecimal medicaoSolicitacao,
        OffsetDateTime solicitadoEm,
        OffsetDateTime aprovadoEm,
        OffsetDateTime liberadoEm,
        OffsetDateTime venceEm,
        OffsetDateTime realizadoEm,
        String motivoReprovacao,
        String motivoCancelamento,
        List<Item> itens,
        List<UUID> fotosPendentes,
        boolean podeCancelar,
        boolean medicaoValida,
        String motivoMedicao,
        List<Foto> fotos,
        String aprovador,
        String liberador,
        String destino
) {
    public record Foto(UUID idFoto, TipoFotoAbastecimento tipo, String tipoRotulo, boolean recebida) {
    }


    /**
     * @param quantidadePedida    só nos pedidos antigos; hoje a equipe pede só o produto
     * @param quantidadeAutorizada a que vale no posto: liberada, senão aprovada
     */
    public record Item(UUID id, CategoriaProdutoAbastecimento categoria, UUID idProdutoPedido, String produtoPedido,
                       BigDecimal quantidadePedida, String unidade, UUID idProduto, String produto, BigDecimal quantidade,
                       BigDecimal valorTotal, BigDecimal valorUnitario, Boolean tanqueCheio, BigDecimal quantidadeAprovada,
                       BigDecimal quantidadeLiberada, BigDecimal quantidadeAutorizada) {
    }
}
