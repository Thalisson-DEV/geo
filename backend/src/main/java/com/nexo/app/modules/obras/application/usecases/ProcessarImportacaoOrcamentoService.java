package com.nexo.app.modules.obras.application.usecases;

import com.nexo.app.modules.contrato.AcaoResponse;
import com.nexo.app.modules.contrato.ContratoApi;
import com.nexo.app.modules.estoque.EstoqueApi;
import com.nexo.app.modules.estoque.MaterialResponse;
import com.nexo.app.modules.obras.application.usecases.LeitorPlanilhaImportacao.Linha;
import com.nexo.app.modules.obras.domain.ImportacaoObra;
import com.nexo.app.modules.obras.domain.ItemOrcamentoObra;
import com.nexo.app.modules.obras.domain.Obra;
import com.nexo.app.modules.obras.domain.OperacaoItemKit;
import com.nexo.app.modules.obras.domain.OrigemOrcamento;
import com.nexo.app.modules.obras.domain.TipoItemKit;
import com.nexo.app.modules.obras.infrastructure.persistence.ImportacaoObraRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.ObraRepository;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.infrastructure.config.CacheNames;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Processa a planilha do orçamento: uma linha por serviço ou material, agrupada pelo número da obra.
 *
 * <p>Cada obra da planilha ganha uma revisão nova do orçamento com as linhas válidas; a anterior fica no histórico
 * (linhas inválidas ficam no relatório e não entram). Os totais do orçamento viram os valores previstos da carteira;
 * as colunas antigas de valor de material/serviço previsto, quando informadas, prevalecem.</p>
 */
@Slf4j
@Service
public class ProcessarImportacaoOrcamentoService {

    static final String[] COL_OBRA = ProcessarImportacaoCarteiraService.COL_NUMERO;
    static final String[] COL_TIPO = {"TIPO", "TIPO_ITEM", "NATUREZA"};
    static final String[] COL_OPERACAO = {"OPERACAO", "ACAO_CAMPO"};
    static final String[] COL_CODIGO = {"CODIGO", "CODIGO_SERVICO", "SERVICO", "COD_SERVICO", "CODIGO_MATERIAL", "MATERIAL"};
    static final String[] COL_DESCRICAO = {"DESCRICAO", "DESCRICAO_SERVICO", "DESCRICAO_MATERIAL"};
    static final String[] COL_UNIDADE = {"UNIDADE", "UN", "UND"};
    static final String[] COL_QUANTIDADE = {"QUANTIDADE", "QTD", "QTDE"};
    static final String[] COL_VALOR_UNITARIO = {"VALOR_UNITARIO", "PRECO", "PRECO_UNITARIO"};
    static final String[] COL_VALOR_TOTAL = {"VALOR_TOTAL", "TOTAL"};

    private final ImportacaoObraRepository importacaoRepository;
    private final ObraRepository obraRepository;
    private final OrcamentoObraUseCases orcamentos;
    private final ContratoApi contratoApi;
    private final EstoqueApi estoqueApi;
    private final NormalizadorObraService normalizador;
    private final TransactionTemplate transacao;

    public ProcessarImportacaoOrcamentoService(ImportacaoObraRepository importacaoRepository,
                                               ObraRepository obraRepository,
                                               OrcamentoObraUseCases orcamentos,
                                               ContratoApi contratoApi,
                                               EstoqueApi estoqueApi,
                                               NormalizadorObraService normalizador,
                                               PlatformTransactionManager transacoes) {
        this.importacaoRepository = importacaoRepository;
        this.obraRepository = obraRepository;
        this.orcamentos = orcamentos;
        this.contratoApi = contratoApi;
        this.estoqueApi = estoqueApi;
        this.normalizador = normalizador;
        this.transacao = new TransactionTemplate(transacoes);
    }

    @Async
    @CacheEvict(cacheNames = CacheNames.OBRAS, allEntries = true)
    public void processar(UUID idImportacao, List<Linha> linhas) {
        ImportacaoObra importacao = importacaoRepository.findById(idImportacao).orElse(null);
        if (importacao == null) {
            log.warn("Importação de orçamento {} não encontrada para processamento", idImportacao);
            return;
        }
        try {
            Map<String, List<Linha>> porObra = new LinkedHashMap<>();
            for (Linha linha : linhas) {
                String numero = normalizador.normalizarNumero(linha.valor(COL_OBRA));
                if (numero == null) {
                    importacao.registrarErro(linha.numero(), null, "Número da obra não informado.");
                } else {
                    porObra.computeIfAbsent(numero, k -> new ArrayList<>()).add(linha);
                }
            }
            Map<String, Optional<UUID>> referencias = new HashMap<>();
            porObra.forEach((numero, grupo) -> processarObra(importacao, numero, grupo, referencias));
            importacao.concluir(linhas.size());
        } catch (InvarianteVioladaException e) {
            importacao.falhar(e.getMessage());
        } catch (RuntimeException e) {
            log.error("Falha inesperada na importação de orçamento {}", idImportacao, e);
            importacao.falhar("Falha inesperada ao processar a planilha. Tente novamente ou contate o suporte.");
        }
        importacaoRepository.save(importacao);
    }

