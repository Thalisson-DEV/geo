package com.nexo.app.modules.sincronizacao.application.usecases;

import com.nexo.app.modules.execucao.TurnoApi;
import com.nexo.app.modules.execucao.application.dto.TurnoResponse;
import com.nexo.app.modules.rh.EquipeApi;
import com.nexo.app.modules.sincronizacao.application.dto.SincronizacaoDtos.AcaoRecomendada;
import com.nexo.app.modules.sincronizacao.application.dto.SincronizacaoDtos.DiagnosticoResponse;
import com.nexo.app.modules.sincronizacao.domain.CasoSincronizacao;
import com.nexo.app.modules.sincronizacao.domain.StatusCasoSincronizacao;
import com.nexo.app.modules.sincronizacao.domain.TipoOperacaoSincronizacao;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.regex.Pattern;

/**
 * Traduz a recusa do servidor em linguagem de operação: o que aconteceu, por quê e
 * qual o próximo passo de quem trata o caso. O resumo (sem consultas) vai na
 * listagem; o completo consulta turno e equipe para orientar com o dado real.
 */
@Component @RequiredArgsConstructor
public class DiagnosticoCasoSincronizacao {
 static final String SEM_TURNO_ABERTO = "SEM_TURNO_ABERTO";
 private static final ZoneId ZONA = ZoneId.of("America/Sao_Paulo");
 private static final DateTimeFormatter DIA = DateTimeFormatter.ofPattern("dd/MM");
 private static final DateTimeFormatter HORA = DateTimeFormatter.ofPattern("HH:mm");
 private static final Pattern SERIE = Pattern.compile("série '([^']+)'");
 private static final Pattern PREFIXOS = Pattern.compile(
         "^(Erro informado pelo aplicativo:|Falha no reprocessamento:|Falha ao [^:]{1,60}:|InvarianteVioladaException:|IllegalArgumentException:)\\s*",
         Pattern.CASE_INSENSITIVE);

 private final TurnoApi turnoApi;
 private final EquipeApi equipeApi;

 /** Mensagem do servidor (ou do aparelho) que impediu o registro na última tentativa. */
 public static String ultimoErro(CasoSincronizacao c) {
  String ultima = c.getJustificativaUltima();
  if (c.getStatus() == StatusCasoSincronizacao.AGUARDANDO_REPROCESSAMENTO && ultima != null && ultima.startsWith("Falha no reprocessamento:")) return ultima;
  return c.getMotivo();
 }

 /** Mensagem sem os prefixos técnicos acumulados entre aparelho e reprocessamento. */
 static String limpar(String erro) {
  String texto = erro == null ? "" : erro.trim();
  for (String anterior = null; !texto.equals(anterior); ) { anterior = texto; texto = PREFIXOS.matcher(texto).replaceFirst("").trim(); }
  return texto;
 }

 public static boolean semTurnoAberto(CasoSincronizacao c) {
  return c.getOperacao().getTipo() == TipoOperacaoSincronizacao.EXECUCAO && ultimoErro(c).toLowerCase(Locale.ROOT).contains("sem um turno aberto");
 }

 public DiagnosticoResponse resumo(CasoSincronizacao c, Map<String, Object> payload) { return diagnosticar(c, payload, false); }

 public DiagnosticoResponse completo(CasoSincronizacao c, Map<String, Object> payload) { return diagnosticar(c, payload, true); }

