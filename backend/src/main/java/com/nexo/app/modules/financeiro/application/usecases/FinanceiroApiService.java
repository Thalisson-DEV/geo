package com.nexo.app.modules.financeiro.application.usecases;

import com.nexo.app.modules.financeiro.FinanceiroApi;
import com.nexo.app.modules.financeiro.FornecedorResumo;
import com.nexo.app.modules.financeiro.ResumoSolicitacaoFinanceira;
import com.nexo.app.modules.financeiro.domain.Fornecedor;
import com.nexo.app.modules.financeiro.domain.SolicitacaoBase;
import com.nexo.app.modules.financeiro.infrastructure.persistence.FornecedorRepository;
import com.nexo.app.modules.financeiro.infrastructure.persistence.SolicitacaoCompraRepository;
import com.nexo.app.modules.financeiro.infrastructure.persistence.SolicitacaoPagamentoRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/** Implementação da {@link FinanceiroApi}: consultas em lote, uma por tabela. */
@Service
@RequiredArgsConstructor
class FinanceiroApiService implements FinanceiroApi {

    private final SolicitacaoCompraRepository compras;
    private final SolicitacaoPagamentoRepository pagamentos;
    private final FornecedorRepository fornecedores;

    @Override
    @Transactional(readOnly = true)
    public Map<UUID, ResumoSolicitacaoFinanceira> resumosSolicitacoes(Collection<UUID> ids) {
        var validos = semNulos(ids);
        if (validos.isEmpty()) return Map.of();
        List<SolicitacaoBase> encontradas = Stream.concat(
                compras.findAllById(validos).stream(),
                pagamentos.findAllById(validos).stream()).map(SolicitacaoBase.class::cast).toList();
        Map<UUID, String> nomes = nomesFornecedores(encontradas.stream()
                .map(s -> s.getNucleo().getFornecedorId()).toList());
        Map<UUID, ResumoSolicitacaoFinanceira> resumos = new HashMap<>();
        for (SolicitacaoBase s : encontradas) {
            var nucleo = s.getNucleo();
            String fornecedor = nucleo.getFornecedorId() != null ? nomes.get(nucleo.getFornecedorId())
                    : nucleo.getFornecedorNome() != null ? nucleo.getFornecedorNome() : nucleo.getFornecedorRazaoSocial();
            resumos.put(s.getId(), new ResumoSolicitacaoFinanceira(
                    s.getId(),
                    s.getTipoSolicitacao().name(),
                    s.getNumero(),
                    s.getStatus().name(),
                    nucleo.getValor(),
                    s.getValorAprovado(),
                    fornecedor,
                    nucleo.getDescricao(),
                    s.getDataSubmissao(),
                    s.getDataDecisao(),
                    s.getMotivoRejeicao()));
        }
        return resumos;
    }

    @Override
    @Transactional(readOnly = true)
    public List<FornecedorResumo> fornecedoresUtilizaveis() {
        return fornecedores.findAll().stream()
                .filter(f -> f.isAtivo() && f.getStatus().isUtilizavel())
                .map(f -> new FornecedorResumo(f.getId(), nome(f)))
                .sorted(Comparator.comparing(FornecedorResumo::nome, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public Map<UUID, String> nomesFornecedores(Collection<UUID> ids) {
        var validos = semNulos(ids);
        if (validos.isEmpty()) return Map.of();
        return fornecedores.findAllById(validos).stream()
                .collect(Collectors.toMap(Fornecedor::getId, FinanceiroApiService::nome));
    }

    private static String nome(Fornecedor fornecedor) {
        return fornecedor.getNomeFantasia() != null ? fornecedor.getNomeFantasia() : fornecedor.getRazaoSocial();
    }

    private static List<UUID> semNulos(Collection<UUID> ids) {
        return ids == null ? List.of() : ids.stream().filter(Objects::nonNull).distinct().toList();
    }
}
