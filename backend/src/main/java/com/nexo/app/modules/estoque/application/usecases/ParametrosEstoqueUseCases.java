package com.nexo.app.modules.estoque.application.usecases;

import com.nexo.app.modules.estoque.application.dto.BalcaoRequests;
import com.nexo.app.modules.estoque.application.dto.BalcaoResponses;
import com.nexo.app.modules.estoque.domain.ParametrosEstoque;
import com.nexo.app.modules.estoque.infrastructure.persistence.ParametrosEstoqueRepository;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Regras do almoxarifado editáveis sem deploy (linha única criada pela migração). */
@Service
@RequiredArgsConstructor
public class ParametrosEstoqueUseCases {

    private final ParametrosEstoqueRepository repository;

    @Transactional(readOnly = true)
    public BalcaoResponses.Parametros consultar() {
        return toResponse(obter());
    }

    @Transactional
    public BalcaoResponses.Parametros atualizar(BalcaoRequests.Parametros request) {
        ParametrosEstoque parametros = obter();
        parametros.atualizar(request.separacaoObrigatoria(), request.entregaAcimaPedido(), request.devolucaoAcimaCaminhao(),
                request.exigeAssinatura(), request.exigeMatricula(), request.exigeFoto());
        return toResponse(repository.save(parametros));
    }

    ParametrosEstoque obter() {
        return repository.findById(ParametrosEstoque.ID_UNICO)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Parâmetros do almoxarifado não configurados."));
    }

    static BalcaoResponses.Parametros toResponse(ParametrosEstoque p) {
        return new BalcaoResponses.Parametros(p.isSeparacaoObrigatoria(), p.isEntregaAcimaPedido(), p.isDevolucaoAcimaCaminhao(),
                p.isExigeAssinatura(), p.isExigeMatricula(), p.isExigeFoto());
    }
}
