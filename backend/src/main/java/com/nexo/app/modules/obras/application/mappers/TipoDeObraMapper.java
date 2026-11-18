package com.nexo.app.modules.obras.application.mappers;

import com.nexo.app.modules.obras.application.dto.TipoDeObraResponse;
import com.nexo.app.modules.obras.domain.TipoDeObra;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingConstants;
import org.mapstruct.ReportingPolicy;

import java.util.List;

@Mapper(componentModel = MappingConstants.ComponentModel.SPRING,
        unmappedTargetPolicy = ReportingPolicy.IGNORE)
public interface TipoDeObraMapper {

    @Mapping(target = "classeOperacional", expression = "java(entity.classeOperacional())")
    TipoDeObraResponse toResponse(TipoDeObra entity);

    List<TipoDeObraResponse> toResponseList(List<TipoDeObra> entities);
}