 private DiagnosticoResponse diagnosticar(CasoSincronizacao c, Map<String, Object> payload, boolean completo) {
  String erro = limpar(ultimoErro(c));
  String lower = erro.toLowerCase(Locale.ROOT);
  if (semTurnoAberto(c)) return completo ? semTurno(payload, erro) : resumoSemTurno(erro);
  if (c.getOperacao().getTipo().deObras()) { var obra = obras(lower, erro); if (obra != null) return obra; }
  if (lower.contains("já foi registrado nesta execução")) return serieRepetida(payload, erro);
  if (lower.contains("já foi adicionada a esta execução")) return new DiagnosticoResponse("ACAO_REPETIDA", "Serviço repetido na nota", erro,
          "A mesma ação foi informada duas vezes. Em Corrigir, deixe a ação uma vez só e reenvie.", AcaoRecomendada.CORRIGIR);
  if (lower.contains("série é obrigatório")) return new DiagnosticoResponse("SERIE_OBRIGATORIA", "Material sem número de série", erro,
          "Este material exige a série de cada unidade. Confirme a série com a equipe, informe em Corrigir e reenvie.", AcaoRecomendada.CORRIGIR);
  if (lower.contains("já possui um turno aberto")) return new DiagnosticoResponse("TURNO_JA_ABERTO", "Turno já estava aberto", erro,
          "O turno da equipe já está aberto no sistema; este envio é uma repetição. Descarte o registro.", AcaoRecomendada.DESCARTAR);
  if (lower.contains("não encontrad")) return new DiagnosticoResponse("CADASTRO_NAO_ENCONTRADO", "Cadastro não localizado", erro,
          "Um cadastro usado na nota (equipe, material, ação ou tipo de serviço) não existe ou foi desativado. Em Corrigir, escolha o cadastro certo e reenvie.", AcaoRecomendada.CORRIGIR);
  if (lower.contains("saldo") || lower.contains("insuficiente")) return new DiagnosticoResponse("SALDO_INSUFICIENTE", "Saldo de estoque insuficiente", erro,
          "Confira as quantidades com a equipe ou acerte o saldo no almoxarifado; depois reenvie.", AcaoRecomendada.CONFERIR);
  if (lower.contains("no static resource") || lower.contains("timeout") || lower.contains("connection")) return new DiagnosticoResponse("FALHA_TECNICA", "Falha técnica no envio",
          "O servidor não conseguiu receber o registro naquele momento; os dados não têm erro conhecido.",
          "Reenvie sem alterar. Se falhar de novo, avise o suporte.", AcaoRecomendada.REENVIAR);
  if (lower.contains("aguardando tratamento administrativo")) return new DiagnosticoResponse("GUARDADO_SEM_ERRO", "Registro guardado sem erro",
          "O aparelho guardou o registro para conferência, sem recusa do servidor.",
          "Confira os dados e reenvie sem alterar.", AcaoRecomendada.REENVIAR);
  return new DiagnosticoResponse("OUTRO", "Registro recusado pelo servidor", erro.isBlank() ? "O servidor não informou o motivo." : erro,
          "Confira os dados abaixo com a equipe. Corrija o que estiver errado e reenvie, ou descarte se o registro não deve entrar.", AcaoRecomendada.CONFERIR);
 }

 /** Recusas dos registros de Obras do app, na linguagem de quem acompanha a equipe. */
 static DiagnosticoResponse obras(String lower, String erro) {
  if (lower.contains("apr deste serviço precisa estar concluída") || lower.contains("apr ainda não chegou")) return new DiagnosticoResponse("OBRA_SEM_APR", "Apontamento sem APR concluída", erro,
          "A APR do serviço não chegou ou foi concluída depois do apontamento. Confira a APR do dia no turno; quando ela entrar, reenvie sem alterar.", AcaoRecomendada.CONFERIR);
  if (lower.contains("não tem condição de ser feito")) return new DiagnosticoResponse("OBRA_IMPEDIDA", "Serviço registrado como sem condição", erro,
          "A equipe registrou que não havia condição de executar antes deste apontamento. Confirme com a equipe o que foi feito; descarte se o serviço não aconteceu.", AcaoRecomendada.CONFERIR);
  if (lower.contains("foi cancelada ou excluída") || lower.contains("não é mais desta equipe") || lower.contains("não está na programação")) return new DiagnosticoResponse("OBRA_PROGRAMACAO_ALTERADA", "A programação mudou depois do lançamento", erro,
          "A programação foi cancelada, reprogramada ou teve o item retirado enquanto a equipe estava sem sinal. Decida com a supervisão em qual programação o serviço entra, corrija e reenvie, ou descarte.", AcaoRecomendada.CONFERIR);
  if (lower.contains("não tinha turno aberto")) return new DiagnosticoResponse("OBRA_SEM_TURNO", "Registro feito sem turno aberto", erro,
          "O turno da equipe ainda não tinha chegado ao servidor. Reenvie sem alterar depois que o turno do dia entrar.", AcaoRecomendada.REENVIAR);
  if (lower.contains("já estava apontado")) return new DiagnosticoResponse("OBRA_PONTO_JA_APONTADO", "Ponto já apontado", erro,
          "Tudo deste ponto já estava apontado na programação. Descarte o registro.", AcaoRecomendada.DESCARTAR);
  if (lower.contains("já foi usado com outro conteúdo") || lower.contains("já foi recebida com outro conteúdo")) return new DiagnosticoResponse("OBRA_ID_REPETIDO", "Registro repetido com conteúdo diferente", erro,
          "O aparelho mandou dois registros diferentes com o mesmo identificador. O primeiro já entrou; confira com a equipe e descarte este se for repetição.", AcaoRecomendada.CONFERIR);
  return null;
 }

 private DiagnosticoResponse resumoSemTurno(String erro) {
  return new DiagnosticoResponse(SEM_TURNO_ABERTO, "Nota lançada sem turno aberto", erro,
          "Abra o caso para ver se a equipe já abriu o turno do dia.", AcaoRecomendada.CONFERIR);
 }

