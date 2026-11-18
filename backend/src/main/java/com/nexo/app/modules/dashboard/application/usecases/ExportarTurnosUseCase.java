package com.nexo.app.modules.dashboard.application.usecases;

import java.io.IOException;
import java.io.Writer;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVPrinter;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.nexo.app.modules.dashboard.application.dto.ConsultaTurnosFilter;
import com.nexo.app.modules.dashboard.application.dto.TurnoConsultaResponse;
import com.nexo.app.modules.dashboard.domain.CalendarioOperacional;
import com.nexo.app.modules.execucao.ExecucaoComercialApi;
import com.nexo.app.modules.execucao.application.dto.ExecucaoComercialResponse;
import com.nexo.app.modules.execucao.domain.StatusExecucao;
import com.nexo.app.modules.execucao.domain.StatusTurno;
import com.nexo.app.shared.application.dto.OperacaoMaterial;
import com.nexo.app.shared.application.dto.PageResponse;

import lombok.RequiredArgsConstructor;

/**
 * Exportação dos turnos em CSV, no recorte escolhido na tela. O resumo traz uma linha por
 * turno, com a produção e a meta; o detalhado, uma linha por nota lançada no turno. Vão no
 * máximo {@value #MAX_TURNOS} turnos, os mais recentes.
 */
@Service
@RequiredArgsConstructor
public class ExportarTurnosUseCase {

    public static final int MAX_TURNOS = 30_000;
    static final int TAMANHO_PAGINA = 500;

    private static final DateTimeFormatter DATA_HORA = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");
    private static final Sort ORDENACAO = Sort.by(Sort.Order.desc("dataInicio"), Sort.Order.desc("id"));

    static final List<String> CABECALHO_TURNO = List.of(
            "Equipe", "Base", "Processo", "Abertura", "Fechamento", "Situação", "Aberto por", "Placa");

    static final List<String> CABECALHO_RESUMO_EXTRA = List.of(
            "Duração (h:min)", "Integrantes", "Notas", "Produção (R$)", "Valor médio da nota (R$)",
            "Meta do dia (R$)", "% da meta", "Primeiro lançamento", "Último lançamento",
            "Motivo do encerramento", "ID");

    static final List<String> CABECALHO_DETALHADO_EXTRA = List.of(
            "Nota", "Tipo de serviço", "Lançamento", "Status da nota", "Faturado (R$)", "Serviços",
            "Materiais aplicados", "Materiais retirados", "ID do turno");

    private static final Map<StatusExecucao, String> STATUS_NOTA = Map.of(
            StatusExecucao.INICIADO, "Em andamento", StatusExecucao.CONCLUIDO, "Concluído",
            StatusExecucao.EDITADO, "Editado");

    private final ConsultarTurnosUseCase consulta;
    private final ExecucaoComercialApi execucoes;

    @Transactional(readOnly = true)
    public void exportarResumo(ConsultaTurnosFilter filtro, Writer writer) throws IOException {
        exportar(filtro, writer, false);
    }

    @Transactional(readOnly = true)
    public void exportarDetalhado(ConsultaTurnosFilter filtro, Writer writer) throws IOException {
        exportar(filtro, writer, true);
    }

    private void exportar(ConsultaTurnosFilter filtro, Writer writer, boolean detalhado) throws IOException {
        List<String> cabecalho = new ArrayList<>(CABECALHO_TURNO);
        cabecalho.addAll(detalhado ? CABECALHO_DETALHADO_EXTRA : CABECALHO_RESUMO_EXTRA);
        CSVFormat formato = CSVFormat.Builder.create().setHeader(cabecalho.toArray(String[]::new))
                .setDelimiter(';').build();
        try (CSVPrinter printer = new CSVPrinter(writer, formato)) {
            int processados = 0;
            for (int pagina = 0; processados < MAX_TURNOS; pagina++) {
                PageResponse<TurnoConsultaResponse> resultado = consulta.executar(filtro,
                        PageRequest.of(pagina, TAMANHO_PAGINA, ORDENACAO));
                List<TurnoConsultaResponse> turnos = resultado == null || resultado.getContent() == null
                        ? List.of() : resultado.getContent();
                List<TurnoConsultaResponse> desta = turnos.subList(0, Math.min(turnos.size(), MAX_TURNOS - processados));
                processados += desta.size();
                if (detalhado) {
                    Map<UUID, List<ExecucaoComercialResponse>> notas = execucoes
                            .listarPorTurnos(desta.stream().map(TurnoConsultaResponse::id).toList()).stream()
                            .collect(Collectors.groupingBy(ExecucaoComercialResponse::idTurno));
                    for (TurnoConsultaResponse turno : desta) {
                        for (List<Object> linha : linhasDetalhadas(turno, notas.getOrDefault(turno.id(), List.of()))) {
                            printer.printRecord(linha);
                        }
                    }
                } else {
                    for (TurnoConsultaResponse turno : desta) {
                        printer.printRecord(linhaResumo(turno));
                    }
                }
                if (turnos.size() < TAMANHO_PAGINA) {
                    break;
                }
            }
        }
    }

