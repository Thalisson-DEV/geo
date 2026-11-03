package com.nexo.app.modules.frota.domain;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

/**
 * Se o colaborador pode conduzir um veículo numa data, pela CNH registrada na frota.
 *
 * @param exigida categoria mínima do tipo de veículo; nula quando o tipo não exige
 * @param atual   categoria registrada; nula sem CNH
 */
public record AptidaoConducao(SituacaoCnh situacao, LocalDate validade, CategoriaCnh exigida, CategoriaCnh atual) {

    private static final DateTimeFormatter DATA = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    public enum SituacaoCnh { APTO, SEM_CNH, VENCIDA, CATEGORIA_INSUFICIENTE }

    /** @param condutor ficha de condutor ativa do colaborador, ou nula se ele não tem */
    public static AptidaoConducao avaliar(Condutor condutor, CategoriaCnh exigida, LocalDate data) {
        if (condutor == null || !condutor.isAtivo() || condutor.getCnhValidade() == null) {
            return new AptidaoConducao(SituacaoCnh.SEM_CNH, null, exigida, null);
        }
        var validade = condutor.getCnhValidade();
        var atual = condutor.getCnhCategoria();
        if (condutor.isCnhVencidaEm(data)) {
            return new AptidaoConducao(SituacaoCnh.VENCIDA, validade, exigida, atual);
        }
        if (atual != null && !atual.habilita(exigida)) {
            return new AptidaoConducao(SituacaoCnh.CATEGORIA_INSUFICIENTE, validade, exigida, atual);
        }
        return new AptidaoConducao(SituacaoCnh.APTO, validade, exigida, atual);
    }

    public boolean isApto() {
        return situacao == SituacaoCnh.APTO;
    }

    public String mensagem() {
        return switch (situacao) {
            case APTO -> "CNH em dia.";
            case SEM_CNH -> "O condutor não tem CNH registrada.";
            case VENCIDA -> "A CNH do condutor está vencida desde " + DATA.format(validade) + ".";
            case CATEGORIA_INSUFICIENTE -> "A CNH categoria " + atual + " não habilita veículos que exigem categoria " + exigida + ".";
        };
    }
}
