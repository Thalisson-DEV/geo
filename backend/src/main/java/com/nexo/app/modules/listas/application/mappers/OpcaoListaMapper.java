package com.nexo.app.modules.listas.application.mappers;

import com.nexo.app.modules.listas.application.dto.OpcaoListaResponse;
import com.nexo.app.modules.listas.domain.OpcaoLista;
import org.mapstruct.Mapper;

@Mapper(componentModel = "spring")
public interface OpcaoListaMapper {

    OpcaoListaResponse toResponse(OpcaoLista opcao);
}
