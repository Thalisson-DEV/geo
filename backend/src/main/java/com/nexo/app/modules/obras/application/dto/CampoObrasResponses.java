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
                         List<ObraCampo> obras, ModeloApr modeloApr, List<ModeloFoto> modelosFoto, List<Aviso> avisos) {
    }

    public record ProgramacaoCampo(UUID id, long numero, UUID idObra, String numeroObra,
                                   @JsonFormat(pattern = "dd/MM/yyyy") LocalDate inicio,
                                   @JsonFormat(pattern = "dd/MM/yyyy") LocalDate fim,
                                   String descricao, TurnoProgramacao turno, boolean linhaViva, boolean desligamento,
                                   @JsonFormat(pattern = "HH:mm") LocalTime horaDesligamentoInicio,
                                   @JsonFormat(pattern = "HH:mm") LocalTime horaDesligamentoFim,
                                   String numeroManobra, boolean finalizaObra, SituacaoIntervencao situacaoIntervencao,
                                   String observacao, SituacaoProgramacao situacao, Long versao, List<ItemCampo> itens) {
    }

    /** Item programado no ponto ou vão, com o que já foi executado. */
    public record ItemCampo(UUID idItem, UUID idPonto, UUID idVao, String local, TipoItemKit tipo, UUID idMaterial,
                            String codigo, String descricao, String unidade, String kit, BigDecimal quantidade,
                            BigDecimal executada, StatusItemPlanejado status) {
    }

    public record ObraCampo(UUID id, String numero, String titulo, String endereco, String referencia, Double latitude,
                            Double longitude, String municipio, ProjetoPdf projeto, Map<String, Integer> rotacoes,
                            List<PontoCampo> pontos, List<VaoCampo> vaos, UUID idModeloFoto, List<FotoCampo> fotos,
                            List<PendenciaFoto> pendenciasFoto) {
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

    public record ItemFoto(String id, String titulo, boolean obrigatoria) {
    }

    /** Mudança na agenda da equipe, para avisar ao abrir o app. */
    public record Aviso(UUID id, TipoEventoProgramacao tipo, UUID idProgramacao, Long numeroProgramacao, UUID idObra,
                        String numeroObra, String texto, OffsetDateTime em) {
    }
}
