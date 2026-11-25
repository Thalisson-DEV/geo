package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.listas.ListaConfiguravel;
import com.nexo.app.modules.listas.ListasApi;

import com.nexo.app.modules.financeiro.FinanceiroApi;
import com.nexo.app.modules.frota.application.dto.AgendaFrotaResponse;
import com.nexo.app.modules.frota.domain.Apolice;
import com.nexo.app.modules.frota.domain.Condutor;
import com.nexo.app.modules.frota.domain.DocumentoFrota;
import com.nexo.app.modules.frota.domain.FichaVeiculo;
import com.nexo.app.modules.frota.domain.Implemento;
import com.nexo.app.modules.frota.domain.OrdemServico;
import com.nexo.app.modules.frota.domain.SituacaoOrdemServico;
import com.nexo.app.modules.frota.domain.SituacaoPreventiva;
import com.nexo.app.modules.frota.domain.TipoEventoAgendaFrota;
import com.nexo.app.modules.frota.infrastructure.persistence.ApoliceRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.CondutorRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.DocumentoFrotaRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.FichaVeiculoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.ImplementoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.OrdemServicoRepository;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.infrastructure.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Calendário da frota: OS agendadas, previsões de término das OS em andamento e vencimentos de
 * documentos, CNH e apólices num período. Cada tipo só aparece para quem pode ler o que ele mostra.
 */
@Service
@RequiredArgsConstructor
public class AgendaFrotaUseCases {

    static final int MAXIMO_DIAS = 62;
    static final int MAXIMO_EVENTOS = 1000;

    private final OrdemServicoRepository ordens;
    private final DocumentoFrotaRepository documentos;
    private final CondutorRepository condutores;
    private final FichaVeiculoRepository fichas;
    private final ImplementoRepository implementos;
    private final ReferenciasFrota referencias;
    private final PreventivaUseCases preventiva;
    private final ApoliceRepository apolices;
    private final FinanceiroApi financeiro;
    private final ListasApi listasApi;

    @Transactional(readOnly = true)
    public AgendaFrotaResponse agenda(LocalDate de, LocalDate ate, Collection<UUID> idsBase, Collection<TipoEventoAgendaFrota> tipos) {
        if (de == null || ate == null || ate.isBefore(de)) {
            throw new InvarianteVioladaException("Informe o período: a data final não pode ser antes da inicial.");
        }
        if (ChronoUnit.DAYS.between(de, ate) > MAXIMO_DIAS) {
            throw new InvarianteVioladaException("O calendário consulta no máximo " + MAXIMO_DIAS + " dias por vez.");
        }
        Set<TipoEventoAgendaFrota> pedidos = tipos == null || tipos.isEmpty() ? Set.of(TipoEventoAgendaFrota.values()) : Set.copyOf(tipos);
        boolean leOs = SecurityUtils.possuiAutoridade("frota:os:read");
        boolean leDocumentos = SecurityUtils.possuiAutoridade("frota:documento:read");
        boolean leCondutores = SecurityUtils.possuiAutoridade("frota:condutor:read");
        boolean lePreventiva = SecurityUtils.possuiAutoridade("frota:preventiva:read");
        boolean leSeguros = SecurityUtils.possuiAutoridade("frota:seguro:read");
        if (!leOs && !leDocumentos && !leCondutores && !lePreventiva && !leSeguros) {
            throw new AccessDeniedException("Sem permissão para ver o calendário da frota.");
        }
        Set<UUID> bases = idsBase == null || idsBase.isEmpty() ? null : Set.copyOf(idsBase);
        var hoje = LocalDate.now(LiberacaoCnhUseCases.FUSO);
        var eventos = new ArrayList<AgendaFrotaResponse.Evento>();
        if (leOs) {
            var inicio = de.atStartOfDay(LiberacaoCnhUseCases.FUSO).toOffsetDateTime();
            var fim = ate.plusDays(1).atStartOfDay(LiberacaoCnhUseCases.FUSO).toOffsetDateTime().minusNanos(1);
            if (pedidos.contains(TipoEventoAgendaFrota.OS_AGENDADA)) {
                eventos.addAll(ordensAgendadas(inicio, fim, bases));
            }
            if (pedidos.contains(TipoEventoAgendaFrota.OS_PREVISAO_TERMINO)) {
                eventos.addAll(previsoesTermino(inicio, fim, bases));
            }
        }
        if (leDocumentos && pedidos.contains(TipoEventoAgendaFrota.DOCUMENTO_VENCIMENTO)) {
            eventos.addAll(vencimentosDocumentos(de, ate, bases, hoje));
        }
        if (leCondutores && pedidos.contains(TipoEventoAgendaFrota.CNH_VENCIMENTO)) {
            eventos.addAll(vencimentosCnh(de, ate, bases, hoje));
        }
        if (lePreventiva && pedidos.contains(TipoEventoAgendaFrota.PREVENTIVA_PREVISTA)) {
            eventos.addAll(preventivasPrevistas(de, ate, bases));
        }
        if (leSeguros && pedidos.contains(TipoEventoAgendaFrota.APOLICE_VENCIMENTO)) {
            eventos.addAll(vencimentosApolices(de, ate, bases, hoje));
        }
        eventos.sort(Comparator.comparing(AgendaFrotaResponse.Evento::data)
                .thenComparing(e -> e.tipo().ordinal())
                .thenComparing(e -> e.placa() == null ? "" : e.placa()));
        boolean truncado = eventos.size() > MAXIMO_EVENTOS;
        return new AgendaFrotaResponse(List.copyOf(truncado ? eventos.subList(0, MAXIMO_EVENTOS) : eventos), truncado);
    }

