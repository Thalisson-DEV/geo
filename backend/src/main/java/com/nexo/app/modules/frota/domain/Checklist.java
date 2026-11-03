package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

/**
 * Checklist do veículo preenchido no app. Valida as respostas contra o modelo principal e os
 * adicionais, exige foto onde o modelo pede e, na troca de condutor, as fotos de recebimento.
 */
@Entity
@Table(name = "frota_checklists")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Checklist extends BaseEntity {

    /** Folga para o relógio do aparelho adiantado. */
    private static final Duration TOLERANCIA_RELOGIO = Duration.ofMinutes(10);

    @Column(name = "id_aparelho", nullable = false, updatable = false)
    private UUID idAparelho;

    @Column(name = "id_veiculo", nullable = false, updatable = false)
    private UUID idVeiculo;

    @Column(name = "placa", nullable = false, length = 10, updatable = false)
    private String placa;

    @Column(name = "id_base_operacional", updatable = false)
    private UUID idBaseOperacional;

    @Column(name = "id_modelo", nullable = false, updatable = false)
    private UUID idModelo;

    @Column(name = "modelo_nome", nullable = false, length = 120, updatable = false)
    private String modeloNome;

    @Enumerated(EnumType.STRING)
    @Column(name = "finalidade", nullable = false, length = 20, updatable = false)
    private FinalidadeChecklist finalidade = FinalidadeChecklist.USO;

    /** Nulo no recebimento e na devolução, que não têm condutor. */
    @Column(name = "id_condutor", updatable = false)
    private UUID idCondutor;

    @Column(name = "id_usuario_preenchimento", nullable = false, updatable = false)
    private UUID idUsuarioPreenchimento;

    @Column(name = "preenchido_em", nullable = false, updatable = false)
    private OffsetDateTime preenchidoEm;

    @Column(name = "recebido_em", nullable = false, updatable = false)
    private OffsetDateTime recebidoEm;

    @Column(name = "medicao", updatable = false)
    private Long medicao;

    @Enumerated(EnumType.STRING)
    @Column(name = "unidade_medicao", nullable = false, length = 10, updatable = false)
    private UnidadeMedicao unidadeMedicao;

    @Column(name = "id_leitura")
    private UUID idLeitura;

    @Column(name = "passagem_veiculo", nullable = false, updatable = false)
    private boolean passagemVeiculo;

    @Column(name = "assinado", nullable = false, updatable = false)
    private boolean assinado;

    @Column(name = "comentario", length = 2000, updatable = false)
    private String comentario;

    @Column(name = "id_liberacao_cnh")
    private UUID idLiberacaoCnh;

    /** Situação da CNH quando o condutor não estava apto: o checklist vale, com aviso. */
    @Column(name = "cnh_situacao", length = 30)
    private String cnhSituacao;

    @Column(name = "cnh_motivo", length = 300)
    private String cnhMotivo;

    @OneToMany(mappedBy = "checklist", cascade = CascadeType.ALL)
    @OrderBy("ordem ASC")
    private List<RespostaChecklist> respostas = new ArrayList<>();

    @OneToMany(mappedBy = "checklist", cascade = CascadeType.ALL)
    private List<FotoChecklist> fotos = new ArrayList<>();

    public record Registro(
            UUID idAparelho,
            FinalidadeChecklist finalidade,
            UUID idCondutor,
            UUID idUsuario,
            OffsetDateTime preenchidoEm,
            Long medicao,
            String comentario,
            boolean assinado,
            List<RespostaInformada> respostas,
            List<FotoRecebimentoInformada> fotosRecebimento) {
    }

    /**
     * @param conforme      OK/Não OK
     * @param idAlternativa opção escolhida ou motivo do Não OK
     * @param idsFotos      ids gerados no aparelho para as fotos desta resposta
     */
    public record RespostaInformada(UUID idPergunta, Boolean conforme, UUID idAlternativa, String texto,
                                    String comentario, List<UUID> idsFotos) {
    }

    public record FotoRecebimentoInformada(UUID idFotoRecebimento, UUID idFoto) {
    }

    /**
     * @param passagem o condutor informado é outro que o anterior (ou não havia anterior):
     *                 exige as fotos de recebimento do modelo principal
     */
    public static Checklist registrar(Registro registro, FichaVeiculo ficha, ModeloChecklist principal,
                                      List<ModeloChecklist> adicionais, boolean passagem, OffsetDateTime agora) {
        var checklist = new Checklist();
        checklist.preencher(registro, ficha, principal, passagem, agora);
        checklist.responder(registro, principal, adicionais);
        if (passagem) {
            checklist.exigirFotosRecebimento(registro, principal);
        }
        return checklist;
    }

    private void preencher(Registro registro, FichaVeiculo ficha, ModeloChecklist principal, boolean passagem,
                           OffsetDateTime agora) {
        Objects.requireNonNull(ficha, "A ficha do veículo é obrigatória");
        if (registro.idAparelho() == null) {
            throw new InvarianteVioladaException("Informe o identificador do checklist gerado no aparelho.");
        }
        var finalidadeInformada = registro.finalidade() == null ? FinalidadeChecklist.USO : registro.finalidade();
        if (finalidadeInformada.temCondutor() && registro.idCondutor() == null) {
            throw new InvarianteVioladaException("Informe o condutor.");
        }
        if (!finalidadeInformada.temCondutor() && registro.idCondutor() != null) {
            throw new InvarianteVioladaException("O checklist de " + finalidadeInformada.getRotulo().toLowerCase()
                    + " é um registro sem condutor. Tire o condutor ou faça um checklist de uso.");
        }
        if (registro.preenchidoEm() == null) {
            throw new InvarianteVioladaException("Informe a data e hora do checklist.");
        }
        if (registro.preenchidoEm().isAfter(agora.plus(TOLERANCIA_RELOGIO))) {
            throw new InvarianteVioladaException("A data do checklist está no futuro. Confira a data e a hora do celular.");
        }
        if (registro.medicao() == null || registro.medicao() < 0) {
            throw new InvarianteVioladaException("Informe o " + (ficha.getUnidadeMedicao() == UnidadeMedicao.HORAS ? "horímetro" : "KM") + " do painel.");
        }
        if (!principal.isAtivo() && principal.getDataDesativacao() != null
                && principal.getDataDesativacao().isBefore(registro.preenchidoEm())) {
            throw new InvarianteVioladaException("O modelo " + principal.getNome() + " foi desativado. Atualize o app e refaça o checklist.");
        }
        if (principal.getTipo() != TipoModeloChecklist.PRINCIPAL) {
            throw new InvarianteVioladaException("Escolha um modelo principal para o checklist.");
        }
        if (principal.isExigeAssinatura() && !registro.assinado()) {
            throw new InvarianteVioladaException("Este modelo exige a confirmação de quem preencheu.");
        }
        this.idAparelho = registro.idAparelho();
        this.idVeiculo = ficha.getIdVeiculo();
        this.placa = ficha.getPlaca();
        this.idBaseOperacional = ficha.getIdBaseOperacional();
        this.idModelo = principal.getId();
        this.modeloNome = principal.getNome();
        this.finalidade = finalidadeInformada;
        this.idCondutor = registro.idCondutor();
        this.idUsuarioPreenchimento = Objects.requireNonNull(registro.idUsuario(), "O usuário é obrigatório");
        this.preenchidoEm = registro.preenchidoEm();
        this.recebidoEm = agora;
        this.medicao = registro.medicao();
        this.unidadeMedicao = ficha.getUnidadeMedicao();
        this.passagemVeiculo = passagem;
        this.assinado = registro.assinado();
        this.comentario = Textos.opcional(registro.comentario(), 2000);
    }

    private void responder(Registro registro, ModeloChecklist principal, List<ModeloChecklist> adicionais) {
        var modelos = new ArrayList<ModeloChecklist>();
        modelos.add(principal);
        for (var adicional : adicionais) {
            if (adicional.getTipo() != TipoModeloChecklist.ADICIONAL) {
                throw new InvarianteVioladaException("O modelo " + adicional.getNome() + " não é adicional.");
            }
            modelos.add(adicional);
        }

        var informadas = new HashMap<UUID, RespostaInformada>();
        for (var r : registro.respostas() == null ? List.<RespostaInformada>of() : registro.respostas()) {
            if (r.idPergunta() == null || informadas.putIfAbsent(r.idPergunta(), r) != null) {
                throw new InvarianteVioladaException("Há respostas repetidas ou sem pergunta no checklist.");
            }
        }

        var idsFotos = new HashSet<UUID>();
        int ordem = 0;
        for (var modelo : modelos) {
            for (var pergunta : modelo.getPerguntas()) {
                var informada = informadas.remove(pergunta.getId());
                if (informada == null) {
                    if (exigida(pergunta)) {
                        throw new InvarianteVioladaException("Responda a pergunta \"" + pergunta.getTexto() + "\".");
                    }
                    continue;
                }
                var grupo = pergunta.getGrupo() != null ? pergunta.getGrupo()
                        : (modelo == principal ? null : modelo.getNome());
                var resposta = new RespostaChecklist(this, pergunta, ordem++, grupo, validarConforme(pergunta, informada),
                        alternativa(pergunta, informada), informada.texto(), informada.comentario());
                respostas.add(resposta);
                var fotosResposta = informada.idsFotos() == null ? List.<UUID>of() : informada.idsFotos();
                if (pergunta.getModoFoto().exige(resposta.getConforme()) && fotosResposta.isEmpty()) {
                    throw new InvarianteVioladaException(pergunta.getModoFoto() == ModoFotoPergunta.SEMPRE
                            ? "Tire a foto do item \"" + pergunta.getTexto() + "\"."
                            : "Tire a foto do item \"" + pergunta.getTexto() + "\" marcado como Não OK.");
                }
                for (var idFoto : fotosResposta) {
                    if (!idsFotos.add(idFoto)) {
                        throw new InvarianteVioladaException("Há fotos repetidas no checklist.");
                    }
                    fotos.add(FotoChecklist.daResposta(this, idFoto, resposta));
                }
            }
        }
        if (!informadas.isEmpty()) {
            throw new InvarianteVioladaException("O checklist tem respostas para perguntas que não são do modelo. Atualize o app e refaça o checklist.");
        }
    }

    /** Pergunta em uso que já existia quando o checklist foi preenchido (o app pode estar desatualizado). */
    private boolean exigida(PerguntaChecklist pergunta) {
        return pergunta.isAtivo() && (pergunta.getDataCriacao() == null || !pergunta.getDataCriacao().isAfter(preenchidoEm));
    }

    private static Boolean validarConforme(PerguntaChecklist pergunta, RespostaInformada informada) {
        if (pergunta.getTipoResposta() != TipoRespostaChecklist.OK_NOK) return null;
        if (informada.conforme() == null) {
            throw new InvarianteVioladaException("Marque OK ou Não OK em \"" + pergunta.getTexto() + "\".");
        }
        return informada.conforme();
    }

    private static AlternativaChecklist alternativa(PerguntaChecklist pergunta, RespostaInformada informada) {
        return switch (pergunta.getTipoResposta()) {
            case OPCOES -> {
                if (informada.idAlternativa() == null) {
                    throw new InvarianteVioladaException("Escolha uma opção em \"" + pergunta.getTexto() + "\".");
                }
                yield pergunta.alternativa(informada.idAlternativa())
                        .filter(a -> a.getTipo() == TipoAlternativaChecklist.OPCAO)
                        .orElseThrow(() -> new InvarianteVioladaException("Opção inválida em \"" + pergunta.getTexto() + "\"."));
            }
            case OK_NOK -> {
                if (informada.idAlternativa() == null || Boolean.TRUE.equals(informada.conforme())) yield null;
                yield pergunta.alternativa(informada.idAlternativa())
                        .filter(a -> a.getTipo() == TipoAlternativaChecklist.MOTIVO)
                        .orElseThrow(() -> new InvarianteVioladaException("Motivo inválido em \"" + pergunta.getTexto() + "\"."));
            }
            case TEXTO -> null;
        };
    }

    private void exigirFotosRecebimento(Registro registro, ModeloChecklist principal) {
        Map<UUID, UUID> informadas = new HashMap<>();
        for (var f : registro.fotosRecebimento() == null ? List.<FotoRecebimentoInformada>of() : registro.fotosRecebimento()) {
            if (f.idFotoRecebimento() != null && f.idFoto() != null) {
                informadas.putIfAbsent(f.idFotoRecebimento(), f.idFoto());
            }
        }
        var faltando = new ArrayList<String>();
        for (var pedida : principal.fotosRecebimentoAtivas()) {
            if (pedida.getDataCriacao() != null && pedida.getDataCriacao().isAfter(preenchidoEm)) continue;
            var idFoto = informadas.get(pedida.getId());
            if (idFoto == null) {
                faltando.add(pedida.getDescricao());
                continue;
            }
            if (fotos.stream().anyMatch(f -> f.getIdAparelho().equals(idFoto))) {
                throw new InvarianteVioladaException("Há fotos repetidas no checklist.");
            }
            fotos.add(FotoChecklist.deRecebimento(this, idFoto, pedida));
        }
        if (!faltando.isEmpty()) {
            throw new InvarianteVioladaException("Você está recebendo o veículo de outro condutor. Tire as fotos de recebimento: "
                    + String.join(", ", faltando) + ".");
        }
    }

    /** O condutor dirigiu com liberação do gestor (CNH vencida ou de categoria insuficiente). */
    public void registrarLiberacaoCnh(UUID idLiberacao) {
        this.idLiberacaoCnh = idLiberacao;
    }

    /** O condutor não estava apto pela CNH (vencida, ausente ou categoria abaixo): o checklist vale com aviso. */
    public void registrarCnhInapta(String situacao, String motivo) {
        this.cnhSituacao = Textos.opcional(situacao, 30);
        this.cnhMotivo = Textos.opcional(motivo, 300);
    }

    public boolean isComCnhInapta() {
        return cnhSituacao != null;
    }

    public void vincularLeitura(UUID idLeitura) {
        this.idLeitura = idLeitura;
    }

    public List<RespostaChecklist> problemas() {
        return respostas.stream().filter(RespostaChecklist::isProblema).toList();
    }

    public List<FotoChecklist> fotosPendentes() {
        return fotos.stream().filter(f -> !f.isRecebida()).toList();
    }

    public Optional<FotoChecklist> foto(UUID idAparelho) {
        return fotos.stream().filter(f -> f.getIdAparelho().equals(idAparelho)).findFirst();
    }
}
