package com.nexo.app.modules.frota.domain;

import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Quais modelos o veículo usa: os principais do tipo de veículo (os específicos ganham dos
 * genéricos; mais de um específico fica para o usuário escolher) e os adicionais dos
 * implementos acoplados.
 */
public record ResolucaoModeloChecklist(List<ModeloChecklist> principais, List<ModeloChecklist> adicionais) {

    public static ResolucaoModeloChecklist resolver(Collection<ModeloChecklist> modelos,
                                                    UUID idTipoVeiculo,
                                                    Set<UUID> idsTiposImplementoAcoplados) {
        var ativos = modelos.stream().filter(ModeloChecklist::isAtivo).toList();
        var principais = ativos.stream().filter(m -> m.aplicaAoTipoVeiculo(idTipoVeiculo)).toList();
        var especificos = principais.stream().filter(ModeloChecklist::isEspecifico).toList();
        var adicionais = ativos.stream().filter(m -> m.aplicaAosImplementos(idsTiposImplementoAcoplados)).toList();
        return new ResolucaoModeloChecklist(especificos.isEmpty() ? principais : especificos, adicionais);
    }

    public boolean semModelo() {
        return principais.isEmpty();
    }

    public boolean exigeEscolha() {
        return principais.size() > 1;
    }
}
