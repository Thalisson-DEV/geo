package com.nexo.app.modules.obras.application.dto;

import com.nexo.app.modules.obras.domain.DocumentoAsBuilt;
import com.nexo.app.modules.obras.domain.EquipamentoObra;
import com.nexo.app.modules.obras.domain.EstruturaChecklist;
import com.nexo.app.modules.obras.domain.EvidenciaPonto;
import com.nexo.app.modules.obras.domain.RespostasChecklist;
import com.nexo.app.modules.obras.domain.TipoPontoPlanejamento;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public final class DocumentacaoTecnicaResponses {

    private DocumentacaoTecnicaResponses() {
    }

    public record Documentacao(boolean visitaRealizada, List<Visita> visitas, boolean temProjetoMestre, List<Ponto> pontos,
                               ResumoAsBuilt asBuilt, List<Documento> documentos, List<Equipamento> equipamentos) {
    }

    /** {@code idColaborador} nulo: registro antigo, só com o nome. {@code naoConformidades} conta as respostas fora do esperado. */
    public record Visita(UUID id, UUID idModelo, String tituloModelo, LocalDate dataVisita, UUID idColaborador, String responsavel, String observacoes,
                         RespostasChecklist respostas, int naoConformidades, List<EvidenciaVisita> evidencias, String usuario, OffsetDateTime data) {
    }

    /** Foto ou PDF da visita. Sem {@code idPergunta}, é evidência geral. */
    public record EvidenciaVisita(UUID id, String idPergunta, String enunciadoPergunta, String legenda, String nomeArquivo, String contentType,
                                  long tamanhoBytes, boolean foto, String usuario, OffsetDateTime data) {
    }

    /** O modelo do ponto é o da ficha ou, antes dela, o das fotos já lançadas; sem nenhum dos dois, fica nulo. */
    public record Ponto(UUID id, String numero, int pagina, TipoPontoPlanejamento tipo, boolean executado, Ficha ficha,
                        UUID idModelo, String tituloModelo, List<EstruturaChecklist.ItemEvidencia> itensEvidencia, List<Evidencia> evidencias) {
    }

    /**
     * {@code dataCaptura} e as coordenadas vêm do app quando ele as informa; a etapa pode ser classificada depois. A revisão
     * (aprovada, para revisar ou reprovada com o motivo) acompanha a foto onde ela aparecer: book, planejamento e medição.
     */
    public record Evidencia(UUID id, String idItem, String tituloItem, String legenda, String nomeArquivo, String usuario, OffsetDateTime data,
                            EvidenciaPonto.Etapa etapa, BigDecimal latitude, BigDecimal longitude, OffsetDateTime dataCaptura, long tamanhoBytes,
                            EvidenciaPonto.Revisao revisao, String rotuloInconformidade, String motivoReprovacao, String revisadaPor,
                            OffsetDateTime revisadaEm, String codigo) {
    }

    public record Ficha(UUID id, UUID idModelo, String tituloModelo, boolean completa, List<String> pendencias,
                        RespostasChecklist respostas, String usuario, OffsetDateTime data) {
    }

    /** Faltar foto só gera aviso; ficha incompleta é que impede o documento. */
    public record ResumoAsBuilt(int pontosExecutados, int fichasCompletas, List<String> pontosPendentes, List<String> pontosSemEvidencia) {
    }

    public record Documento(UUID id, DocumentoAsBuilt.Tipo tipo, int numeroVersao, DocumentoAsBuilt.Status status, UUID idAnexo, String mensagemErro,
                            String usuario, OffsetDateTime data, Integer totalPaginas, Integer totalFotos) {
    }

    public record Equipamento(UUID id, UUID idPonto, String numeroPonto, int pagina, EquipamentoObra.Tipo tipo, boolean trafoAuxiliar,
                              String observacao) {
    }
}
