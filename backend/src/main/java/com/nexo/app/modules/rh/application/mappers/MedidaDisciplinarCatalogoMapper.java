package com.nexo.app.modules.rh.application.mappers;

import com.nexo.app.modules.rh.application.dto.MotivoMedidaDisciplinarResponse;
import com.nexo.app.modules.rh.application.dto.ParametrosRhResponse;
import com.nexo.app.modules.rh.application.dto.TipoMedidaDisciplinarResponse;
import com.nexo.app.modules.rh.domain.MotivoMedidaDisciplinar;
import com.nexo.app.modules.rh.domain.ParametrosRh;
import com.nexo.app.modules.rh.domain.TipoMedidaDisciplinar;
import org.mapstruct.Mapper;
import org.mapstruct.MappingConstants;

import java.util.List;

/** Catálogos e parâmetros das medidas disciplinares. A medida em si é montada no caso de uso (nomes de outras tabelas). */
@Mapper(componentModel = MappingConstants.ComponentModel.SPRING)
public interface MedidaDisciplinarCatalogoMapper {

    TipoMedidaDisciplinarResponse toResponse(TipoMedidaDisciplinar entity);

    List<TipoMedidaDisciplinarResponse> toTipos(List<TipoMedidaDisciplinar> entities);

    MotivoMedidaDisciplinarResponse toResponse(MotivoMedidaDisciplinar entity);

    List<MotivoMedidaDisciplinarResponse> toMotivos(List<MotivoMedidaDisciplinar> entities);

    ParametrosRhResponse toResponse(ParametrosRh entity);
}
