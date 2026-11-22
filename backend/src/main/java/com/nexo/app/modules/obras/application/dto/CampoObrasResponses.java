package com.nexo.app.modules.obras.application.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.nexo.app.modules.obras.domain.SituacaoIntervencao;
import com.nexo.app.modules.obras.domain.SituacaoProgramacao;
import com.nexo.app.modules.obras.domain.StatusItemPlanejado;
import com.nexo.app.modules.obras.domain.TipoEventoProgramacao;
import com.nexo.app.modules.obras.domain.TipoItemKit;
import com.nexo.app.modules.obras.domain.TurnoProgramacao;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** O que o app de campo recebe: o resultado de cada comando e o pacote offline da equipe. */
public final class CampoObrasResponses {

    private CampoObrasResponses() {
    }

    /**
     * Resultado de um comando do aparelho.
     *
     * @param ids        registros gravados (o apontamento de ponto inteiro gera um por item).
     * @param jaRecebido o mesmo comando já tinha chegado: nada foi gravado de novo.
     */
    public record Resultado(UUID idLocal, String tipo, List<UUID> ids, boolean jaRecebido, OffsetDateTime recebidoEm,
                            UUID idTurno) {
    }

    /**
     * Pacote offline da equipe. Com {@code desde}, traz só as programações que mudaram e a lista das que saíram da agenda
     * (canceladas, excluídas, passadas para outra equipe ou fora da janela).
     */
    public record Pacote(OffsetDateTime geradoEm, OffsetDateTime desde, UUID idEquipe, String codigoEquipe,
                         @JsonFormat(pattern = "dd/MM/yyyy") LocalDate inicioJanela,
                         @JsonFormat(pattern = "dd/MM/yyyy") LocalDate fimJanela,
                         List<ProgramacaoCampo> programacoes, List<UUID> programacoesRemovidas,
                         List<ObraCampo> obras, ModeloApr modeloApr, List<ModeloFoto> modelosFoto, List<Aviso> avisos,
                         /** APRs concluídas e "sem condição" da equipe hoje, em qualquer aparelho: a liberação do dia no app. */
                         List<LiberacaoDia> liberacaoDoDia,
                         List<ObraResumo> obrasAbertas) {
    }

    /** {@code tipo}: APR (concluída) ou IMPEDIMENTO ("sem condição de executar"). {@code idLocal}: id do aparelho, se veio do app. */
    public record LiberacaoDia(String tipo, UUID idObra, UUID idLocal, OffsetDateTime em) {
    }

    public record ProgramacaoCampo(UUID id, long numero, UUID idObra, String numeroObra,
                                   @JsonFormat(pattern = "dd/MM/yyyy") LocalDate inicio,
                                   @JsonFormat(pattern = "dd/MM/yyyy") LocalDate fim,
                                   String descricao, TurnoProgramacao turno, boolean linhaViva, boolean desligamento,
                                   @JsonFormat(pattern = "HH:mm") LocalTime horaDesligamentoInicio,
                                   @JsonFormat(pattern = "HH:mm") LocalTime horaDesligamentoFim,
                                   String numeroManobra, boolean finalizaObra, SituacaoIntervencao situacaoIntervencao,
                                   String observacao, SituacaoProgramacao situacao, Long versao, List<ItemCampo> itens,
                                   /** Montada pelo servidor na execução avulsa: o app usa a dele e não mostra esta. */
                                   boolean avulsa) {
    }

    /** Obra buscada pela equipe para a execução avulsa: o que ela ainda pode executar (pendente ou já na avulsa do dia). */
    public record ObraAvulsa(ObraCampo obra, List<ItemCampo> itens, int programadosEmOutra) {
    }

    /** Item programado no ponto ou vão, com o que já foi executado. */
    public record ItemCampo(UUID idItem, UUID idPonto, UUID idVao, String local, TipoItemKit tipo, UUID idMaterial,
                            String codigo, String descricao, String unidade, String kit, BigDecimal quantidade,
                            BigDecimal executada, StatusItemPlanejado status) {
    }

    public record ObraCampo(UUID id, String numero, String titulo, String endereco, String referencia, Double latitude,
                            Double longitude, String municipio, ProjetoPdf projeto, Map<String, Integer> rotacoes,
                            List<PontoCampo> pontos, List<VaoCampo> vaos, UUID idModeloFoto, List<FotoCampo> fotos,
                            List<PendenciaFoto> pendenciasFoto,
                            /** Itens pendentes da obra fora de qualquer programação: a equipe pode ir além do programado. */
                            List<ItemCampo> itensExtras,
                            /** Última visita prévia: o que o supervisor deixou para a equipe ver antes de começar. */
                            VisitaCampo visitaPrevia) {
    }

    /** {@code atencao}: respostas de texto e as fora do esperado pelo modelo ("pergunta: resposta"). */
    public record VisitaCampo(@JsonFormat(pattern = "dd/MM/yyyy") LocalDate data, String responsavel, String observacoes,
                              List<String> atencao) {
    }

    /** Obra em aberto da base da equipe, para começar uma execução avulsa sem sinal (os pontos chegam com o sinal). */
    public record ObraResumo(UUID id, String numero, String titulo, String municipio) {
    }

    /** Versão do projeto em PDF: o app baixa de novo só quando o hash muda. */
    public record ProjetoPdf(UUID idAnexo, String nome, long tamanhoBytes, String hash) {
    }

    public record PontoCampo(UUID id, String numero, Integer pagina, BigDecimal x, BigDecimal y, String tipo,
                             String tipoExecucao, boolean temPoda, boolean temAterramento) {
    }

    public record VaoCampo(UUID id, UUID idPontoA, UUID idPontoB, BigDecimal metragem) {
    }

    /** Foto já recebida, para o app não pedir de novo. */
    public record FotoCampo(UUID id, UUID idLocal, UUID idPonto, UUID idVao, UUID idModelo, String idItem, String etapa) {
    }

    /** Foto exigida pelo modelo que falta num ponto já executado. */
    /** {@code motivoReprovacao}: a foto foi tirada e reprovada na revisão; precisa de outra. */
    public record PendenciaFoto(UUID idPonto, String numeroPonto, String idItem, String titulo, String motivoReprovacao) {
    }

    /** Opções da APR e as sugestões por condição (desligamento, linha viva, poda, aterramento). */
    public record ModeloApr(List<String> riscos, List<String> medidas, List<String> verificacoes,
                            Map<String, Sugestao> sugestoes) {
    }

    public record Sugestao(List<String> riscos, List<String> medidas) {
    }

    public record ModeloFoto(UUID id, String titulo, List<ItemFoto> itens) {
    }

    /** {@code etapa}: o momento da foto (ANTES, DURANTE, DEPOIS); nula, o app segue a situação do ponto. */
    public record ItemFoto(String id, String titulo, boolean obrigatoria, String etapa) {
    }

    /** Mudança na agenda da equipe, para avisar ao abrir o app. */
    public record Aviso(UUID id, TipoEventoProgramacao tipo, UUID idProgramacao, Long numeroProgramacao, UUID idObra,
                        String numeroObra, String texto, OffsetDateTime em) {
    }
}