    private void processarObra(ImportacaoObra importacao, String numero, List<Linha> linhas,
                               Map<String, Optional<UUID>> referencias) {
        List<Runnable> contagens = new ArrayList<>();
        try {
            transacao.executeWithoutResult(status -> {
                contagens.clear();
                Obra obra = obraRepository.findByNumeroIgnoreCaseAndAtivoTrue(numero)
                        .orElseThrow(() -> new InvarianteVioladaException("Obra " + numero + " não encontrada."));
                List<ItemOrcamentoObra.Dados> novos = new ArrayList<>();
                for (Linha linha : linhas) {
                    try {
                        novos.add(dados(obra, linha, referencias));
                        contagens.add(importacao::registrarInserido);
                    } catch (InvarianteVioladaException e) {
                        importacao.registrarErro(linha.numero(), numero, e.getMessage());
                    }
                }
                if (novos.isEmpty()) {
                    return;
                }
                String arquivo = importacao.getNomeArquivo() != null ? importacao.getNomeArquivo() : "planilha";
                // O processamento é assíncrono (sem usuário logado): quem importou fica na observação.
                String quem = importacao.getUsuarioCriacao() != null ? " por " + importacao.getUsuarioCriacao() : "";
                orcamentos.substituir(obra, OrigemOrcamento.IMPORTACAO, importacao.getId(), "Importado de " + arquivo + quem, novos);
                atualizarTotais(obra, linhas);
            });
            contagens.forEach(Runnable::run);
        } catch (InvarianteVioladaException e) {
            linhas.forEach(l -> importacao.registrarErro(l.numero(), numero, e.getMessage()));
        } catch (RuntimeException e) {
            log.error("Falha ao gravar o orçamento da obra {} na importação {}", numero, importacao.getId(), e);
            linhas.forEach(l -> importacao.registrarErro(l.numero(), numero, "Falha ao gravar o orçamento."));
        }
    }

    private ItemOrcamentoObra.Dados dados(Obra obra, Linha linha, Map<String, Optional<UUID>> referencias) {
        String codigo = linha.valor(COL_CODIGO);
        if (codigo == null) {
            throw new InvarianteVioladaException("Código do serviço ou material não informado.");
        }
        TipoItemKit tipo = tipo(linha.valor(COL_TIPO));
        String chave = codigo.trim().toUpperCase(Locale.ROOT);
        UUID referencia = referencias.computeIfAbsent(tipo + "|" + chave, c -> tipo == TipoItemKit.MATERIAL
                ? estoqueApi.buscarMaterialAtivoPorCodigo(codigo.trim()).map(MaterialResponse::id)
                : contratoApi.buscarAcaoAtivaPorCodigo(chave).map(AcaoResponse::id)).orElse(null);
        ItemOrcamentoObra.Dados dados = new ItemOrcamentoObra.Dados(tipo, operacao(linha.valor(COL_OPERACAO)), codigo,
                linha.valor(COL_DESCRICAO), linha.valor(COL_UNIDADE),
                LeitorPlanilhaImportacao.interpretarDecimal(linha.valor(COL_QUANTIDADE)),
                LeitorPlanilhaImportacao.interpretarDecimal(linha.valor(COL_VALOR_UNITARIO)),
                LeitorPlanilhaImportacao.interpretarDecimal(linha.valor(COL_VALOR_TOTAL)),
                tipo == TipoItemKit.SERVICO ? referencia : null, tipo == TipoItemKit.MATERIAL ? referencia : null);
        // Valida quantidade e valores aqui, para o erro voltar só para esta linha.
        new ItemOrcamentoObra(obra.getId(), null, null, dados);
        return dados;
    }

    /** Tipo escrito na planilha: vazio, "serviço" ou "mão de obra" é serviço; "material" é material. */
    static TipoItemKit tipo(String valor) {
        String t = normalizar(valor);
        if (t.isEmpty() || t.startsWith("SERV") || t.startsWith("MAO") || t.equals("S") || t.equals("MO")) {
            return TipoItemKit.SERVICO;
        }
        if (t.startsWith("MAT") || t.equals("M")) {
            return TipoItemKit.MATERIAL;
        }
        throw new InvarianteVioladaException("Tipo \"" + valor.trim() + "\" não reconhecido: use Serviço ou Material.");
    }

    /** Operação escrita na planilha: vazio ou "instalar" é instalar; "retirar" ou "retirada" é retirar. */
    static OperacaoItemKit operacao(String valor) {
        String o = normalizar(valor);
        if (o.isEmpty() || o.startsWith("INST") || o.equals("I")) {
            return OperacaoItemKit.INSTALAR;
        }
        if (o.startsWith("RET") || o.equals("R")) {
            return OperacaoItemKit.RETIRAR;
        }
        throw new InvarianteVioladaException("Operação \"" + valor.trim() + "\" não reconhecida: use Instalar ou Retirar.");
    }

    private static String normalizar(String valor) {
        if (valor == null) {
            return "";
        }
        return Normalizer.normalize(valor.trim(), Normalizer.Form.NFD).replaceAll("\\p{M}", "").toUpperCase(Locale.ROOT);
    }

    /** Colunas antigas de valor previsto: quando vêm na planilha, prevalecem sobre os totais do orçamento. */
    private void atualizarTotais(Obra obra, List<Linha> linhas) {
        BigDecimal material = linhas.stream()
                .map(l -> normalizador.parseValor(l.valor(ProcessarImportacaoCarteiraService.COL_VALOR_MATERIAL)))
                .filter(v -> v != null).findFirst().orElse(null);
        BigDecimal servico = linhas.stream()
                .map(l -> normalizador.parseValor(l.valor(ProcessarImportacaoCarteiraService.COL_VALOR_SERVICO)))
                .filter(v -> v != null).findFirst().orElse(null);
        if (material == null && servico == null) {
            return;
        }
        obra.informarCarteira(obra.getIdContrato(), obra.getPrazoRegulado(), obra.getPrioridade(),
                obra.getLotePrevisto(), null,
                material != null ? material : obra.getValorMaterialPrevisto(),
                servico != null ? servico : obra.getValorServicoPrevisto());
        obraRepository.save(obra);
    }
}
