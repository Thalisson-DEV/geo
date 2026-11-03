package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.financeiro.FinanceiroApi;
import com.nexo.app.modules.frota.application.dto.ApoliceFilter;
import com.nexo.app.modules.frota.application.dto.ApoliceRequest;
import com.nexo.app.modules.frota.application.dto.ApoliceResponse;
import com.nexo.app.modules.frota.application.dto.ArquivoAnexoDespesa;
import com.nexo.app.modules.frota.application.dto.CoberturaApoliceRequest;
import com.nexo.app.modules.frota.application.dto.CoberturaVeiculoResponse;
import com.nexo.app.modules.frota.application.dto.GerarParcelasRequest;
import com.nexo.app.modules.frota.application.dto.ParcelaApoliceRequest;
import com.nexo.app.modules.frota.domain.AnexoApolice;
import com.nexo.app.modules.frota.domain.Apolice;
import com.nexo.app.modules.frota.domain.CoberturaApolice;
import com.nexo.app.modules.frota.domain.FichaVeiculo;
import com.nexo.app.modules.frota.domain.MotivoEncerramentoCobertura;
import com.nexo.app.modules.frota.domain.PapelSeguradora;
import com.nexo.app.modules.frota.domain.SituacaoOperacional;
import com.nexo.app.modules.frota.domain.SituacaoVencimento;
import com.nexo.app.modules.frota.infrastructure.persistence.AnexoApoliceRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.ApoliceRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.ApoliceSpecification;
import com.nexo.app.modules.frota.infrastructure.persistence.FichaVeiculoRepository;
import com.nexo.app.modules.rh.ProcessoNegocioApi;
import com.nexo.app.modules.rh.ProcessoNegocioResponse;
import com.nexo.app.shared.application.dto.PageResponse;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Apólices de seguro: cadastro, veículos cobertos por período, parcelas e anexos. O pagamento
 * das parcelas pelo financeiro fica em {@link PagamentoApoliceUseCases}; o aviso de vencimento,
 * no job de vencimentos da frota.
 */
@Service
@RequiredArgsConstructor
public class ApoliceUseCases {

    /** Parcela sem pedido que vence até estes dias à frente aparece como "falta pedir". */
    static final int ANTECEDENCIA_PEDIDO_DIAS = 30;
    private static final DateTimeFormatter DATA = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    private final ApoliceRepository repository;
    private final AnexoApoliceRepository anexos;
    private final FichaVeiculoRepository fichas;
    private final AnexosFrota arquivos;
    private final ReferenciasFrota referencias;
    private final ParametrosFrotaUseCases parametros;
    private final FinanceiroApi financeiro;
    private final ProcessoNegocioApi processos;
    private final SeguradoraFrotaUseCases seguradoras;

    @Transactional(readOnly = true)
    public PageResponse<ApoliceResponse> listar(ApoliceFilter filtro, Pageable pageable) {
        Page<Apolice> pagina = repository.findAll(especificacao(filtro), pageable);
        return PageResponse.fromPage(new PageImpl<>(montar(pagina.getContent()), pageable, pagina.getTotalElements()));
    }

    @Transactional(readOnly = true)
    public ApoliceResponse buscarPorId(UUID id) {
        return montar(List.of(buscarEntidade(id))).get(0);
    }

    /** Apólices que cobriam o veículo no dia, para escolher qual acionar no sinistro. */
    @Transactional(readOnly = true)
    public List<ApoliceResponse> cobrindo(UUID idVeiculo, LocalDate dia) {
        var lista = repository.findAllCobrindoVeiculo(idVeiculo).stream()
                .filter(a -> dia == null || a.cobre(idVeiculo, dia)).toList();
        return montar(lista);
    }

