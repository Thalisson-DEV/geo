package com.nexo.app.modules.obras.domain;

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
import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

/**
 * Uma foto do book da obra, lançada no ponto. Responde a um item do modelo da ficha ou é avulsa. Guarda o título do
 * item, para continuar legível, e o arquivo original junto com uma miniatura.
 */
@Entity
@Table(name = "evidencias_ponto_obra")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class EvidenciaPonto extends BaseEntity {

    /** Item do modelo a que a foto responde. */
    public record ItemRespondido(UUID idModelo, String idItem, String titulo) {
    }

    /** Momento da foto em relação à execução do ponto. */
    public enum Etapa {
        ANTES,
        DURANTE,
        DEPOIS
    }

    /** Onde e quando a foto foi tirada, como o app informou. Tudo opcional. */
    public record Captura(Etapa etapa, BigDecimal latitude, BigDecimal longitude, OffsetDateTime data) {
        public static final Captura VAZIA = new Captura(null, null, null, null);
    }

    /** O arquivo já guardado no armazenamento. */
    public record Arquivo(String nome, String contentType, long tamanhoBytes, String chaveStorage, String chaveMiniatura) {
    }

    @Column(name = "id_obra", nullable = false, updatable = false)
    private UUID idObra;

    @Column(name = "id_ponto", nullable = false, updatable = false)
    private UUID idPonto;

    @Column(name = "id_modelo", updatable = false)
    private UUID idModelo;

    @Column(name = "id_item", length = 100, updatable = false)
    private String idItem;

    @Column(name = "titulo_item", length = 150, updatable = false)
    private String tituloItem;

    @Column(name = "legenda", length = 500)
    private String legenda;

    @Column(name = "nome_arquivo", nullable = false, updatable = false)
    private String nomeArquivo;

    @Column(name = "content_type", nullable = false, length = 100, updatable = false)
    private String contentType;

    @Column(name = "tamanho_bytes", nullable = false, updatable = false)
    private long tamanhoBytes;

    @Column(name = "chave_storage", nullable = false, length = 500, updatable = false)
    private String chaveStorage;

    @Column(name = "chave_miniatura", nullable = false, length = 500, updatable = false)
    private String chaveMiniatura;

    @Enumerated(EnumType.STRING)
    @Column(name = "etapa", length = 10)
    private Etapa etapa;

    @Column(name = "latitude", precision = 9, scale = 6, updatable = false)
    private BigDecimal latitude;

    @Column(name = "longitude", precision = 9, scale = 6, updatable = false)
    private BigDecimal longitude;

    @Column(name = "data_captura", updatable = false)
    private OffsetDateTime dataCaptura;

    /** Id gerado no aparelho; nulo na foto lançada pelo web. */
    @Column(name = "id_local", updatable = false)
    private UUID idLocal;

    @Column(name = "hash_campo", length = 64, updatable = false)
    private String hashCampo;

    @Column(name = "recebido_em", updatable = false)
    private OffsetDateTime recebidoEm;

    @Column(name = "precisao_metros", precision = 8, scale = 1, updatable = false)
    private BigDecimal precisao;

    /** Vão fotografado; a foto de vão fica também no ponto A dele. */
    @Column(name = "id_vao", updatable = false)
    private UUID idVao;

    @Column(name = "id_programacao", updatable = false)
    private UUID idProgramacao;

    /** O apontamento (pelo id do aparelho) que a foto comprova. */
    @Column(name = "id_apontamento_local", updatable = false)
    private UUID idApontamentoLocal;

    /** Situação da foto na revisão antes da medição. */
    public enum Revisao {
        PENDENTE,
        APROVADA,
        REPROVADA
    }

    /** Por que a foto não serve. */
    public enum Inconformidade {
        FORA_DE_FOCO("Fora de foco ou escura"),
        ITEM_ERRADO("Não mostra o item pedido"),
        ANGULO_RUIM("Ângulo ou enquadramento ruim"),
        PONTO_ERRADO("Ponto errado"),
        SEM_CARIMBO("Sem carimbo ou carimbo ilegível"),
        OUTRA("Outra");

        private final String rotulo;

        Inconformidade(String rotulo) {
            this.rotulo = rotulo;
        }

        public String rotulo() {
            return rotulo;
        }
    }

    @Enumerated(EnumType.STRING)
    @Column(name = "status_revisao", nullable = false, length = 10)
    private Revisao revisao = Revisao.PENDENTE;

    @Enumerated(EnumType.STRING)
    @Column(name = "inconformidade", length = 30)
    private Inconformidade inconformidade;

    @Column(name = "motivo_reprovacao", length = 500)
    private String motivoReprovacao;

    @Column(name = "revisada_por")
    private String revisadaPor;

    @Column(name = "revisada_em")
    private OffsetDateTime revisadaEm;

    /** Equipe que tirou a foto (para o ranking); nula na foto lançada pelo web. */
    @Column(name = "id_equipe")
    private UUID idEquipe;

    /** Foto boa para a medição e o book. */
    public void aprovar(String usuario) {
        this.revisao = Revisao.APROVADA;
        this.inconformidade = null;
        this.motivoReprovacao = null;
        this.revisadaPor = usuario;
        this.revisadaEm = OffsetDateTime.now();
    }

    /** Foto recusada: sai da medição e volta a ser pendência para a equipe, com o motivo. */
    public void reprovar(Inconformidade inconformidade, String motivo, String usuario) {
        if (inconformidade == null) {
            throw new InvarianteVioladaException("Escolha a inconformidade da foto.");
        }
        String texto = motivo != null && !motivo.isBlank() ? motivo.trim() : null;
        if (inconformidade == Inconformidade.OUTRA && texto == null) {
            throw new InvarianteVioladaException("Descreva o motivo da reprovação.");
        }
        this.revisao = Revisao.REPROVADA;
        this.inconformidade = inconformidade;
        this.motivoReprovacao = texto;
        this.revisadaPor = usuario;
        this.revisadaEm = OffsetDateTime.now();
    }

    public boolean reprovada() {
        return revisao == Revisao.REPROVADA;
    }

    /** Vínculos da foto que veio do app. */
    public record OrigemCampo(UUID idLocal, String hash, UUID idVao, UUID idProgramacao, UUID idApontamentoLocal,
                              BigDecimal precisao, UUID idEquipe) {
    }

    /** Foto lançada pelo app, com o carimbo já desenhado no aparelho. */
    public static EvidenciaPonto doCampo(UUID idObra, UUID idPonto, ItemRespondido item, String legenda, Arquivo arquivo,
                                         Captura captura, OrigemCampo origem) {
        EvidenciaPonto evidencia = new EvidenciaPonto(idObra, idPonto, item, legenda, arquivo, captura);
        evidencia.idLocal = Objects.requireNonNull(origem.idLocal());
        evidencia.hashCampo = origem.hash();
        evidencia.recebidoEm = OffsetDateTime.now();
        evidencia.idVao = origem.idVao();
        evidencia.idProgramacao = origem.idProgramacao();
        evidencia.idApontamentoLocal = origem.idApontamentoLocal();
        evidencia.idEquipe = origem.idEquipe();
        evidencia.precisao = origem.precisao() != null && origem.precisao().signum() >= 0
                ? origem.precisao().min(new BigDecimal("9999999")).setScale(1, RoundingMode.HALF_UP) : null;
        return evidencia;
    }

    public EvidenciaPonto(UUID idObra, UUID idPonto, ItemRespondido item, String legenda, Arquivo arquivo) {
        this(idObra, idPonto, item, legenda, arquivo, Captura.VAZIA);
    }

    public EvidenciaPonto(UUID idObra, UUID idPonto, ItemRespondido item, String legenda, Arquivo arquivo, Captura captura) {
        this.idObra = Objects.requireNonNull(idObra);
        this.idPonto = Objects.requireNonNull(idPonto);
        if (item != null) {
            this.idModelo = item.idModelo();
            this.idItem = item.idItem();
            this.tituloItem = item.titulo();
        }
        this.nomeArquivo = arquivo.nome();
        this.contentType = arquivo.contentType();
        this.tamanhoBytes = arquivo.tamanhoBytes();
        this.chaveStorage = arquivo.chaveStorage();
        this.chaveMiniatura = arquivo.chaveMiniatura();
        alterarLegenda(legenda);
        Captura dados = captura != null ? captura : Captura.VAZIA;
        if ((dados.latitude() == null) != (dados.longitude() == null)) {
            throw new InvarianteVioladaException("Informe a latitude e a longitude juntas.");
        }
        if (dados.latitude() != null) {
            validarCoordenada(dados.latitude(), 90, "latitude");
            validarCoordenada(dados.longitude(), 180, "longitude");
            this.latitude = dados.latitude().setScale(6, RoundingMode.HALF_UP);
            this.longitude = dados.longitude().setScale(6, RoundingMode.HALF_UP);
        }
        if (dados.data() != null && dados.data().isAfter(OffsetDateTime.now().plusMinutes(10))) {
            throw new InvarianteVioladaException("A data da foto não pode estar no futuro.");
        }
        this.dataCaptura = dados.data();
        this.etapa = dados.etapa();
    }

    /** A etapa pode ser corrigida depois, por quem analisa o book. */
    public void classificarEtapa(Etapa etapa) {
        this.etapa = etapa;
    }

    /** Quando a foto foi tirada; sem a informação do app, vale o lançamento. */
    public OffsetDateTime momentoDaFoto() {
        return dataCaptura != null ? dataCaptura : getDataCriacao();
    }

    private static void validarCoordenada(BigDecimal valor, int limite, String nome) {
        if (valor.abs().compareTo(BigDecimal.valueOf(limite)) > 0) {
            throw new InvarianteVioladaException("A " + nome + " da foto está fora do intervalo válido.");
        }
    }

    public void alterarLegenda(String legenda) {
        this.legenda = legenda != null && !legenda.isBlank() ? legenda.trim() : null;
    }
}
