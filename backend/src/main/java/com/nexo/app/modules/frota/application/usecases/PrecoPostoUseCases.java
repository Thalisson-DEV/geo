package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.application.dto.PrecoPostoRequest;
import com.nexo.app.modules.frota.application.dto.PrecoPostoResponse;
import com.nexo.app.modules.frota.application.dto.SugestaoPrecoPostoResponse;
import com.nexo.app.modules.frota.domain.Abastecimento;
import com.nexo.app.modules.frota.domain.PostoAbastecimento;
import com.nexo.app.modules.frota.domain.PrecoPostoAbastecimento;
import com.nexo.app.modules.frota.domain.ProdutoAbastecimento;
import com.nexo.app.modules.frota.domain.SugestaoPrecoPosto;
import com.nexo.app.modules.frota.infrastructure.persistence.AbastecimentoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.PrecoPostoAbastecimentoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.ProdutoAbastecimentoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.SugestaoPrecoPostoRepository;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import com.nexo.app.shared.infrastructure.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Preço por posto e produto, com histórico: o realizado calcula o valor por ele. O preço lido
 * no cupom pela Bússola vira sugestão e só muda o cadastro depois de confirmado.
 */
@Service
@RequiredArgsConstructor
public class PrecoPostoUseCases {

    /** Diferença do cupom para o cadastrado abaixo disto é arredondamento, não preço novo. */
    static final BigDecimal TOLERANCIA_SUGESTAO = new BigDecimal("0.005");

    private final PrecoPostoAbastecimentoRepository repository;
    private final SugestaoPrecoPostoRepository sugestoes;
    private final PostoAbastecimentoUseCases postos;
    private final ProdutoAbastecimentoRepository produtos;
    private final ReferenciasFrota referencias;
    private final AbastecimentoRepository abastecimentos;

    @Transactional(readOnly = true)
    public List<PrecoPostoResponse> listar(UUID idPosto) {
        postos.buscarEntidade(idPosto);
        var precos = repository.findAllByPostoIdAndAtivoTrueOrderByVigenteDesdeDescDataCriacaoDesc(idPosto);
        var hoje = LocalDate.now(Abastecimento.FUSO);
        var vigentes = new HashSet<UUID>();
        precos.stream().filter(p -> !p.getVigenteDesde().isAfter(hoje))
                .collect(Collectors.toMap(p -> p.getProduto().getId(), p -> p, (a, b) -> a))
                .values().forEach(p -> vigentes.add(p.getId()));
        var nomes = referencias.nomesPessoas(precos.stream().map(PrecoPostoAbastecimento::getIdUsuario)
                .filter(Objects::nonNull).distinct().toList());
        return precos.stream().map(p -> response(p, vigentes.contains(p.getId()), nomes)).toList();
    }

    @Transactional
    public PrecoPostoResponse registrar(UUID idPosto, PrecoPostoRequest request) {
        var posto = postos.buscarEntidade(idPosto);
        var produto = produtos.findById(request.idProduto()).filter(ProdutoAbastecimento::isAtivo)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Produto não encontrado ou desativado."));
        var dia = request.vigenteDesde() == null ? LocalDate.now(Abastecimento.FUSO) : request.vigenteDesde();
        var preco = gravar(posto, produto, request.precoUnitario(), dia, PrecoPostoAbastecimento.Origem.MANUAL, null,
                SecurityUtils.getUsuarioLogadoId());
        return response(preco, !dia.isAfter(LocalDate.now(Abastecimento.FUSO)),
                referencias.nomesPessoas(Stream.of(preco.getIdUsuario()).filter(Objects::nonNull).toList()));
    }

    /** Preço vigente do produto no posto na data. */
    @Transactional(readOnly = true)
    public Optional<BigDecimal> vigente(UUID idPosto, UUID idProduto, LocalDate data) {
        return repository.findFirstByPostoIdAndProdutoIdAndVigenteDesdeLessThanEqualAndAtivoTrueOrderByVigenteDesdeDesc(
                idPosto, idProduto, data).map(PrecoPostoAbastecimento::getPrecoUnitario);
    }

    /** Preços vigentes de vários postos, por posto e produto (catálogo do app). */
    @Transactional(readOnly = true)
    public Map<UUID, Map<UUID, BigDecimal>> vigentes(Collection<UUID> idsPosto, LocalDate data) {
        if (idsPosto.isEmpty()) return Map.of();
        return repository.vigentes(idsPosto, data).stream().collect(Collectors.groupingBy(p -> p.getPosto().getId(),
                Collectors.toMap(p -> p.getProduto().getId(), PrecoPostoAbastecimento::getPrecoUnitario, (a, b) -> a)));
    }

    /**
     * Preço lido no cupom: diferente do cadastrado (ou sem cadastro), vira sugestão pendente.
     * Reanalisar o mesmo abastecimento não duplica.
     */
    @Transactional
    public Optional<SugestaoPrecoPosto> sugerir(Abastecimento abastecimento, ProdutoAbastecimento produto, BigDecimal precoCupom,
                                                LocalDate dataCupom) {
        if (precoCupom == null || precoCupom.signum() <= 0
                || sugestoes.findByIdAbastecimentoAndProdutoIdAndAtivoTrue(abastecimento.getId(), produto.getId()).isPresent()) {
            return Optional.empty();
        }
        var cadastrado = vigente(abastecimento.getPosto().getId(), produto.getId(), dataCupom).orElse(null);
        if (cadastrado != null && cadastrado.subtract(precoCupom).abs().compareTo(TOLERANCIA_SUGESTAO) < 0) {
            return Optional.empty();
        }
        return Optional.of(sugestoes.save(new SugestaoPrecoPosto(abastecimento.getId(), abastecimento.getPosto(), produto,
                cadastrado, precoCupom, dataCupom)));
    }

