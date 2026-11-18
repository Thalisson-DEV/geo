package com.nexo.app.modules.sst.application.usecases;

import com.nexo.app.modules.sst.application.dto.ConfirmarImportacaoFormularioInspecaoRequest;
import com.nexo.app.modules.sst.application.dto.CriarFormularioRequest;
import com.nexo.app.modules.sst.application.dto.FormularioInspecaoImportacaoDTO;
import com.nexo.app.modules.sst.application.dto.ImportacaoFormularioInspecaoResponse;
import com.nexo.app.modules.sst.domain.GravidadeDesvio;
import com.nexo.app.modules.sst.domain.TipoResposta;
import com.nexo.app.modules.sst.infrastructure.persistence.FormularioInspecaoRepository;
import com.nexo.app.shared.application.dto.ImportacaoStatus;
import com.nexo.app.shared.domain.exception.BaseBusinessException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Importação de formulários de inspeção por planilha, no mesmo fluxo validar →
 * conferir → confirmar dos demais cadastros. Cada linha é uma pergunta; as linhas
 * com o mesmo formulário viram um formulário, e as com o mesmo grupo, um grupo,
 * na ordem em que aparecem.
 *
 * <p>O tipo padrão é o checklist Conforme / Não conforme / Não se aplica:
 * "Conforme" já vem marcada, "Não conforme" gera desvio com a gravidade da linha
 * e "Não se aplica" não gera desvio.</p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ImportarFormulariosInspecaoUseCase {

    static final String CONFORME = "Conforme";
    static final String NAO_CONFORME = "Não conforme";
    static final String NAO_SE_APLICA = "Não se aplica";

    private static final int LIMITE_LINHAS = 3000;

    private final FormularioInspecaoUseCases formularioUseCases;
    private final FormularioInspecaoRepository formularioRepository;

    /** Tipos aceitos na coluna "Tipo de resposta". */
    enum TipoImportacao { CHECKLIST, ESCOLHA, TEXTO, NUMERO, DATA }

    public ImportacaoFormularioInspecaoResponse executarValidacao(MultipartFile arquivo) {
        if (arquivo == null || arquivo.isEmpty()) {
            throw new IllegalArgumentException("Selecione um arquivo CSV preenchido");
        }
        List<FormularioInspecaoImportacaoDTO> registros = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(arquivo.getInputStream(), StandardCharsets.UTF_8))) {
            String linha;
            int numeroLinha = 0;
            while ((linha = reader.readLine()) != null) {
                numeroLinha++;
                if (numeroLinha == 1 || linha.isBlank() || linha.strip().replace("﻿", "").startsWith("#")) {
                    continue;
                }
                if (registros.size() >= LIMITE_LINHAS) {
                    log.warn("Arquivo de formulários excede o limite de {} perguntas", LIMITE_LINHAS);
                    break;
                }
                registros.add(processarLinhaCsv(linha, numeroLinha - 1));
            }
        } catch (Exception e) {
            log.error("Falha ao ler arquivo de importação de formulários", e);
            throw new IllegalArgumentException("Falha ao ler o arquivo CSV: " + e.getMessage(), e);
        }
        return resposta(validarTodas(registros));
    }

    public ImportacaoFormularioInspecaoResponse confirmarImportacao(ConfirmarImportacaoFormularioInspecaoRequest request) {
        List<FormularioInspecaoImportacaoDTO> revalidadas = validarTodas(request.perguntas());

        Map<String, List<Integer>> indicesPorFormulario = new LinkedHashMap<>();
        for (int i = 0; i < revalidadas.size(); i++) {
            indicesPorFormulario.computeIfAbsent(chave(revalidadas.get(i).formulario()), k -> new ArrayList<>()).add(i);
        }

        List<FormularioInspecaoImportacaoDTO> resultado = new ArrayList<>(revalidadas);
        for (List<Integer> indices : indicesPorFormulario.values()) {
            List<FormularioInspecaoImportacaoDTO> linhas = indices.stream().map(revalidadas::get).toList();
            boolean algumErro = linhas.stream().anyMatch(l -> l.status() == ImportacaoStatus.COM_ERRO);
            if (algumErro) {
                for (int i : indices) {
                    if (resultado.get(i).status() != ImportacaoStatus.COM_ERRO) {
                        resultado.set(i, resultado.get(i).withStatus(ImportacaoStatus.COM_ERRO,
                                "Outra linha deste formulário tem erro; corrija-a para importar o formulário inteiro"));
                    }
                }
                continue;
            }
            try {
                formularioUseCases.criar(montarRequest(linhas));
                for (int i : indices) {
                    resultado.set(i, resultado.get(i).withStatus(ImportacaoStatus.CONCLUIDO, null));
                }
            } catch (BaseBusinessException | IllegalArgumentException e) {
                for (int i : indices) {
                    resultado.set(i, resultado.get(i).withStatus(ImportacaoStatus.COM_ERRO, e.getMessage()));
                }
            }
        }
        return resposta(resultado);
    }

    public byte[] obterModeloCsv() {
        String cabecalho = "Formulário;Descrição do formulário;Grupo;Pergunta;Orientação;Tipo de resposta;"
                + "Gravidade da não conformidade;Desvio por colaborador;Obrigatória;Opções\n";
        String instrucoes = "# Uma linha por pergunta. Use ponto e vírgula entre as colunas; textos com ponto e vírgula vão entre aspas.\n"
                + "# Linhas com o mesmo Formulário formam um formulário; com o mesmo Grupo, um grupo, na ordem da planilha.\n"
                + "# Tipo de resposta: Checklist (padrão: Conforme / Não conforme / Não se aplica), Escolha, Texto, Número ou Data.\n"
                + "# Gravidade (obrigatória no Checklist): Baixa, Média, Alta ou Crítica.\n"
                + "# Desvio por colaborador: Sim (padrão, ex.: EPI) ou Não (item da equipe ou do veículo, ex.: pneu, extintor).\n"
                + "# Opções (só no tipo Escolha): separe por |. Exemplo: Turma liberada sem notificação|Turma suspensa\n"
                + "# Exemplo: Inspeção Comercial;Equipe parada;EPI;Capacete de segurança com jugular;Individual;Checklist;Alta;Sim;Sim;\n"
                + "# Exemplo: Inspeção Comercial;Equipe parada;Veículo;Pneus / estepe;;Checklist;Média;Não;Sim;\n";
        return ("﻿" + cabecalho + instrucoes).getBytes(StandardCharsets.UTF_8);
    }

    // --------------------------------------------------------------------- //

    private List<FormularioInspecaoImportacaoDTO> validarTodas(List<FormularioInspecaoImportacaoDTO> linhas) {
        Map<String, Boolean> tituloExiste = new LinkedHashMap<>();
        return linhas.stream().map(l -> {
            try {
                validar(l);
                String titulo = l.formulario().strip();
                boolean existe = tituloExiste.computeIfAbsent(chave(titulo),
                        k -> formularioRepository.findByTituloIgnoreCase(titulo).isPresent());
                if (existe) {
                    throw new IllegalArgumentException("Já existe um formulário com o título \"" + titulo + "\"");
                }
                return l.withStatus(ImportacaoStatus.AGUARDANDO_PROCESSAMENTO, null);
            } catch (IllegalArgumentException e) {
                return l.withStatus(ImportacaoStatus.COM_ERRO, e.getMessage());
            }
        }).toList();
    }

    private void validar(FormularioInspecaoImportacaoDTO l) {
        exigir(l.formulario(), "Informe o formulário", 150);
        exigir(l.grupo(), "Informe o grupo", 150);
        exigir(l.pergunta(), "Informe a pergunta", 500);
        if (texto(l.descricao()).length() > 500) {
            throw new IllegalArgumentException("A descrição do formulário passa de 500 caracteres");
        }
        if (texto(l.orientacao()).length() > 300) {
            throw new IllegalArgumentException("A orientação passa de 300 caracteres");
        }
        TipoImportacao tipo = tipo(l.tipoResposta());
        if (tipo == TipoImportacao.CHECKLIST) {
            gravidade(l.gravidade());
        }
        if (tipo == TipoImportacao.ESCOLHA && opcoes(l.opcoes()).size() < 2) {
            throw new IllegalArgumentException("Informe ao menos duas opções separadas por |");
        }
        simNao(l.desvioPorColaborador(), true, "Desvio por colaborador");
        simNao(l.obrigatoria(), true, "Obrigatória");
    }

    private CriarFormularioRequest montarRequest(List<FormularioInspecaoImportacaoDTO> linhas) {
        FormularioInspecaoImportacaoDTO primeira = linhas.get(0);
        String descricao = linhas.stream().map(FormularioInspecaoImportacaoDTO::descricao)
                .filter(d -> !texto(d).isEmpty()).findFirst().map(String::strip).orElse(null);

        Map<String, String> tituloGrupo = new LinkedHashMap<>();
        Map<String, List<CriarFormularioRequest.PerguntaRequest>> perguntasPorGrupo = new LinkedHashMap<>();
        for (FormularioInspecaoImportacaoDTO l : linhas) {
            String k = chave(l.grupo());
            tituloGrupo.putIfAbsent(k, l.grupo().strip());
            perguntasPorGrupo.computeIfAbsent(k, x -> new ArrayList<>()).add(montarPergunta(l));
        }
        List<CriarFormularioRequest.GrupoRequest> grupos = perguntasPorGrupo.entrySet().stream()
                .map(e -> new CriarFormularioRequest.GrupoRequest(tituloGrupo.get(e.getKey()), e.getValue()))
                .toList();
        return new CriarFormularioRequest(primeira.formulario().strip(), descricao, grupos);
    }

    private CriarFormularioRequest.PerguntaRequest montarPergunta(FormularioInspecaoImportacaoDTO l) {
        TipoImportacao tipo = tipo(l.tipoResposta());
        boolean obrigatoria = simNao(l.obrigatoria(), true, "Obrigatória");
        boolean porColaborador = simNao(l.desvioPorColaborador(), true, "Desvio por colaborador");
        String orientacao = texto(l.orientacao()).isEmpty() ? null : l.orientacao().strip();

        List<CriarFormularioRequest.OpcaoRequest> opcoes = switch (tipo) {
            case CHECKLIST -> List.of(
                    new CriarFormularioRequest.OpcaoRequest(CONFORME, false, null, true),
                    new CriarFormularioRequest.OpcaoRequest(NAO_CONFORME, true, gravidade(l.gravidade()), false),
                    new CriarFormularioRequest.OpcaoRequest(NAO_SE_APLICA, false, null, false));
            case ESCOLHA -> opcoes(l.opcoes()).stream()
                    .map(o -> new CriarFormularioRequest.OpcaoRequest(o, false, null, false))
                    .toList();
            default -> List.of();
        };
        TipoResposta tipoResposta = switch (tipo) {
            case CHECKLIST, ESCOLHA -> TipoResposta.MULTIPLA_ESCOLHA;
            case TEXTO -> TipoResposta.TEXTO;
            case NUMERO -> TipoResposta.NUMERO;
            case DATA -> TipoResposta.DATA;
        };
        return new CriarFormularioRequest.PerguntaRequest(
                l.pergunta().strip(), tipoResposta, obrigatoria, opcoes, orientacao, porColaborador);
    }

    static TipoImportacao tipo(String valor) {
        String v = normalizar(valor);
        if (v.isEmpty() || v.startsWith("checklist") || v.startsWith("conforme") || v.equals("c/nc/na")) {
            return TipoImportacao.CHECKLIST;
        }
        return switch (v) {
            case "escolha", "escolha unica", "multipla escolha" -> TipoImportacao.ESCOLHA;
            case "texto" -> TipoImportacao.TEXTO;
            case "numero" -> TipoImportacao.NUMERO;
            case "data" -> TipoImportacao.DATA;
            default -> throw new IllegalArgumentException(
                    "Tipo de resposta \"" + valor + "\" desconhecido. Use Checklist, Escolha, Texto, Número ou Data");
        };
    }

    static GravidadeDesvio gravidade(String valor) {
        return switch (normalizar(valor)) {
            case "baixa", "baixo" -> GravidadeDesvio.BAIXA;
            case "media", "medio" -> GravidadeDesvio.MEDIA;
            case "alta", "alto" -> GravidadeDesvio.ALTA;
            case "critica", "critico" -> GravidadeDesvio.CRITICA;
            case "" -> throw new IllegalArgumentException("Informe a gravidade da não conformidade (Baixa, Média, Alta ou Crítica)");
            default -> throw new IllegalArgumentException(
                    "Gravidade \"" + valor + "\" desconhecida. Use Baixa, Média, Alta ou Crítica");
        };
    }

    private static boolean simNao(String valor, boolean padrao, String coluna) {
        return switch (normalizar(valor)) {
            case "" -> padrao;
            case "sim", "s", "verdadeiro", "true" -> true;
            case "nao", "n", "falso", "false" -> false;
            default -> throw new IllegalArgumentException("Na coluna " + coluna + ", use Sim ou Não");
        };
    }

    private static List<String> opcoes(String valor) {
        return Arrays.stream(texto(valor).split("\\|")).map(String::strip).filter(s -> !s.isEmpty()).distinct().toList();
    }

    private static void exigir(String valor, String mensagem, int limite) {
        if (texto(valor).isEmpty()) {
            throw new IllegalArgumentException(mensagem);
        }
        if (valor.strip().length() > limite) {
            throw new IllegalArgumentException(mensagem.replace("Informe o", "O") + " passa de " + limite + " caracteres");
        }
    }

    private static String texto(String valor) {
        return valor == null ? "" : valor.strip();
    }

    private static String chave(String valor) {
        return normalizar(valor);
    }

    private static String normalizar(String valor) {
        String sem = Normalizer.normalize(texto(valor), Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        return sem.toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
    }

    private ImportacaoFormularioInspecaoResponse resposta(List<FormularioInspecaoImportacaoDTO> registros) {
        int falhas = (int) registros.stream().filter(r -> r.status() == ImportacaoStatus.COM_ERRO).count();
        return new ImportacaoFormularioInspecaoResponse(registros, registros.size(), registros.size() - falhas, falhas);
    }

    private FormularioInspecaoImportacaoDTO processarLinhaCsv(String linha, int indice) {
        List<String> c = colunasCsv(linha);
        return new FormularioInspecaoImportacaoDTO(
                indice, coluna(c, 0), coluna(c, 1), coluna(c, 2), coluna(c, 3), coluna(c, 4),
                coluna(c, 5), coluna(c, 6), coluna(c, 7), coluna(c, 8), coluna(c, 9),
                ImportacaoStatus.AGUARDANDO_PROCESSAMENTO, null);
    }

    /** Separa por ponto e vírgula respeitando textos entre aspas (com "" como aspa literal). */
    static List<String> colunasCsv(String linha) {
        List<String> colunas = new ArrayList<>();
        StringBuilder atual = new StringBuilder();
        boolean entreAspas = false;
        for (int i = 0; i < linha.length(); i++) {
            char ch = linha.charAt(i);
            if (ch == '"') {
                if (entreAspas && i + 1 < linha.length() && linha.charAt(i + 1) == '"') {
                    atual.append('"');
                    i++;
                } else {
                    entreAspas = !entreAspas;
                }
            } else if (ch == ';' && !entreAspas) {
                colunas.add(atual.toString());
                atual.setLength(0);
            } else {
                atual.append(ch);
            }
        }
        colunas.add(atual.toString());
        return colunas;
    }

    private static String coluna(List<String> colunas, int indice) {
        return colunas.size() > indice ? colunas.get(indice).replace("﻿", "").strip() : "";
    }
}