    private List<AgendaFrotaResponse.Evento> ordensAgendadas(OffsetDateTime inicio, OffsetDateTime fim, Set<UUID> bases) {
        var lista = filtrarBase(ordens.findAllBySituacaoAndAgendadaParaBetweenAndAtivoTrue(SituacaoOrdemServico.AGENDADA, inicio, fim), bases);
        var nomesBase = nomesBase(lista);
        var agora = OffsetDateTime.now();
        return lista.stream().map(os -> {
            boolean atrasada = os.getAgendadaPara().isBefore(agora);
            String local = os.getLocalAgendamento() == null ? "" : " · " + os.getLocalAgendamento();
            return new AgendaFrotaResponse.Evento(TipoEventoAgendaFrota.OS_AGENDADA, TipoEventoAgendaFrota.OS_AGENDADA.getRotulo(),
                    dia(os.getAgendadaPara()), os.getAgendadaPara(), "OS " + os.getNumero() + " · " + identificacao(os),
                    (atrasada ? "Não iniciada · " : "") + resumo(os.getDescricao()) + local,
                    os.getPlaca(), nomesBase.get(os.getIdBaseOperacional()), os.getId(), os.getNumero(),
                    atrasada ? "danger" : "info", atrasada);
        }).toList();
    }

    private List<AgendaFrotaResponse.Evento> previsoesTermino(OffsetDateTime inicio, OffsetDateTime fim, Set<UUID> bases) {
        var lista = filtrarBase(ordens.findAllBySituacaoAndPrevisaoTerminoBetweenAndAtivoTrue(SituacaoOrdemServico.EM_ANDAMENTO, inicio, fim), bases);
        var nomesBase = nomesBase(lista);
        var agora = OffsetDateTime.now();
        return lista.stream().map(os -> {
            boolean atrasada = os.getPrevisaoTermino().isBefore(agora);
            return new AgendaFrotaResponse.Evento(TipoEventoAgendaFrota.OS_PREVISAO_TERMINO,
                    TipoEventoAgendaFrota.OS_PREVISAO_TERMINO.getRotulo(), dia(os.getPrevisaoTermino()), os.getPrevisaoTermino(),
                    "OS " + os.getNumero() + " · " + identificacao(os), (atrasada ? "Prazo estourado · " : "Termina · ") + resumo(os.getDescricao()),
                    os.getPlaca(), nomesBase.get(os.getIdBaseOperacional()), os.getId(), os.getNumero(),
                    atrasada ? "danger" : "warning", atrasada);
        }).toList();
    }