 private DiagnosticoResponse semTurno(Map<String, Object> p, String erro) {
  UUID idEquipe = uuid(p.get("idEquipe"));
  OffsetDateTime lancamento = data(p.get("dataLancamento") != null ? p.get("dataLancamento") : p.get("dataInicio"));
  if (idEquipe == null || lancamento == null) return resumoSemTurno(erro);
  String equipe = equipeApi.buscarPublicaPorId(idEquipe).map(e -> "equipe " + e.codigo()).orElse("equipe");
  var local = lancamento.atZoneSameInstant(ZONA);
  var explicacao = new StringBuilder("A nota foi lançada em ").append(local.format(DIA)).append(" às ").append(local.format(HORA))
          .append(", quando a ").append(equipe).append(" não tinha turno aberto.");
  turno(uuid(p.get("idTurno"))).filter(TurnoResponse::encerradoAutomaticamente).ifPresent(t -> explicacao
          .append(" O aparelho ainda usava o turno de ").append(t.dataInicio().atZoneSameInstant(ZONA).format(DIA))
          .append(", que não foi encerrado pela equipe e o sistema fechou no corte da noite."));
  LocalDate diaDaNota = local.toLocalDate();
  var ativo = turnoApi.buscarAtivoPorEquipe(idEquipe);
  if (ativo.isPresent()) {
   var abertura = ativo.get().dataInicio().atZoneSameInstant(ZONA);
   if (abertura.toLocalDate().equals(diaDaNota)) return new DiagnosticoResponse(SEM_TURNO_ABERTO, "Nota lançada antes de abrir o turno", explicacao.toString(),
           "A " + equipe + " abriu o turno às " + abertura.format(HORA) + ". Reenvie sem alterar: a nota entra nesse turno.", AcaoRecomendada.REENVIAR);
   return new DiagnosticoResponse(SEM_TURNO_ABERTO, "Nota lançada sem turno aberto", explicacao.toString(),
           "O turno aberto agora é de " + abertura.format(DIA) + ", outro dia. Reenviar lança a nota nele: confirme com a supervisão antes, ou descarte se a nota já foi lançada de novo.", AcaoRecomendada.CONFERIR);
  }
  if (diaDaNota.equals(LocalDate.now(ZONA))) return new DiagnosticoResponse(SEM_TURNO_ABERTO, "Nota lançada sem turno aberto", explicacao.toString(),
          "Quando a equipe abrir o turno de hoje, a nota é reenviada sozinha. Não é preciso fazer nada agora.", AcaoRecomendada.AGUARDAR);
  return new DiagnosticoResponse(SEM_TURNO_ABERTO, "Nota lançada sem turno aberto", explicacao.toString(),
          "A equipe não abriu turno em " + local.format(DIA) + ". Confirme com a supervisão se a nota foi feita e em qual turno ela entra antes de reenviar, ou descarte.", AcaoRecomendada.CONFERIR);
 }

 private DiagnosticoResponse serieRepetida(Map<String, Object> p, String erro) {
  var m = SERIE.matcher(erro);
  String serie = m.find() ? m.group(1) : null;
  var operacoes = new LinkedHashSet<String>();
  if (serie != null && p.get("materiais") instanceof List<?> materiais) {
   for (Object item : materiais) if (item instanceof Map<?, ?> mat && serie.equalsIgnoreCase(String.valueOf(mat.get("numSerie"))))
    operacoes.add("RETIRADO".equals(String.valueOf(mat.get("operacao"))) ? "retirada" : "aplicada");
  }
  String onde = operacoes.size() > 1 ? " como aplicada e como retirada" : "";
  String explicacao = serie == null ? erro : "A série " + serie + " foi informada mais de uma vez na mesma nota" + onde + ". Cada série entra uma vez só.";
  return new DiagnosticoResponse("SERIE_REPETIDA", "Número de série repetido na nota", explicacao,
          "Confirme com a equipe a série do medidor que saiu. Em Corrigir, troque a série da linha errada (ou remova a repetida) e reenvie.", AcaoRecomendada.CORRIGIR);
 }

 private Optional<TurnoResponse> turno(UUID id) {
  if (id == null) return Optional.empty();
  try { return Optional.ofNullable(turnoApi.buscarPorId(id)); } catch (RuntimeException e) { return Optional.empty(); }
 }

 static UUID uuid(Object valor) {
  if (valor == null) return null;
  try { return UUID.fromString(String.valueOf(valor)); } catch (IllegalArgumentException e) { return null; }
 }

 static OffsetDateTime data(Object valor) {
  if (valor == null) return null;
  try { return OffsetDateTime.parse(String.valueOf(valor)); } catch (RuntimeException e) { return null; }
 }
}
