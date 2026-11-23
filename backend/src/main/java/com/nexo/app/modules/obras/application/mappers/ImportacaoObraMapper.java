package com.nexo.app.modules.obras.application.mappers;

import com.nexo.app.modules.obras.application.dto.HistoricoImportacaoResponse;
import com.nexo.app.modules.obras.application.dto.OrcamentoObraResponse;
import com.nexo.app.modules.obras.domain.ImportacaoObra;
import com.nexo.app.modules.obras.domain.RevisaoOrcamentoObra;
import org.mapstruct.Mapper;
import org.mapstruct.MappingConstants;
import org.mapstruct.ReportingPolicy;

@Mapper(componentModel = MappingConstants.ComponentModel.SPRING,
        unmappedTargetPolicy = ReportingPolicy.IGNORE)
public interface ImportacaoObraMapper {

    HistoricoImportacaoResponse toResponse(ImportacaoObra entity);

    OrcamentoObraResponse.Revisao toRevisao(RevisaoOrcamentoObra entity);
}
