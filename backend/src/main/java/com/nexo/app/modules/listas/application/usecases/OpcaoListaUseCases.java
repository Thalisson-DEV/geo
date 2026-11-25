package com.nexo.app.modules.listas.application.usecases;

import com.nexo.app.modules.listas.ListaConfiguravel;
import com.nexo.app.modules.listas.ListasApi;
import com.nexo.app.modules.listas.application.dto.ListaConfiguravelResponse;
import com.nexo.app.modules.listas.application.dto.OpcaoListaFilter;
import com.nexo.app.modules.listas.application.dto.OpcaoListaRequest;
import com.nexo.app.modules.listas.application.dto.OpcaoListaResponse;
import com.nexo.app.modules.listas.application.mappers.OpcaoListaMapper;
import com.nexo.app.modules.listas.domain.OpcaoLista;
import com.nexo.app.modules.listas.infrastructure.persistence.OpcaoListaRepository;
import com.nexo.app.modules.listas.infrastructure.persistence.OpcaoListaSpecification;
import com.nexo.app.shared.application.dto.PageResponse;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class OpcaoListaUseCases implements ListasApi {

    private final OpcaoListaRepository repository;
    private final OpcaoListaMapper mapper;

    public ListaConfiguravelResponse descrever(ListaConfiguravel lista) {
        return new ListaConfiguravelResponse(lista, lista.rotulo(), lista.descricao(), lista.contextos());
    }

    @Transactional(readOnly = true)
    public PageResponse<OpcaoListaResponse> listar(ListaConfiguravel lista, OpcaoListaFilter filter, Pageable pageable) {
        return PageResponse.fromPage(repository.findAll(OpcaoListaSpecification.filterBy(lista, filter), pageable).map(mapper::toResponse));
    }

    @Transactional
    public OpcaoListaResponse criar(ListaConfiguravel lista, OpcaoListaRequest request) {
        OpcaoLista nova = new OpcaoLista(lista, request.rotulo(), request.descricao(), repository.maiorOrdem(lista) + 1);
        nova.definirContextos(request.contextos());
        if (repository.existsByListaAndRotuloIgnoreCase(lista, nova.getRotulo())) {
            throw new InvarianteVioladaException("Já existe a opção \"" + nova.getRotulo() + "\" nesta lista.");
        }
        repository.findByListaAndCodigo(lista, nova.getCodigo()).ifPresent(existente -> {
            throw new InvarianteVioladaException("Já existe uma opção parecida (\"" + existente.getRotulo() + "\")"
                    + (existente.isAtivo() ? "." : ", desativada. Reative-a em vez de criar outra."));
        });
        return mapper.toResponse(repository.save(nova));
    }

    @Transactional
    public OpcaoListaResponse atualizar(ListaConfiguravel lista, UUID id, OpcaoListaRequest request) {
        OpcaoLista opcao = buscar(lista, id);
        if (repository.existsByListaAndRotuloIgnoreCaseAndIdNot(lista, request.rotulo().trim(), id)) {
            throw new InvarianteVioladaException("Já existe outra opção com esse nome nesta lista.");
        }
        opcao.atualizar(request.rotulo(), request.descricao());
        opcao.definirContextos(request.contextos());
        return mapper.toResponse(repository.save(opcao));
    }

    @Transactional
    public void desativar(ListaConfiguravel lista, UUID id) {
        OpcaoLista opcao = buscar(lista, id);
        opcao.desativar();
        repository.save(opcao);
    }

    @Transactional
    public void reativar(ListaConfiguravel lista, UUID id) {
        OpcaoLista opcao = buscar(lista, id);
        opcao.ativar();
        repository.save(opcao);
    }

    /** Sobe ou desce a opção uma posição entre as da lista (a ordem é a que web e app mostram). */
    @Transactional
    public void mover(ListaConfiguravel lista, UUID id, int delta) {
        List<OpcaoLista> todas = repository.findByListaOrderByOrdemAscRotuloAsc(lista);
        int i = -1;
        for (int k = 0; k < todas.size(); k++) {
            if (todas.get(k).getId().equals(id)) {
                i = k;
            }
        }
        if (i < 0) {
            throw new RecursoNaoEncontradoException("Opção não encontrada nesta lista.");
        }
        int j = i + Integer.signum(delta);
        if (j < 0 || j >= todas.size()) {
            return;
        }
        OpcaoLista a = todas.get(i);
        todas.set(i, todas.get(j));
        todas.set(j, a);
        for (int k = 0; k < todas.size(); k++) {
            todas.get(k).posicionar(k + 1);
        }
        repository.saveAll(todas);
    }

    @Override
    @Transactional(readOnly = true)
    public List<Opcao> ativas(ListaConfiguravel lista) {
        return repository.findByListaOrderByOrdemAscRotuloAsc(lista).stream()
                .filter(OpcaoLista::isAtivo)
                .map(o -> new Opcao(o.getCodigo(), o.getRotulo(), o.getContextos()))
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public Map<String, String> rotulos(ListaConfiguravel lista) {
        Map<String, String> rotulos = new LinkedHashMap<>();
        repository.findByListaOrderByOrdemAscRotuloAsc(lista).forEach(o -> rotulos.put(o.getCodigo(), o.getRotulo()));
        return rotulos;
    }

    @Override
    @Transactional(readOnly = true)
    public String rotulo(ListaConfiguravel lista, String codigo) {
        if (codigo == null) {
            return null;
        }
        return repository.findByListaAndCodigo(lista, codigo).map(OpcaoLista::getRotulo).orElse(codigo);
    }

    @Override
    @Transactional(readOnly = true)
    public String exigirAtiva(ListaConfiguravel lista, String codigo) {
        if (codigo == null || codigo.isBlank()) {
            throw new InvarianteVioladaException("Escolha uma opção em " + lista.rotulo().toLowerCase() + ".");
        }
        OpcaoLista opcao = repository.findByListaAndCodigo(lista, codigo.trim())
                .orElseThrow(() -> new InvarianteVioladaException("A opção \"" + codigo + "\" não existe em " + lista.rotulo().toLowerCase() + "."));
        if (!opcao.isAtivo()) {
            throw new InvarianteVioladaException("A opção \"" + opcao.getRotulo() + "\" foi desativada. Escolha outra.");
        }
        return opcao.getCodigo();
    }

    @Override
    @Transactional(readOnly = true)
    public String exigirAtiva(ListaConfiguravel lista, String codigo, String contexto) {
        String valido = exigirAtiva(lista, codigo);
        OpcaoLista opcao = repository.findByListaAndCodigo(lista, valido).orElseThrow();
        if (contexto != null && !opcao.valeEm(contexto)) {
            String onde = lista.contextos().stream().filter(c -> c.codigo().equals(contexto)).map(ListaConfiguravel.Contexto::rotulo)
                    .findFirst().orElse(contexto);
            throw new InvarianteVioladaException("O motivo \"" + opcao.getRotulo() + "\" não vale para " + onde.toLowerCase() + ".");
        }
        return valido;
    }

    @Override
    @Transactional(readOnly = true)
    public String exigirExistente(ListaConfiguravel lista, String codigo) {
        if (codigo == null || codigo.isBlank()) {
            throw new InvarianteVioladaException("Escolha uma opção em " + lista.rotulo().toLowerCase() + ".");
        }
        return repository.findByListaAndCodigo(lista, codigo.trim()).map(OpcaoLista::getCodigo)
                .orElseThrow(() -> new InvarianteVioladaException("A opção \"" + codigo + "\" não existe em " + lista.rotulo().toLowerCase() + "."));
    }

    private OpcaoLista buscar(ListaConfiguravel lista, UUID id) {
        return repository.findById(id).filter(o -> o.getLista() == lista)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Opção não encontrada nesta lista."));
    }
}
