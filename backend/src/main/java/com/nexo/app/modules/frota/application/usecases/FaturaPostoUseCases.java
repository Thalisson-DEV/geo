package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.financeiro.FinanceiroApi;
import com.nexo.app.modules.frota.application.dto.ConferenciaFaturaResponse;
import com.nexo.app.modules.frota.application.dto.FaturaPostoRequest;
import com.nexo.app.modules.frota.application.dto.FaturaPostoResponse;
import com.nexo.app.modules.frota.application.dto.PreenchimentoFinanceiroResponse;
import com.nexo.app.modules.frota.application.mappers.AbastecimentoMapper;
import com.nexo.app.modules.frota.domain.Abastecimento;
import com.nexo.app.modules.frota.domain.FaturaPosto;
import com.nexo.app.modules.frota.infrastructure.persistence.AbastecimentoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.FaturaPostoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.PostoAbastecimentoRepository;
import com.nexo.app.shared.application.dto.PageResponse;
import com.nexo.app.shared.domain.events.SolicitacaoFinanceiraCriadaEvent;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import com.nexo.app.shared.infrastructure.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Fatura do posto: lançamento, conferência contra os abastecimentos realizados e envio ao
 * financeiro pelo formulário de pagamento já preenchido (origem {@code FROTA_FATURA_POSTO}).
 */
@Service
@RequiredArgsConstructor
public class FaturaPostoUseCases {

    public static final String ORIGEM_FINANCEIRO = "FROTA_FATURA_POSTO";
    private static final DateTimeFormatter DATA = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    private final FaturaPostoRepository repository;
    private final PostoAbastecimentoRepository postos;
    private final AbastecimentoRepository abastecimentos;
    private final ReferenciasFrota referencias;
    private final AbastecimentoMapper mapper;
    private final FinanceiroApi financeiro;

    @Transactional(readOnly = true)
    public PageResponse<FaturaPostoResponse> listar(UUID idPosto, FaturaPosto.Situacao situacao, Pageable pageable) {
        return PageResponse.fromPage(repository.listar(idPosto, situacao, pageable).map(this::responder));
    }

    @Transactional
    public FaturaPostoResponse criar(FaturaPostoRequest request) {
        var posto = postos.findById(request.idPosto()).orElseThrow(() -> new RecursoNaoEncontradoException("Posto não encontrado."));
        if (repository.existsByPostoIdAndNumeroIgnoreCaseAndAtivoTrue(posto.getId(), request.numero().trim())) {
            throw new InvarianteVioladaException("Já existe a fatura " + request.numero().trim() + " deste posto.");
        }
        return responder(repository.save(new FaturaPosto(posto, request.numero(), request.periodoInicio(), request.periodoFim(),
                request.valor())));
    }

    @Transactional
    public FaturaPostoResponse atualizar(UUID id, FaturaPostoRequest request) {
        var fatura = buscar(id);
        fatura.atualizar(request.numero(), request.periodoInicio(), request.periodoFim(), request.valor());
        return responder(repository.save(fatura));
    }

    @Transactional(readOnly = true)
    public ConferenciaFaturaResponse conferencia(UUID id) {
        var fatura = buscar(id);
        var inicio = fatura.getPeriodoInicio().atStartOfDay(Abastecimento.FUSO).toOffsetDateTime();
        var fim = fatura.getPeriodoFim().plusDays(1).atStartOfDay(Abastecimento.FUSO).toOffsetDateTime();
        var candidatos = abastecimentos.candidatosFatura(fatura.getPosto().getId(), inicio, fim, fatura.getId());
        var veiculos = referencias.veiculos(candidatos.stream().map(Abastecimento::getIdVeiculo).toList());
        return new ConferenciaFaturaResponse(responder(fatura), candidatos.stream().map(a -> new ConferenciaFaturaResponse.Candidato(
                a.getId(), veiculos.containsKey(a.getIdVeiculo()) ? veiculos.get(a.getIdVeiculo()).placa() : null, a.getRealizadoEm(),
                mapper.resumoItens(a), a.valorTotal(), fatura.getId().equals(a.getIdFatura()))).toList());
    }

