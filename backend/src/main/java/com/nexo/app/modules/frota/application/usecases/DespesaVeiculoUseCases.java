package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.financeiro.FinanceiroApi;
import com.nexo.app.modules.frota.application.dto.ArquivoAnexoDespesa;
import com.nexo.app.modules.frota.application.dto.DespesaVeiculoFilter;
import com.nexo.app.modules.frota.application.dto.DespesaVeiculoRequest;
import com.nexo.app.modules.frota.application.dto.DespesaVeiculoResponse;
import com.nexo.app.modules.frota.application.dto.ResumoDespesasResponse;
import com.nexo.app.modules.frota.domain.AnexoDespesa;
import com.nexo.app.modules.frota.domain.DespesaVeiculo;
import com.nexo.app.modules.frota.domain.SubtipoDespesa;
import com.nexo.app.modules.frota.infrastructure.persistence.AnexoDespesaRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.DespesaVeiculoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.DespesaVeiculoSpecification;
import com.nexo.app.modules.frota.infrastructure.persistence.FichaVeiculoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.SubtipoDespesaRepository;
import com.nexo.app.modules.rh.ProcessoNegocioApi;
import com.nexo.app.modules.rh.ProcessoNegocioResponse;
import com.nexo.app.shared.application.dto.PageResponse;
import com.nexo.app.shared.domain.exception.ArmazenamentoException;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import com.nexo.app.shared.infrastructure.storage.ObjectStorageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Despesas por veículo: lançamento, edição, exclusão lógica, consulta com totais por tipo e
 * anexos (nota, recibo). O pagamento pelo financeiro fica em {@link PagamentoDespesaUseCases}.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DespesaVeiculoUseCases {

    static final ZoneId FUSO = ZoneId.of("America/Sao_Paulo");
    private static final long TAMANHO_MAXIMO_BYTES = 15L * 1024 * 1024;
    private static final Map<String, String> TIPOS_PERMITIDOS = Map.of(
            "application/pdf", "pdf",
            "image/jpeg", "jpg",
            "image/png", "png",
            "image/webp", "webp");

    private final DespesaVeiculoRepository repository;
    private final AnexoDespesaRepository anexos;
    private final SubtipoDespesaRepository subtipos;
    private final FichaVeiculoRepository fichas;
    private final TipoDespesaUseCases tipos;
    private final ReferenciasFrota referencias;
    private final FinanceiroApi financeiro;
    private final ProcessoNegocioApi processos;
    private final ObjectStorageService objectStorage;

    @Transactional(readOnly = true)
    public PageResponse<DespesaVeiculoResponse> listar(DespesaVeiculoFilter filtro, Pageable pageable) {
        Page<DespesaVeiculo> pagina = repository.findAll(especificacao(filtro), pageable);
        return PageResponse.fromPage(new org.springframework.data.domain.PageImpl<>(montar(pagina.getContent()), pageable,
                pagina.getTotalElements()));
    }

    /** Totais do recorte, para o cabeçalho da lista e a aba Despesas da ficha. */
    @Transactional(readOnly = true)
    public ResumoDespesasResponse resumo(DespesaVeiculoFilter filtro) {
        List<DespesaVeiculo> todas = repository.findAll(especificacao(filtro));
        BigDecimal total = soma(todas);
        var semSolicitacao = todas.stream().filter(DespesaVeiculo::podePedirPagamento)
                .filter(d -> d.getSituacaoPagamento() == null).toList();
        Map<UUID, List<DespesaVeiculo>> porTipo = todas.stream()
                .collect(Collectors.groupingBy(d -> d.getTipo().getId(), LinkedHashMap::new, Collectors.toList()));
        var linhas = porTipo.values().stream()
                .map(l -> new ResumoDespesasResponse.PorTipo(l.get(0).getTipo().getId(), l.get(0).getTipo().getNome(), l.size(), soma(l)))
                .sorted(Comparator.comparing(ResumoDespesasResponse.PorTipo::total).reversed())
                .toList();
        return new ResumoDespesasResponse(todas.size(), total, semSolicitacao.size(), soma(semSolicitacao), linhas);
    }

    @Transactional(readOnly = true)
    public DespesaVeiculoResponse buscarPorId(UUID id) {
        return montar(List.of(buscarEntidade(id))).get(0);
    }

    @Transactional
    public DespesaVeiculoResponse criar(DespesaVeiculoRequest request) {
        var despesa = repository.save(DespesaVeiculo.registrar(dados(request), hoje()));
        return montar(List.of(despesa)).get(0);
    }

    @Transactional
    public DespesaVeiculoResponse atualizar(UUID id, DespesaVeiculoRequest request) {
        var despesa = buscarEntidade(id);
        despesa.atualizar(dados(request), hoje());
        return montar(List.of(repository.save(despesa))).get(0);
    }

    @Transactional
    public void excluir(UUID id) {
        var despesa = buscarEntidade(id);
        despesa.excluir();
        repository.save(despesa);
    }

    @Transactional
    public DespesaVeiculoResponse anexar(UUID id, MultipartFile arquivo) {
        var despesa = buscarEntidade(id);
        if (!despesa.isAtivo()) {
            throw new InvarianteVioladaException("Esta despesa foi excluída.");
        }
        if (arquivo == null || arquivo.isEmpty()) {
            throw new InvarianteVioladaException("Envie um arquivo não vazio.");
        }
        if (arquivo.getSize() > TAMANHO_MAXIMO_BYTES) {
            throw new InvarianteVioladaException("O arquivo excede o limite de 15 MB.");
        }
        String contentType = contentType(arquivo);
        String chave = "frota/despesas/" + despesa.getId() + "/" + UUID.randomUUID() + "." + TIPOS_PERMITIDOS.get(contentType);
        try (InputStream entrada = arquivo.getInputStream()) {
            objectStorage.enviar(chave, entrada, arquivo.getSize(), contentType);
        } catch (IOException e) {
            throw new ArmazenamentoException("Falha ao ler o arquivo enviado.", e);
        }
        try {
            anexos.saveAndFlush(new AnexoDespesa(despesa.getId(), chave, nomeSeguro(arquivo, contentType), contentType, arquivo.getSize()));
        } catch (RuntimeException e) {
            try {
                objectStorage.remover(chave);
            } catch (RuntimeException falha) {
                log.warn("Não foi possível remover o objeto órfão {}: {}", chave, falha.getMessage());
            }
            throw e;
        }
        return montar(List.of(despesa)).get(0);
    }

    @Transactional(readOnly = true)
    public ArquivoAnexoDespesa baixarAnexo(UUID id, UUID idAnexo) {
        var anexo = anexo(id, idAnexo);
        var objeto = objectStorage.baixar(anexo.getArquivoChave());
        return new ArquivoAnexoDespesa(anexo.getArquivoNome(), anexo.getArquivoContentType(), anexo.getArquivoTamanhoBytes(), objeto.conteudo());
    }

    /** Exclusão lógica do anexo; o arquivo fica para auditoria. */
    @Transactional
    public DespesaVeiculoResponse removerAnexo(UUID id, UUID idAnexo) {
        var anexo = anexo(id, idAnexo);
        anexo.desativar();
        anexos.save(anexo);
        return montar(List.of(buscarEntidade(id))).get(0);
    }

    DespesaVeiculo buscarEntidade(UUID id) {
        return repository.findById(id).orElseThrow(() -> new RecursoNaoEncontradoException("Despesa não encontrada."));
    }

    /** Monta a despesa do domínio a partir do pedido, conferindo as referências de outros módulos. */
    DespesaVeiculo.Dados dados(DespesaVeiculoRequest r) {
        var ficha = fichas.findByIdVeiculo(r.idVeiculo())
                .orElseThrow(() -> new InvarianteVioladaException("Veículo não encontrado na frota."));
        var tipo = tipos.buscarEntidade(r.idTipo());
        SubtipoDespesa subtipo = r.idSubtipo() == null ? null : subtipos.findById(r.idSubtipo())
                .orElseThrow(() -> new InvarianteVioladaException("Subtipo de despesa não encontrado."));
        UUID base = r.idBaseOperacional() != null ? r.idBaseOperacional() : ficha.getIdBaseOperacional();
        if (r.idBaseOperacional() != null && !referencias.baseExiste(r.idBaseOperacional())) {
            throw new InvarianteVioladaException("A base operacional informada não existe.");
        }
        if (r.idProcesso() != null && !processos.existeProcesso(r.idProcesso())) {
            throw new InvarianteVioladaException("O setor/centro de custo informado não existe.");
        }
        if (r.idFornecedor() != null && !financeiro.nomesFornecedores(List.of(r.idFornecedor())).containsKey(r.idFornecedor())) {
            throw new InvarianteVioladaException("O fornecedor informado não existe no financeiro.");
        }
        return new DespesaVeiculo.Dados(r.idVeiculo(), r.data(), tipo, subtipo, r.descricao(), r.valor(), base, r.idProcesso(),
                r.idFornecedor(), r.fornecedorNome(), r.documentoTipo(), r.documentoNumero(), r.medicao(), r.formaPagamento());
    }

    static LocalDate hoje() {
        return LocalDate.now(FUSO);
    }

    List<DespesaVeiculoResponse> montar(List<DespesaVeiculo> despesas) {
        if (despesas.isEmpty()) {
            return List.of();
        }
        var veiculos = referencias.veiculos(despesas.stream().map(DespesaVeiculo::getIdVeiculo).distinct().toList());
        var bases = referencias.nomesBases(despesas.stream().map(DespesaVeiculo::getIdBaseOperacional).filter(Objects::nonNull).distinct().toList());
        var idsFornecedor = despesas.stream().map(DespesaVeiculo::getIdFornecedor).filter(Objects::nonNull).distinct().toList();
        Map<UUID, String> fornecedores = idsFornecedor.isEmpty() ? Map.of() : financeiro.nomesFornecedores(idsFornecedor);
        Map<UUID, String> nomesProcesso = nomesProcessos(despesas.stream().map(DespesaVeiculo::getIdProcesso).filter(Objects::nonNull).distinct().toList());
        Map<UUID, List<AnexoDespesa>> anexosPorDespesa = anexos.findAllByIdDespesaInAndAtivoTrue(despesas.stream().map(DespesaVeiculo::getId).toList())
                .stream().collect(Collectors.groupingBy(AnexoDespesa::getIdDespesa));
        return despesas.stream().map(d -> {
            var v = veiculos.get(d.getIdVeiculo());
            return new DespesaVeiculoResponse(
                    d.getId(), d.getIdVeiculo(), v == null ? null : v.placa(), v == null ? null : v.modelo(), d.getData(),
                    d.getTipo().getId(), d.getTipo().getNome(),
                    d.getSubtipo() == null ? null : d.getSubtipo().getId(), d.getSubtipo() == null ? null : d.getSubtipo().getNome(),
                    d.getDescricao(), d.getValor(),
                    d.getIdBaseOperacional(), d.getIdBaseOperacional() == null ? null : bases.get(d.getIdBaseOperacional()),
                    d.getIdProcesso(), d.getIdProcesso() == null ? null : nomesProcesso.get(d.getIdProcesso()),
                    d.getIdFornecedor(), d.getIdFornecedor() != null ? fornecedores.get(d.getIdFornecedor()) : d.getFornecedorNome(),
                    d.getDocumentoTipo(), d.getDocumentoTipo() == null ? null : d.getDocumentoTipo().getRotulo(), d.getDocumentoNumero(),
                    d.getMedicao(), d.getFormaPagamento(), d.getFormaPagamento().getRotulo(),
                    d.getIdSolicitacaoFinanceira(), d.getNumeroSolicitacaoFinanceira(), d.getSituacaoPagamento(),
                    d.getSituacaoPagamento() == null ? null : d.getSituacaoPagamento().getRotulo(), d.getMotivoReprovacaoPagamento(),
                    d.podePedirPagamento(), d.getOrigem(),
                    d.getReferenciaExterna() == null ? null : d.getReferenciaExterna().getIdExterno(),
                    anexosPorDespesa.getOrDefault(d.getId(), List.of()).stream()
                            .sorted(Comparator.comparing(AnexoDespesa::getDataCriacao))
                            .map(a -> new DespesaVeiculoResponse.Anexo(a.getId(), a.getArquivoNome(), a.getArquivoContentType(),
                                    a.getArquivoTamanhoBytes(), a.getDataCriacao())).toList(),
                    d.getDataCriacao(), d.getUsuarioCriacao());
        }).toList();
    }

    private org.springframework.data.jpa.domain.Specification<DespesaVeiculo> especificacao(DespesaVeiculoFilter f) {
        DespesaVeiculoFilter filtro = f == null ? new DespesaVeiculoFilter(null, null, null, null, null, null, null, null, null) : f;
        Collection<UUID> idsVeiculo = null;
        if (filtro.idVeiculo() != null) {
            idsVeiculo = List.of(filtro.idVeiculo());
        } else if (StringUtils.hasText(filtro.busca())) {
            idsVeiculo = referencias.idsVeiculosPorTrecho(filtro.busca().trim());
        }
        return DespesaVeiculoSpecification.of(idsVeiculo, filtro.idsBase(), filtro.idsTipo(), filtro.de(), filtro.ate(),
                filtro.formaPagamento(), filtro.situacaoPagamento(), Boolean.TRUE.equals(filtro.semPagamento()));
    }

    private Map<UUID, String> nomesProcessos(List<UUID> ids) {
        Map<UUID, String> nomes = new LinkedHashMap<>();
        for (UUID id : ids) {
            processos.buscarPorIdResponse(id).map(ProcessoNegocioResponse::nome).ifPresent(n -> nomes.put(id, n));
        }
        return nomes;
    }

    private AnexoDespesa anexo(UUID id, UUID idAnexo) {
        return anexos.findById(idAnexo).filter(AnexoDespesa::isAtivo).filter(a -> a.getIdDespesa().equals(id))
                .orElseThrow(() -> new RecursoNaoEncontradoException("Anexo não encontrado nesta despesa."));
    }

    private static BigDecimal soma(List<DespesaVeiculo> lista) {
        return lista.stream().map(DespesaVeiculo::getValor).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private static String contentType(MultipartFile arquivo) {
        String informado = arquivo.getContentType() == null ? null
                : arquivo.getContentType().toLowerCase(Locale.ROOT).split(";")[0].trim();
        if (informado != null && TIPOS_PERMITIDOS.containsKey(informado)) {
            return informado;
        }
        String extensao = StringUtils.getFilenameExtension(arquivo.getOriginalFilename());
        if (extensao != null) {
            String ext = extensao.toLowerCase(Locale.ROOT).equals("jpeg") ? "jpg" : extensao.toLowerCase(Locale.ROOT);
            for (var entrada : TIPOS_PERMITIDOS.entrySet()) {
                if (entrada.getValue().equals(ext)) return entrada.getKey();
            }
        }
        throw new InvarianteVioladaException("Tipo de arquivo não suportado. Envie PDF ou imagem (JPG, PNG, WEBP).");
    }

    private static String nomeSeguro(MultipartFile arquivo, String contentType) {
        String original = arquivo.getOriginalFilename();
        String nome = StringUtils.hasText(original) ? StringUtils.getFilename(StringUtils.cleanPath(original)) : null;
        if (!StringUtils.hasText(nome)) {
            nome = "comprovante." + TIPOS_PERMITIDOS.get(contentType);
        }
        return nome.length() <= 255 ? nome : nome.substring(nome.length() - 255);
    }
}
