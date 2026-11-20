package com.nexo.app.modules.assistente.application.results;

import com.nexo.app.modules.assistente.application.rastreio.NumerosDeNota;
import com.nexo.app.shared.application.analytics.SemanticQueryContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Todo resultado com a coluna {@code execucao_id} ganha, logo ao lado, {@code numero_nota}: o identificador interno
 * nao serve ao gestor, e o numero (cifrado no banco) nunca aparece nas consultas SQL. Assim o numero acompanha a
 * nota em anomalias, planilhas, relatorios e no Python sem o modelo precisar pedir.
 */
@Component
public class NumeroNotaNosResultados {

    static final String COLUNA_EXECUCAO = "execucao_id";
    static final String COLUNA_NUMERO = "numero_nota";
    private static final Logger LOGGER = LoggerFactory.getLogger(NumeroNotaNosResultados.class);

    private final ObjectProvider<NumerosDeNota> fontes;

    public NumeroNotaNosResultados(ObjectProvider<NumerosDeNota> fontes) {
        this.fontes = fontes;
    }

    public TabularData enriquecer(TabularData data, SemanticQueryContext seguranca) {
        int indice = data.columnIndex(COLUNA_EXECUCAO);
        if (indice < 0 || data.columnIndex(COLUNA_NUMERO) >= 0 || data.rows().isEmpty()) return data;
        NumerosDeNota fonte = fontes.getIfAvailable();
        if (fonte == null || seguranca == null || fonte.autoridades().stream().noneMatch(seguranca::possuiAutoridade)) {
            return data;
        }
        Map<UUID, String> numeros;
        try {
            numeros = fonte.numeros(ids(data, indice));
        } catch (RuntimeException exception) {
            // O numero e um complemento: sem ele o resultado continua valido.
            LOGGER.warn("Nao foi possivel abrir o numero das notas do resultado: {}", exception.getMessage());
            return data;
        }
        return comNumeros(data, indice, numeros);
    }

    static TabularData comNumeros(TabularData data, int indice, Map<UUID, String> numeros) {
        List<TabularData.Column> colunas = new ArrayList<>(data.columns());
        colunas.add(indice + 1, new TabularData.Column(COLUNA_NUMERO, TabularData.ColumnType.TEXTO));
        List<List<Object>> linhas = new ArrayList<>(data.rows().size());
        for (List<Object> row : data.rows()) {
            List<Object> linha = new ArrayList<>(row);
            linha.add(indice + 1, numeros.get(uuid(row.get(indice))));
            linhas.add(linha);
        }
        return new TabularData(colunas, linhas, data.totalRows(), data.truncated());
    }

    private static Set<UUID> ids(TabularData data, int indice) {
        Set<UUID> ids = new LinkedHashSet<>();
        for (List<Object> row : data.rows()) {
            UUID id = uuid(row.get(indice));
            if (id != null) ids.add(id);
        }
        return ids;
    }

    private static UUID uuid(Object valor) {
        if (valor == null) return null;
        try {
            return UUID.fromString(String.valueOf(valor).trim());
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }
}