    /**
     * Situação de seguro de cada veículo ativo da frota (baixados ficam de fora): coberto até
     * quando, quem perde a cobertura dentro da faixa de aviso e quem está sem seguro hoje.
     */
    @Transactional(readOnly = true)
    public List<CoberturaVeiculoResponse> coberturaVeiculos() {
        LocalDate hoje = DespesaVeiculoUseCases.hoje();
        LocalDate limiteAviso = hoje.plusDays(parametros.diasAviso());
        var fichasAtivas = fichas.findAllByAtivoTrue().stream()
                .filter(f -> f.getSituacao() != SituacaoOperacional.BAIXADO).toList();
        if (fichasAtivas.isEmpty()) {
            return List.of();
        }
        var ids = fichasAtivas.stream().map(FichaVeiculo::getIdVeiculo).toList();
        var apolices = repository.findAllCobrindoVeiculos(ids);
        var veiculos = referencias.veiculos(ids);
        var bases = referencias.nomesBases(fichasAtivas.stream().map(FichaVeiculo::getIdBaseOperacional).filter(Objects::nonNull).distinct().toList());
        List<CoberturaVeiculoResponse> resultado = new ArrayList<>();
        for (FichaVeiculo ficha : fichasAtivas) {
            UUID idVeiculo = ficha.getIdVeiculo();
            List<Periodo> periodos = apolices.stream()
                    .flatMap(a -> a.periodosCobertos(idVeiculo).stream().map(p -> new Periodo(a, p[0], p[1])))
                    .sorted(Comparator.comparing(Periodo::inicio)).toList();
            var hojeCoberto = periodos.stream().filter(p -> p.contem(hoje)).max(Comparator.comparing(Periodo::fim));
            var v = veiculos.get(idVeiculo);
            String modelo = v == null ? null : v.modelo();
            String base = ficha.getIdBaseOperacional() == null ? null : bases.get(ficha.getIdBaseOperacional());
            if (hojeCoberto.isPresent()) {
                LocalDate ate = fimContinuo(periodos, hojeCoberto.get().fim());
                var atual = hojeCoberto.get().apolice();
                resultado.add(new CoberturaVeiculoResponse(idVeiculo, ficha.getPlaca(), modelo, ficha.getIdBaseOperacional(), base,
                        true, atual.getId(), atual.getNumero(), ate, ate.isBefore(limiteAviso) ? ate.plusDays(1) : null, null, null));
            } else {
                var anterior = periodos.stream().map(Periodo::fim).filter(f -> f.isBefore(hoje)).max(Comparator.naturalOrder());
                var proxima = periodos.stream().filter(p -> p.inicio().isAfter(hoje)).findFirst();
                resultado.add(new CoberturaVeiculoResponse(idVeiculo, ficha.getPlaca(), modelo, ficha.getIdBaseOperacional(), base,
                        false, proxima.map(p -> p.apolice().getId()).orElse(null), proxima.map(p -> p.apolice().getNumero()).orElse(null),
                        null, null, anterior.orElse(null), proxima.map(Periodo::inicio).orElse(null)));
            }
        }
        resultado.sort(Comparator.comparing(CoberturaVeiculoResponse::placa));
        return resultado;
    }

    /**
     * Renovação de cada apólice: a apólice que cobre, no dia seguinte ao fim da vigência, os
     * veículos que ainda estavam cobertos no último dia. Sem veículos no fim, não há o que renovar.
     */
    public Map<UUID, Apolice> renovacoes(List<Apolice> lista) {
        var idsVeiculo = lista.stream().flatMap(a -> a.veiculosNoFimDaVigencia().stream()).distinct().toList();
        if (idsVeiculo.isEmpty()) {
            return Map.of();
        }
        var candidatas = repository.findAllCobrindoVeiculos(idsVeiculo);
        Map<UUID, Apolice> resultado = new LinkedHashMap<>();
        for (Apolice apolice : lista) {
            var veiculos = apolice.veiculosNoFimDaVigencia();
            if (veiculos.isEmpty()) continue;
            LocalDate diaSeguinte = apolice.getVigenciaFim().plusDays(1);
            var outras = candidatas.stream().filter(c -> !c.getId().equals(apolice.getId())).toList();
            boolean todosContinuam = veiculos.stream().allMatch(v -> outras.stream().anyMatch(o -> o.cobre(v, diaSeguinte)));
            if (!todosContinuam) continue;
            outras.stream().filter(o -> veiculos.stream().anyMatch(v -> o.cobre(v, diaSeguinte)))
                    .min(Comparator.comparing(Apolice::getVigenciaInicio).reversed())
                    .ifPresent(o -> resultado.put(apolice.getId(), o));
        }
        return resultado;
    }

