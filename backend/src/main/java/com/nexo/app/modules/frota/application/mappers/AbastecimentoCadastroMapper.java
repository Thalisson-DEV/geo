package com.nexo.app.modules.frota.application.mappers;

import com.nexo.app.modules.frota.application.dto.PostoAbastecimentoResponse;
import com.nexo.app.modules.frota.application.dto.ProdutoAbastecimentoResponse;
import com.nexo.app.modules.frota.domain.PostoAbastecimento;
import com.nexo.app.modules.frota.domain.ProdutoAbastecimento;
import org.mapstruct.Mapper;
import org.mapstruct.ReportingPolicy;

import java.util.Map;
import java.util.UUID;

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.IGNORE)
public interface AbastecimentoCadastroMapper {

    ProdutoAbastecimentoResponse toResponse(ProdutoAbastecimento entity);

    /** Nomes de base e fornecedor vêm de outros módulos, resolvidos em lote pelo caso de uso. */
    default PostoAbastecimentoResponse toResponse(PostoAbastecimento posto, Map<UUID, String> bases, Map<UUID, String> fornecedores) {
        return new PostoAbastecimentoResponse(
                posto.getId(),
                posto.getNome(),
                posto.getCnpj(),
                posto.getIdBaseOperacional(),
                nome(bases, posto.getIdBaseOperacional()),
                posto.getWhatsapp(),
                posto.getIdFornecedor(),
                nome(fornecedores, posto.getIdFornecedor()),
                posto.getObservacao(),
                posto.isAtivo());
    }

    /** Mapas imutáveis não aceitam chave nula: posto sem base ou sem fornecedor fica sem nome. */
    private static String nome(Map<UUID, String> nomes, UUID id) {
        return id == null ? null : nomes.get(id);
    }
}
