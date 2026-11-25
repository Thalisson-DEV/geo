package com.nexo.app.modules.listas;

import java.util.List;

/**
 * Listas de opções que cada cliente ajusta no próprio cadastro em vez de ficarem fixas no código. O registro guarda o
 * código da opção; o rótulo vem do cadastro. Quais listas existem é decisão do sistema; o conteúdo de cada uma é do
 * cliente.
 */
public enum ListaConfiguravel {
    OCORRENCIA_TURNO("Motivos de ocorrência do turno",
            "O que a equipe registra no app quando algo atrapalha ou impede a execução.",
            List.of("obras:cadastros:read", "obras:obra:read"), List.of("obras:cadastros:write")),
    MOTIVO_MOVIMENTACAO_ESTOQUE("Motivos de entrada e baixa avulsa",
            "Por que uma entrada ou baixa avulsa de estoque foi feita.",
            List.of("estoque:movimentacao:read", "estoque:motivo-rejeicao:read"), List.of("estoque:motivo-rejeicao:write"),
            List.of(new Contexto("ENTRADA", "Entrada avulsa"), new Contexto("BAIXA", "Baixa avulsa"))),
    TIPO_DOCUMENTO_VEICULO("Tipos de documento do veículo",
            "Documentos controlados por veículo, com vencimento e consulta no app.",
            List.of("frota:os:read", "frota:configuracao:write"), List.of("frota:configuracao:write")),
    CAUSA_MANUTENCAO("Causas de manutenção",
            "Por que a manutenção aconteceu; pedida ao concluir a ordem de serviço.",
            List.of("frota:os:read", "frota:configuracao:write"), List.of("frota:configuracao:write")),
    NATUREZA_SERVICO_FROTA("Naturezas de serviço da frota",
            "Classificação dos itens de manutenção, usada para recortar custos.",
            List.of("frota:os:read", "frota:configuracao:write"), List.of("frota:configuracao:write"));

    private final String rotulo;
    private final String descricao;
    private final List<String> permissoesLeitura;
    private final List<String> permissoesEscrita;
    private final List<Contexto> contextos;

    ListaConfiguravel(String rotulo, String descricao, List<String> permissoesLeitura, List<String> permissoesEscrita) {
        this(rotulo, descricao, permissoesLeitura, permissoesEscrita, List.of());
    }

    ListaConfiguravel(String rotulo, String descricao, List<String> permissoesLeitura, List<String> permissoesEscrita,
                      List<Contexto> contextos) {
        this.rotulo = rotulo;
        this.descricao = descricao;
        this.permissoesLeitura = permissoesLeitura;
        this.permissoesEscrita = permissoesEscrita;
        this.contextos = contextos;
    }

    /**
     * Onde a opção pode ser usada, quando a lista atende mais de um formulário (ex.: entrada e baixa avulsa). Cada
     * opção marca os seus no cadastro; opção sem marca vale em todos.
     */
    public List<Contexto> contextos() {
        return contextos;
    }

    public boolean temContexto(String codigo) {
        return contextos.stream().anyMatch(c -> c.codigo().equals(codigo));
    }

    public record Contexto(String codigo, String rotulo) {
    }

    public String rotulo() {
        return rotulo;
    }

    public String descricao() {
        return descricao;
    }

    /** Basta uma destas permissões para consultar o cadastro da lista. */
    public List<String> permissoesLeitura() {
        return permissoesLeitura;
    }

    /** Basta uma destas permissões para alterar o cadastro da lista. */
    public List<String> permissoesEscrita() {
        return permissoesEscrita;
    }
}
