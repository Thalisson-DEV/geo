package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.Locale;
import java.util.Objects;
import java.util.UUID;

/**
 * Nota, cupom ou recibo do serviço feito na OS, com o arquivo no armazenamento de objetos.
 *
 * <p>Fica fora do agregado da OS: a nota costuma chegar depois da conclusão, e anexá-la
 * não deve versionar a OS inteira. Por isso é aceita em OS aberta ou concluída, nunca em
 * cancelada. Excluir é lógico: o arquivo fica para auditoria.</p>
 */
@Entity
@Table(name = "frota_os_documentos_fiscais")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class DocumentoFiscalOrdemServico extends BaseEntity {

    @Column(name = "id_ordem_servico", nullable = false, updatable = false)
    private UUID idOrdemServico;

    @Enumerated(EnumType.STRING)
    @Column(name = "tipo", nullable = false, length = 10)
    private TipoDocumentoFiscal tipo;

    @Column(name = "numero", nullable = false, length = 60)
    private String numero;

    @Column(name = "serie", length = 10)
    private String serie;

    @Column(name = "emitido_em", nullable = false)
    private LocalDate emitidoEm;

    /** Fornecedor do financeiro (sem FK: outro módulo). */
    @Column(name = "id_fornecedor")
    private UUID idFornecedor;

    @Column(name = "fornecedor_nome", length = 150)
    private String fornecedorNome;

    @Column(name = "valor", nullable = false, precision = 14, scale = 2)
    private BigDecimal valor;

    @Column(name = "arquivo_chave", length = 500)
    private String arquivoChave;

    @Column(name = "arquivo_nome", length = 255)
    private String arquivoNome;

    @Column(name = "arquivo_content_type", length = 120)
    private String arquivoContentType;

    @Column(name = "arquivo_tamanho_bytes")
    private Long arquivoTamanhoBytes;

    public record Dados(TipoDocumentoFiscal tipo, String numero, String serie, LocalDate emitidoEm,
                        UUID idFornecedor, String fornecedorNome, BigDecimal valor) {
    }

    public static DocumentoFiscalOrdemServico registrar(OrdemServico os, Dados dados) {
        Objects.requireNonNull(os, "A OS é obrigatória");
        if (os.getSituacao() == SituacaoOrdemServico.CANCELADA) {
            throw new InvarianteVioladaException("A OS " + os.getNumero() + " está cancelada e não recebe documento fiscal.");
        }
        if (dados.tipo() == null) {
            throw new InvarianteVioladaException("Informe o tipo do documento fiscal.");
        }
        if (dados.emitidoEm() == null) {
            throw new InvarianteVioladaException("Informe a data de emissão.");
        }
        if (dados.emitidoEm().isAfter(LocalDate.now())) {
            throw new InvarianteVioladaException("A data de emissão não pode estar no futuro.");
        }
        String fornecedorNome = dados.idFornecedor() == null ? Textos.opcional(dados.fornecedorNome(), 150) : null;
        if (dados.idFornecedor() == null && fornecedorNome == null) {
            throw new InvarianteVioladaException("Informe o fornecedor (cadastro do financeiro ou nome).");
        }
        if (dados.valor() == null || dados.valor().signum() < 0 || dados.valor().stripTrailingZeros().scale() > 2) {
            throw new InvarianteVioladaException("Informe o valor do documento (zero ou mais, com até 2 casas decimais).");
        }
        var documento = new DocumentoFiscalOrdemServico();
        documento.idOrdemServico = os.getId();
        documento.tipo = dados.tipo();
        documento.numero = Textos.obrigatorio(dados.numero(), "número do documento", 60).toUpperCase(Locale.ROOT);
        documento.serie = Textos.opcional(dados.serie(), 10);
        documento.serie = documento.serie == null ? null : documento.serie.toUpperCase(Locale.ROOT);
        documento.emitidoEm = dados.emitidoEm();
        documento.idFornecedor = dados.idFornecedor();
        documento.fornecedorNome = fornecedorNome;
        documento.valor = dados.valor().setScale(2, RoundingMode.UNNECESSARY);
        return documento;
    }

    /** Mesmo tipo, número, série e fornecedor: é a mesma nota. */
    public boolean mesmaNota(DocumentoFiscalOrdemServico outro) {
        return tipo == outro.tipo
                && numero.equals(outro.numero)
                && Objects.equals(serie, outro.serie)
                && Objects.equals(idFornecedor, outro.idFornecedor)
                && (idFornecedor != null || fornecedorNome.equalsIgnoreCase(outro.fornecedorNome));
    }

    public void anexarArquivo(String chave, String nome, String contentType, long tamanhoBytes) {
        this.arquivoChave = Textos.obrigatorio(chave, "caminho do arquivo", 500);
        this.arquivoNome = Textos.obrigatorio(nome, "nome do arquivo", 255);
        this.arquivoContentType = contentType;
        this.arquivoTamanhoBytes = tamanhoBytes;
    }

    public boolean possuiArquivo() {
        return arquivoChave != null;
    }
}
