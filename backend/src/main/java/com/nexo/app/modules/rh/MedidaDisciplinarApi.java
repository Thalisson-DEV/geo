package com.nexo.app.modules.rh;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;

/**
 * API pública das medidas disciplinares para outros módulos.
 *
 * <p>Quem abriu uma medida (ex.: a multa da frota) guarda o id e mostra a situação lendo
 * daqui. O contrato não traz a descrição dos fatos nem o nome do colaborador: o detalhe é
 * dado restrito e fica atrás de {@code rh:medida-disciplinar:read}.</p>
 */
public interface MedidaDisciplinarApi {

    /**
     * Situação, tipo e datas das medidas informadas, indexadas por id e em uma consulta só.
     * Ids inexistentes não aparecem no resultado.
     */
    Map<UUID, ResumoMedidaDisciplinar> resumos(Collection<UUID> ids);
}