    @Transactional
    public ApoliceResponse criar(ApoliceRequest request) {
        exigirNumeroLivre(request, null);
        var apolice = Apolice.cadastrar(dados(request));
        if (request.idsVeiculo() != null) {
            for (UUID idVeiculo : new HashSet<>(request.idsVeiculo())) {
                exigirVeiculo(idVeiculo);
                apolice.incluirVeiculo(idVeiculo, null, null);
            }
        }
        return salvar(apolice);
    }

    @Transactional
    public ApoliceResponse atualizar(UUID id, ApoliceRequest request) {
        var apolice = buscarEntidade(id);
        exigirNumeroLivre(request, id);
        apolice.atualizar(dados(request));
        return salvar(apolice);
    }

    @Transactional
    public void excluir(UUID id) {
        var apolice = buscarEntidade(id);
        apolice.excluir();
        repository.save(apolice);
    }

    @Transactional
    public ApoliceResponse incluirVeiculo(UUID id, CoberturaApoliceRequest request) {
        var apolice = buscarEntidade(id);
        exigirVeiculo(request.idVeiculo());
        apolice.incluirVeiculo(request.idVeiculo(), request.inicio(), request.fim());
        return salvar(apolice);
    }

    @Transactional
    public ApoliceResponse encerrarCobertura(UUID id, UUID idCobertura, LocalDate fim, MotivoEncerramentoCobertura motivo,
                                             String observacao) {
        var apolice = buscarEntidade(id);
        apolice.encerrarCobertura(idCobertura, fim, motivo, observacao);
        return salvar(apolice);
    }

    @Transactional
    public ApoliceResponse removerCobertura(UUID id, UUID idCobertura) {
        var apolice = buscarEntidade(id);
        apolice.removerCobertura(idCobertura);
        return salvar(apolice);
    }

    @Transactional
    public ApoliceResponse gerarParcelas(UUID id, GerarParcelasRequest request) {
        var apolice = buscarEntidade(id);
        apolice.gerarParcelas(request.quantidade(), request.primeiroVencimento(), request.valorTotal());
        return salvar(apolice);
    }

    @Transactional
    public ApoliceResponse incluirParcela(UUID id, ParcelaApoliceRequest request) {
        var apolice = buscarEntidade(id);
        apolice.incluirParcela(request.vencimento(), request.valor());
        return salvar(apolice);
    }

    @Transactional
    public ApoliceResponse alterarParcela(UUID id, UUID idParcela, ParcelaApoliceRequest request) {
        var apolice = buscarEntidade(id);
        apolice.alterarParcela(idParcela, request.vencimento(), request.valor());
        return salvar(apolice);
    }

    @Transactional
    public ApoliceResponse removerParcela(UUID id, UUID idParcela) {
        var apolice = buscarEntidade(id);
        apolice.removerParcela(idParcela);
        return salvar(apolice);
    }

    @Transactional
    public ApoliceResponse anexar(UUID id, MultipartFile arquivo) {
        var apolice = buscarEntidade(id);
        if (!apolice.isAtivo()) {
            throw new InvarianteVioladaException("Esta apólice foi excluída.");
        }
        arquivos.enviar("frota/apolices/" + id, arquivo,
                a -> anexos.saveAndFlush(new AnexoApolice(id, a.chave(), a.nome(), a.contentType(), a.tamanho())));
        return montar(List.of(apolice)).get(0);
    }

    @Transactional(readOnly = true)
    public ArquivoAnexoDespesa baixarAnexo(UUID id, UUID idAnexo) {
        var anexo = anexo(id, idAnexo);
        return new ArquivoAnexoDespesa(anexo.getArquivoNome(), anexo.getArquivoContentType(), anexo.getArquivoTamanhoBytes(),
                arquivos.baixar(anexo.getArquivoChave()));
    }

