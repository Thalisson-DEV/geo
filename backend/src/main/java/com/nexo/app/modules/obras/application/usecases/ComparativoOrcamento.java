package com.nexo.app.modules.obras.application.usecases;

import com.nexo.app.modules.obras.application.dto.OrcamentoObraResponse;
import com.nexo.app.modules.obras.application.dto.OrcamentoObraResponse.SituacaoItemOrcamento;
import com.nexo.app.modules.obras.domain.ItemOrcamentoObra;
import com.nexo.app.modules.obras.domain.OperacaoItemKit;
import com.nexo.app.modules.obras.domain.TipoItemKit;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Junta, por código, tipo e operação, o orçado com o planejado, o executado e o medido da obra e diz a situação de cada
 * item. Zeros à esquerda não diferenciam códigos, porque planilhas costumam perdê-los.
 */
final class ComparativoOrcamento {

    /** Folga para arredondamento de quantidade (metros, por exemplo). */
    private static final BigDecimal FOLGA = new BigDecimal("0.0001");

    private final Map<String, Linha> linhas = new LinkedHashMap<>();

    void orcar(ItemOrcamentoObra item) {
        Linha l = linha(item.getTipo(), item.getCodigo(), item.getOperacao(), item.getDescricao(), item.getUnidade());
        l.id = item.getId();
        l.idAcao = item.getIdAcao();
        l.idMaterial = item.getIdMaterial();
        l.valorUnitario = item.getValorUnitario();
        l.orcadoQuantidade = mais(l.orcadoQuantidade, item.getQuantidade());
        l.orcadoValor = mais(l.orcadoValor, item.getValorTotal());
        l.orcado = true;
    }

    /** O código do sistema prevalece sobre o do orçamento, que pode ter perdido zeros. */
    void planejar(TipoItemKit tipo, String codigo, OperacaoItemKit operacao, String descricao, String unidade,
                  UUID idAcao, UUID idMaterial, BigDecimal quantidade, BigDecimal valor) {
        Linha l = linha(tipo, codigo, operacao, descricao, unidade);
        l.codigo = codigo.trim();
        if (l.idAcao == null) {
            l.idAcao = idAcao;
        }
        if (l.idMaterial == null) {
            l.idMaterial = idMaterial;
        }
        l.planejadoQuantidade = mais(l.planejadoQuantidade, quantidade);
        l.planejadoValor = mais(l.planejadoValor, valor);
    }

    void executar(TipoItemKit tipo, String codigo, OperacaoItemKit operacao, BigDecimal quantidade, BigDecimal valor) {
        Linha l = linha(tipo, codigo, operacao, null, null);
        l.executadoQuantidade = mais(l.executadoQuantidade, quantidade);
        l.executadoValor = mais(l.executadoValor, valor);
    }

    void medir(TipoItemKit tipo, String codigo, OperacaoItemKit operacao, String descricao, String unidade,
               BigDecimal quantidade, BigDecimal valor) {
        Linha l = linha(tipo, codigo, operacao, descricao, unidade);
        l.medidoQuantidade = mais(l.medidoQuantidade, quantidade);
        l.medidoValor = mais(l.medidoValor, valor);
    }

    List<OrcamentoObraResponse.Item> itens() {
        java.util.Set<TipoItemKit> orcados = java.util.EnumSet.noneOf(TipoItemKit.class);
        linhas.values().stream().filter(l -> l.orcado).forEach(l -> orcados.add(l.tipo));
        return linhas.values().stream().map(l -> l.item(orcados.contains(l.tipo)))
                .sorted(Comparator.comparing((OrcamentoObraResponse.Item i) -> i.tipo())
                        .thenComparing(i -> ordem(i.situacao()))
                        .thenComparing(OrcamentoObraResponse.Item::codigo)
                        .thenComparing(OrcamentoObraResponse.Item::operacao))
                .toList();
    }

    static OrcamentoObraResponse.Totais totais(List<OrcamentoObraResponse.Item> itens) {
        BigDecimal orcadoServicos = BigDecimal.ZERO;
        BigDecimal orcadoMateriais = BigDecimal.ZERO;
        BigDecimal planejado = BigDecimal.ZERO;
        BigDecimal executado = BigDecimal.ZERO;
        BigDecimal medido = BigDecimal.ZERO;
        BigDecimal fora = BigDecimal.ZERO;
        BigDecimal planejadoMateriais = BigDecimal.ZERO;
        for (OrcamentoObraResponse.Item i : itens) {
            if (i.tipo() == TipoItemKit.MATERIAL) {
                orcadoMateriais = orcadoMateriais.add(zero(i.orcadoValor()));
                planejadoMateriais = planejadoMateriais.add(zero(i.planejadoValor()));
                continue;
            }
            orcadoServicos = orcadoServicos.add(zero(i.orcadoValor()));
            planejado = planejado.add(zero(i.planejadoValor()));
            executado = executado.add(zero(i.executadoValor()));
            medido = medido.add(zero(i.medidoValor()));
            if (i.situacao() == SituacaoItemOrcamento.FORA_DO_ORCAMENTO) {
                fora = fora.add(zero(i.planejadoValor()));
            }
        }
        return new OrcamentoObraResponse.Totais(moeda(orcadoServicos), moeda(orcadoMateriais), moeda(planejado),
                moeda(executado), moeda(medido), moeda(orcadoServicos.subtract(medido)), moeda(fora), moeda(planejadoMateriais));
    }