    @Transactional
    public FaturaPostoResponse conferir(UUID id, List<UUID> idsAbastecimento) {
        var fatura = buscar(id);
        var ids = new HashSet<>(idsAbastecimento);
        var inicio = fatura.getPeriodoInicio().atStartOfDay(Abastecimento.FUSO).toOffsetDateTime();
        var fim = fatura.getPeriodoFim().plusDays(1).atStartOfDay(Abastecimento.FUSO).toOffsetDateTime();
        var candidatos = abastecimentos.candidatosFatura(fatura.getPosto().getId(), inicio, fim, fatura.getId());
        var incluidos = candidatos.stream().filter(a -> ids.contains(a.getId())).toList();
        if (incluidos.size() != ids.size()) {
            throw new InvarianteVioladaException("Há abastecimento fora do período, de outro posto ou já em outra fatura.");
        }
        fatura.conferir(incluidos, abastecimentos.findAllByIdFatura(fatura.getId()), SecurityUtils.getUsuarioLogadoId(), OffsetDateTime.now());
        abastecimentos.saveAll(candidatos);
        return responder(repository.save(fatura));
    }

    /** Valores para o formulário de pagamento do financeiro: fornecedor do posto, valor e a lista dos abastecimentos. */
    @Transactional(readOnly = true)
    public PreenchimentoFinanceiroResponse preenchimentoFinanceiro(UUID id) {
        var fatura = buscar(id);
        if (fatura.getSituacao() == FaturaPosto.Situacao.RASCUNHO) {
            throw new InvarianteVioladaException("Confira a fatura antes de enviar ao financeiro.");
        }
        var posto = fatura.getPosto();
        var ligados = abastecimentos.findAllByIdFatura(fatura.getId());
        var veiculos = referencias.veiculos(ligados.stream().map(Abastecimento::getIdVeiculo).toList());
        Map<String, Object> valores = new LinkedHashMap<>();
        Map<String, String> rotulos = new LinkedHashMap<>();
        if (posto.getIdFornecedor() != null) {
            valores.put("fornecedorId", posto.getIdFornecedor());
            rotulos.put("fornecedorId", financeiro.nomesFornecedores(List.of(posto.getIdFornecedor())).get(posto.getIdFornecedor()));
        } else {
            valores.put("fornecedorNome", posto.getNome());
        }
        if (posto.getIdBaseOperacional() != null) {
            valores.put("baseId", posto.getIdBaseOperacional());
            rotulos.put("baseId", referencias.nomesBases(List.of(posto.getIdBaseOperacional())).get(posto.getIdBaseOperacional()));
        }
        var linhas = ligados.stream().map(a -> (veiculos.containsKey(a.getIdVeiculo()) ? veiculos.get(a.getIdVeiculo()).placa() : "")
                + " em " + a.getRealizadoEm().atZoneSameInstant(Abastecimento.FUSO).format(DATA) + ": " + mapper.resumoItens(a)
                + " — R$ " + a.valorTotal().toPlainString().replace('.', ',')).toList();
        valores.put("descricao", "Fatura " + fatura.getNumero() + " do " + posto.getNome() + " (" + fatura.getPeriodoInicio().format(DATA)
                + " a " + fatura.getPeriodoFim().format(DATA) + "), " + ligados.size() + " abastecimentos:\n- " + String.join("\n- ", linhas));
        valores.put("valor", fatura.getValor());
        valores.put("observacoes", "Conferida na frota contra os abastecimentos realizados.");
        rotulos.values().removeIf(java.util.Objects::isNull);
        return new PreenchimentoFinanceiroResponse(ORIGEM_FINANCEIRO, "Fatura " + fatura.getNumero() + " — " + posto.getNome(),
                "PADRAO", valores, rotulos);
    }

    /** O financeiro criou a solicitação de pagamento pedida pela fatura. */
    @Transactional
    public void vincular(SolicitacaoFinanceiraCriadaEvent evento) {
        if (!ORIGEM_FINANCEIRO.equals(evento.origemTipo())) {
            return;
        }
        var fatura = buscar(evento.origemId());
        fatura.enviarAoFinanceiro();
        repository.save(fatura);
    }

    private FaturaPosto buscar(UUID id) {
        return repository.findById(id).filter(FaturaPosto::isAtivo)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Fatura não encontrada."));
    }

    private FaturaPostoResponse responder(FaturaPosto f) {
        var ligados = f.getId() == null ? List.<Abastecimento>of() : abastecimentos.findAllByIdFatura(f.getId());
        BigDecimal soma = ligados.stream().map(Abastecimento::valorTotal).reduce(BigDecimal.ZERO, BigDecimal::add);
        return new FaturaPostoResponse(f.getId(), f.getPosto().getId(), f.getPosto().getNome(), f.getNumero(), f.getPeriodoInicio(),
                f.getPeriodoFim(), f.getValor(), f.getSituacao(), f.getSituacao().getRotulo(), ligados.size(), soma,
                f.getValor().subtract(soma), f.getConferidaEm());
    }
}