    /** Exclusão lógica do anexo; o arquivo fica para auditoria. */
    @Transactional
    public ApoliceResponse removerAnexo(UUID id, UUID idAnexo) {
        var anexo = anexo(id, idAnexo);
        anexo.desativar();
        anexos.save(anexo);
        return buscarPorId(id);
    }

    Apolice buscarEntidade(UUID id) {
        return repository.findById(id).orElseThrow(() -> new RecursoNaoEncontradoException("Apólice não encontrada."));
    }

    List<ApoliceResponse> montar(List<Apolice> apolices) {
        if (apolices.isEmpty()) {
            return List.of();
        }
        LocalDate hoje = DespesaVeiculoUseCases.hoje();
        int diasAviso = parametros.diasAviso();
        var idsVeiculo = apolices.stream().flatMap(a -> a.getCoberturasAtivas().stream()).map(CoberturaApolice::getIdVeiculo)
                .distinct().toList();
        var veiculos = idsVeiculo.isEmpty() ? Map.<UUID, com.nexo.app.modules.rh.VeiculoResponse>of() : referencias.veiculos(idsVeiculo);
        var bases = referencias.nomesBases(apolices.stream().map(Apolice::getIdBaseOperacional).filter(Objects::nonNull).distinct().toList());
        var idsFornecedor = apolices.stream().flatMap(a -> Stream.of(a.getIdSeguradora(), a.getIdCorretor()))
                .filter(Objects::nonNull).distinct().toList();
        Map<UUID, String> fornecedores = financeiro.nomesFornecedores(idsFornecedor);
        Map<UUID, String> nomesProcesso = nomesProcessos(apolices.stream().map(Apolice::getIdProcesso).filter(Objects::nonNull).distinct().toList());
        Map<UUID, List<AnexoApolice>> anexosPorApolice = anexos.findAllByIdApoliceInAndAtivoTrue(apolices.stream().map(Apolice::getId).toList())
                .stream().collect(Collectors.groupingBy(AnexoApolice::getIdApolice));
        Map<UUID, Apolice> renovadas = renovacoes(apolices);
        LocalDate limitePedido = hoje.plusDays(ANTECEDENCIA_PEDIDO_DIAS);
        return apolices.stream().map(a -> {
            SituacaoVencimento situacao = SituacaoVencimento.calcular(a.getVigenciaFim(), hoje, diasAviso);
            Apolice renovacao = renovadas.get(a.getId());
            long diasParaComecar = ChronoUnit.DAYS.between(hoje, a.getVigenciaInicio());
            var coberturas = a.getCoberturasAtivas().stream()
                    .sorted(Comparator.comparing((CoberturaApolice c) -> placa(veiculos.get(c.getIdVeiculo()))).thenComparing(CoberturaApolice::getInicio))
                    .map(c -> {
                        var v = veiculos.get(c.getIdVeiculo());
                        return new ApoliceResponse.Cobertura(c.getId(), c.getIdVeiculo(), v == null ? null : v.placa(),
                                v == null ? null : v.modelo(), c.getInicio(), c.getFim(), c.cobre(hoje, a.getVigenciaFim())
                                && !hoje.isBefore(a.getVigenciaInicio()), c.getMotivoEncerramento(),
                                c.getMotivoEncerramento() == null ? null : c.getMotivoEncerramento().getRotulo(),
                                c.getObservacaoEncerramento());
                    }).toList();
            var parcelas = a.getParcelasAtivas().stream().map(p -> new ApoliceResponse.Parcela(p.getId(), p.getNumero(),
                    p.getVencimento(), p.getValor(), p.getIdSolicitacaoFinanceira(), p.getNumeroSolicitacaoFinanceira(),
                    p.getSituacaoPagamento(), p.getSituacaoPagamento() == null ? null : p.getSituacaoPagamento().getRotulo(),
                    p.getMotivoReprovacaoPagamento(), p.podePedirPagamento(),
                    p.getVencimento().isBefore(hoje) && p.getSituacaoPagamento() == null,
                    p.getSituacaoPagamento() == null && !p.getVencimento().isBefore(hoje) && !p.getVencimento().isAfter(limitePedido))).toList();
            return new ApoliceResponse(a.getId(), a.getNumero(), a.getIdSeguradora(), fornecedores.get(a.getIdSeguradora()),
                    a.getIdCorretor(), a.getIdCorretor() == null ? null : fornecedores.get(a.getIdCorretor()), a.getSegurado(),
                    a.getIdBaseOperacional(), a.getIdBaseOperacional() == null ? null : bases.get(a.getIdBaseOperacional()),
                    a.getIdProcesso(), a.getIdProcesso() == null ? null : nomesProcesso.get(a.getIdProcesso()),
                    a.getVigenciaInicio(), a.getVigenciaFim(), a.getValor(), a.getFranquia(), a.getObservacao(),
                    situacao, rotulo(situacao, diasParaComecar, a, renovacao), ChronoUnit.DAYS.between(hoje, a.getVigenciaFim()),
                    diasParaComecar,
                    (int) coberturas.stream().filter(ApoliceResponse.Cobertura::cobertoHoje).map(ApoliceResponse.Cobertura::idVeiculo).distinct().count(),
                    renovacao == null ? null : new ApoliceResponse.Renovacao(renovacao.getId(), renovacao.getNumero(), renovacao.getVigenciaInicio()),
                    coberturas, parcelas, a.totalParcelas(),
                    anexosPorApolice.getOrDefault(a.getId(), List.of()).stream()
                            .sorted(Comparator.comparing(AnexoApolice::getDataCriacao))
                            .map(x -> new ApoliceResponse.Anexo(x.getId(), x.getArquivoNome(), x.getArquivoContentType(),
                                    x.getArquivoTamanhoBytes(), x.getDataCriacao())).toList(),
                    a.getDataCriacao(), a.getUsuarioCriacao());
        }).toList();
    }