    static OrcamentoObraResponse.Contagens contagens(List<OrcamentoObraResponse.Item> itens) {
        int acima = 0;
        int fora = 0;
        int naoPlanejados = 0;
        int semReferencia = 0;
        for (OrcamentoObraResponse.Item i : itens) {
            switch (i.situacao()) {
                case ACIMA -> acima++;
                case FORA_DO_ORCAMENTO -> fora++;
                case NAO_PLANEJADO -> naoPlanejados++;
                default -> { }
            }
            if (i.semReferencia()) {
                semReferencia++;
            }
        }
        return new OrcamentoObraResponse.Contagens(acima, fora, naoPlanejados, semReferencia);
    }

    private Linha linha(TipoItemKit tipo, String codigo, OperacaoItemKit operacao, String descricao, String unidade) {
        TipoItemKit t = tipo != null ? tipo : TipoItemKit.SERVICO;
        OperacaoItemKit o = operacao != null ? operacao : OperacaoItemKit.INSTALAR;
        Linha l = linhas.computeIfAbsent(ItemOrcamentoObra.chave(t, codigo, o), k -> new Linha(t, codigo.trim(), o));
        if (l.descricao == null && descricao != null) {
            l.descricao = descricao;
        }
        if (l.unidade == null && unidade != null) {
            l.unidade = unidade;
        }
        return l;
    }

    private static int ordem(SituacaoItemOrcamento situacao) {
        return switch (situacao) {
            case ACIMA -> 0;
            case FORA_DO_ORCAMENTO -> 1;
            case NAO_PLANEJADO -> 2;
            case DENTRO -> 3;
            case SEM_ORCADO -> 4;
        };
    }

    private static final class Linha {
        private final TipoItemKit tipo;
        private final OperacaoItemKit operacao;
        private String codigo;
        private String descricao;
        private String unidade;
        private UUID id;
        private UUID idAcao;
        private UUID idMaterial;
        private boolean orcado;
        private BigDecimal orcadoQuantidade;
        private BigDecimal valorUnitario;
        private BigDecimal orcadoValor;
        private BigDecimal planejadoQuantidade;
        private BigDecimal planejadoValor;
        private BigDecimal executadoQuantidade;
        private BigDecimal executadoValor;
        private BigDecimal medidoQuantidade;
        private BigDecimal medidoValor;

        Linha(TipoItemKit tipo, String codigo, OperacaoItemKit operacao) {
            this.tipo = tipo;
            this.codigo = codigo;
            this.operacao = operacao;
        }

        /** {@code tipoOrcado}: o orçamento tem itens deste tipo; sem isso, faltar no orçamento não é desvio. */
        OrcamentoObraResponse.Item item(boolean tipoOrcado) {
            BigDecimal maior = zero(planejadoQuantidade).max(zero(executadoQuantidade)).max(zero(medidoQuantidade));
            SituacaoItemOrcamento situacao;
            BigDecimal excedente = null;
            if (!orcado && !tipoOrcado) {
                situacao = SituacaoItemOrcamento.SEM_ORCADO;
            } else if (!orcado) {
                situacao = SituacaoItemOrcamento.FORA_DO_ORCAMENTO;
                excedente = maior;
            } else if (maior.subtract(zero(orcadoQuantidade)).compareTo(FOLGA) > 0) {
                situacao = SituacaoItemOrcamento.ACIMA;
                excedente = maior.subtract(zero(orcadoQuantidade));
            } else if (zero(planejadoQuantidade).signum() == 0 && maior.signum() == 0) {
                situacao = SituacaoItemOrcamento.NAO_PLANEJADO;
            } else {
                situacao = SituacaoItemOrcamento.DENTRO;
            }
            boolean semReferencia = orcado && (tipo == TipoItemKit.SERVICO ? idAcao == null : idMaterial == null);
            return new OrcamentoObraResponse.Item(id, tipo, operacao, codigo, descricao, unidade, idAcao, idMaterial,
                    orcadoQuantidade, valorUnitario, orcadoValor, planejadoQuantidade, moedaOuNulo(planejadoValor),
                    executadoQuantidade, moedaOuNulo(executadoValor), medidoQuantidade, moedaOuNulo(medidoValor),
                    situacao, excedente, semReferencia);
        }
    }

    private static BigDecimal mais(BigDecimal atual, BigDecimal valor) {
        if (valor == null) {
            return atual;
        }
        return atual == null ? valor : atual.add(valor);
    }

    private static BigDecimal zero(BigDecimal valor) {
        return valor != null ? valor : BigDecimal.ZERO;
    }

    private static BigDecimal moeda(BigDecimal valor) {
        return valor.setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal moedaOuNulo(BigDecimal valor) {
        return valor != null ? moeda(valor) : null;
    }
}
