package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.application.dto.ModeloChecklistFilter;
import com.nexo.app.modules.frota.application.dto.ModeloChecklistRequest;
import com.nexo.app.modules.frota.application.dto.TipoVeiculoRequest;
import com.nexo.app.modules.frota.domain.TipoModeloChecklist;
import com.nexo.app.modules.frota.domain.TipoRespostaChecklist;
import com.nexo.app.modules.frota.infrastructure.persistence.ModeloChecklistRepository;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Gravação real dos modelos: coleções de tipos, perguntas, alternativas e a edição que desativa o que saiu. */
@SpringBootTest
@Transactional
class ModeloChecklistUseCasesTest {

    @Autowired
    private ModeloChecklistUseCases useCases;
    @Autowired
    private TipoVeiculoUseCases tiposVeiculo;
    @Autowired
    private ModeloChecklistRepository repository;
    @Autowired
    private EntityManager entityManager;

    private static ModeloChecklistRequest.Pergunta farois(UUID id) {
        return new ModeloChecklistRequest.Pergunta(id, "Iluminação", "Faróis", TipoRespostaChecklist.OK_NOK, true, null, null,
                List.of(new ModeloChecklistRequest.Alternativa(null, "Queimado", false)));
    }

    private static ModeloChecklistRequest request(String nome, Set<UUID> tipos, List<ModeloChecklistRequest.Pergunta> perguntas) {
        return new ModeloChecklistRequest(nome, TipoModeloChecklist.PRINCIPAL, null, false, tipos, Set.of(), perguntas,
                List.of(new ModeloChecklistRequest.FotoRecebimento(null, "Frente")));
    }

    @Test
    void criaEditaEListaModelo() {
        var tipo = tiposVeiculo.criar(new TipoVeiculoRequest("CAMINHONETE TESTE", null, null));
        var pneus = new ModeloChecklistRequest.Pergunta(null, null, "Pneus", TipoRespostaChecklist.TEXTO, false, null, null, null);
        var criado = useCases.criar(request("Caminhonete", Set.of(tipo.id()), List.of(farois(null), pneus)));
        entityManager.flush();
        entityManager.clear();

        assertThat(criado.tiposVeiculo()).extracting(o -> o.rotulo()).containsExactly("CAMINHONETE TESTE");
        assertThat(criado.perguntas()).hasSize(2);
        var idFarois = criado.perguntas().getFirst().id();

        var editado = useCases.atualizar(criado.id(), request("Caminhonete", Set.of(tipo.id()), List.of(farois(idFarois))));
        entityManager.flush();
        entityManager.clear();

        assertThat(editado.perguntas()).extracting(p -> p.id()).containsExactly(idFarois);
        var gravado = repository.findById(criado.id()).orElseThrow();
        assertThat(gravado.getPerguntas()).as("a pergunta retirada fica desativada").hasSize(2);

        var lista = useCases.listar(new ModeloChecklistFilter(null, TipoModeloChecklist.PRINCIPAL, true), PageRequest.of(0, 10));
        assertThat(lista.getContent()).singleElement().satisfies(r -> {
            assertThat(r.quantidadePerguntas()).isEqualTo(1);
            assertThat(r.quantidadeFotosRecebimento()).isEqualTo(1);
        });
    }

    @Test
    void recusaNomeRepetidoETipoInexistente() {
        useCases.criar(request("Geral", Set.of(), List.of(farois(null))));

        assertThatThrownBy(() -> useCases.criar(request("geral", Set.of(), List.of(farois(null)))))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("Já existe");
        assertThatThrownBy(() -> useCases.criar(request("Outro", Set.of(UUID.randomUUID()), List.of(farois(null)))))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("tipo de veículo");
    }
}
