package com.nexo.app.modules.execucao.application.usecases;

import java.io.IOException;
import java.io.Writer;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVPrinter;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.nexo.app.modules.execucao.application.dto.ExecucaoAcaoResponse;
import com.nexo.app.modules.execucao.application.dto.ExecucaoComercialResponse;
import com.nexo.app.modules.execucao.application.dto.ExecucaoFilter;
import com.nexo.app.modules.execucao.application.dto.ExecucaoMaterialResponse;
import com.nexo.app.modules.execucao.domain.OrigemMaterial;
import com.nexo.app.modules.execucao.domain.StatusExecucao;
import com.nexo.app.modules.execucao.domain.TipoNota;
import com.nexo.app.shared.application.dto.OperacaoMaterial;

import lombok.RequiredArgsConstructor;

/**
 * Exportação das notas comerciais em CSV, no recorte escolhido na tela. O resumo traz uma linha
 * por nota; o detalhado, uma linha por serviço e por material, repetindo os dados da nota.
 * Vão no máximo {@value #MAX_NOTAS} notas, as mais recentes.
 */
@Service
@RequiredArgsConstructor
public class ExportarExecucoesUseCase {

    public static final int MAX_NOTAS = 30_000;
    static final int TAMANHO_PAGINA = 500;

    static final ZoneId FUSO = ZoneId.of("America/Bahia");
    private static final DateTimeFormatter DATA_HORA = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");
    private static final Sort ORDENACAO = Sort.by(Sort.Order.desc("dataLancamento"), Sort.Order.desc("id"));

    static final List<String> CABECALHO_NOTA = List.of(
            "Nota", "Tipo de lançamento", "Tipo de serviço", "Equipe", "Município", "Lançamento", "Status",
            "Faturado (R$)");

    static final List<String> CABECALHO_RESUMO_EXTRA = List.of(
            "Serviços", "Materiais aplicados", "Materiais retirados", "Alterações", "Nº provisório",
            "Nº oficial informado em", "Latitude", "Longitude", "ID");

    static final List<String> CABECALHO_DETALHADO_EXTRA = List.of(
            "Item", "Código", "Descrição", "Quantidade", "Unidade", "Operação", "Nº série", "Origem",
            "Quantidade informada", "Unidade informada", "Improdutivo", "ID da nota");

    private static final Map<TipoNota, String> TIPO = Map.of(
            TipoNota.COMUM, "Comum", TipoNota.AVULSA, "Avulsa", TipoNota.OCORRENCIA, "Ocorrência");

    private static final Map<StatusExecucao, String> STATUS = Map.of(
            StatusExecucao.INICIADO, "Em andamento", StatusExecucao.CONCLUIDO, "Concluído",
            StatusExecucao.EDITADO, "Editado");

    private static final Map<OperacaoMaterial, String> OPERACAO = Map.of(
            OperacaoMaterial.APLICADO, "Aplicado", OperacaoMaterial.RETIRADO, "Retirado");

    private static final Map<OrigemMaterial, String> ORIGEM = Map.of(
            OrigemMaterial.EQUIPE, "Equipe", OrigemMaterial.CONCESSIONARIA, "Concessionária");

    private final ExecucaoComercialUseCases execucoes;

    @Transactional(readOnly = true)
    public void exportarResumo(ExecucaoFilter filtro, Writer writer) throws IOException {
        exportar(filtro, writer, false);
    }

    @Transactional(readOnly = true)
    public void exportarDetalhado(ExecucaoFilter filtro, Writer writer) throws IOException {
        exportar(filtro, writer, true);
    }

    private void exportar(ExecucaoFilter filtro, Writer writer, boolean detalhado) throws IOException {
        List<String> cabecalho = new ArrayList<>(CABECALHO_NOTA);
        cabecalho.addAll(detalhado ? CABECALHO_DETALHADO_EXTRA : CABECALHO_RESUMO_EXTRA);
        CSVFormat formato = CSVFormat.Builder.create().setHeader(cabecalho.toArray(String[]::new))
                .setDelimiter(';').build();
        try (CSVPrinter printer = new CSVPrinter(writer, formato)) {
            int processadas = 0;
            for (int pagina = 0; processadas < MAX_NOTAS; pagina++) {
                List<ExecucaoComercialResponse> conteudo = execucoes.listarParaExportacao(filtro,
                        PageRequest.of(pagina, TAMANHO_PAGINA, ORDENACAO));
                for (ExecucaoComercialResponse nota : conteudo) {
                    if (processadas++ >= MAX_NOTAS) {
                        break;
                    }
                    if (detalhado) {
                        for (List<Object> linha : linhasDetalhadas(nota)) {
                            printer.printRecord(linha);
                        }
                    } else {
                        printer.printRecord(linhaResumo(nota));
                    }
                }
                if (conteudo.size() < TAMANHO_PAGINA) {
                    break;
                }
            }
        }
    }

