package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.financeiro.FinanceiroApi;
import com.nexo.app.modules.frota.application.dto.SeguradoraFrotaRequest;
import com.nexo.app.modules.frota.application.dto.SeguradoraFrotaResponse;
import com.nexo.app.modules.frota.domain.Apolice;
import com.nexo.app.modules.frota.domain.PapelSeguradora;
import com.nexo.app.modules.frota.domain.SeguradoraFrota;
import com.nexo.app.modules.frota.infrastructure.persistence.ApoliceRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.SeguradoraFrotaRepository;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.text.Collator;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/** Seguradoras e corretoras da frota, cada uma ligada a um fornecedor do financeiro. */
@Service
@RequiredArgsConstructor
public class SeguradoraFrotaUseCases {

    private final SeguradoraFrotaRepository repository;
    private final ApoliceRepository apolices;
    private final FinanceiroApi financeiro;

    @Transactional
    public SeguradoraFrotaResponse criar(SeguradoraFrotaRequest request) {
        exigirFornecedor(request.idFornecedor());
        if (repository.existsByIdFornecedorAndPapelAndAtivoTrue(request.idFornecedor(), request.papel())) {
            throw jaCadastrado(request.papel());
        }
        return responder(repository.save(new SeguradoraFrota(dados(request))));
    }

    @Transactional
    public SeguradoraFrotaResponse atualizar(UUID id, SeguradoraFrotaRequest request) {
        var seguradora = buscarEntidade(id);
        exigirFornecedor(request.idFornecedor());
        if (repository.existsByIdFornecedorAndPapelAndAtivoTrueAndIdNot(request.idFornecedor(), request.papel(), id)) {
            throw jaCadastrado(request.papel());
        }
        seguradora.atualizar(dados(request));
        return responder(repository.save(seguradora));
    }

    @Transactional
    public void desativar(UUID id) {
        var seguradora = buscarEntidade(id);
        seguradora.desativar();
        repository.save(seguradora);
    }

    @Transactional
    public void ativar(UUID id) {
        var seguradora = buscarEntidade(id);
        if (repository.existsByIdFornecedorAndPapelAndAtivoTrueAndIdNot(seguradora.getIdFornecedor(), seguradora.getPapel(), id)) {
            throw jaCadastrado(seguradora.getPapel());
        }
        seguradora.ativar();
        repository.save(seguradora);
    }

    /** Todas (ativas primeiro), pelo nome. A lista é curta: não pagina. */
    @Transactional(readOnly = true)
    public List<SeguradoraFrotaResponse> listar() {
        var todas = repository.findAll();
        var nomes = financeiro.nomesFornecedores(todas.stream().map(SeguradoraFrota::getIdFornecedor).distinct().toList());
        var vigentes = vigentesHoje();
        var collator = Collator.getInstance(Locale.of("pt", "BR"));
        return todas.stream()
                .map(s -> montar(s, nomes, vigentes))
                .sorted(Comparator.comparing(SeguradoraFrotaResponse::ativo).reversed()
                        .thenComparing(SeguradoraFrotaResponse::nome, collator))
                .toList();
    }

    /**
     * Apólice gravada com um fornecedor que ainda não está no cadastro: ele entra, para aparecer
     * na lista de seguradoras (ou corretoras) e nas próximas apólices.
     */
    @Transactional
    public void garantir(UUID idFornecedor, PapelSeguradora papel) {
        if (idFornecedor == null || repository.existsByIdFornecedorAndPapelAndAtivoTrue(idFornecedor, papel)) {
            return;
        }
        repository.save(new SeguradoraFrota(new SeguradoraFrota.Dados(idFornecedor, papel, null, null)));
    }

    private SeguradoraFrota buscarEntidade(UUID id) {
        return repository.findById(id).orElseThrow(() -> new RecursoNaoEncontradoException("Seguradora não encontrada."));
    }

    private SeguradoraFrotaResponse responder(SeguradoraFrota s) {
        return montar(s, financeiro.nomesFornecedores(List.of(s.getIdFornecedor())), vigentesHoje());
    }

    private static SeguradoraFrotaResponse montar(SeguradoraFrota s, Map<UUID, String> nomes, List<Apolice> vigentes) {
        int quantas = (int) vigentes.stream()
                .filter(a -> s.getIdFornecedor().equals(s.getPapel() == PapelSeguradora.SEGURADORA ? a.getIdSeguradora() : a.getIdCorretor()))
                .count();
        return new SeguradoraFrotaResponse(s.getId(), s.getIdFornecedor(), nomes.getOrDefault(s.getIdFornecedor(), "Fornecedor removido"),
                s.getPapel(), s.getPapel().getRotulo(), s.getTelefoneAssistencia(), s.getObservacao(), quantas, s.isAtivo());
    }

    private List<Apolice> vigentesHoje() {
        var hoje = LocalDate.now(DespesaVeiculoUseCases.FUSO);
        return apolices.findAllByAtivoTrue().stream()
                .filter(a -> !a.getVigenciaInicio().isAfter(hoje) && !a.getVigenciaFim().isBefore(hoje))
                .toList();
    }

    private void exigirFornecedor(UUID idFornecedor) {
        if (!financeiro.nomesFornecedores(List.of(idFornecedor)).containsKey(idFornecedor)) {
            throw new InvarianteVioladaException("O fornecedor informado não existe no financeiro.");
        }
    }

    private static InvarianteVioladaException jaCadastrado(PapelSeguradora papel) {
        return new InvarianteVioladaException("Este fornecedor já está cadastrado como " + papel.getRotulo().toLowerCase(Locale.ROOT) + ".");
    }

    private static SeguradoraFrota.Dados dados(SeguradoraFrotaRequest r) {
        return new SeguradoraFrota.Dados(r.idFornecedor(), r.papel(), r.telefoneAssistencia(), r.observacao());
    }
}
