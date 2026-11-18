package com.nexo.app.modules.estoque.application.services;

import com.nexo.app.modules.estoque.domain.ContextoSolicitacaoMaterial;
import com.nexo.app.modules.estoque.domain.Material;
import com.nexo.app.modules.rh.ProcessoNegocioApi;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

/**
 * Cada material pertence a um processo do cadastro. Os do processo Obras só entram nas
 * solicitações técnica e de fechamento; os demais, só na comercial. Assim o saldo de um
 * processo não é consumido pelo outro.
 */
@Service
@RequiredArgsConstructor
public class ProcessoMaterialService {

    public static final String PROCESSO_OBRAS = "OBRAS";

    private final ProcessoNegocioApi processoApi;

    public boolean ehDeObras(Material material) {
        return material != null && idObras().filter(id -> Objects.equals(id, material.getIdProcesso())).isPresent();
    }

    /** Mensagem para a pessoa quando o material não cabe no contexto; vazio quando cabe. */
    public Optional<String> incompatibilidade(ContextoSolicitacaoMaterial contexto, Material material) {
        Optional<UUID> idObras = idObras();
        // Sem o processo Obras no cadastro não há como separar: nada é barrado.
        if (contexto == null || material == null || idObras.isEmpty()) {
            return Optional.empty();
        }
        boolean obras = Objects.equals(idObras.get(), material.getIdProcesso());
        boolean contextoObras = contexto != ContextoSolicitacaoMaterial.COMERCIAL;
        if (obras == contextoObras) {
            return Optional.empty();
        }
        String nome = material.getCodigo() + " - " + material.getDescricao();
        return Optional.of(obras
                ? "O material " + nome + " é do processo Obras e só pode ser pedido em solicitação técnica ou de encerramento."
                : "O material " + nome + " não é do processo Obras e só pode ser pedido em solicitação comercial. "
                        + "Se ele também é usado em obras, ajuste o processo no cadastro do material.");
    }

    public void exigirCompativel(ContextoSolicitacaoMaterial contexto, Material material) {
        incompatibilidade(contexto, material).ifPresent(mensagem -> {
            throw new InvarianteVioladaException(mensagem);
        });
    }

    private Optional<UUID> idObras() {
        return processoApi.buscarIdPorNome(PROCESSO_OBRAS);
    }
}