    static List<Object> colunasDoTurno(TurnoConsultaResponse t) {
        List<Object> l = new ArrayList<>();
        l.add(t.codigoEquipe() == null ? "Equipe removida" : texto(t.codigoEquipe()));
        l.add(texto(t.baseOperacional()));
        l.add(texto(t.processo()));
        l.add(dataHora(t.dataInicio()));
        l.add(t.dataFim() == null ? "Em aberto" : dataHora(t.dataFim()));
        l.add(situacao(t));
        l.add(texto(t.abertoPor()));
        l.add(texto(t.placa()));
        return l;
    }

    static List<Object> linhaResumo(TurnoConsultaResponse t) {
        List<Object> l = colunasDoTurno(t);
        l.add(duracao(t.duracaoMinutos()));
        l.add(t.membros());
        l.add(t.notas());
        l.add(valor(t.producao()));
        l.add(valor(t.valorMedioNota()));
        l.add(valor(t.metaDiaria()));
        l.add(t.percentualMetaDiaria() == null ? "" : valor(t.percentualMetaDiaria()));
        l.add(dataHora(t.primeiroLancamento()));
        l.add(dataHora(t.ultimoLancamento()));
        l.add(texto(t.motivoEncerramento()));
        l.add(t.id() == null ? "" : t.id().toString());
        return l;
    }

    /** Uma linha por nota do turno; o turno sem nota sai numa linha só, com as colunas da nota vazias. */
    static List<List<Object>> linhasDetalhadas(TurnoConsultaResponse t, List<ExecucaoComercialResponse> notas) {
        List<Object> turno = colunasDoTurno(t);
        String id = t.id() == null ? "" : t.id().toString();
        List<List<Object>> linhas = new ArrayList<>();
        for (ExecucaoComercialResponse e : notas) {
            List<Object> l = new ArrayList<>(turno);
            l.add(texto(e.referenciaNota()));
            l.add(e.tipoServico() == null ? "Não informado"
                    : texto(e.tipoServico().codigo() + " · " + e.tipoServico().descricao()));
            l.add(dataHora(e.dataLancamento()));
            l.add(e.statusExecucao() == null ? "" : STATUS_NOTA.getOrDefault(e.statusExecucao(), e.statusExecucao().name()));
            l.add(valor(e.valorTotalFaturado()));
            l.add(e.acoes() == null ? 0 : e.acoes().size());
            l.add(e.materiais() == null ? 0 : e.materiais().stream().filter(m -> m.operacao() == OperacaoMaterial.APLICADO).count());
            l.add(e.materiais() == null ? 0 : e.materiais().stream().filter(m -> m.operacao() == OperacaoMaterial.RETIRADO).count());
            l.add(id);
            linhas.add(l);
        }
        if (linhas.isEmpty()) {
            List<Object> l = new ArrayList<>(turno);
            for (int i = 0; i < CABECALHO_DETALHADO_EXTRA.size() - 1; i++) {
                l.add("");
            }
            l.add(id);
            linhas.add(l);
        }
        return linhas;
    }

    /** Mesmo texto da coluna Status da lista. */
    static String situacao(TurnoConsultaResponse t) {
        if (t.status() == StatusTurno.FECHADO) {
            return t.encerradoAutomaticamente() ? "Encerrado pelo sistema" : "Encerrado";
        }
        return t.abertoDesdeOutroDia() ? "Aberto desde outro dia" : "Em turno";
    }

    static String duracao(long minutos) {
        return String.format("%d:%02d", minutos / 60, minutos % 60);
    }

    static String dataHora(OffsetDateTime d) {
        return d == null ? "" : d.atZoneSameInstant(CalendarioOperacional.FUSO).format(DATA_HORA);
    }

    static String valor(BigDecimal v) {
        return v == null ? "" : v.setScale(2, RoundingMode.HALF_UP).toPlainString().replace('.', ',');
    }

    /** Neutraliza fórmulas: texto começando por =, +, - ou @ não vira conta no Excel. */
    static String texto(String valor) {
        if (valor == null) {
            return "";
        }
        String inicio = valor.stripLeading();
        return !inicio.isEmpty() && "=+-@".indexOf(inicio.charAt(0)) >= 0 ? "'" + valor : valor;
    }
}