    private List<AgendaFrotaResponse.Evento> vencimentosDocumentos(LocalDate de, LocalDate ate, Set<UUID> bases, LocalDate hoje) {
        var lista = documentos.findAllByAtivoTrueAndDataVencimentoBetween(de, ate);
        Map<UUID, FichaVeiculo> porVeiculo = fichas.findAllByIdVeiculoIn(lista.stream().map(DocumentoFrota::getIdVeiculo)
                        .filter(Objects::nonNull).collect(Collectors.toSet())).stream()
                .collect(Collectors.toMap(FichaVeiculo::getIdVeiculo, Function.identity(), (a, b) -> a));
        Map<UUID, Implemento> porImplemento = implementos.findAllById(lista.stream().map(DocumentoFrota::getIdImplemento)
                        .filter(Objects::nonNull).collect(Collectors.toSet())).stream()
                .collect(Collectors.toMap(Implemento::getId, Function.identity()));
        var idsBase = new HashSet<UUID>();
        porVeiculo.values().forEach(f -> idsBase.add(f.getIdBaseOperacional()));
        porImplemento.values().forEach(i -> idsBase.add(i.getIdBaseOperacional()));
        idsBase.remove(null);
        var nomesBase = referencias.nomesBases(idsBase);
        var eventos = new ArrayList<AgendaFrotaResponse.Evento>();
        for (var d : lista) {
            var ficha = d.getIdVeiculo() == null ? null : porVeiculo.get(d.getIdVeiculo());
            var implemento = d.getIdImplemento() == null ? null : porImplemento.get(d.getIdImplemento());
            UUID idBase = ficha != null ? ficha.getIdBaseOperacional() : implemento != null ? implemento.getIdBaseOperacional() : null;
            if (bases != null && (idBase == null || !bases.contains(idBase))) {
                continue;
            }
            String alvo = ficha != null ? ficha.getPlaca() : implemento != null ? implemento.getIdentificacao() : "Documento";
            boolean vencido = d.getDataVencimento().isBefore(hoje);
            String numero = d.getNumero() == null ? "" : " · Nº " + d.getNumero();
            eventos.add(new AgendaFrotaResponse.Evento(TipoEventoAgendaFrota.DOCUMENTO_VENCIMENTO,
                    TipoEventoAgendaFrota.DOCUMENTO_VENCIMENTO.getRotulo(), d.getDataVencimento(), null,
                    listasApi.rotulo(ListaConfiguravel.TIPO_DOCUMENTO_VEICULO, d.getTipo()) + " · " + alvo, (vencido ? "Vencido" : "Vence neste dia") + numero,
                    ficha != null ? ficha.getPlaca() : null, idBase == null ? null : nomesBase.get(idBase), d.getId(), null,
                    vencido ? "danger" : "warning", vencido));
        }
        return eventos;
    }

    private List<AgendaFrotaResponse.Evento> vencimentosCnh(LocalDate de, LocalDate ate, Set<UUID> bases, LocalDate hoje) {
        var lista = condutores.findAllByAtivoTrueAndCnhValidadeBetween(de, ate);
        if (bases != null) {
            var daBase = Set.copyOf(referencias.idsColaboradoresPorBases(bases));
            lista = lista.stream().filter(c -> daBase.contains(c.getIdColaborador())).toList();
        }
        var pessoas = referencias.colaboradores(lista.stream().map(Condutor::getIdColaborador).collect(Collectors.toSet()));
        return lista.stream().map(c -> {
            var pessoa = pessoas.get(c.getIdColaborador());
            boolean vencida = c.getCnhValidade().isBefore(hoje);
            String categoria = c.getCnhCategoria() == null ? "" : " · categoria " + c.getCnhCategoria();
            return new AgendaFrotaResponse.Evento(TipoEventoAgendaFrota.CNH_VENCIMENTO, TipoEventoAgendaFrota.CNH_VENCIMENTO.getRotulo(),
                    c.getCnhValidade(), null, "CNH · " + (pessoa == null ? "Condutor" : pessoa.nomeCompleto()),
                    (vencida ? "Vencida" : "Vence neste dia") + categoria,
                    null, pessoa == null ? null : pessoa.baseOperacional(), c.getId(), null, vencida ? "danger" : "warning", vencida);
        }).toList();
    }

