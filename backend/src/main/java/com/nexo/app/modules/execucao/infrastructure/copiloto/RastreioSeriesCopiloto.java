package com.nexo.app.modules.execucao.infrastructure.copiloto;

import com.nexo.app.modules.assistente.application.rastreio.LocalizadorSeries;
import com.nexo.app.modules.assistente.application.rastreio.SerieEncontrada;
import com.nexo.app.modules.execucao.application.dto.SerieNaNota;
import com.nexo.app.modules.execucao.application.usecases.RastreioSerieUseCases;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.List;
import java.util.Set;

/**
 * Em quais notas um número de série foi lançado, para a Bússola. Vale a mesma permissão de ver as notas na tela.
 */
@Component
public class RastreioSeriesCopiloto implements LocalizadorSeries {

    private final RastreioSerieUseCases useCases;

    public RastreioSeriesCopiloto(RastreioSerieUseCases useCases) {
        this.useCases = useCases;
    }

    @Override
    public Set<String> autoridades() {
        return Set.of("execucao:comercial:read");
    }

    @Override
    public List<SerieEncontrada> localizar(Collection<String> series) {
        return useCases.localizar(series).stream().map(RastreioSeriesCopiloto::converter).toList();
    }

    private static SerieEncontrada converter(SerieNaNota s) {
        return new SerieEncontrada(s.serieInformada(), s.numeroSerie(), s.exata(), s.referenciaNota(),
                nome(s.tipoNota()), s.aguardandoNumeroOficial(), s.dataLancamento(), nome(s.operacao()),
                s.materialCodigo(), s.material(), nome(s.origem()), s.equipe(), s.baseOperacional(),
                nome(s.statusExecucao()));
    }

    private static String nome(Enum<?> valor) {
        return valor == null ? null : valor.name();
    }
}
