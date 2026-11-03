package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.FrotaOdometroApi;
import com.nexo.app.modules.frota.application.dto.CatalogoChecklistAppResponse;
import com.nexo.app.modules.frota.application.dto.ChecklistRegistradoResponse;
import com.nexo.app.modules.frota.application.dto.RegistrarChecklistRequest;
import com.nexo.app.modules.frota.application.mappers.ChecklistFrotaMapper;
import com.nexo.app.modules.frota.domain.Checklist;
import com.nexo.app.modules.frota.application.events.AnaliseIaPedida;
import com.nexo.app.modules.frota.domain.AlvoAnaliseIa;
import com.nexo.app.modules.frota.domain.AptidaoConducao;
import com.nexo.app.modules.frota.domain.FichaVeiculo;
import com.nexo.app.modules.frota.domain.FinalidadeChecklist;
import com.nexo.app.modules.frota.domain.LiberacaoCnh;
import com.nexo.app.modules.frota.domain.FotoChecklist;
import com.nexo.app.modules.frota.domain.ModeloChecklist;
import com.nexo.app.modules.frota.domain.OrigemVinculoCondutor;
import com.nexo.app.modules.frota.domain.PendenciaChecklist;
import com.nexo.app.modules.frota.domain.SituacaoOperacional;
import com.nexo.app.modules.frota.infrastructure.persistence.ChecklistRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.CondutorRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.FichaVeiculoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.ModeloChecklistRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.PendenciaChecklistRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.VinculoCondutorRepository;
import com.nexo.app.shared.domain.events.FrotaChecklistCnhInaptaEvent;
import com.nexo.app.shared.domain.exception.ArmazenamentoException;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import com.nexo.app.shared.infrastructure.security.SecurityUtils;
import com.nexo.app.shared.infrastructure.storage.ObjectStorageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

