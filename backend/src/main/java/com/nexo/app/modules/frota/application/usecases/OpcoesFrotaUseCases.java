package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.application.dto.OpcaoFrota;
import com.nexo.app.modules.frota.application.dto.OpcoesFrotaResponse;
import com.nexo.app.modules.frota.domain.CategoriaCnh;
import com.nexo.app.modules.frota.domain.SituacaoSinistro;
import com.nexo.app.modules.frota.domain.TipoSinistro;
import com.nexo.app.modules.frota.domain.Criticidade;
import com.nexo.app.modules.frota.domain.CausaManutencao;
import com.nexo.app.modules.frota.domain.MotivoServico;
import com.nexo.app.modules.frota.domain.NaturezaServico;
import com.nexo.app.modules.frota.domain.OrigemOrdemServico;
import com.nexo.app.modules.frota.domain.OrigemPeca;
import com.nexo.app.modules.frota.domain.SituacaoAprovacaoOrcamento;
import com.nexo.app.modules.frota.domain.SituacaoOrdemServico;
import com.nexo.app.modules.frota.domain.TipoManutencao;
import com.nexo.app.modules.frota.domain.TipoOficina;
import com.nexo.app.modules.frota.domain.Combustivel;
import com.nexo.app.modules.frota.domain.OrigemLeituraOdometro;
import com.nexo.app.modules.frota.domain.ProvedorTelemetria;
import com.nexo.app.modules.frota.domain.RegimeVeiculo;
import com.nexo.app.modules.frota.domain.SituacaoOperacional;
import com.nexo.app.modules.frota.domain.TipoDocumentoFrota;
import org.springframework.stereotype.Service;

import java.util.Arrays;
import java.util.Map;

/** Listas fechadas da frota com o rótulo de exibição, para a tela não duplicar textos. */
@Service
public class OpcoesFrotaUseCases {

    private static final Map<OrigemLeituraOdometro, String> ORIGENS = Map.of(
            OrigemLeituraOdometro.MANUAL, "Lançamento manual",
            OrigemLeituraOdometro.CHECKLIST, "Checklist",
            OrigemLeituraOdometro.ABASTECIMENTO, "Abastecimento",
            OrigemLeituraOdometro.MANUTENCAO, "Manutenção",
            OrigemLeituraOdometro.TELEMETRIA, "Telemetria",
            OrigemLeituraOdometro.IMPORTACAO, "Importação");

    public OpcoesFrotaResponse listar() {
        return new OpcoesFrotaResponse(
                Arrays.stream(SituacaoOperacional.values()).map(v -> new OpcaoFrota(v.name(), v.getRotulo())).toList(),
                Arrays.stream(RegimeVeiculo.values()).map(v -> new OpcaoFrota(v.name(), v.getRotulo())).toList(),
                Arrays.stream(Combustivel.values()).map(v -> new OpcaoFrota(v.name(), v.getRotulo())).toList(),
                Arrays.stream(ProvedorTelemetria.values()).map(v -> new OpcaoFrota(v.name(), v.getRotulo())).toList(),
                Arrays.stream(CategoriaCnh.values()).map(v -> new OpcaoFrota(v.name(), v.name())).toList(),
                Arrays.stream(TipoDocumentoFrota.values()).map(v -> new OpcaoFrota(v.name(), v.getRotulo())).toList(),
                Arrays.stream(OrigemLeituraOdometro.values()).map(v -> new OpcaoFrota(v.name(), ORIGENS.get(v))).toList(),
                Arrays.stream(SituacaoOrdemServico.values()).map(v -> new OpcaoFrota(v.name(), v.getRotulo())).toList(),
                Arrays.stream(Criticidade.values()).map(v -> new OpcaoFrota(v.name(), v.getRotulo())).toList(),
                Arrays.stream(TipoManutencao.values()).map(v -> new OpcaoFrota(v.name(), v.getRotulo())).toList(),
                Arrays.stream(OrigemOrdemServico.values()).map(v -> new OpcaoFrota(v.name(), v.getRotulo())).toList(),
                Arrays.stream(TipoOficina.values()).map(v -> new OpcaoFrota(v.name(), v.getRotulo())).toList(),
                Arrays.stream(MotivoServico.values()).map(v -> new OpcaoFrota(v.name(), v.getRotulo())).toList(),
                Arrays.stream(NaturezaServico.values()).map(v -> new OpcaoFrota(v.name(), v.getRotulo())).toList(),
                Arrays.stream(SituacaoAprovacaoOrcamento.values()).map(v -> new OpcaoFrota(v.name(), v.getRotulo())).toList(),
                Arrays.stream(CausaManutencao.values()).map(v -> new OpcaoFrota(v.name(), v.getRotulo())).toList(),
                Arrays.stream(OrigemPeca.values()).map(v -> new OpcaoFrota(v.name(), v.getRotulo())).toList(),
                Arrays.stream(TipoSinistro.values()).map(v -> new OpcaoFrota(v.name(), v.getRotulo())).toList(),
                Arrays.stream(SituacaoSinistro.values()).map(v -> new OpcaoFrota(v.name(), v.getRotulo())).toList());
    }
}
