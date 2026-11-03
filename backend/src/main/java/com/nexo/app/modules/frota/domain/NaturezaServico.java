package com.nexo.app.modules.frota.domain;

/** Natureza do serviço, com os mesmos valores do financeiro ({@code NaturezaServicoFrota}) para pré-preencher a compra e recortar custos. */
public enum NaturezaServico {
    COMPRA_E_REFORMA_DE_PNEUS("Compra e reforma de pneus"),
    SUSPENSAO_FREIOS("Suspensão / freios"),
    ARREFECIMENTO("Arrefecimento"),
    TRANSMISSAO("Transmissão"),
    ELETRICA("Elétrica"),
    CHAPARIA_E_PINTURA("Chaparia e pintura"),
    GUINCHO("Guincho"),
    HIDRAULICA("Hidráulica"),
    TAPECARIA("Tapeçaria"),
    LAVAGEM_E_LUBRIFICACAO("Lavagem e lubrificação"),
    ACESSORIOS("Acessórios"),
    BATERIA("Bateria"),
    BORRACHARIA("Borracharia"),
    MECANICA("Mecânica"),
    PNEUMATICA("Pneumática"),
    POSTO_DE_MOLAS("Posto de molas"),
    REFRIGERACAO_E_CLIMATIZACAO("Refrigeração e climatização"),
    TACOGRAFO("Tacógrafo"),
    TORNEADORA("Torneadora");

    private final String rotulo;

    NaturezaServico(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }
}