/**
 * Checklist preenchido no app: catálogo para uso offline, gravação idempotente pelo id do
 * aparelho (com medição no livro-razão, passagem de veículo e pendências de Não OK) e envio
 * das fotos, uma a uma.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ChecklistAppUseCases {

    static final String PERMISSAO_REGISTRAR = "frota:checklist:registrar";
    private static final long TAMANHO_MAXIMO_FOTO = 10L * 1024 * 1024;
    private static final Map<String, String> TIPOS_FOTO = Map.of(
            "image/jpeg", "jpg",
            "image/png", "png",
            "image/webp", "webp");

    private final ChecklistRepository repository;
    private final PendenciaChecklistRepository pendencias;
    private final ModeloChecklistRepository modelos;
    private final ModeloChecklistUseCases modeloUseCases;
    private final FichaVeiculoRepository fichas;
    private final VinculoCondutorRepository vinculoRepository;
    private final VinculoCondutorUseCases vinculos;
    private final OdometroUseCases odometro;
    private final ReferenciasFrota referencias;
    private final LiberacaoCnhUseCases liberacoes;
    private final CondutorRepository condutorRepository;
    private final ChecklistFrotaMapper mapper;
    private final ObjectStorageService objectStorage;
    private final ApplicationEventPublisher eventos;
    @Transactional(readOnly = true)
    public CatalogoChecklistAppResponse catalogo() {
        var ativos = modelos.findAllByAtivoTrue();
        var nomesTipos = modeloUseCases.nomesTipos(ativos);
        var veiculos = fichas.findAll().stream()
                .filter(f -> f.isAtivo() && f.getSituacao() != SituacaoOperacional.BAIXADO)
                .sorted(Comparator.comparing(FichaVeiculo::getPlaca))
                .toList();
        var ids = veiculos.stream().map(FichaVeiculo::getIdVeiculo).toList();
        var resolucao = modeloUseCases.resolver(ativos, ids);
        var cadastro = referencias.veiculos(ids);
        var bases = referencias.nomesBases(veiculos.stream().map(FichaVeiculo::getIdBaseOperacional).filter(Objects::nonNull).toList());
        var km = odometro.kmAtualPorVeiculo(ids);
        var travas = odometro.travas(ids);
        var abertos = vinculos.abertosPorVeiculo(ids);
        var condutores = referencias.nomesColaboradores(abertos.values().stream().map(v -> v.getIdColaborador()).toList());

        var lista = veiculos.stream().map(f -> {
            var r = resolucao.get(f.getIdVeiculo());
            var v = cadastro.get(f.getIdVeiculo());
            var vinculo = abertos.get(f.getIdVeiculo());
            var leitura = km.get(f.getIdVeiculo());
            return new CatalogoChecklistAppResponse.Veiculo(
                    f.getIdVeiculo(),
                    f.getPlaca(),
                    v == null ? null : descricao(v.fabricante(), v.modelo()),
                    f.getIdBaseOperacional(),
                    f.getIdBaseOperacional() == null ? null : bases.get(f.getIdBaseOperacional()),
                    f.getUnidadeMedicao(),
                    f.getTipoVeiculo() == null || f.getTipoVeiculo().getCategoriaCnhMinima() == null ? null
                            : f.getTipoVeiculo().getCategoriaCnhMinima().name(),
                    leitura == null ? null : leitura.getKm(),
                    r.principais().stream().map(ModeloChecklist::getId).toList(),
                    r.adicionais().stream().map(ModeloChecklist::getId).toList(),
                    vinculo == null ? null : vinculo.getIdColaborador(),
                    vinculo == null ? null : condutores.get(vinculo.getIdColaborador()),
                    travas.containsKey(f.getIdVeiculo()) ? travas.get(f.getIdVeiculo()).limite() : null);
        }).toList();
        var fichasCondutor = condutorRepository.findAll().stream().filter(c -> c.isAtivo()).toList();
        var nomesCondutores = referencias.nomesColaboradores(fichasCondutor.stream().map(c -> c.getIdColaborador()).toList());
        var listaCondutores = fichasCondutor.stream()
                .filter(c -> nomesCondutores.containsKey(c.getIdColaborador()))
                .map(c -> new CatalogoChecklistAppResponse.Condutor(c.getIdColaborador(), nomesCondutores.get(c.getIdColaborador()),
                        c.getCnhCategoria() == null ? null : c.getCnhCategoria().name(), c.getCnhValidade()))
                .sorted(Comparator.comparing(CatalogoChecklistAppResponse.Condutor::nome))
                .toList();
        var hoje = LocalDate.now(LiberacaoCnhUseCases.FUSO);
        var liberadas = liberacoes.liberacoesDoDia(hoje).stream()
                .map(l -> new CatalogoChecklistAppResponse.Liberacao(l.getIdCondutor(), l.getIdVeiculo(), l.getDia()))
                .toList();
        return new CatalogoChecklistAppResponse(OffsetDateTime.now(), ativos.stream()
                .map(m -> mapper.toResponse(m, nomesTipos)).toList(), lista, listaCondutores, liberadas);
    }

    @Transactional
    public ChecklistRegistradoResponse registrar(RegistrarChecklistRequest request) {
        var existente = repository.findByIdAparelho(request.idAparelho());
        if (existente.isPresent()) {
            return resposta(existente.get(), null);
        }
        var ficha = fichas.findByIdVeiculo(request.idVeiculo())
                .orElseThrow(() -> new RecursoNaoEncontradoException("Veículo não encontrado na frota."));
        if (!ficha.isAtivo() || ficha.getSituacao() == SituacaoOperacional.BAIXADO) {
            throw new InvarianteVioladaException("O veículo " + ficha.getPlaca() + " não está disponível para uso.");
        }
        var finalidade = request.finalidade() == null ? FinalidadeChecklist.USO : request.finalidade();
        if (!finalidade.temCondutor() && !SecurityUtils.possuiAutoridade(PERMISSAO_REGISTRAR)) {
            throw new InvarianteVioladaException("O checklist de " + finalidade.getRotulo().toLowerCase()
                    + " sem condutor é só para a equipe administrativa.");
        }
        if (finalidade.temCondutor() && !referencias.colaboradorAtivo(request.idCondutor())) {
            throw new InvarianteVioladaException("Condutor não encontrado ou desligado.");
        }
        var dia = request.preenchidoEm().atZoneSameInstant(LiberacaoCnhUseCases.FUSO).toLocalDate();
        // A CNH só avisa no checklist: ele também é feito por quem recebe o veículo sem dirigir.
        // O bloqueio fica no abastecimento (gestores da frota, 23/10/2026).
        var aptidao = finalidade.temCondutor() ? vinculos.aptidao(request.idCondutor(), ficha.getIdVeiculo(), dia) : null;
        var liberacao = aptidao == null || aptidao.isApto() ? Optional.<LiberacaoCnh>empty()
                : liberacoes.liberacao(request.idCondutor(), ficha.getIdVeiculo(), dia);
        var principal = modeloUseCases.buscarEntidade(request.idModelo());
        var adicionais = (request.idsModelosAdicionais() == null ? List.<UUID>of() : request.idsModelosAdicionais()).stream()
                .distinct().map(modeloUseCases::buscarEntidade).toList();

        boolean passagem = finalidade.temCondutor() && condutorAnterior(ficha.getIdVeiculo(), request.preenchidoEm())
                .map(id -> !id.equals(request.idCondutor())).orElse(true);
        var agora = OffsetDateTime.now();
        var checklist = Checklist.registrar(registro(request, finalidade), ficha, principal, adicionais, passagem, agora);
        if (liberacao.isPresent()) {
            checklist.registrarLiberacaoCnh(liberacao.get().getId());
        } else if (aptidao != null && !aptidao.isApto()) {
            checklist.registrarCnhInapta(aptidao.situacao().name(), aptidao.mensagem());
        }
        checklist = repository.saveAndFlush(checklist);

        var leitura = odometro.registrarLeitura(ficha.getIdVeiculo(), request.medicao(), request.preenchidoEm(),
                FrotaOdometroApi.OrigemLeitura.CHECKLIST, checklist.getId(), checklist.getIdUsuarioPreenchimento());
        checklist.vincularLeitura(leitura.idLeitura());

        if (passagem && !vinculoRepository.existeEncerradoDepois(ficha.getIdVeiculo(), request.idCondutor(), request.preenchidoEm())) {
            var vinculo = vinculos.vincular(ficha.getIdVeiculo(), request.idCondutor(), request.preenchidoEm(),
                    OrigemVinculoCondutor.CHECKLIST, checklist.getId(), null, false);
            if (checklist.isComCnhInapta()) {
                vinculo.marcarCnhNoInicio(checklist.getCnhSituacao());
            }
        }
        if (checklist.isComCnhInapta()) {
            avisarCnhInapta(checklist, aptidao);
        }
        if (checklist.fotosPendentes().isEmpty()) {
            eventos.publishEvent(new AnaliseIaPedida(AlvoAnaliseIa.CHECKLIST, checklist.getId()));
        }
        // O mesmo item com pendência em aberto no veículo não vira outra: a repetição aparece no histórico do item.
        for (var problema : checklist.problemas()) {
            if (!pendencias.existeEmAberto(ficha.getIdVeiculo(), problema.getPergunta().getId())) {
                pendencias.save(new PendenciaChecklist(checklist, problema));
            }
        }
        return resposta(repository.save(checklist), leitura);
    }

    /** Recebe uma foto esperada. Reenviar a mesma foto não muda nada. */
    @Transactional
    public ChecklistRegistradoResponse enviarFoto(UUID idAparelhoChecklist, UUID idAparelhoFoto, MultipartFile arquivo) {
        var checklist = repository.findByIdAparelho(idAparelhoChecklist)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Checklist não encontrado. Envie o checklist antes das fotos."));
        var foto = checklist.foto(idAparelhoFoto)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Esta foto não faz parte do checklist."));
        if (!foto.isRecebida()) {
            enviarArquivo(checklist, foto, arquivo);
            // A última foto completa o checklist: o Assistente analisa sozinho.
            if (checklist.fotosPendentes().isEmpty()) {
                eventos.publishEvent(new AnaliseIaPedida(AlvoAnaliseIa.CHECKLIST, checklist.getId()));
            }
        }
        return resposta(checklist, null);
    }

    /** Condutor que estava com o veículo no instante: o vínculo vigente ou, sem ele, o do último checklist de uso. */
    private Optional<UUID> condutorAnterior(UUID idVeiculo, OffsetDateTime instante) {
        return vinculos.condutorEm(idVeiculo, instante)
                .or(() -> repository.findFirstByIdVeiculoAndFinalidadeAndPreenchidoEmBeforeAndAtivoTrueOrderByPreenchidoEmDesc(
                                idVeiculo, FinalidadeChecklist.USO, instante)
                        .map(Checklist::getIdCondutor));
    }

    private void avisarCnhInapta(Checklist checklist, AptidaoConducao aptidao) {
        var condutor = referencias.nomesColaboradores(List.of(checklist.getIdCondutor())).get(checklist.getIdCondutor());
        var situacao = switch (aptidao.situacao()) {
            case SEM_CNH -> "CNH não registrada";
            case VENCIDA -> "CNH vencida";
            case CATEGORIA_INSUFICIENTE -> "CNH de categoria abaixo da exigida";
            case APTO -> "CNH em dia";
        };
        eventos.publishEvent(new FrotaChecklistCnhInaptaEvent(checklist.getId(), checklist.getPlaca(),
                condutor == null ? "O condutor" : condutor, situacao, aptidao.mensagem(),
                "/frota/checklists?checklist=" + checklist.getId()));
    }

    private void enviarArquivo(Checklist checklist, FotoChecklist foto, MultipartFile arquivo) {
        if (arquivo == null || arquivo.isEmpty()) {
            throw new InvarianteVioladaException("Envie uma foto não vazia.");
        }
        if (arquivo.getSize() > TAMANHO_MAXIMO_FOTO) {
            throw new InvarianteVioladaException("A foto excede o limite de 10 MB.");
        }
        String contentType = arquivo.getContentType() == null ? null
                : arquivo.getContentType().toLowerCase(Locale.ROOT).split(";")[0].trim();
        if (contentType == null || !TIPOS_FOTO.containsKey(contentType)) {
            throw new InvarianteVioladaException("Envie a foto em JPG, PNG ou WEBP.");
        }
        String chave = "frota/checklists/" + checklist.getId() + "/" + foto.getIdAparelho() + "." + TIPOS_FOTO.get(contentType);
        try (InputStream entrada = arquivo.getInputStream()) {
            objectStorage.enviar(chave, entrada, arquivo.getSize(), contentType);
        } catch (IOException e) {
            throw new ArmazenamentoException("Falha ao ler a foto enviada.", e);
        }
        try {
            foto.anexar(chave, foto.getIdAparelho() + "." + TIPOS_FOTO.get(contentType), contentType, arquivo.getSize(),
                    OffsetDateTime.now());
            repository.saveAndFlush(checklist);
        } catch (RuntimeException e) {
            removerSilenciosamente(chave);
            throw e;
        }
    }

    private void removerSilenciosamente(String chave) {
        try {
            objectStorage.remover(chave);
        } catch (RuntimeException e) {
            log.warn("Não foi possível remover o objeto órfão {}: {}", chave, e.getMessage());
        }
    }

    private ChecklistRegistradoResponse resposta(Checklist checklist, FrotaOdometroApi.ResultadoLeitura leitura) {
        boolean valida = leitura == null || leitura.valida();
        return new ChecklistRegistradoResponse(
                checklist.getId(),
                checklist.getIdAparelho(),
                checklist.getPlaca(),
                checklist.isPassagemVeiculo(),
                checklist.problemas().size(),
                valida,
                leitura == null ? null : leitura.motivoInconsistencia(),
                checklist.fotosPendentes().stream().map(FotoChecklist::getIdAparelho).toList());
    }

    private static Checklist.Registro registro(RegistrarChecklistRequest r, FinalidadeChecklist finalidade) {
        return new Checklist.Registro(
                r.idAparelho(),
                finalidade,
                finalidade.temCondutor() ? r.idCondutor() : null,
                SecurityUtils.getUsuarioLogadoId(),
                r.preenchidoEm(),
                r.medicao(),
                r.comentario(),
                Boolean.TRUE.equals(r.assinado()),
                r.respostas() == null ? List.of() : r.respostas().stream()
                        .map(x -> new Checklist.RespostaInformada(x.idPergunta(), x.conforme(), x.idAlternativa(), x.texto(),
                                x.comentario(), x.idsFotos()))
                        .toList(),
                r.fotosRecebimento() == null ? List.of() : r.fotosRecebimento().stream()
                        .map(x -> new Checklist.FotoRecebimentoInformada(x.idFotoRecebimento(), x.idFoto()))
                        .toList());
    }

    private static String descricao(String fabricante, String modelo) {
        var texto = ((fabricante == null ? "" : fabricante) + " " + (modelo == null ? "" : modelo)).trim();
        return texto.isEmpty() ? null : texto;
    }
}
