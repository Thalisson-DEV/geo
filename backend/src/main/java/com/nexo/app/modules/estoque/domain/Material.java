package com.nexo.app.modules.estoque.domain;

import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.infrastructure.persistence.CryptoConverterImpl;
import com.nexo.app.shared.infrastructure.security.HashUtils;
import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Representa o cadastro mestre de materiais.
 */
@Entity
@Table(name = "materiais")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Material extends BaseEntity {

    @NotBlank(message = "O código do material é obrigatório")
    @Size(min = 3, max = 100, message = "O código deve ter entre 3 e 100 caracteres")
    @Column(name = "cod_material", nullable = false, unique = true)
    private String codigo;

    @NotBlank(message = "A descrição é obrigatória")
    @Size(min = 3, max = 355, message = "A descrição deve ter entre 3 e 355 caracteres")
    @Column(name = "descricao", nullable = false)
    private String descricao;

    @Size(min = 1, max = 10, message = "A unidade de medida deve ter entre 1 e 10 caracteres")
    @Column(name = "unidade_medida", length = 10)
    private String unidadeMedida;

    @Size(min = 4, max = 4, message = "A flag de supr ou matr deve ter entre 3 e 4 caracteres")
    @Column(name = "supr_matr_flag", length = 4)
    private String suprMatrFlag;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_avaliacao_tecnica")
    private AvaliacaoMaterial avaliacaoTecnica;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_centro_investimento")
    private CentroInvestimento centroInvestimento;

    /** Obrigatório no catálogo operacional; a peça da frota não tem processo de negócio. */
    @Column(name = "id_processo")
    private UUID idProcesso;

    @Enumerated(EnumType.STRING)
    @Column(name = "catalogo", nullable = false, length = 20)
    private CatalogoMaterial catalogo = CatalogoMaterial.OPERACIONAL;

    /** Grupo da peça da frota (filtros, lubrificantes, freios...). */
    @Column(name = "grupo", length = 60)
    private String grupo;

    @Column(name = "detalha_serie")
    private boolean detalhaSerie = false;

    /** Outras unidades em que a quantidade pode ser informada; o saldo segue em {@link #unidadeMedida}. */
    @OneToMany(mappedBy = "material", cascade = CascadeType.ALL)
    @org.hibernate.annotations.BatchSize(size = 100)
    private List<UnidadeEquivalenteMaterial> equivalencias = new ArrayList<>();

    /** Uma linha do cadastro de equivalências: "1 KG = 4,2 MT". */
    public record Equivalencia(String unidade, BigDecimal quantidadeUnidade, BigDecimal quantidadeBase) {
    }

    /** Compatibilidade de leitura durante a migração; classificação não é persistida. */
    @Deprecated
    public Material(String codigo, String descricao, String unidadeMedida, String suprMatrFlag,
                    AvaliacaoMaterial avaliacao, CentroInvestimento centro, boolean detalhaSerie, UUID idProcesso) {
        validarCodigo(codigo);
        validarDescricao(descricao);
        this.codigo = codigo.toUpperCase().trim();
        this.descricao = descricao;
        this.unidadeMedida = unidadeMedida != null ? unidadeMedida.toUpperCase().trim() : null;
        this.suprMatrFlag = suprMatrFlag != null ? suprMatrFlag.toUpperCase().trim() : null;
        vincularAvaliacao(avaliacao);
        vincularCentroInvestimento(centro);
        vincularProcesso(idProcesso);
        this.detalhaSerie = detalhaSerie;
    }

    /** Peça do estoque da oficina da frota: catálogo FROTA, sem processo nem classificação técnica. */
    public static Material pecaFrota(String codigo, String descricao, String unidadeMedida, String grupo) {
        var material = new Material();
        material.catalogo = CatalogoMaterial.FROTA;
        material.preencherPecaFrota(codigo, descricao, unidadeMedida, grupo);
        return material;
    }

    public void atualizarPecaFrota(String codigo, String descricao, String unidadeMedida, String grupo) {
        validarStatus();
        exigirCatalogoFrota();
        preencherPecaFrota(codigo, descricao, unidadeMedida, grupo);
    }

    public boolean isCatalogoFrota() {
        return catalogo == CatalogoMaterial.FROTA;
    }

    public void exigirCatalogoFrota() {
        if (!isCatalogoFrota()) {
            throw new InvarianteVioladaException("O material " + codigo + " não é uma peça da frota.");
        }
    }

    private void preencherPecaFrota(String codigo, String descricao, String unidadeMedida, String grupo) {
        if (codigo == null || codigo.isBlank()) {
            throw new InvarianteVioladaException("Informe o código da peça.");
        }
        if (descricao == null || descricao.isBlank()) {
            throw new InvarianteVioladaException("Informe o nome da peça.");
        }
        if (unidadeMedida == null || unidadeMedida.isBlank()) {
            throw new InvarianteVioladaException("Informe a unidade da peça (UN, L, KG...).");
        }
        this.codigo = codigo.toUpperCase().trim();
        this.descricao = descricao.trim();
        this.unidadeMedida = unidadeMedida.toUpperCase().trim();
        this.grupo = grupo == null || grupo.isBlank() ? null : grupo.trim();
        this.detalhaSerie = false;
    }

    public void atualizar(String codigo, String descricao, String unidadeMedida, String suprMatrFlag, boolean detalhaSerie) {
        validarStatus();
        if (isCatalogoFrota()) {
            throw new InvarianteVioladaException("A peça " + this.codigo + " é da frota: altere pelo estoque da oficina.");
        }
        validarCodigo(codigo);
        validarDescricao(descricao);
        this.codigo = codigo;
        this.descricao = descricao;
        this.unidadeMedida = unidadeMedida != null ? unidadeMedida.toUpperCase().trim() : null;
        this.suprMatrFlag = suprMatrFlag != null ? suprMatrFlag.toUpperCase().trim() : null;
        this.detalhaSerie = detalhaSerie;
    }

    public List<UnidadeEquivalenteMaterial> getEquivalencias() {
        return equivalencias.stream().filter(UnidadeEquivalenteMaterial::isAtivo).toList();
    }

    /**
     * Substitui as equivalências pelas informadas: mesma unidade é atualizada, a que saiu é
     * desativada (nunca apagada) e a nova é criada. Não aceita a própria unidade do material.
     */
    public void definirEquivalencias(List<Equivalencia> novas) {
        validarStatus();
        List<Equivalencia> lista = novas == null ? List.of() : novas;
        String base = unidadeMedida == null ? "UN" : unidadeMedida;
        Set<String> vistas = new HashSet<>();
        for (Equivalencia nova : lista) {
            String unidade = UnidadeEquivalenteMaterial.normalizar(nova.unidade());
            if (unidade.equals(base)) {
                throw new InvarianteVioladaException("A unidade " + unidade + " já é a unidade do material; escolha outra para a equivalência.");
            }
            if (!vistas.add(unidade)) {
                throw new InvarianteVioladaException("A unidade " + unidade + " aparece duas vezes nas equivalências.");
            }
        }
        for (UnidadeEquivalenteMaterial atual : getEquivalencias()) {
            if (!vistas.contains(atual.getUnidade())) {
                atual.desativar();
            }
        }
        for (Equivalencia nova : lista) {
            String unidade = UnidadeEquivalenteMaterial.normalizar(nova.unidade());
            Optional<UnidadeEquivalenteMaterial> existente = getEquivalencias().stream()
                    .filter(e -> e.getUnidade().equals(unidade)).findFirst();
            if (existente.isPresent()) {
                existente.get().redefinir(nova.quantidadeUnidade(), nova.quantidadeBase());
            } else {
                equivalencias.add(new UnidadeEquivalenteMaterial(this, unidade, nova.quantidadeUnidade(), nova.quantidadeBase()));
            }
        }
    }

    /**
     * Converte a quantidade informada para a unidade do material. Unidade vazia ou igual à do
     * material passa direto; unidade sem equivalência cadastrada é recusada.
     */
    public QuantidadeConvertida converterParaBase(BigDecimal quantidade, String unidade) {
        Objects.requireNonNull(quantidade, "A quantidade e obrigatoria");
        String base = unidadeMedida == null ? "UN" : unidadeMedida;
        if (unidade == null || unidade.isBlank() || unidade.trim().equalsIgnoreCase(base)) {
            return QuantidadeConvertida.semConversao(quantidade);
        }
        UnidadeEquivalenteMaterial equivalencia = getEquivalencias().stream()
                .filter(e -> e.mesmaUnidade(unidade)).findFirst()
                .orElseThrow(() -> new InvarianteVioladaException("O material " + codigo + " não tem equivalência em "
                        + unidade.trim().toUpperCase() + ". Cadastre a equivalência no material ou informe em " + base + "."));
        BigDecimal convertida = equivalencia.paraUnidadeBase(quantidade);
        if (convertida.signum() <= 0) {
            throw new InvarianteVioladaException("A quantidade em " + equivalencia.getUnidade()
                    + " é pequena demais para virar " + base + ".");
        }
        return new QuantidadeConvertida(convertida, quantidade, equivalencia.getUnidade());
    }

    public void vincularAvaliacao(AvaliacaoMaterial avaliacao) {
        if (avaliacao != null && !avaliacao.isAtivo()) {
            throw new InvarianteVioladaException("Não é possível vincular uma avaliação desativada.");
        }
        this.avaliacaoTecnica = avaliacao;
    }

    public void vincularCentroInvestimento(CentroInvestimento centro) {
        if (centro != null && !centro.isAtivo()) {
            throw new InvarianteVioladaException("Não é possível vincular um centro de investimento desativado.");
        }
        this.centroInvestimento = centro;
    }

    public void vincularProcesso(UUID idProcesso) {
        this.idProcesso = Objects.requireNonNull(idProcesso, "O processo de negócio é obrigatório");
    }

    private void validarCodigo(String codigo) {
        if (codigo == null || codigo.isBlank()) {
            throw new IllegalArgumentException("Código do material inválido");
        }
    }

    private void validarDescricao(String desc) {
        if (desc == null || desc.isBlank()) {
            throw new IllegalArgumentException("Descrição do material é obrigatória");
        }
    }

    private void validarStatus() {
        if (!isAtivo()) {
            throw new IllegalStateException("Não é possível alterar um registro desativado.");
        }
    }
}