    /**
     * Preços por litro lidos no cupom do abastecimento realizado, pela chave do nome do produto
     * ({@link #chave}): cada item entregue com preço diferente do posto vira sugestão.
     */
    @Transactional
    public void sugerirDoCupom(UUID idAbastecimento, Map<String, BigDecimal> precosCupom) {
        var abastecimento = abastecimentos.findById(idAbastecimento).orElse(null);
        if (abastecimento == null || abastecimento.getRealizadoEm() == null) {
            return;
        }
        var dia = abastecimento.getRealizadoEm().atZoneSameInstant(Abastecimento.FUSO).toLocalDate();
        for (var item : abastecimento.getItens()) {
            var produto = item.getProduto() != null ? item.getProduto() : item.getProdutoPedido();
            var preco = precosCupom.get(chave(produto.getNome()));
            if (preco != null && item.getQuantidade() != null && item.getQuantidade().signum() > 0) {
                sugerir(abastecimento, produto, preco, dia);
            }
        }
    }

    /** Nome do produto sem acento, caixa e pontuação ("ARLA 32" = "arla32"). */
    static String chave(String nome) {
        return nome == null ? "" : java.text.Normalizer.normalize(nome, java.text.Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "").toLowerCase(java.util.Locale.ROOT).replaceAll("[^a-z0-9]", "");
    }

    @Transactional(readOnly = true)
    public List<SugestaoPrecoPostoResponse> pendentes() {
        return responder(sugestoes.findAllBySituacaoInAndAtivoTrueOrderByDataCriacaoDesc(List.of(SugestaoPrecoPosto.Situacao.PENDENTE)));
    }

    @Transactional(readOnly = true)
    public List<SugestaoPrecoPostoResponse> doAbastecimento(UUID idAbastecimento) {
        return responder(sugestoes.findAllByIdAbastecimentoAndAtivoTrueOrderByDataCriacaoAsc(idAbastecimento));
    }

    /** Uma pessoa conferiu o cupom: o preço novo vale a partir da data do cupom. */
    @Transactional
    public SugestaoPrecoPostoResponse confirmar(UUID id) {
        var sugestao = buscar(id);
        var preco = sugestao.confirmar(SecurityUtils.getUsuarioLogadoId(), OffsetDateTime.now());
        gravar(preco.getPosto(), preco.getProduto(), preco.getPrecoUnitario(), preco.getVigenteDesde(), preco.getOrigem(),
                preco.getIdAbastecimento(), preco.getIdUsuario());
        return responder(List.of(sugestoes.save(sugestao))).getFirst();
    }

    @Transactional
    public SugestaoPrecoPostoResponse descartar(UUID id) {
        var sugestao = buscar(id);
        sugestao.descartar(SecurityUtils.getUsuarioLogadoId(), OffsetDateTime.now());
        return responder(List.of(sugestoes.save(sugestao))).getFirst();
    }

    /** Um preço por posto, produto e dia: o novo do mesmo dia substitui o anterior. */
    private PrecoPostoAbastecimento gravar(PostoAbastecimento posto, ProdutoAbastecimento produto, BigDecimal valor, LocalDate dia,
                                           PrecoPostoAbastecimento.Origem origem, UUID idAbastecimento, UUID idUsuario) {
        if (!posto.isAtivo()) {
            throw new InvarianteVioladaException("O posto " + posto.getNome() + " está desativado.");
        }
        repository.findByPostoIdAndProdutoIdAndVigenteDesdeAndAtivoTrue(posto.getId(), produto.getId(), dia).ifPresent(antigo -> {
            antigo.substituir();
            repository.saveAndFlush(antigo);
        });
        return repository.save(new PrecoPostoAbastecimento(posto, produto, valor, dia, origem, idAbastecimento, idUsuario));
    }

    private SugestaoPrecoPosto buscar(UUID id) {
        return sugestoes.findById(id).filter(SugestaoPrecoPosto::isAtivo)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Sugestão de preço não encontrada."));
    }

    private List<SugestaoPrecoPostoResponse> responder(List<SugestaoPrecoPosto> lista) {
        var nomes = referencias.nomesPessoas(lista.stream().map(SugestaoPrecoPosto::getIdUsuarioDecisao).filter(Objects::nonNull)
                .distinct().toList());
        return lista.stream().map(s -> new SugestaoPrecoPostoResponse(s.getId(), s.getIdAbastecimento(), s.getPosto().getId(),
                s.getPosto().getNome(), s.getProduto().getId(), s.getProduto().getNome(), s.getPrecoCadastrado(), s.getPrecoCupom(),
                s.getDataCupom(), s.getSituacao(), s.getSituacao().getRotulo(),
                s.getIdUsuarioDecisao() == null ? null : nomes.get(s.getIdUsuarioDecisao()), s.getDecididoEm(), s.getDataCriacao())).toList();
    }

    private static PrecoPostoResponse response(PrecoPostoAbastecimento p, boolean vigente, Map<UUID, String> nomes) {
        var produto = p.getProduto();
        return new PrecoPostoResponse(p.getId(), produto.getId(), produto.getNome(), produto.getCategoria(),
                produto.getUnidade().getSigla(), p.getPrecoUnitario(), p.getVigenteDesde(), p.getOrigem(), p.getOrigem().getRotulo(),
                p.getIdUsuario() == null ? null : nomes.get(p.getIdUsuario()), p.getDataCriacao(), vigente);
    }
}