    /** Antes do início, "Começa em"; vencendo ou vencida com a renovação cadastrada, "Renovada". */
    static String rotulo(SituacaoVencimento situacao, long diasParaComecar, Apolice apolice, Apolice renovacao) {
        if (diasParaComecar > 0) {
            return "Começa em " + apolice.getVigenciaInicio().format(DATA);
        }
        if (renovacao != null && situacao != SituacaoVencimento.VIGENTE) {
            return "Renovada";
        }
        return rotulo(situacao);
    }

    static String rotulo(SituacaoVencimento situacao) {
        return switch (situacao) {
            case VIGENTE -> "Vigente";
            case A_VENCER -> "A vencer";
            case VENCIDO -> "Vencida";
            case SEM_VENCIMENTO -> "Sem vencimento";
        };
    }

    private ApoliceResponse salvar(Apolice apolice) {
        seguradoras.garantir(apolice.getIdSeguradora(), PapelSeguradora.SEGURADORA);
        seguradoras.garantir(apolice.getIdCorretor(), PapelSeguradora.CORRETORA);
        return montar(List.of(repository.saveAndFlush(apolice))).get(0);
    }

    private Specification<Apolice> especificacao(ApoliceFilter f) {
        ApoliceFilter filtro = f == null ? new ApoliceFilter(null, null, null, null, null) : f;
        LocalDate hoje = DespesaVeiculoUseCases.hoje();
        LocalDate limiteAviso = hoje.plusDays(parametros.diasAviso());
        LocalDate antesDe = null;
        LocalDate de = null;
        LocalDate ate = null;
        LocalDate depois = null;
        if (filtro.situacao() == SituacaoVencimento.VENCIDO) {
            antesDe = hoje;
        } else if (filtro.situacao() == SituacaoVencimento.A_VENCER) {
            de = hoje;
            ate = limiteAviso;
        } else if (filtro.situacao() == SituacaoVencimento.VIGENTE) {
            depois = limiteAviso;
        }
        return ApoliceSpecification.of(filtro.busca(), filtro.idsSeguradora(), filtro.idVeiculo(), filtro.idsBase(),
                antesDe, de, ate, depois);
    }

