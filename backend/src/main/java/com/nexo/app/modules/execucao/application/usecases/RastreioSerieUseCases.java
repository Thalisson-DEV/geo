package com.nexo.app.modules.execucao.application.usecases;

import com.nexo.app.modules.estoque.EstoqueApi;
import com.nexo.app.modules.estoque.MaterialResponse;
import com.nexo.app.modules.execucao.application.dto.SerieNaNota;
import com.nexo.app.modules.execucao.domain.ExecucaoComercial;
import com.nexo.app.modules.execucao.domain.ExecucaoMaterial;
import com.nexo.app.modules.execucao.domain.TipoNota;
import com.nexo.app.modules.execucao.infrastructure.persistence.ExecucaoMaterialRepository;
import com.nexo.app.modules.rh.EquipeApi;
import com.nexo.app.modules.rh.EquipeResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * Rastreio de números de série (ex.: medidores): em quais notas cada série foi aplicada ou retirada.
 * A série exata vem primeiro; só a que não tem lançamento exato é procurada por trecho, com limite,
 * para um pedaço curto não devolver centenas de notas.
 */
@Service
@RequiredArgsConstructor
public class RastreioSerieUseCases {

    public static final int MAXIMO_SERIES = 200;
    static final int TAMANHO_MINIMO_TRECHO = 5;
    static final int MAXIMO_POR_TRECHO = 10;

    private final ExecucaoMaterialRepository materialRepository;
    private final EquipeApi equipeApi;
    private final EstoqueApi estoqueApi;

    @Transactional(readOnly = true)
    public List<SerieNaNota> localizar(Collection<String> series) {
        Map<String, String> pedidas = normalizar(series);
        if (pedidas.isEmpty()) {
            return List.of();
        }
        List<Achado> achados = new ArrayList<>();
        Set<String> encontradas = new HashSet<>();
        for (ExecucaoMaterial material : materialRepository.buscarPorSeries(pedidas.keySet())) {
            String chave = chave(material.getNumSerie());
            achados.add(new Achado(pedidas.get(chave), material, true));
            encontradas.add(chave);
        }
        pedidas.forEach((chave, informada) -> {
            if (encontradas.contains(chave) || chave.length() < TAMANHO_MINIMO_TRECHO) {
                return;
            }
            materialRepository.buscarPorTrechoDeSerie("%" + escaparLike(chave) + "%",
                            PageRequest.of(0, MAXIMO_POR_TRECHO))
                    .forEach(material -> achados.add(new Achado(informada, material, false)));
        });
        return montar(achados);
    }

    /** Chave de comparação → série como foi pedida, sem repetir e na ordem do pedido. */
    private static Map<String, String> normalizar(Collection<String> series) {
        Map<String, String> pedidas = new LinkedHashMap<>();
        if (series == null) {
            return pedidas;
        }
        for (String serie : series) {
            if (serie == null || serie.isBlank()) continue;
            pedidas.putIfAbsent(chave(serie), serie.trim());
            if (pedidas.size() >= MAXIMO_SERIES) break;
        }
        return pedidas;
    }

    private static String chave(String serie) {
        return serie == null ? "" : serie.trim().toUpperCase(Locale.ROOT);
    }

    private static String escaparLike(String texto) {
        return texto.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    private List<SerieNaNota> montar(List<Achado> achados) {
        if (achados.isEmpty()) {
            return List.of();
        }
        Map<UUID, EquipeResponse> equipes = new HashMap<>();
        equipeApi.buscarPorIdsResponse(achados.stream().map(a -> a.material().getExecucao().getIdEquipe())
                        .filter(Objects::nonNull).distinct().toList())
                .forEach(e -> equipes.putIfAbsent(e.id(), e));
        Map<UUID, MaterialResponse> materiais = new HashMap<>();
        estoqueApi.buscarMateriaisPorIdsResponse(achados.stream().map(a -> a.material().getIdMaterial())
                        .distinct().toList())
                .forEach(m -> materiais.putIfAbsent(m.id(), m));

        return achados.stream().map(achado -> {
            ExecucaoMaterial item = achado.material();
            ExecucaoComercial nota = item.getExecucao();
            EquipeResponse equipe = equipes.get(nota.getIdEquipe());
            MaterialResponse material = materiais.get(item.getIdMaterial());
            return new SerieNaNota(
                    achado.informada(),
                    item.getNumSerie() == null ? null : item.getNumSerie().trim(),
                    achado.exata(),
                    nota.getId(),
                    nota.getReferenciaNota(),
                    nota.getTipoNota(),
                    nota.getTipoNota() == TipoNota.AVULSA && nota.getDataNumeroOficial() == null,
                    nota.getDataLancamento(),
                    nota.getStatusExecucao(),
                    item.getOperacao(),
                    item.getOrigem(),
                    material == null ? null : material.codigo(),
                    material == null ? null : material.descricao(),
                    equipe == null ? null : equipe.codigo(),
                    equipe == null || equipe.baseOperacional() == null ? null : equipe.baseOperacional().nome());
        }).toList();
    }

    private record Achado(String informada, ExecucaoMaterial material, boolean exata) {
    }
}
