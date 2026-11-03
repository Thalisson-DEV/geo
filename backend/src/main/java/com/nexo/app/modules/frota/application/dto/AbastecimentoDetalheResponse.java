package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.EtapaAlertaAbastecimento;
import com.nexo.app.modules.frota.domain.SituacaoAbastecimento;
import com.nexo.app.modules.frota.domain.TipoAlertaAbastecimento;
import com.nexo.app.modules.frota.domain.TipoFotoAbastecimento;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import com.nexo.app.modules.frota.domain.OrigemAbastecimento;

import java.util.List;
import java.util.UUID;

/**
 * Abastecimento completo para quem aprova, libera ou consulta.
 *
 * @param podeAprovar  a placa está na carteira de quem consulta e aguarda aprovação
 * @param podeLiberar  quem consulta libera e o abastecimento está aprovado
 * @param podeCancelar quem consulta pode cancelar agora
 */
public record AbastecimentoDetalheResponse(
        UUID id,
        UUID idVeiculo,
        String placa,
        String veiculoDescricao,
        SituacaoAbastecimento situacao,
        String situacaoRotulo,
        UUID idBaseOperacional,
        String baseNome,
        String solicitante,
        String condutor,
        UUID idPosto,
        String posto,
        String postoWhatsapp,
        String unidadeMedicao,
        BigDecimal medicaoSolicitacao,
        BigDecimal medicaoRealizado,
        BigDecimal capacidadeTanque,
        String observacao,
        OffsetDateTime solicitadoEm,
        String aprovador,
        OffsetDateTime aprovadoEm,
        String motivoReprovacao,
        String liberador,
        OffsetDateTime liberadoEm,
        OffsetDateTime venceEm,
        String cancelador,
        OffsetDateTime canceladoEm,
        String motivoCancelamento,
        OffsetDateTime realizadoEm,
        BigDecimal valorTotal,
        List<AbastecimentoAppResponse.Item> itens,
        List<Foto> fotos,
        List<Alerta> alertas,
        List<Aviso> avisos,
        boolean podeAprovar,
        boolean podeLiberar,
        boolean podeCancelar,
        String destino,
        OrigemAbastecimento origem,
        String origemRotulo,
        /** Preços lidos no cupom diferentes do posto (pendentes ou já decididos). */
        List<SugestaoPrecoPostoResponse> sugestoesPreco
) {

    public record Foto(UUID id, TipoFotoAbastecimento tipo, String tipoRotulo, boolean recebida) {
    }

    public record Alerta(TipoAlertaAbastecimento tipo, String tipoRotulo, EtapaAlertaAbastecimento etapa, String mensagem) {
    }

    /** Aviso ao posto: a mensagem pronta e o atalho do WhatsApp (nulo sem número no posto). */
    public record Aviso(UUID id, String motivo, String situacao, String mensagem, String linkWhatsapp, String abertoPor,
                        OffsetDateTime abertoEm, OffsetDateTime criadoEm) {
    }
}
