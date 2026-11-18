package com.nexo.app.modules.financeiro.infrastructure.persistence;

import com.nexo.app.modules.financeiro.domain.SolicitacaoCompra;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface SolicitacaoCompraRepository
        extends JpaRepository<SolicitacaoCompra, UUID>, JpaSpecificationExecutor<SolicitacaoCompra> {

    /** Busca pelo número sequencial, que é como as equipes se referem à solicitação. */
    Optional<SolicitacaoCompra> findByNumero(Long numero);

    /** Fila de decisão: as que aguardam aprovação, das mais antigas para as mais novas. */
    java.util.List<SolicitacaoCompra> findByStatusAndAtivoTrueOrderByDataSubmissaoAsc(
            com.nexo.app.modules.financeiro.domain.StatusSolicitacao status, Pageable pageable);

    @Query("""
            select s from SolicitacaoCompra s
            where s.nucleo.dadosPagamento is not null
              and s.nucleo.dadosPagamentoBusca is null
            """)
    java.util.List<SolicitacaoCompra> buscarPendentesReindexacao(Pageable pageable);

    /** Compras do fornecedor com forma de pagamento informada, das mais novas para as mais antigas. */
    @Query("""
            select s from SolicitacaoCompra s
            where s.ativo = true
              and s.nucleo.fornecedorId = :idFornecedor
              and s.nucleo.formaPagamento is not null
            order by s.dataCriacao desc
            """)
    java.util.List<SolicitacaoCompra> buscarRecentesDoFornecedor(UUID idFornecedor, Pageable pageable);

    /** Compras do veículo com setor informado, das mais novas para as mais antigas. */
    @Query("""
            select s from SolicitacaoCompra s
            where s.ativo = true
              and s.nucleo.veiculoId = :idVeiculo
              and s.nucleo.processoId is not null
            order by s.dataCriacao desc
            """)
    java.util.List<SolicitacaoCompra> buscarRecentesDoVeiculo(UUID idVeiculo, Pageable pageable);
}
