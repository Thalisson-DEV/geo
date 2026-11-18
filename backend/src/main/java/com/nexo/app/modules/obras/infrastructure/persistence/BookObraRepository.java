package com.nexo.app.modules.obras.infrastructure.persistence;

import com.nexo.app.modules.obras.domain.AnexoObra;
import com.nexo.app.modules.obras.domain.DocumentoAsBuilt;
import com.nexo.app.modules.obras.domain.EquipamentoObra;
import com.nexo.app.modules.obras.domain.EvidenciaPonto;
import com.nexo.app.modules.obras.domain.FichaAsBuilt;
import com.nexo.app.modules.obras.domain.ItemPlanejado;
import com.nexo.app.modules.obras.domain.PlanejamentoObra;
import com.nexo.app.modules.obras.domain.PontoPlanejamento;
import com.nexo.app.modules.obras.domain.TipoAnexoObra;
import com.nexo.app.modules.obras.domain.VaoPlanejamento;
import com.nexo.app.modules.obras.domain.VisitaPreviaObra;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

/**
 * Leituras em lote do book e da entrega documental: o mesmo cálculo de completude serve a uma obra ou à carteira inteira,
 * sem uma consulta por obra.
 */
@org.springframework.stereotype.Repository
public interface BookObraRepository extends Repository<EvidenciaPonto, UUID> {

    /** Obra resumida para a visão consolidada: id, número, título, status, se o status é de conclusão, latitude e longitude. */
    @Query("""
            select o.id, o.numero, o.titulo, s.nome, s.concluida, o.latitude, o.longitude
            from Obra o join o.statusObra s
            where o.ativo = true and (:todas = true or o.id in :ids)
            """)
    List<Object[]> obras(@Param("todas") boolean todas, @Param("ids") Collection<UUID> ids);

    @Query("select p from PontoPlanejamento p where p.ativo = true and p.idObra in :ids order by p.pagina, p.numero")
    List<PontoPlanejamento> pontos(@Param("ids") Collection<UUID> ids);

    @Query("select v from VaoPlanejamento v where v.ativo = true and v.idObra in :ids")
    List<VaoPlanejamento> vaos(@Param("ids") Collection<UUID> ids);

    /** Pontos com algo já feito (execução apontada ou kit executado antes do sistema), por obra. */
    @Query("""
            select distinct k.idObra, k.idPonto from ItemPlanejado i join i.kitAplicado k
            where k.idObra in :ids and k.idPonto is not null and i.ativo = true and k.ativo = true
              and (i.quantidadeExecutada > 0 or k.executadoAntes = true)
            """)
    List<Object[]> pontosExecutados(@Param("ids") Collection<UUID> ids);

    @Query("select f from FichaAsBuilt f where f.ativo = true and f.idObra in :ids")
    List<FichaAsBuilt> fichas(@Param("ids") Collection<UUID> ids);

    @Query("select e from EvidenciaPonto e where e.ativo = true and e.idObra in :ids order by e.dataCriacao")
    List<EvidenciaPonto> evidencias(@Param("ids") Collection<UUID> ids);

    @Query("select v from VisitaPreviaObra v where v.ativo = true and v.idObra in :ids order by v.dataVisita desc, v.dataCriacao desc")
    List<VisitaPreviaObra> visitas(@Param("ids") Collection<UUID> ids);

    @Query("select p from PlanejamentoObra p where p.ativo = true and p.idObra in :ids")
    List<PlanejamentoObra> planejamentos(@Param("ids") Collection<UUID> ids);

    @Query("select a from AnexoObra a join fetch a.tipoAnexo where a.ativo = true and a.obra.id in :ids order by a.dataCriacao desc")
    List<AnexoObra> anexos(@Param("ids") Collection<UUID> ids);

    @Query("select d from DocumentoAsBuilt d where d.ativo = true and d.idObra in :ids order by d.dataCriacao desc")
    List<DocumentoAsBuilt> documentos(@Param("ids") Collection<UUID> ids);

    @Query("select e from EquipamentoObra e where e.ativo = true and e.idObra in :ids")
    List<EquipamentoObra> equipamentos(@Param("ids") Collection<UUID> ids);

    @Query("select t from TipoAnexoObra t where t.ativo = true and t.exigidoNaEntrega = true order by t.nome")
    List<TipoAnexoObra> tiposExigidosNaEntrega();

    /** Itens planejados da obra com o kit, para o comparativo previsto x realizado. */
    @Query("""
            select i from ItemPlanejado i join fetch i.kitAplicado k
            where k.idObra = :idObra and i.ativo = true and k.ativo = true
            order by k.codigoKit, i.tipo, i.codigo
            """)
    List<ItemPlanejado> itensPlanejados(@Param("idObra") UUID idObra);
}
