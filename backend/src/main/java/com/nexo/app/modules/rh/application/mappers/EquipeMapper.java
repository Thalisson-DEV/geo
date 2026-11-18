package com.nexo.app.modules.rh.application.mappers;

import com.nexo.app.modules.rh.EquipeMembroResponse;
import com.nexo.app.modules.rh.EquipeResponse;
import com.nexo.app.modules.rh.domain.Equipe;
import com.nexo.app.modules.rh.domain.EquipeMembro;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingConstants;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Mapper(componentModel = MappingConstants.ComponentModel.SPRING, uses = {
    TipoEquipeMapper.class,
    VeiculoMapper.class,
    CoordenadorMapper.class,
    SupervisorMapper.class,
    ColaboradorMapper.class,
    BaseOperacionalMapper.class,
    ProcessoNegocioMapper.class
})
public interface EquipeMapper {

    /** A meta vem do cadastro de metas de faturamento (MetaFaturamentoUseCases.comMetaVigente). */
    @Mapping(target = "metaFaturamentoMensal", ignore = true)
    @Mapping(target = "metaFaturamentoDiaria", ignore = true)
    @Mapping(target = "membros", expression = "java(toMembroResponseList(membrosAtivos(equipe)))")
    EquipeResponse toResponse(Equipe equipe);

    /**
     * Só os vínculos ativos, um por colaborador. A equipe guarda o histórico: cada
     * troca de responsável encerra o vínculo antigo e cria outro para a mesma
     * pessoa, e devolvê-lo fazia o colaborador aparecer duas vezes na nota, no
     * turno e na inspeção do app de campo.
     */
    default List<EquipeMembro> membrosAtivos(Equipe equipe) {
        if (equipe == null || equipe.getMembros() == null) {
            return List.of();
        }
        Set<UUID> vistos = new HashSet<>();
        return equipe.getMembros().stream()
                .filter(EquipeMembro::isVinculoAtivo)
                .filter(m -> vistos.add(m.getColaborador().getId()))
                .toList();
    }

    List<EquipeResponse> toResponseList(List<Equipe> equipes);

    @Mapping(target = "idColaborador", source = "colaborador.id")
    @Mapping(target = "nomeColaborador", source = "colaborador.nomeCompleto")
    @Mapping(target = "vinculoAtivo", expression = "java(entity.isVinculoAtivo())")
    EquipeMembroResponse toMembroResponse(EquipeMembro entity);

    List<EquipeMembroResponse> toMembroResponseList(List<EquipeMembro> membros);
}
