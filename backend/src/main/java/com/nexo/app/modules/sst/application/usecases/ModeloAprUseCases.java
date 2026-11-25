package com.nexo.app.modules.sst.application.usecases;

import com.nexo.app.modules.sst.AprApi;
import com.nexo.app.modules.sst.application.dto.ModeloAprRequest;
import com.nexo.app.modules.sst.application.dto.ModeloAprResponse;
import com.nexo.app.modules.sst.domain.CondicaoApr;
import com.nexo.app.modules.sst.domain.EstruturaApr;
import com.nexo.app.modules.sst.domain.ModeloApr;
import com.nexo.app.modules.sst.infrastructure.persistence.ModeloAprRepository;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/** Cadastro único da APR, mantido pelo SST, e as opções que chegam ao app de campo. */
@Service
@RequiredArgsConstructor
public class ModeloAprUseCases implements AprApi {

    private final ModeloAprRepository repository;

    @Transactional(readOnly = true)
    public ModeloAprResponse obter() {
        return toResponse(buscar());
    }

    @Transactional
    public ModeloAprResponse salvar(ModeloAprRequest request) {
        ModeloApr modelo = repository.findFirstByAtivoTrueOrderByDataCriacaoAsc()
                .map(m -> {
                    m.alterar(request.estrutura());
                    return m;
                })
                .orElseGet(() -> new ModeloApr(request.estrutura()));
        return toResponse(repository.saveAndFlush(modelo));
    }

    /**
     * Opções da APR para o app: as listas na ordem do cadastro, o que cada condição sugere, as medidas que cada risco
     * puxa e em que condição cada verificação aparece. Tudo em texto, como a APR grava.
     */
    @Override
    @Transactional(readOnly = true)
    public OpcoesAprCampo opcoesParaCampo() {
        EstruturaApr e = buscar().getEstrutura();
        Map<String, String> textoDaMedida = e.medidas().stream()
                .collect(Collectors.toMap(EstruturaApr.Medida::id, EstruturaApr.Medida::texto, (a, b) -> a));

        Map<String, Sugestao> sugestoes = new LinkedHashMap<>();
        for (CondicaoApr c : CondicaoApr.values()) {
            List<String> riscos = e.riscos().stream().filter(r -> r.sugeridoEm().contains(c)).map(EstruturaApr.Risco::texto).toList();
            List<String> medidas = e.medidas().stream().filter(m -> m.sugeridaEm().contains(c)).map(EstruturaApr.Medida::texto).toList();
            if (!riscos.isEmpty() || !medidas.isEmpty()) {
                sugestoes.put(c.name(), new Sugestao(riscos, medidas));
            }
        }
        Map<String, List<String>> medidasDoRisco = new LinkedHashMap<>();
        for (EstruturaApr.Risco r : e.riscos()) {
            List<String> medidas = r.medidas().stream().map(textoDaMedida::get).filter(t -> t != null).toList();
            if (!medidas.isEmpty()) {
                medidasDoRisco.put(r.texto(), medidas);
            }
        }
        Map<String, List<String>> condicoesDasVerificacoes = new LinkedHashMap<>();
        for (EstruturaApr.Verificacao v : e.verificacoes()) {
            if (!v.exigidaEm().isEmpty() && !v.exigidaEm().contains(CondicaoApr.SEMPRE)) {
                condicoesDasVerificacoes.put(v.texto(), v.exigidaEm().stream().map(Enum::name).toList());
            }
        }
        return new OpcoesAprCampo(
                e.riscos().stream().map(EstruturaApr.Risco::texto).toList(),
                e.medidas().stream().map(EstruturaApr.Medida::texto).toList(),
                e.verificacoes().stream().map(EstruturaApr.Verificacao::texto).toList(),
                sugestoes, medidasDoRisco, condicoesDasVerificacoes);
    }

    private ModeloApr buscar() {
        return repository.findFirstByAtivoTrueOrderByDataCriacaoAsc()
                .orElseThrow(() -> new RecursoNaoEncontradoException("A APR ainda não foi cadastrada."));
    }

    private static ModeloAprResponse toResponse(ModeloApr m) {
        List<ModeloAprResponse.Condicao> condicoes = Arrays.stream(CondicaoApr.values())
                .map(c -> new ModeloAprResponse.Condicao(c, c.rotulo())).toList();
        OffsetDateTime em = m.getDataUltimaAlteracao() != null ? m.getDataUltimaAlteracao() : m.getDataCriacao();
        String por = m.getUsuarioUltimaAlteracao() != null ? m.getUsuarioUltimaAlteracao() : m.getUsuarioCriacao();
        return new ModeloAprResponse(m.getEstrutura(), condicoes, em, por);
    }
}
