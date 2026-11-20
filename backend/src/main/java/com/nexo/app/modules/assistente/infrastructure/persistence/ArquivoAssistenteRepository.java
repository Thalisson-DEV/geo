package com.nexo.app.modules.assistente.infrastructure.persistence;

import com.nexo.app.modules.assistente.domain.ArquivoAssistente;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ArquivoAssistenteRepository extends JpaRepository<ArquivoAssistente, UUID> {

    Optional<ArquivoAssistente> findByIdAndUsuarioIdAndAtivoTrue(UUID id, UUID usuarioId);

    List<ArquivoAssistente> findByIdInAndUsuarioIdAndAtivoTrue(Collection<UUID> ids, UUID usuarioId);

    /** Metadados leves (sem texto extraido nem dados tabulares) dos arquivos ativos da conversa. */
    @Query("""
            select new com.nexo.app.modules.assistente.infrastructure.persistence.ArquivoResumo(
                a.id, a.codigo, a.conversaId, a.origem, a.nome, a.tipoConteudo, a.categoria, a.tamanhoBytes,
                a.armazenamento, a.chaveArmazenamento, a.status, a.erro, a.resumoJson, a.dataCriacao)
            from ArquivoAssistente a where a.conversaId = :conversaId and a.ativo = true order by a.dataCriacao asc
            """)
    List<ArquivoResumo> listarResumos(@Param("conversaId") UUID conversaId);

    Optional<ArquivoAssistente> findByConversaIdAndCodigoAndAtivoTrue(UUID conversaId, String codigo);

    @Query("select count(a) from ArquivoAssistente a where a.conversaId = :conversaId and a.codigo is not null")
    long contarCodificados(@Param("conversaId") UUID conversaId);
}
