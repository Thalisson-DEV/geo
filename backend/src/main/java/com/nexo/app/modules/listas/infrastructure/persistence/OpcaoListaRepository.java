package com.nexo.app.modules.listas.infrastructure.persistence;

import com.nexo.app.modules.listas.ListaConfiguravel;
import com.nexo.app.modules.listas.domain.OpcaoLista;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface OpcaoListaRepository extends JpaRepository<OpcaoLista, UUID>, JpaSpecificationExecutor<OpcaoLista> {

    List<OpcaoLista> findByListaOrderByOrdemAscRotuloAsc(ListaConfiguravel lista);

    Optional<OpcaoLista> findByListaAndCodigo(ListaConfiguravel lista, String codigo);

    boolean existsByListaAndRotuloIgnoreCaseAndIdNot(ListaConfiguravel lista, String rotulo, UUID id);

    boolean existsByListaAndRotuloIgnoreCase(ListaConfiguravel lista, String rotulo);

    @Query("select coalesce(max(o.ordem), 0) from OpcaoLista o where o.lista = :lista")
    int maiorOrdem(ListaConfiguravel lista);
}
