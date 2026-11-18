package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.execucao.TurnoVeiculoApi;
import com.nexo.app.modules.frota.application.dto.RelatorioFrotaDetalheResponse;
import com.nexo.app.modules.frota.application.dto.RelatorioFrotaDetalheResponse.*;
import com.nexo.app.modules.frota.application.dto.RelatorioGerencialFrotaFilter;
import com.nexo.app.modules.frota.application.usecases.RelatorioGerencialFrotaUseCases.Acesso;
import com.nexo.app.modules.frota.application.usecases.RelatorioGerencialFrotaUseCases.Contexto;
import com.nexo.app.modules.frota.application.usecases.RelatorioGerencialFrotaUseCases.Janela;
import com.nexo.app.modules.frota.infrastructure.persistence.RelatorioFrotaDetalheRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.RelatorioGerencialFrotaRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.RelatorioGerencialFrotaRepository.Ficha;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Registros de origem dos dashboards da frota (custos, manutenção, combustível, uso e
 * conformidade), no mesmo recorte e com as mesmas leituras por assunto do relatório gerencial.
 */
@Service
@RequiredArgsConstructor
public class RelatorioFrotaDetalheUseCases {

    static final int HORIZONTE_PADRAO = 90;
    static final int HORIZONTE_MAXIMO = 365;

    private final RelatorioGerencialFrotaUseCases gerencial;
    private final RelatorioFrotaDetalheRepository repositorio;
    private final RelatorioGerencialFrotaRepository gerencialRepositorio;
    private final TurnoVeiculoApi turnos;

    @Transactional(readOnly = true)
    public Custos custos(RelatorioGerencialFrotaFilter filtro) {
        var acesso = Acesso.doUsuario();
        var ctx = gerencial.contexto(filtro, agora());
        var j = ctx.atual();
        var lista = repositorio.lancamentos(ctx.ids(), j.inicio(), j.fim(), acesso.os(), acesso.despesa(),
                        acesso.abastecimento(), acesso.sinistro()).stream()
                .map(l -> new Lancamento(l.categoria(), l.id(), l.numero(), l.data(), l.idVeiculo(), placa(ctx, l.idVeiculo()),
                        l.descricao(), l.contraparte(), dinheiro(l.valor())))
                .toList();
        return new Custos(lista);
    }

    @Transactional(readOnly = true)
    public Manutencao manutencao(RelatorioGerencialFrotaFilter filtro) {
        var agora = agora();
        var ctx = gerencial.contexto(filtro, agora);
        var ids = ctx.ids();
        var j = ctx.atual();
        var a = ctx.anterior();
        var abertas = repositorio.osAbertas(ids).stream().map(o -> {
            long dias = o.abertaEm() == null ? 0 : ChronoUnit.DAYS.between(o.abertaEm(), agora);
            boolean atrasada = o.previsaoTermino() != null && o.previsaoTermino().isBefore(agora);
            return new OsAberta(o.id(), o.numero(), o.idVeiculo(), o.placa(), o.situacao(), o.tipoManutencao(), o.origem(),
                    o.criticidade(), o.tipoOficina(), o.oficina(), o.abertaEm(), o.agendadaPara(), o.previsaoTermino(),
                    o.veiculoParado(), o.paradoDesde(), dias, atrasada, o.descricao());
        }).toList();
        return new Manutencao(
                os(ctx, repositorio.osConcluidas(ids, j.inicio(), j.fim())),
                os(ctx, repositorio.osConcluidas(ids, a.inicio(), a.fim())),
                abertas,
                repositorio.itens(ids, j.inicio(), j.fim(), RelatorioGerencialFrotaUseCases.DIAS_RETRABALHO).stream()
                        .map(i -> new ItemOs(i.idOs(), i.item(), i.tipo(), i.retrabalho())).toList(),
                repositorio.pecas(ids, j.inicio(), j.fim()).stream()
                        .map(p -> new PecaOs(p.idOs(), p.descricao(), p.origem(), p.quantidade(), p.unidade(), dinheiro(p.valor())))
                        .toList(),
                repositorio.servicos(ids, j.inicio(), j.fim()).stream()
                        .map(s -> new ServicoOs(s.idOs(), s.descricao(), s.mecanico(), dinheiro(s.valor()))).toList());
    }

