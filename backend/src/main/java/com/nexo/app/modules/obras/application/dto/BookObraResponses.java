package com.nexo.app.modules.obras.application.dto;

import com.nexo.app.modules.obras.domain.DocumentoAsBuilt;
import com.nexo.app.modules.obras.domain.OperacaoItemKit;
import com.nexo.app.modules.obras.domain.StatusItemPlanejado;
import com.nexo.app.modules.obras.domain.TipoItemKit;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** Respostas do book de obras: completude documental, auditoria de entrega, comparativo e visão da carteira. */
public final class BookObraResponses {

    private BookObraResponses() {
    }

    /** Semáforo da entrega documental. */
    public enum Situacao {
        /** Nenhum ponto executado ainda: não há o que documentar. */
        SEM_EXECUCAO,
        /** Há item que impede gerar o As Built (ficha pendente, projeto mestre). */
        BLOQUEADA,
        /** Gera, mas ainda falta algo para a entrega (foto, anexo, versão desatualizada). */
        PENDENTE,
        /** Tudo o que a entrega exige está em dia. */
        PRONTA
    }

    public enum StatusAuditoria { OK, PENDENTE, ALERTA, NAO_SE_APLICA }

    public enum Severidade { BLOQUEIO, AVISO }

    /** Onde, na tela do book, se resolve a pendência. */
    public enum Destino { PONTOS, GALERIA, COMPARATIVO, AUDITORIA, ENTREGA, ANEXOS }

    public record Indicadores(
            int pontos,
            int pontosExecutados,
            int pontosComFoto,
            int pontosExecutadosSemFoto,
            int pontosComFotosCompletas,
            int fotos,
            int fotosAntes,
            int fotosDurante,
            int fotosDepois,
            int fotosSemEtapa,
            int fotosComCoordenadas,
            int itensObrigatorios,
            int itensObrigatoriosFaltando,
            int fichasCompletas,
            int fichasIncompletas,
            int fichasNaoIniciadas,
            int equipamentos,
            int visitas,
            boolean projetoMestre,
            OffsetDateTime ultimaAtividade) {
    }

    public record Pendencia(String codigo, Severidade severidade, String titulo, String detalhe, List<String> pontos, Destino destino) {
    }

    /**
     * Item da auditoria de entrega. {@code obrigatorio} conta no percentual de pronto; {@code bloqueiaAsBuilt} impede a geração.
     * {@code responsavel}/{@code data} dizem quem resolveu (ou mexeu por último) e quando.
     */
    public record ItemAuditoria(String codigo, String titulo, String descricao, StatusAuditoria status, boolean obrigatorio,
                                boolean bloqueiaAsBuilt, int progresso, String detalhe, String responsavel, OffsetDateTime data, Destino destino) {
    }

    public record UltimaVersao(UUID id, int numeroVersao, DocumentoAsBuilt.Status status, OffsetDateTime data, String usuario, UUID idAnexo,
                               boolean atualizada) {
    }

    /** Painel de uma obra: indicadores, semáforo, pendências, auditoria e as versões de cada documento. */
    public record Painel(UUID idObra, String numero, String titulo, String status, Situacao situacao, int percentualPronto,
                         Indicadores indicadores, List<Pendencia> pendencias, List<ItemAuditoria> auditoria,
                         UltimaVersao asBuilt, UltimaVersao book, List<DocumentacaoTecnicaResponses.Documento> documentos) {
    }

    /** Linha da visão consolidada. */
    public record ResumoObra(UUID idObra, String numero, String titulo, String status, boolean statusConcluido, Situacao situacao,
                             int percentualPronto, int pontosExecutados, int fichasCompletas, int pontosComFotosCompletas, int fotos,
                             int bloqueios, int avisos, String principalPendencia, UltimaVersao asBuilt, UltimaVersao book,
                             OffsetDateTime ultimaAtividade) {
    }

    public record Totais(int obras, int prontas, int pendentes, int bloqueadas, int semExecucao, int fotos, int fichasCompletas,
                         int pontosExecutados, int percentualMedio, int asBuiltDesatualizados) {
    }

    public record Consolidado(Totais totais, List<ResumoObra> obras) {
    }

    // ---- Previsto x realizado ----

    public enum SituacaoItem { OK, ABAIXO, ACIMA, NAO_EXECUTADO, EXECUTADO_ANTES }

    public enum SituacaoGrupo { CONFORME, DIVERGENTE, EM_EXECUCAO, NAO_INICIADO }

    public record ItemComparativo(UUID id, TipoItemKit tipo, String codigo, String descricao, String kit, OperacaoItemKit operacao, String unidade,
                                  BigDecimal previsto, BigDecimal executado, BigDecimal diferenca, int percentual, StatusItemPlanejado status,
                                  SituacaoItem situacao) {
    }

    /**
     * Um ponto (ou vão) com o que foi planejado e o que foi feito, e as divergências da documentação dele.
     * {@code idPonto} é nulo nos vãos.
     */
    public record GrupoComparativo(String chave, UUID idPonto, String rotulo, boolean vao, int pagina, boolean executado, String ficha,
                                   int fotos, String equipamento, SituacaoGrupo situacao, List<String> divergencias,
                                   List<ItemComparativo> itens) {
    }

    public record ResumoComparativo(int grupos, int gruposConformes, int gruposDivergentes, int gruposEmExecucao, int gruposNaoIniciados,
                                    int itens, int itensOk, int itensAbaixo, int itensAcima, int itensNaoExecutados,
                                    int servicosPrevistos, int servicosConcluidos, int percentualServicos) {
    }

    public record Comparativo(ResumoComparativo resumo, List<GrupoComparativo> grupos) {
    }
}
