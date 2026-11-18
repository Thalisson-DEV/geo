package com.nexo.app.modules.avaliacao.application.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Contratos HTTP da avaliação do aplicativo.
 *
 * @author <b>Thalisson</b>
 */
public final class AvaliacaoDtos {

    private AvaliacaoDtos() {
    }

    /** De onde veio a resposta: o GEO web ou o app de campo. */
    public enum Origem { WEB, CAMPO }

    public enum Facilidade { FACIL, RAZOAVEL, DIFICIL }

    /** Problemas que se repetem, em códigos fixos para poderem ser contados. */
    public enum Problema { LENTIDAO, SINCRONIZACAO, LOGIN, TELA_TRAVANDO, DADO_SUMIU, OUTRO }

    /**
     * O convite da campanha aberta para o usuário logado.
     *
     * @param convidar     mostrar o convite agora (não respondeu, não recusou e o adiamento venceu)
     * @param jaRespondeu  já respondeu nesta campanha — o "Avaliar o app" do menu mostra agradecimento
     * @param ultimaVez    o convite já foi adiado o máximo de vezes: esta aparição oferece recusar
     */
    public record ConviteResponse(UUID campanhaId, String titulo, OffsetDateTime fim,
                                  boolean convidar, boolean jaRespondeu, boolean ultimaVez) {
    }

    public record RespostaRequest(
            @NotNull Origem origem,
            @NotNull @Min(1) @Max(5) Integer estrelas,
            Facilidade facilidade,
            @Size(max = 6) List<Problema> problemas,
            @Size(max = 1000) String problemaDetalhe,
            @Size(max = 2000) String sugestao,
            boolean anonima,
            @Size(max = 60) String versaoApp) {
    }

    public record CampanhaRequest(
            @NotBlank @Size(max = 120) String titulo,
            @NotNull OffsetDateTime inicio,
            @NotNull OffsetDateTime fim) {
    }

    public record CampanhaResponse(UUID id, String titulo, OffsetDateTime inicio, OffsetDateTime fim,
                                   OffsetDateTime encerradaEm, boolean aberta, long respostas) {
    }

    /** Números da campanha, já agregados para o painel. */
    public record ResumoResponse(
            long respostas,
            Double mediaEstrelas,
            Map<Integer, Long> porEstrelas,
            Map<String, Long> porFacilidade,
            Map<String, Long> porProblema,
            Map<String, Long> porOrigem,
            long anonimas,
            long comSugestao,
            long adiaram,
            long recusaram) {
    }

    /** Uma resposta na lista do painel. {@code autor} nulo = anônima. */
    public record RespostaItem(UUID id, LocalDate respondidaEm, String origem, int estrelas, String facilidade,
                               List<String> problemas, String problemaDetalhe, String sugestao,
                               String versaoApp, String autor) {
    }
}