    private static List<Os> os(Contexto ctx, List<RelatorioFrotaDetalheRepository.Os> lista) {
        return lista.stream().map(o -> {
            var inicio = o.veiculoParado() && o.paradoDesde() != null ? o.paradoDesde() : o.inicioReal();
            var fim = o.veiculoParado() && o.liberadoEm() != null ? o.liberadoEm() : o.fimReal();
            BigDecimal horas = inicio == null || fim == null || fim.isBefore(inicio) ? null
                    : BigDecimal.valueOf(Duration.between(inicio, fim).toMinutes() / 60.0).setScale(1, RoundingMode.HALF_UP);
            BigDecimal espera = o.abertaEm() == null || o.inicioReal() == null || o.inicioReal().isBefore(o.abertaEm()) ? null
                    : BigDecimal.valueOf(Duration.between(o.abertaEm(), o.inicioReal()).toMinutes() / 1440.0).setScale(1, RoundingMode.HALF_UP);
            return new Os(o.id(), o.numero(), o.idVeiculo(), placa(ctx, o.idVeiculo()), o.tipoManutencao(), o.origem(), o.causa(),
                    o.criticidade(), o.tipoOficina(), o.oficina(), dinheiro(o.valor()), dinheiro(o.valorPecas()),
                    dinheiro(o.valorServicos()), o.abertaEm(), o.inicioReal(), o.fimReal(), o.veiculoParado(), horas, espera,
                    o.finalizadaEm() == null, o.descricao());
        }).toList();
    }

    @Transactional(readOnly = true)
    public Combustivel combustivel(RelatorioGerencialFrotaFilter filtro) {
        var ctx = gerencial.contexto(filtro, agora());
        var atual = repositorio.abastecimentos(ctx.ids(), ctx.atual().inicio(), ctx.atual().fim());
        var anterior = repositorio.abastecimentos(ctx.ids(), ctx.anterior().inicio(), ctx.anterior().fim());
        var nomes = gerencial.nomes(java.util.stream.Stream.concat(atual.stream(), anterior.stream())
                .map(RelatorioFrotaDetalheRepository.Abastecimento::idCondutor).filter(Objects::nonNull)
                .collect(Collectors.toSet()));
        return new Combustivel(abastecimentos(ctx, atual, nomes), abastecimentos(ctx, anterior, nomes));
    }

    private static List<Abastecimento> abastecimentos(Contexto ctx, List<RelatorioFrotaDetalheRepository.Abastecimento> lista,
                                                      Map<UUID, String> nomes) {
        return lista.stream().map(a -> {
            BigDecimal litros = a.litros() == null ? BigDecimal.ZERO : a.litros();
            BigDecimal preco = litros.signum() > 0 ? a.valorCombustivel().divide(litros, 3, RoundingMode.HALF_UP) : null;
            BigDecimal kmL = a.kmDesdeAnterior() != null && litros.signum() > 0
                    && a.kmDesdeAnterior().compareTo(BigDecimal.valueOf(5000)) < 0
                    ? a.kmDesdeAnterior().divide(litros, 2, RoundingMode.HALF_UP) : null;
            return new Abastecimento(a.id(), a.realizadoEm(), a.idVeiculo(), placa(ctx, a.idVeiculo()), a.idPosto(), a.posto(),
                    a.idCondutor(), a.idCondutor() == null ? null : nomes.get(a.idCondutor()), a.origem(), litros,
                    dinheiro(a.valorCombustivel()), dinheiro(a.valorTotal()), preco, a.produtos(), a.medicao(),
                    a.kmDesdeAnterior(), kmL,
                    a.horasAprovacao() == null ? null : a.horasAprovacao().setScale(1, RoundingMode.HALF_UP), a.alertas());
        }).toList();
    }

