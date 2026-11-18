package com.nexo.app.modules.sst;

import com.nexo.app.modules.rh.ResumoColaborador;
import com.nexo.app.modules.sst.application.dto.AcompanhamentoMetaFilter;
import com.nexo.app.modules.sst.application.dto.AcompanhamentoMetaItem;
import com.nexo.app.modules.sst.application.dto.DesvioDetalhadoResponse;
import com.nexo.app.modules.sst.application.dto.DesvioSegurancaFilter;
import com.nexo.app.modules.sst.application.usecases.AcompanhamentoMetasUseCases;
import com.nexo.app.modules.sst.application.usecases.DesvioSegurancaUseCases;
import com.nexo.app.modules.sst.infrastructure.persistence.InspecaoSegurancaRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class SstRelatoriosApiImpl implements SstRelatoriosApi {

    private static final ZoneId ZONA = ZoneId.of("America/Sao_Paulo");

    private final AcompanhamentoMetasUseCases acompanhamento;
    private final DesvioSegurancaUseCases desvios;
    private final InspecaoSegurancaRepository inspecoes;

    @Override
    @Transactional(readOnly = true)
    public MetasDaSemana metasDaSemana(LocalDate hoje) {
        LocalDate semanaInicio = hoje.minusWeeks(1).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        LocalDate semanaFim = semanaInicio.plusDays(6);

        List<AcompanhamentoMetaItem> atuais = acompanhar(hoje);
        Map<String, Long> semana = realizadoNaSemana(atuais, semanaInicio, semanaFim);
        List<MetaPessoa> pessoas = atuais.stream().map(i -> pessoa(i, semana)).toList();

        // Um período que começou nos últimos 7 dias tem o anterior recém-fechado: na
        // primeira segunda do mês, o que importa é como o mês passado terminou.
        Set<LocalDate> fechamentos = new TreeSet<>();
        for (AcompanhamentoMetaItem item : atuais) {
            if (item.janelaInicio().isAfter(hoje.minusDays(7))) fechamentos.add(item.janelaInicio().minusDays(1));
        }
        Map<String, MetaPessoa> anteriores = new LinkedHashMap<>();
        for (LocalDate fim : fechamentos) {
            List<AcompanhamentoMetaItem> fechados = acompanhar(fim).stream()
                    .filter(i -> i.janelaFim().equals(fim))
                    .toList();
            Map<String, Long> semanaFechada = realizadoNaSemana(fechados, semanaInicio, semanaFim);
            fechados.forEach(i -> anteriores.putIfAbsent(chave(i), pessoa(i, semanaFechada)));
        }
        return new MetasDaSemana(hoje, semanaInicio, semanaFim, pessoas, new ArrayList<>(anteriores.values()));
    }

    @Override
    @Transactional(readOnly = true)
    public List<DesvioPendente> desviosPendentes() {
        DesvioSegurancaFilter pendentes = new DesvioSegurancaFilter(null, true, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null);
        return desvios.listarTodos(pendentes).stream().map(this::pendente).toList();
    }

    private List<AcompanhamentoMetaItem> acompanhar(LocalDate referencia) {
        return acompanhamento.acompanhar(new AcompanhamentoMetaFilter(referencia, null, null, null, null, null, null,
                null, null, null)).itens();
    }

    /** Inspeções do tipo da meta que cada pessoa lançou na semana, por colaborador e meta. */
    private Map<String, Long> realizadoNaSemana(List<AcompanhamentoMetaItem> itens, LocalDate inicio, LocalDate fim) {
        Set<UUID> usuarios = itens.stream().map(AcompanhamentoMetaItem::idUsuario).filter(Objects::nonNull)
                .collect(Collectors.toSet());
        if (usuarios.isEmpty()) return Map.of();
        Map<UUID, Map<UUID, Long>> porUsuario = new HashMap<>();
        inspecoes.listarRealizacoesPorInspetor(usuarios, inicio.atStartOfDay(ZONA).toOffsetDateTime(),
                        fim.plusDays(1).atStartOfDay(ZONA).toOffsetDateTime())
                .forEach(r -> porUsuario.computeIfAbsent(r.getIdInspetor(), id -> new HashMap<>())
                        .merge(r.getIdTipoInspecao(), 1L, Long::sum));
        Map<String, Long> resultado = new HashMap<>();
        for (AcompanhamentoMetaItem item : itens) {
            if (item.idUsuario() == null) continue;
            resultado.put(chave(item), porUsuario.getOrDefault(item.idUsuario(), Map.of())
                    .getOrDefault(item.idTipoInspecao(), 0L));
        }
        return resultado;
    }

    private static String chave(AcompanhamentoMetaItem item) {
        return item.idMeta() + "~" + item.idColaborador();
    }

    private static MetaPessoa pessoa(AcompanhamentoMetaItem i, Map<String, Long> semana) {
        return new MetaPessoa(i.idColaborador(), i.nomeColaborador(), i.idUsuario(), i.nomeFuncao(),
                i.nomeBaseOperacional(), i.nomeProcesso(), i.nomeTipoInspecao(), i.janelaInicio(), i.janelaFim(),
                i.diasRestantes(), i.meta(), i.realizado(), semana.getOrDefault(chave(i), 0L),
                i.percentualAtingimento(), i.status().name());
    }

    private DesvioPendente pendente(DesvioDetalhadoResponse d) {
        String processo = d.processo() != null ? d.processo().nome()
                : d.processoInspetor() != null ? d.processoInspetor().nome() : null;
        return new DesvioPendente(d.id(), d.idInspecao(), d.idInspetor(), d.inspetor(), processo,
                d.baseOperacional() == null ? null : d.baseOperacional().nome(),
                d.equipe() == null ? null : d.equipe().codigo(),
                d.formulario(), d.pergunta(), d.descricao(),
                d.gravidade() == null ? null : d.gravidade().name(), d.status().name(),
                d.prazo(), d.vencido(), d.diasEmAtraso(),
                d.dataInspecao() == null ? null : d.dataInspecao().atZoneSameInstant(ZONA).toLocalDate(),
                d.colaboradores().stream().map(ResumoColaborador::nomeCompleto).toList());
    }
}