    private Apolice.Dados dados(ApoliceRequest r) {
        Set<UUID> fornecedores = new HashSet<>();
        fornecedores.add(r.idSeguradora());
        if (r.idCorretor() != null) fornecedores.add(r.idCorretor());
        var conhecidos = financeiro.nomesFornecedores(List.copyOf(fornecedores));
        if (!conhecidos.containsKey(r.idSeguradora())) {
            throw new InvarianteVioladaException("A seguradora informada não existe no cadastro de fornecedores do financeiro.");
        }
        if (r.idCorretor() != null && !conhecidos.containsKey(r.idCorretor())) {
            throw new InvarianteVioladaException("O corretor informado não existe no cadastro de fornecedores do financeiro.");
        }
        if (r.idBaseOperacional() != null && !referencias.baseExiste(r.idBaseOperacional())) {
            throw new InvarianteVioladaException("A base operacional informada não existe.");
        }
        if (r.idProcesso() != null && !processos.existeProcesso(r.idProcesso())) {
            throw new InvarianteVioladaException("O setor/centro de custo informado não existe.");
        }
        return new Apolice.Dados(r.numero(), r.idSeguradora(), r.idCorretor(), r.segurado(), r.idBaseOperacional(), r.idProcesso(),
                r.vigenciaInicio(), r.vigenciaFim(), r.valor(), r.franquia(), r.observacao());
    }

    private void exigirNumeroLivre(ApoliceRequest r, UUID id) {
        if (r.numero() == null || r.idSeguradora() == null) return;
        String numero = r.numero().trim();
        boolean repetido = id == null
                ? repository.existsByIdSeguradoraAndNumeroIgnoreCaseAndAtivoTrue(r.idSeguradora(), numero)
                : repository.existsByIdSeguradoraAndNumeroIgnoreCaseAndAtivoTrueAndIdNot(r.idSeguradora(), numero, id);
        if (repetido) {
            throw new InvarianteVioladaException("Já existe a apólice " + numero + " desta seguradora.");
        }
    }

    private void exigirVeiculo(UUID idVeiculo) {
        var ficha = fichas.findByIdVeiculo(idVeiculo)
                .orElseThrow(() -> new InvarianteVioladaException("Veículo não encontrado na frota."));
        if (!ficha.isAtivo()) {
            throw new InvarianteVioladaException("O veículo " + ficha.getPlaca() + " não está ativo na frota.");
        }
    }

    private AnexoApolice anexo(UUID id, UUID idAnexo) {
        return anexos.findById(idAnexo).filter(AnexoApolice::isAtivo).filter(a -> a.getIdApolice().equals(id))
                .orElseThrow(() -> new RecursoNaoEncontradoException("Anexo não encontrado nesta apólice."));
    }

    private Map<UUID, String> nomesProcessos(List<UUID> ids) {
        Map<UUID, String> nomes = new LinkedHashMap<>();
        for (UUID id : ids) {
            processos.buscarPorIdResponse(id).map(ProcessoNegocioResponse::nome).ifPresent(n -> nomes.put(id, n));
        }
        return nomes;
    }

    /** Fim da cobertura sem interrupção: emenda os períodos que começam até o dia seguinte. */
    private static LocalDate fimContinuo(List<Periodo> periodos, LocalDate fim) {
        LocalDate ate = fim;
        boolean estendeu = true;
        while (estendeu) {
            estendeu = false;
            for (Periodo p : periodos) {
                if (!p.inicio().isAfter(ate.plusDays(1)) && p.fim().isAfter(ate)) {
                    ate = p.fim();
                    estendeu = true;
                }
            }
        }
        return ate;
    }

    private record Periodo(Apolice apolice, LocalDate inicio, LocalDate fim) {
        boolean contem(LocalDate dia) {
            return !dia.isBefore(inicio) && !dia.isAfter(fim);
        }
    }

    private static String placa(com.nexo.app.modules.rh.VeiculoResponse v) {
        return v == null || v.placa() == null ? "" : v.placa();
    }
}