    /** Colunas que identificam a nota, comuns aos dois formatos (e à exportação dos turnos). */
    public static List<Object> colunasDaNota(ExecucaoComercialResponse e) {
        List<Object> l = new ArrayList<>();
        l.add(texto(e.referenciaNota()));
        l.add(e.tipoNota() == null ? "Comum" : TIPO.getOrDefault(e.tipoNota(), e.tipoNota().name()));
        l.add(e.tipoServico() == null ? "Não informado"
                : texto(e.tipoServico().codigo() + " · " + e.tipoServico().descricao()));
        l.add(e.equipe() == null ? "" : texto(e.equipe().codigo()));
        l.add(e.municipio() == null ? "" : texto(e.municipio().nome()));
        l.add(dataHora(e.dataLancamento()));
        l.add(e.statusExecucao() == null ? "" : STATUS.getOrDefault(e.statusExecucao(), e.statusExecucao().name()));
        l.add(valor(e.valorTotalFaturado()));
        return l;
    }

    static List<Object> linhaResumo(ExecucaoComercialResponse e) {
        List<Object> l = colunasDaNota(e);
        List<ExecucaoMaterialResponse> materiais = e.materiais() == null ? List.of() : e.materiais();
        l.add(e.acoes() == null ? 0 : e.acoes().size());
        l.add(materiais.stream().filter(m -> m.operacao() == OperacaoMaterial.APLICADO).count());
        l.add(materiais.stream().filter(m -> m.operacao() == OperacaoMaterial.RETIRADO).count());
        l.add(e.totalAlteracoes());
        l.add(texto(e.referenciaProvisoria()));
        l.add(dataHora(e.dataNumeroOficial()));
        l.add(numero(e.latitude()));
        l.add(numero(e.longitude()));
        l.add(e.id() == null ? "" : e.id().toString());
        return l;
    }

    /** Uma linha por serviço e por material; a nota sem itens sai numa linha só, com os itens vazios. */
    static List<List<Object>> linhasDetalhadas(ExecucaoComercialResponse e) {
        List<Object> nota = colunasDaNota(e);
        String id = e.id() == null ? "" : e.id().toString();
        List<List<Object>> linhas = new ArrayList<>();
        for (ExecucaoAcaoResponse a : e.acoes() == null ? List.<ExecucaoAcaoResponse>of() : e.acoes()) {
            List<Object> l = new ArrayList<>(nota);
            l.add("Serviço");
            l.add(a.acao() == null ? "" : texto(a.acao().codigo()));
            l.add(a.acao() == null ? "" : texto(a.acao().nome()));
            l.add("1");
            l.add("");
            l.add("");
            l.add("");
            l.add("");
            l.add("");
            l.add("");
            l.add(a.acao() != null && a.acao().improdutiva() ? "Sim" : "Não");
            l.add(id);
            linhas.add(l);
        }
        for (ExecucaoMaterialResponse m : e.materiais() == null ? List.<ExecucaoMaterialResponse>of() : e.materiais()) {
            List<Object> l = new ArrayList<>(nota);
            l.add("Material");
            l.add(m.material() == null ? "" : texto(m.material().codigo()));
            l.add(m.material() == null ? "" : texto(m.material().descricao()));
            l.add(numero(m.quantidade()));
            l.add(m.material() == null ? "" : texto(m.material().unidadeMedida()));
            l.add(m.operacao() == null ? "" : OPERACAO.getOrDefault(m.operacao(), m.operacao().name()));
            l.add(texto(m.numSerie()));
            l.add(m.origem() == null ? "" : ORIGEM.getOrDefault(m.origem(), m.origem().name()));
            l.add(numero(m.quantidadeInformada()));
            l.add(texto(m.unidadeInformada()));
            l.add("");
            l.add(id);
            linhas.add(l);
        }
        if (linhas.isEmpty()) {
            List<Object> l = new ArrayList<>(nota);
            for (int i = 0; i < CABECALHO_DETALHADO_EXTRA.size() - 1; i++) {
                l.add("");
            }
            l.add(id);
            linhas.add(l);
        }
        return linhas;
    }

    static String dataHora(OffsetDateTime d) {
        return d == null ? "" : d.atZoneSameInstant(FUSO).format(DATA_HORA);
    }

    /** Valor em reais com vírgula, como o Excel em português lê. */
    static String valor(BigDecimal v) {
        return v == null ? "" : v.setScale(2, RoundingMode.HALF_UP).toPlainString().replace('.', ',');
    }

    static String numero(BigDecimal v) {
        return v == null ? "" : v.stripTrailingZeros().toPlainString().replace('.', ',');
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
