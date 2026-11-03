package com.nexo.app.modules.desconto.application.usecases;

import com.nexo.app.modules.desconto.application.dto.DescontoBaixaRequest;
import com.nexo.app.modules.desconto.application.dto.DescontoFilter;
import com.nexo.app.modules.desconto.application.dto.DescontoItemRequest;
import com.nexo.app.modules.desconto.application.dto.DescontoRequest;
import com.nexo.app.modules.desconto.application.dto.DescontoResponse;
import com.nexo.app.modules.desconto.application.dto.DescontoValidacaoRequest;
import com.nexo.app.modules.desconto.application.mappers.DescontoMapper;
import com.nexo.app.modules.desconto.domain.Desconto;
import com.nexo.app.modules.desconto.infrastructure.persistence.DescontoRepository;
import com.nexo.app.modules.desconto.infrastructure.persistence.DescontoSpecification;
import com.nexo.app.modules.desconto.application.dto.DescontoAnexoDownload;
import com.nexo.app.modules.desconto.domain.DescontoAnexo;
import com.nexo.app.modules.desconto.domain.StatusDesconto;
import com.nexo.app.modules.desconto.domain.EventoDesconto;
import com.nexo.app.modules.desconto.domain.TipoEventoDesconto;
import com.nexo.app.modules.desconto.application.dto.EventoDescontoResponse;
import com.nexo.app.modules.desconto.infrastructure.persistence.EventoDescontoRepository;
import com.nexo.app.modules.rh.ColaboradorApi;
import com.nexo.app.modules.rh.ResumoColaborador;
import com.nexo.app.shared.application.dto.PageResponse;
import com.nexo.app.shared.domain.events.DescontoBaixadoEvent;
import com.nexo.app.shared.domain.events.DescontoRejeitadoEvent;
import com.nexo.app.shared.domain.events.DescontoSolicitadoEvent;
import com.nexo.app.shared.domain.events.DescontoValidadoEvent;
import com.nexo.app.shared.domain.exception.ArmazenamentoException;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import com.nexo.app.shared.infrastructure.storage.ObjectStorageService;
import com.nexo.app.shared.infrastructure.storage.StorageObject;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.text.Collator;
import java.text.Normalizer;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class DescontoUseCases {

    private static final long TAMANHO_MAXIMO_BYTES = 15L * 1024 * 1024;
    private static final Map<String, String> TIPOS_PERMITIDOS = Map.ofEntries(
            // Imagens
            Map.entry("image/jpeg", "jpg"),
            Map.entry("image/png", "png"),
            Map.entry("image/webp", "webp"),
            Map.entry("image/heic", "heic"),
            Map.entry("image/heif", "heif"),

            // Documentos
            Map.entry("application/pdf", "pdf"),
            Map.entry("application/msword", "doc"),
            Map.entry("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"),

            // Áudio (incluindo OGG e formatos comuns)
            Map.entry("audio/ogg", "ogg"),
            Map.entry("application/ogg", "ogg"),
            Map.entry("audio/opus", "opus"),
            Map.entry("audio/mpeg", "mp3"),
            Map.entry("audio/mp3", "mp3"),
            Map.entry("audio/wav", "wav"),
            Map.entry("audio/wave", "wav"),
            Map.entry("audio/x-wav", "wav"),
            Map.entry("audio/aac", "aac"),
            Map.entry("audio/x-aac", "aac"),
            Map.entry("audio/x-m4a", "m4a"),
            Map.entry("audio/m4a", "m4a"),
            Map.entry("audio/mp4", "m4a"),
            Map.entry("audio/webm", "weba"),
            Map.entry("audio/flac", "flac"),
            Map.entry("audio/x-flac", "flac"),
            Map.entry("audio/x-ms-wma", "wma"),

            // Vídeo (formatos comuns)
            Map.entry("video/mp4", "mp4"),
            Map.entry("video/webm", "webm"),
            Map.entry("video/quicktime", "mov"),
            Map.entry("video/x-msvideo", "avi"),
            Map.entry("video/msvideo", "avi"),
            Map.entry("video/avi", "avi"),
            Map.entry("video/x-matroska", "mkv"),
            Map.entry("video/mpeg", "mpeg"),
            Map.entry("video/3gpp", "3gp"),
            Map.entry("video/3gpp2", "3g2"),
            Map.entry("video/x-ms-wmv", "wmv"),
            Map.entry("video/ogg", "ogv")
    );

    private final DescontoRepository repository;
    private final DescontoMapper mapper;
    private final MotivoDescontoUseCases motivoUseCases;
    private final TipoEquipamentoUseCases equipamentoUseCases;
    private final ObjectStorageService storageService;
    private final ApplicationEventPublisher eventPublisher;
    private final ColaboradorApi colaboradorApi;
    private final EventoDescontoRepository eventoRepository;
    private final com.nexo.app.modules.iam.UsuarioApi usuarioApi;

    /** Chaves de ordenação que significam "pelo nome do colaborador". */
    private static final Set<String> ORDENACAO_COLABORADOR = Set.of("colaborador", "nomeColaborador", "colaboradorId");

    @Transactional
    public DescontoResponse solicitar(DescontoRequest request, UUID usuarioSolicitanteId) {
        var motivo = motivoUseCases.buscarEntity(request.motivoId());

        var desconto = new Desconto(
                request.colaboradorId(),
                motivo,
                request.observacoes(),
                request.quantidadeParcelas(),
                request.dataOcorrencia(),
                usuarioSolicitanteId
        );
        repository.save(desconto);
        registrar(desconto, TipoEventoDesconto.LANCADO, null, usuarioSolicitanteId, null,
                motivo.getDescricao() + " · " + request.quantidadeParcelas() + "x", null);

        // O módulo apenas anuncia o fato. Quem (e se alguém) será notificado é decidido
        // pelas regras configuradas para este gatilho, no módulo de notificação.
        eventPublisher.publishEvent(new DescontoSolicitadoEvent(
                desconto.getId(),
                usuarioSolicitanteId,
                motivo.getDescricao(),
                request.quantidadeParcelas(),
                request.dataOcorrencia() == null ? null : request.dataOcorrencia().toString(),
                desconto.getColaboradorId()));

        return mapper.toResponse(desconto);
    }

    @Transactional
    public DescontoResponse atualizar(UUID id, DescontoRequest request, UUID usuarioId) {
        var desconto = buscarEntity(id);
        var motivo = motivoUseCases.buscarEntity(request.motivoId());
        String mudancas = descreverMudancas(desconto, request, motivo.getDescricao());
        desconto.atualizar(request.colaboradorId(), motivo, request.observacoes(), request.quantidadeParcelas(), request.dataOcorrencia());
        repository.save(desconto);
        if (mudancas != null) {
            registrar(desconto, TipoEventoDesconto.DADOS_ALTERADOS, null, usuarioId, null, mudancas, null);
        }
        return mapper.toResponse(desconto);
    }

    /** O que mudou, em linguagem de gente: é o texto que fica na linha do tempo. */
    private String descreverMudancas(Desconto antes, DescontoRequest depois, String motivoNovo) {
        List<String> mudancas = new java.util.ArrayList<>();
        if (!antes.getColaboradorId().equals(depois.colaboradorId())) {
            String de = nomeDoColaborador(antes.getColaboradorId());
            String para = nomeDoColaborador(depois.colaboradorId());
            mudancas.add("colaborador" + (de != null && para != null ? " (" + de + " → " + para + ")" : ""));
        }
        if (!antes.getMotivo().getId().equals(depois.motivoId())) {
            mudancas.add("motivo (" + antes.getMotivo().getDescricao() + " → " + motivoNovo + ")");
        }
        if (depois.dataOcorrencia() != null && (antes.getDataOcorrencia() == null
                || !antes.getDataOcorrencia().toLocalDate().equals(depois.dataOcorrencia().toLocalDate()))) {
            mudancas.add("data da ocorrência (" + data(antes.getDataOcorrencia()) + " → " + data(depois.dataOcorrencia()) + ")");
        }
        if (!antes.getQuantidadeParcelas().equals(depois.quantidadeParcelas())) {
            mudancas.add("parcelas (" + antes.getQuantidadeParcelas() + "x → " + depois.quantidadeParcelas() + "x)");
        }
        String obsAntes = antes.getObservacoes() == null ? "" : antes.getObservacoes().trim();
        String obsDepois = depois.observacoes() == null ? "" : depois.observacoes().trim();
        if (!obsAntes.equals(obsDepois)) {
            mudancas.add("justificativa");
        }
        if (mudancas.isEmpty()) return null;
        String texto = String.join("; ", mudancas);
        return Character.toUpperCase(texto.charAt(0)) + texto.substring(1) + ".";
    }

    private String nomeDoColaborador(UUID colaboradorId) {
        var resumo = colaboradorApi.buscarResumosPorIds(List.of(colaboradorId)).get(colaboradorId);
        return resumo == null ? null : resumo.nomeCompleto();
    }

    private static String data(java.time.OffsetDateTime valor) {
        return valor == null ? "—" : valor.toLocalDate().format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy"));
    }

    /** Sem usuário: lançamentos feitos pelo Copiloto, já atribuídos a quem pediu no LANCADO. */
    @Transactional
    public void adicionarItem(UUID id, DescontoItemRequest request) {
        adicionarItem(id, request, null);
    }

    @Transactional
    public void adicionarItem(UUID id, DescontoItemRequest request, UUID usuarioId) {
        var desconto = buscarEntity(id);
        var equipamento = equipamentoUseCases.buscarEntity(request.tipoEquipamentoId());
        desconto.adicionarItem(request.descricaoMaterial(), equipamento, request.valor());
        repository.save(desconto);
        registrar(desconto, TipoEventoDesconto.ITEM_INCLUIDO, null,
                usuarioId != null ? usuarioId : desconto.getUsuarioSolicitanteId(), request.valor(),
                request.descricaoMaterial() + " (" + equipamento.getDescricao() + ")", null);
    }

    @Transactional
    public void atualizarItem(UUID id, UUID itemId, DescontoItemRequest request, UUID usuarioId) {
        var desconto = buscarEntity(id);
        var equipamento = equipamentoUseCases.buscarEntity(request.tipoEquipamentoId());
        var anterior = desconto.getItens().stream().filter(i -> i.getId().equals(itemId)).findFirst()
                .map(i -> new Object[]{i.getDescricaoMaterial(), i.getValor()}).orElse(null);
        desconto.atualizarItem(itemId, request.descricaoMaterial(), equipamento, request.valor());
        repository.save(desconto);
        String texto = request.descricaoMaterial() + " (" + equipamento.getDescricao() + ")";
        if (anterior != null) {
            if (!anterior[0].equals(request.descricaoMaterial())) {
                texto = anterior[0] + " → " + texto;
            }
            if (((java.math.BigDecimal) anterior[1]).compareTo(request.valor()) != 0) {
                texto += " · era " + moeda((java.math.BigDecimal) anterior[1]);
            }
        }
        registrar(desconto, TipoEventoDesconto.ITEM_ALTERADO, null, usuarioId, request.valor(), texto, null);
    }

    @Transactional
    public void removerItem(UUID id, UUID itemId, UUID usuarioId) {
        var desconto = buscarEntity(id);
        var item = desconto.getItens().stream().filter(i -> i.getId().equals(itemId)).findFirst().orElse(null);
        desconto.removerItem(itemId);
        repository.save(desconto);
        if (item != null) {
            registrar(desconto, TipoEventoDesconto.ITEM_REMOVIDO, null, usuarioId, item.getValor(),
                    item.getDescricaoMaterial(), null);
        }
    }

    @Transactional
    public void adicionarAnexo(UUID id, MultipartFile arquivo, UUID usuarioId) {
        var desconto = buscarEntity(id);
        var enviado = enviarArquivo(id, arquivo);
        var anexo = desconto.adicionarAnexo(enviado.nome(), enviado.chave(), enviado.contentType(), arquivo.getSize());
        repository.saveAndFlush(desconto);
        registrar(desconto, TipoEventoDesconto.ANEXO_INCLUIDO, null, usuarioId, null, anexo.getNomeArquivo(), anexo.getId());
    }

    /**
     * O DP anexa o termo impresso pelo C.E.S e assinado pelo colaborador. O arquivo fica
     * marcado como o termo e o desconto passa a FINALIZADO, tudo na mesma transação.
     */
    @Transactional
    public void finalizar(UUID id, MultipartFile arquivo, UUID usuarioId) {
        var desconto = buscarEntity(id);
        if (desconto.getStatus() != StatusDesconto.BAIXADO) {
            throw new InvarianteVioladaException("O desconto precisa estar baixado em folha para receber o termo assinado.");
        }
        var enviado = enviarArquivo(id, arquivo);
        var termo = desconto.finalizar(usuarioId, enviado.nome(), enviado.chave(), enviado.contentType(), arquivo.getSize());
        repository.saveAndFlush(desconto);
        registrar(desconto, TipoEventoDesconto.FINALIZADO, StatusDesconto.BAIXADO, usuarioId, null,
                termo.getNomeArquivo(), termo.getId());
    }

    private record ArquivoEnviado(String nome, String chave, String contentType) {}

    private ArquivoEnviado enviarArquivo(UUID id, MultipartFile arquivo) {
        String contentType = resolverContentType(arquivo);
        if (arquivo.getSize() > TAMANHO_MAXIMO_BYTES) {
            throw new InvarianteVioladaException("O arquivo excede o limite de 15 MB.");
        }

        String nomeOriginal = arquivo.getOriginalFilename();
        String extensao = TIPOS_PERMITIDOS.get(contentType);
        String nomeSeguro = (nomeOriginal == null || nomeOriginal.isBlank())
                ? "arquivo." + extensao
                : StringUtils.getFilename(StringUtils.cleanPath(nomeOriginal));
        if (nomeSeguro == null || nomeSeguro.isBlank()) {
            nomeSeguro = "arquivo." + extensao;
        }
        if (nomeSeguro.length() > 255) nomeSeguro = nomeSeguro.substring(nomeSeguro.length() - 255);

        String chave = "descontos/" + id + "/" + UUID.randomUUID() + "." + extensao;
        try {
            storageService.enviar(chave, arquivo.getInputStream(), arquivo.getSize(), contentType);
        } catch (IOException e) {
            throw new ArmazenamentoException("Erro ao processar o arquivo de anexo", e);
        }
        return new ArquivoEnviado(nomeSeguro, chave, contentType);
    }

    @Transactional
    public void removerAnexo(UUID id, UUID anexoId, UUID usuarioId) {
        var desconto = buscarEntity(id);
        var anexo = desconto.getAnexos().stream()
                .filter(a -> a.getId().equals(anexoId))
                .findFirst()
                .orElseThrow(() -> new RecursoNaoEncontradoException("Anexo não encontrado."));

        desconto.removerAnexo(anexoId);
        repository.saveAndFlush(desconto);
        registrar(desconto, TipoEventoDesconto.ANEXO_REMOVIDO, null, usuarioId, null, anexo.getNomeArquivo(), null);

        try {
            storageService.remover(anexo.getUrl());
        } catch (RuntimeException e) {
            log.warn("Anexo {} removido do banco, mas falhou a exclusão do objeto '{}' no R2: {}",
                    anexoId, anexo.getUrl(), e.getMessage());
        }
    }

    @Transactional(readOnly = true)
    public DescontoAnexoDownload baixarAnexo(UUID id, UUID anexoId) {
        var desconto = buscarEntity(id);
        var anexo = desconto.getAnexos().stream()
                .filter(a -> a.getId().equals(anexoId))
                .findFirst()
                .orElseThrow(() -> new RecursoNaoEncontradoException("Anexo não encontrado."));

        StorageObject objeto = storageService.baixar(anexo.getUrl());
        return new DescontoAnexoDownload(objeto.conteudo(), anexo.getContentType(), anexo.getTamanhoBytes(), anexo.getNomeArquivo());
    }

    @Transactional
    public void validar(UUID id, UUID usuarioValidadorId, DescontoValidacaoRequest request) {
        var desconto = buscarEntity(id);
        desconto.validar(usuarioValidadorId, request.valorValidado());
        repository.save(desconto);
        registrar(desconto, TipoEventoDesconto.VALIDADO, StatusDesconto.SOLICITADO, usuarioValidadorId,
                desconto.getValorValidado(), null, null);

        // A validação é o ponto em que o termo troca de mãos: sai de quem valida e
        // passa a depender de quem faz a baixa. Quem é essa pessoa não está escrito
        // aqui — é a regra de notificação que a endereça, por permissão.
        eventPublisher.publishEvent(new DescontoValidadoEvent(
                desconto.getId(),
                desconto.getUsuarioSolicitanteId(),
                usuarioValidadorId,
                desconto.getMotivo().getDescricao(),
                desconto.getQuantidadeParcelas(),
                desconto.getValorValidado(),
                desconto.getColaboradorId()));
    }

    @Transactional
    public void baixar(UUID id, UUID usuarioBaixaId, DescontoBaixaRequest request) {
        var desconto = buscarEntity(id);
        desconto.baixar(usuarioBaixaId, request.valorBaixado());
        repository.save(desconto);
        registrar(desconto, TipoEventoDesconto.BAIXADO, StatusDesconto.VALIDADO, usuarioBaixaId,
                desconto.getValorBaixado(), null, null);

        eventPublisher.publishEvent(new DescontoBaixadoEvent(
                desconto.getId(),
                desconto.getUsuarioSolicitanteId(),
                usuarioBaixaId,
                desconto.getMotivo().getDescricao(),
                desconto.getQuantidadeParcelas(),
                desconto.getValorBaixado(),
                desconto.getColaboradorId()));
    }

    @Transactional
    public void rejeitar(UUID id, UUID usuarioRejeicaoId, com.nexo.app.modules.desconto.application.dto.DescontoRejeicaoRequest request) {
        var desconto = buscarEntity(id);
        desconto.rejeitar(usuarioRejeicaoId, request.motivoRejeicao());
        repository.save(desconto);
        registrar(desconto, TipoEventoDesconto.REJEITADO, StatusDesconto.SOLICITADO, usuarioRejeicaoId,
                null, desconto.getMotivoRejeicao(), null);

        eventPublisher.publishEvent(new DescontoRejeitadoEvent(
                desconto.getId(),
                desconto.getUsuarioSolicitanteId(),
                usuarioRejeicaoId,
                desconto.getMotivo().getDescricao(),
                desconto.getMotivoRejeicao(),
                desconto.getColaboradorId()));
    }

    /**
     * Permissão de quem pode desfazer a etapa em que o desconto está: validação e
     * rejeição são de quem valida; baixa e finalização, de quem baixa (o DP).
     */
    @Transactional(readOnly = true)
    public String permissaoParaDesfazer(UUID id) {
        return switch (buscarEntity(id).getStatus()) {
            case VALIDADO, REJEITADO -> "desconto:validar";
            case BAIXADO, FINALIZADO -> "desconto:baixar";
            case SOLICITADO -> throw new InvarianteVioladaException("Não há decisão a desfazer: o desconto ainda aguarda validação.");
        };
    }

    /**
     * Volta o desconto uma etapa, com motivo. As colunas da etapa são limpas e a linha
     * do tempo guarda quem tinha decidido, o valor que deixou de valer e o motivo.
     */
    @Transactional
    public void desfazer(UUID id, UUID usuarioId, String motivo) {
        var desconto = buscarEntity(id);
        var desfeito = desconto.desfazer();
        repository.save(desconto);
        String texto = motivo.trim();
        String quem = nomeDaPessoa(desfeito.responsavelAnterior());
        if (quem != null) {
            texto = texto + "\n" + rotuloEtapa(desfeito.statusAnterior()) + " por " + quem + ".";
        }
        registrar(desconto, TipoEventoDesconto.DECISAO_DESFEITA, desfeito.statusAnterior(), usuarioId,
                desfeito.valorAnterior(), texto,
                desfeito.termoAnterior() == null ? null : desfeito.termoAnterior().getId());
    }

    private static String rotuloEtapa(StatusDesconto status) {
        return switch (status) {
            case VALIDADO -> "Validado";
            case REJEITADO -> "Rejeitado";
            case BAIXADO -> "Baixado";
            case FINALIZADO -> "Termo anexado";
            case SOLICITADO -> "Lançado";
        };
    }

    @Transactional(readOnly = true)
    public List<EventoDescontoResponse> historico(UUID id) {
        buscarEntity(id);
        Map<UUID, java.util.Optional<String>> nomes = new HashMap<>();
        return eventoRepository.findByIdDescontoOrderByOcorridoEmAsc(id).stream()
                .map(evento -> new EventoDescontoResponse(
                        evento.getId(),
                        evento.getTipo(),
                        evento.getTipo().getRotulo(),
                        evento.getStatusAnterior(),
                        evento.getStatusNovo(),
                        evento.getIdUsuario() == null ? null
                                : nomes.computeIfAbsent(evento.getIdUsuario(),
                                        u -> java.util.Optional.ofNullable(nomeDaPessoa(u))).orElse(null),
                        evento.getValor(),
                        evento.getTexto(),
                        evento.getIdAnexo(),
                        evento.getOcorridoEm()))
                .toList();
    }

    private void registrar(Desconto desconto, TipoEventoDesconto tipo, StatusDesconto statusAnterior, UUID usuarioId,
                           java.math.BigDecimal valor, String texto, UUID idAnexo) {
        eventoRepository.save(new EventoDesconto(desconto, tipo, statusAnterior, usuarioId, valor, texto, idAnexo));
    }

    private static String moeda(java.math.BigDecimal valor) {
        return java.text.NumberFormat.getCurrencyInstance(Locale.of("pt", "BR")).format(valor);
    }

    @Transactional(readOnly = true)
    public DescontoResponse buscarPorId(UUID id) {
        Desconto desconto = buscarEntity(id);
        return mapper.toResponse(desconto).comResponsaveis(new DescontoResponse.ResponsaveisDesconto(
                nomeDaPessoa(desconto.getUsuarioSolicitanteId()),
                nomeDaPessoa(desconto.getUsuarioValidadorId()),
                nomeDaPessoa(desconto.getUsuarioBaixaId()),
                nomeDaPessoa(desconto.getUsuarioRejeicaoId()),
                nomeDaPessoa(desconto.getUsuarioFinalizacaoId())));
    }

    /**
     * Nome do colaborador por trás do usuário. O login só aparece para quem não tem
     * colaborador vinculado (contas administrativas): sem ele a trilha perderia o autor.
     */
    private String nomeDaPessoa(UUID idUsuario) {
        if (idUsuario == null) return null;
        return colaboradorApi.buscarNomeCompletoPorUsuario(idUsuario)
                .or(() -> usuarioApi.buscarNomePorId(idUsuario))
                .orElse(null);
    }

    @Transactional(readOnly = true)
    public PageResponse<DescontoResponse> listar(DescontoFilter filter, Pageable pageable) {
        Specification<Desconto> spec = DescontoSpecification.comFiltros(filter, resolverBuscaGlobal(filter));
        Sort.Order porColaborador = pageable.getSort().stream()
                .filter(o -> ORDENACAO_COLABORADOR.contains(o.getProperty()))
                .findFirst()
                .orElse(null);
        if (porColaborador != null) {
            Sort demais = Sort.by(pageable.getSort().stream().filter(o -> o != porColaborador).toList());
            spec = spec.and(DescontoSpecification.ordenadoPorColaborador(
                    posicoesAlfabeticas(), porColaborador.getDirection(), demais));
            pageable = PageRequest.of(pageable.getPageNumber(), pageable.getPageSize());
        }
        Page<Desconto> page = repository.findAll(spec, pageable);
        return PageResponse.fromPage(page.map(mapper::toResponse));
    }

    /**
     * A busca rápida também procura pelo nome do colaborador e pelo rótulo do status.
     * O nome está cifrado no RH; quem compara é o próprio RH, e só os IDs atravessam.
     */
    private DescontoSpecification.BuscaGlobal resolverBuscaGlobal(DescontoFilter filter) {
        if (filter == null || !StringUtils.hasText(filter.buscaGlobal())) {
            return DescontoSpecification.BuscaGlobal.nenhuma();
        }
        String termo = filter.buscaGlobal().trim();
        String normalizado = semAcento(termo);
        List<StatusDesconto> status = Arrays.stream(StatusDesconto.values())
                .filter(s -> semAcento(s.name()).contains(normalizado))
                .toList();
        return new DescontoSpecification.BuscaGlobal(colaboradorApi.buscarIdsPorTrechoDoNome(termo), status);
    }

    /** Posição alfabética (pt-BR) de cada colaborador que tem desconto. */
    private Map<UUID, Integer> posicoesAlfabeticas() {
        List<UUID> ids = repository.listarColaboradoresComDesconto();
        if (ids.isEmpty()) return Map.of();
        Map<UUID, ResumoColaborador> resumos = colaboradorApi.buscarResumosPorIds(ids);
        Collator collator = Collator.getInstance(Locale.of("pt", "BR"));
        collator.setStrength(Collator.PRIMARY);
        List<ResumoColaborador> ordenados = resumos.values().stream()
                .filter(r -> r.nomeCompleto() != null)
                .sorted(Comparator.comparing(ResumoColaborador::nomeCompleto, collator))
                .toList();
        Map<UUID, Integer> posicoes = new HashMap<>();
        for (int i = 0; i < ordenados.size(); i++) {
            posicoes.put(ordenados.get(i).id(), i);
        }
        return posicoes;
    }

    private static String semAcento(String texto) {
        return Normalizer.normalize(texto, Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT);
    }

    protected Desconto buscarEntity(UUID id) {
        return repository.findById(id)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Desconto não encontrado."));
    }

    private String resolverContentType(MultipartFile arquivo) {
        if (arquivo == null || arquivo.isEmpty()) {
            throw new InvarianteVioladaException("Envie um arquivo não vazio.");
        }
        String contentType = normalizar(arquivo.getContentType());
        if (contentType == null || !TIPOS_PERMITIDOS.containsKey(contentType)) {
            contentType = inferirPorExtensao(arquivo.getOriginalFilename());
        }
        if (contentType == null || !TIPOS_PERMITIDOS.containsKey(contentType)) {
            throw new InvarianteVioladaException(
                    "Tipo de arquivo não suportado. Aceitos: imagens (JPEG, PNG, WebP, HEIC), documentos (PDF, DOC, DOCX), áudios (OGG, MP3, WAV, AAC, M4A, etc.) e vídeos (MP4, WebM, MOV, AVI, MKV, etc.).");
        }
        return contentType;
    }

    private static String normalizar(String contentType) {
        if (contentType == null || contentType.isBlank()) {
            return null;
        }
        int ponto = contentType.indexOf(';');
        return (ponto >= 0 ? contentType.substring(0, ponto) : contentType).trim().toLowerCase();
    }

    private static String inferirPorExtensao(String nomeArquivo) {
        String ext = normalizar(StringUtils.getFilenameExtension(nomeArquivo));
        if (ext == null) return null;
        return switch (ext) {
            // Imagens
            case "jpg", "jpeg" -> "image/jpeg";
            case "png" -> "image/png";
            case "webp" -> "image/webp";
            case "heic" -> "image/heic";
            case "heif" -> "image/heif";

            // Documentos
            case "pdf" -> "application/pdf";
            case "doc" -> "application/msword";
            case "docx" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

            // Áudios
            case "ogg", "oga" -> "audio/ogg";
            case "opus" -> "audio/opus";
            case "mp3" -> "audio/mpeg";
            case "wav" -> "audio/wav";
            case "aac" -> "audio/aac";
            case "m4a" -> "audio/x-m4a";
            case "weba" -> "audio/webm";
            case "flac" -> "audio/flac";
            case "wma" -> "audio/x-ms-wma";

            // Vídeos
            case "mp4" -> "video/mp4";
            case "webm" -> "video/webm";
            case "mov" -> "video/quicktime";
            case "avi" -> "video/x-msvideo";
            case "mkv" -> "video/x-matroska";
            case "mpeg", "mpg" -> "video/mpeg";
            case "3gp" -> "video/3gpp";
            case "3g2" -> "video/3gpp2";
            case "wmv" -> "video/x-ms-wmv";
            case "ogv" -> "video/ogg";
            default -> null;
        };
    }
}
