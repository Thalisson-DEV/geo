package com.nexo.app.modules.obras.domain;

import com.nexo.app.shared.domain.exception.InvarianteVioladaException;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Grupos e perguntas de um modelo de checklist, no mesmo desenho dos formulários de inspeção do SST. Cada pergunta
 * guarda um identificador próprio, que liga a resposta à pergunta mesmo se o texto for corrigido. Na ficha As Built, o
 * modelo também lista as fotos que o book pede em cada ponto.
 */
public record EstruturaChecklist(List<Grupo> grupos, List<ItemEvidencia> evidencias) {

    /** Modelo gravado antes do book não tem a lista de fotos. */
    public EstruturaChecklist {
        evidencias = evidencias == null ? List.of() : evidencias;
    }

    public EstruturaChecklist(List<Grupo> grupos) {
        this(grupos, List.of());
    }

    public enum TipoPergunta {
        ESCOLHA_UNICA,
        MULTIPLA_ESCOLHA,
        TEXTO,
        NUMERO,
        DATA;

        boolean temOpcoes() {
            return this == ESCOLHA_UNICA || this == MULTIPLA_ESCOLHA;
        }
    }

    public record Grupo(String titulo, List<Pergunta> perguntas) {
    }

    /**
     * {@code opcaoConforme}, opcional e só na escolha única, é a resposta esperada: qualquer outra opção marcada vira não
     * conformidade no resumo da visita, e o "marcar restantes como conforme" usa essa opção.
     */
    public record Pergunta(String id, String enunciado, TipoPergunta tipo, boolean obrigatoria, boolean aceitaNaoSeAplica,
                           List<String> opcoes, String opcaoConforme) {

        public Pergunta {
            opcaoConforme = opcaoConforme == null || opcaoConforme.isBlank() ? null : opcaoConforme;
        }

        public Pergunta(String id, String enunciado, TipoPergunta tipo, boolean obrigatoria, boolean aceitaNaoSeAplica, List<String> opcoes) {
            this(id, enunciado, tipo, obrigatoria, aceitaNaoSeAplica, opcoes, null);
        }
    }

    /**
     * Foto pedida em cada ponto. {@code etapa} é o momento em que ela é tirada (antes de começar, durante ou depois de
     * pronto); sem ela, o app usa a situação do ponto na hora da foto.
     */
    public record ItemEvidencia(String id, String titulo, boolean obrigatoria, EvidenciaPonto.Etapa etapa) {

        public ItemEvidencia(String id, String titulo, boolean obrigatoria) {
            this(id, titulo, obrigatoria, null);
        }
    }

    /**
     * A mesma estrutura sem o momento das fotos: mudar só o momento não mexe em respostas nem em fotos já tiradas, então
     * vale também para modelo em uso.
     */
    public EstruturaChecklist semMomentoDasFotos() {
        return new EstruturaChecklist(grupos, evidencias.stream()
                .map(i -> new ItemEvidencia(i.id(), i.titulo(), i.obrigatoria(), null)).toList());
    }

    void validar() {
        validarEvidencias();
        if (grupos == null || grupos.isEmpty()) {
            throw new InvarianteVioladaException("Inclua ao menos um grupo no modelo.");
        }
        Set<String> ids = new HashSet<>();
        for (Grupo grupo : grupos) {
            if (grupo.titulo() == null || grupo.titulo().isBlank()) {
                throw new InvarianteVioladaException("Informe o título de todos os grupos.");
            }
            if (grupo.perguntas() == null || grupo.perguntas().isEmpty()) {
                throw new InvarianteVioladaException("O grupo \"" + grupo.titulo() + "\" não tem perguntas.");
            }
            grupo.perguntas().forEach(pergunta -> validar(grupo, pergunta, ids));
        }
    }

    private void validarEvidencias() {
        Set<String> ids = new HashSet<>();
        for (ItemEvidencia item : evidencias) {
            if (item.id() == null || item.id().isBlank() || item.id().length() > 100 || !ids.add(item.id())) {
                throw new InvarianteVioladaException("Há item de evidência sem identificador único.");
            }
            if (item.titulo() == null || item.titulo().isBlank()) {
                throw new InvarianteVioladaException("Informe o título de todos os itens de evidência.");
            }
            if (item.titulo().length() > 150) {
                throw new InvarianteVioladaException("O item de evidência \"" + item.titulo() + "\" passa de 150 caracteres.");
            }
        }
    }

    private static void validar(Grupo grupo, Pergunta pergunta, Set<String> ids) {
        if (pergunta.id() == null || pergunta.id().isBlank() || !ids.add(pergunta.id())) {
            throw new InvarianteVioladaException("Há pergunta sem identificador único no grupo \"" + grupo.titulo() + "\".");
        }
        if (pergunta.enunciado() == null || pergunta.enunciado().isBlank()) {
            throw new InvarianteVioladaException("Há pergunta sem enunciado no grupo \"" + grupo.titulo() + "\".");
        }
        if (pergunta.tipo() == null) {
            throw new InvarianteVioladaException("Informe o tipo de resposta de \"" + pergunta.enunciado() + "\".");
        }
        if (pergunta.opcaoConforme() != null && pergunta.tipo() != TipoPergunta.ESCOLHA_UNICA) {
            throw new InvarianteVioladaException("Só a escolha única tem resposta conforme (\"" + pergunta.enunciado() + "\").");
        }
        if (!pergunta.tipo().temOpcoes()) {
            return;
        }
        List<String> opcoes = pergunta.opcoes() == null ? List.of() : pergunta.opcoes();
        if (opcoes.stream().anyMatch(opcao -> opcao == null || opcao.isBlank())) {
            throw new InvarianteVioladaException("Há opção em branco em \"" + pergunta.enunciado() + "\".");
        }
        if (opcoes.size() < 2 || new HashSet<>(opcoes).size() != opcoes.size()) {
            throw new InvarianteVioladaException("\"" + pergunta.enunciado() + "\" precisa de ao menos duas opções diferentes.");
        }
        if (pergunta.opcaoConforme() != null && !opcoes.contains(pergunta.opcaoConforme())) {
            throw new InvarianteVioladaException("A resposta conforme de \"" + pergunta.enunciado() + "\" não está entre as opções.");
        }
    }
}