    /** Previsão de cada plano sem OS aberta; a vencida aparece no dia em que venceu (ou hoje, pelo uso). */
    private List<AgendaFrotaResponse.Evento> preventivasPrevistas(LocalDate de, LocalDate ate, Set<UUID> bases) {
        return preventiva.previsoes(de, ate, bases).stream().map(p -> {
            boolean vencida = p.situacao() == SituacaoPreventiva.VENCIDA;
            return new AgendaFrotaResponse.Evento(TipoEventoAgendaFrota.PREVENTIVA_PREVISTA,
                    TipoEventoAgendaFrota.PREVENTIVA_PREVISTA.getRotulo(), p.previsao(), null,
                    p.plano() + " · " + p.placa(), p.situacaoRotulo() + " · " + p.falta(), p.placa(), p.base(),
                    p.idVeiculo(), null, vencida ? "danger" : p.situacao() == SituacaoPreventiva.PROXIMA
                    ? "warning" : "info", vencida);
        }).toList();
    }

    /** Fim da vigência das apólices ativas; a apólice sem base aparece em qualquer recorte de base. */
    private List<AgendaFrotaResponse.Evento> vencimentosApolices(LocalDate de, LocalDate ate, Set<UUID> bases, LocalDate hoje) {
        var lista = apolices.findAllByAtivoTrueAndVigenciaFimBetween(de, ate).stream()
                .filter(a -> bases == null || a.getIdBaseOperacional() == null || bases.contains(a.getIdBaseOperacional()))
                .toList();
        if (lista.isEmpty()) {
            return List.of();
        }
        var seguradoras = financeiro.nomesFornecedores(lista.stream().map(Apolice::getIdSeguradora).distinct().toList());
        var nomesBase = referencias.nomesBases(lista.stream().map(Apolice::getIdBaseOperacional).filter(Objects::nonNull)
                .collect(Collectors.toSet()));
        return lista.stream().map(a -> {
            boolean vencida = a.getVigenciaFim().isBefore(hoje);
            long veiculos = a.getCoberturasAtivas().stream().map(c -> c.getIdVeiculo()).distinct().count();
            return new AgendaFrotaResponse.Evento(TipoEventoAgendaFrota.APOLICE_VENCIMENTO,
                    TipoEventoAgendaFrota.APOLICE_VENCIMENTO.getRotulo(), a.getVigenciaFim(), null,
                    a.descricao() + " · " + seguradoras.getOrDefault(a.getIdSeguradora(), "Seguradora"),
                    (vencida ? "Vencida" : "Fim da vigência") + " · " + veiculos + (veiculos == 1 ? " veículo" : " veículos"),
                    null, a.getIdBaseOperacional() == null ? null : nomesBase.get(a.getIdBaseOperacional()), a.getId(), null,
                    vencida ? "danger" : "warning", vencida);
        }).toList();
    }

    private Map<UUID, String> nomesBase(List<OrdemServico> lista) {
        return referencias.nomesBases(lista.stream().map(OrdemServico::getIdBaseOperacional).filter(Objects::nonNull).collect(Collectors.toSet()));
    }

    private static List<OrdemServico> filtrarBase(List<OrdemServico> lista, Set<UUID> bases) {
        return bases == null ? lista : lista.stream().filter(o -> o.getIdBaseOperacional() != null && bases.contains(o.getIdBaseOperacional())).toList();
    }

    private static LocalDate dia(OffsetDateTime instante) {
        return instante.atZoneSameInstant(LiberacaoCnhUseCases.FUSO).toLocalDate();
    }

    private static String identificacao(OrdemServico os) {
        return os.isVeicular() ? os.getPlaca() : os.getDescricaoEquipamento();
    }

    private static String resumo(String texto) {
        if (texto == null) {
            return "";
        }
        return texto.length() > 80 ? texto.substring(0, 79) + "…" : texto;
    }
}