    @Transactional(readOnly = true)
    public Uso uso(RelatorioGerencialFrotaFilter filtro) {
        var ctx = gerencial.contexto(filtro, agora());
        var ids = ctx.ids();
        var j = ctx.atual();
        var km = gerencialRepositorio.kmPorMes(ids, j.inicio(), j.fim()).stream()
                .map(k -> new KmMes(k.idVeiculo(), k.mes(), k.km())).toList();
        List<ProducaoMes> producao = new ArrayList<>();
        for (LocalDate mes = j.de().withDayOfMonth(1); !mes.isAfter(j.ate()); mes = mes.plusMonths(1)) {
            LocalDate de = mes.isBefore(j.de()) ? j.de() : mes;
            LocalDate ate = mes.plusMonths(1).minusDays(1).isAfter(j.ate()) ? j.ate() : mes.plusMonths(1).minusDays(1);
            var janela = new Janela(de, ate, j.agora());
            final LocalDate m = mes;
            turnos.producaoPorVeiculo(janela.inicio(), janela.fim()).stream()
                    .filter(p -> ids.contains(p.idVeiculo()))
                    .forEach(p -> producao.add(new ProducaoMes(p.idVeiculo(), m, p.turnos(), p.notasConcluidas(),
                            dinheiro(p.valorFaturado()))));
        }
        return new Uso(km, producao);
    }

    @Transactional(readOnly = true)
    public Conformidade conformidade(RelatorioGerencialFrotaFilter filtro, Integer horizonte) {
        var acesso = Acesso.doUsuario();
        var ctx = gerencial.contexto(filtro, agora());
        var hoje = ctx.hoje();
        int dias = horizonte == null ? HORIZONTE_PADRAO : Math.max(0, Math.min(HORIZONTE_MAXIMO, horizonte));
        LocalDate limite = hoje.plusDays(dias);
        Set<UUID> ids = ctx.ids();

        List<Documento> documentos = !acesso.documento() ? null : repositorio.documentosAtuais(ids).stream()
                .filter(d -> !d.vencimento().isAfter(limite))
                .map(d -> new Documento(d.id(), d.idVeiculo(), placa(ctx, d.idVeiculo()), d.tipo(), d.descricao(), d.vencimento(),
                        ChronoUnit.DAYS.between(hoje, d.vencimento()), d.comArquivo()))
                .sorted(java.util.Comparator.comparingLong(Documento::dias))
                .toList();

        List<Cnh> cnh = null;
        if (acesso.condutor()) {
            Map<UUID, List<String>> placas = new HashMap<>();
            repositorio.vinculosAtuais().stream().filter(v -> ids.contains(v.idVeiculo()))
                    .forEach(v -> placas.computeIfAbsent(v.idColaborador(), k -> new ArrayList<>()).add(v.placa()));
            boolean frotaInteira = RelatorioGerencialFrotaUseCases.filtroVazio(filtro);
            var condutores = repositorio.condutores().stream()
                    .filter(c -> frotaInteira || placas.containsKey(c.idColaborador()))
                    .filter(c -> c.validade() == null || !c.validade().isAfter(limite))
                    .toList();
            var nomes = gerencial.nomes(condutores.stream().map(RelatorioFrotaDetalheRepository.Condutor::idColaborador).toList());
            cnh = condutores.stream().map(c -> new Cnh(c.id(), c.idColaborador(), nomes.getOrDefault(c.idColaborador(), "Condutor"),
                    c.categoria(), c.validade(), c.validade() == null ? null : ChronoUnit.DAYS.between(hoje, c.validade()),
                    placas.getOrDefault(c.idColaborador(), List.of()))).toList();
        }

        List<Pendencia> pendencias = !acesso.checklist() ? null : repositorio.pendenciasAbertas(ids).stream()
                .map(p -> new Pendencia(p.id(), p.idChecklist(), p.idVeiculo(), placa(ctx, p.idVeiculo()), p.item(), p.grupo(),
                        p.abertaEm(), p.abertaEm() == null ? 0 : ChronoUnit.DAYS.between(p.abertaEm(), ctx.atual().agora()),
                        p.comentario(), p.idOrdemServico()))
                .toList();

        return new Conformidade(documentos, cnh, pendencias);
    }

    private static OffsetDateTime agora() {
        return OffsetDateTime.now(RelatorioGerencialFrotaUseCases.FUSO);
    }

    private static String placa(Contexto ctx, UUID id) {
        Ficha f = ctx.fichas().get(id);
        return f == null ? null : f.placa();
    }

    private static BigDecimal dinheiro(BigDecimal v) {
        return (v == null ? BigDecimal.ZERO : v).setScale(2, RoundingMode.HALF_UP);
    }
}
