package com.nexo.app.modules.execucao.application.usecases;

import com.nexo.app.modules.execucao.MetaFisicaApi;
import com.nexo.app.modules.execucao.application.dto.MetaFisicaFilter;
import com.nexo.app.modules.execucao.application.dto.MetaFisicaRequest;
import com.nexo.app.modules.execucao.application.dto.MetaFisicaResponse;
import com.nexo.app.modules.execucao.domain.MetaFisica;
import com.nexo.app.modules.execucao.domain.MetaFisicaItem;
import com.nexo.app.modules.execucao.domain.TipoServico;
import com.nexo.app.modules.execucao.infrastructure.persistence.MetaFisicaRepository;
import com.nexo.app.modules.execucao.infrastructure.persistence.MetaFisicaSpecification;
import com.nexo.app.modules.execucao.infrastructure.persistence.TipoServicoRepository;
import com.nexo.app.modules.rh.BaseOperacionalApi;
import com.nexo.app.modules.rh.BaseOperacionalResponse;
import com.nexo.app.shared.application.dto.PageResponse;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.YearMonth;
import java.time.format.TextStyle;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Cadastro da meta física da Concessionária: notas por base operacional, mês e tipo de serviço.
 *
 * <p>Uma base tem no máximo uma meta ativa por mês. Base e mês não mudam depois do
 * cadastro; para outro mês, cadastra-se outra meta (a tela oferece repetir a atual).</p>
 */
@Service
@RequiredArgsConstructor
public class MetaFisicaUseCases implements MetaFisicaApi {

    private static final Locale PT_BR = Locale.forLanguageTag("pt-BR");

    private final MetaFisicaRepository repository;
    private final TipoServicoRepository tipoServicoRepository;
    private final BaseOperacionalApi baseOperacionalApi;

    @Transactional
    public MetaFisicaResponse criar(MetaFisicaRequest request) {
        if (request.idBaseOperacional() == null) {
            throw new InvarianteVioladaException("Escolha a base operacional.");
        }
        if (request.competencia() == null) {
            throw new InvarianteVioladaException("Escolha o mês da meta.");
        }
        BaseOperacionalResponse base = baseOperacionalApi.buscarPorIdResponse(request.idBaseOperacional())
                .orElseThrow(() -> new RecursoNaoEncontradoException(
                        "Base operacional não encontrada com ID: " + request.idBaseOperacional()));
        if (!base.ativo()) {
            throw new InvarianteVioladaException("A base " + base.nome() + " está inativa.");
        }
        MetaFisica meta = new MetaFisica(request.idBaseOperacional(), request.competencia());
        definir(meta, request);
        validarUnica(meta, base.nome());
        return hidratar(repository.save(meta));
    }

    @Transactional
    public MetaFisicaResponse atualizar(UUID id, MetaFisicaRequest request) {
        MetaFisica meta = buscarEntidade(id);
        if (!meta.isAtivo()) {
            throw new InvarianteVioladaException("Reative a meta antes de editá-la.");
        }
        if (request.idBaseOperacional() != null && !request.idBaseOperacional().equals(meta.getIdBaseOperacional())) {
            throw new InvarianteVioladaException("A base da meta não muda. Para outra base, cadastre outra meta.");
        }
        if (request.competencia() != null && !request.competencia().equals(meta.getMes())) {
            throw new InvarianteVioladaException("O mês da meta não muda. Para outro mês, cadastre outra meta.");
        }
        definir(meta, request);
        return hidratar(repository.save(meta));
    }

    @Transactional
    public void desativar(UUID id) {
        MetaFisica meta = buscarEntidade(id);
        meta.desativar();
        repository.save(meta);
    }

    @Transactional
    public void ativar(UUID id) {
        MetaFisica meta = buscarEntidade(id);
        meta.ativar();
        validarUnica(meta, nomeDaBase(meta.getIdBaseOperacional()));
        repository.save(meta);
    }

    @Transactional(readOnly = true)
    public MetaFisicaResponse buscarPorId(UUID id) {
        return hidratar(buscarEntidade(id));
    }

    @Transactional(readOnly = true)
    public PageResponse<MetaFisicaResponse> listar(MetaFisicaFilter filter, Pageable pageable) {
        List<UUID> basesDaBusca = filter != null && filter.buscaGlobal() != null && !filter.buscaGlobal().isBlank()
                ? baseOperacionalApi.buscarIdsPorTrecho(filter.buscaGlobal().trim())
                : List.of();
        Page<MetaFisica> pagina = repository.findAll(MetaFisicaSpecification.filterBy(filter, basesDaBusca), pageable);
        Contexto contexto = contexto(pagina.getContent());
        return PageResponse.fromPage(pagina.map(meta -> hidratar(meta, contexto)));
    }

    // ------------------------------------------------------------ API pública

    @Override
    @Transactional(readOnly = true)
    public List<MetaFisicaPublica> listarAtivas(YearMonth de, YearMonth ate) {
        return repository.findByAtivoTrueAndCompetenciaBetween(de.atDay(1), ate.atDay(1)).stream()
                .map(meta -> new MetaFisicaPublica(meta.getId(), meta.getIdBaseOperacional(), meta.getMes(),
                        meta.getItens().stream()
                                .map(item -> new ServicoPublico(item.getIdTipoServico(), item.getQuantidade()))
                                .toList()))
                .toList();
    }

    // ------------------------------------------------------------ Regras

    private void definir(MetaFisica meta, MetaFisicaRequest request) {
        List<MetaFisica.Servico> servicos = request.servicos() == null ? List.of() : request.servicos().stream()
                .map(s -> new MetaFisica.Servico(s.idTipoServico(), s.quantidade(), s.parcialConcessionária()))
                .toList();
        validarTipos(servicos, meta);
        meta.definir(request.totalMesConcessionária(), request.parcialAte(), request.descricao(), servicos);
    }

    /** Tipos novos na meta precisam estar ativos; os que ela já tinha seguem valendo. */
    private void validarTipos(List<MetaFisica.Servico> servicos, MetaFisica meta) {
        Set<UUID> ids = servicos.stream().map(MetaFisica.Servico::idTipoServico)
                .filter(Objects::nonNull).collect(Collectors.toSet());
        Set<UUID> jaNaMeta = meta.getItens().stream().map(MetaFisicaItem::getIdTipoServico).collect(Collectors.toSet());
        Map<UUID, TipoServico> tipos = tipoServicoRepository.findAllById(ids).stream()
                .collect(Collectors.toMap(TipoServico::getId, Function.identity()));
        for (UUID id : ids) {
            TipoServico tipo = tipos.get(id);
            if (tipo == null) {
                throw new RecursoNaoEncontradoException("Tipo de serviço não encontrado com ID: " + id);
            }
            if (!tipo.isAtivo() && !jaNaMeta.contains(id)) {
                throw new InvarianteVioladaException("O tipo de serviço " + tipo.getDescricao() + " está inativo.");
            }
        }
    }

    private void validarUnica(MetaFisica meta, String nomeBase) {
        boolean conflito = repository
                .findByAtivoTrueAndIdBaseOperacionalAndCompetencia(meta.getIdBaseOperacional(), meta.getCompetencia())
                .stream()
                .anyMatch(outra -> !outra.getId().equals(meta.getId()) && meta.conflitaCom(outra));
        if (conflito) {
            throw new InvarianteVioladaException("A base " + nomeBase + " já tem meta física em "
                    + nomeDoMes(meta.getMes()) + ". Edite a meta existente.");
        }
    }

    private static String nomeDoMes(YearMonth mes) {
        return mes.getMonth().getDisplayName(TextStyle.FULL, PT_BR) + " de " + mes.getYear();
    }

    private String nomeDaBase(UUID id) {
        return baseOperacionalApi.buscarPorIdResponse(id).map(BaseOperacionalResponse::nome).orElse("selecionada");
    }

    private MetaFisica buscarEntidade(UUID id) {
        return repository.findById(id)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Meta física não encontrada com ID: " + id));
    }

    // ------------------------------------------------------------ Respostas

    private record Contexto(Map<UUID, BaseOperacionalResponse> bases, Map<UUID, TipoServico> tipos) {
    }

    private Contexto contexto(Collection<MetaFisica> metas) {
        Set<UUID> idsBases = metas.stream().map(MetaFisica::getIdBaseOperacional).collect(Collectors.toSet());
        Set<UUID> idsTipos = metas.stream().flatMap(m -> m.getItens().stream())
                .map(MetaFisicaItem::getIdTipoServico).collect(Collectors.toSet());
        Map<UUID, BaseOperacionalResponse> bases = idsBases.isEmpty() ? Map.of()
                : baseOperacionalApi.buscarPorIdsResponse(idsBases);
        Map<UUID, TipoServico> tipos = tipoServicoRepository.findAllById(idsTipos).stream()
                .collect(Collectors.toMap(TipoServico::getId, Function.identity()));
        return new Contexto(bases, tipos);
    }

    private MetaFisicaResponse hidratar(MetaFisica meta) {
        return hidratar(meta, contexto(List.of(meta)));
    }

    private MetaFisicaResponse hidratar(MetaFisica meta, Contexto contexto) {
        int diasUteis = meta.diasUteis();
        BaseOperacionalResponse base = contexto.bases().get(meta.getIdBaseOperacional());
        List<MetaFisicaResponse.Servico> servicos = meta.getItens().stream()
                .map(item -> {
                    TipoServico tipo = contexto.tipos().get(item.getIdTipoServico());
                    return new MetaFisicaResponse.Servico(
                            item.getIdTipoServico(),
                            tipo != null ? tipo.getCodigo() : null,
                            tipo != null ? tipo.getDescricao() : null,
                            item.getQuantidade(),
                            item.getParcialConcessionária(),
                            porDia(item.getQuantidade(), diasUteis));
                })
                .sorted(Comparator.comparingInt(MetaFisicaResponse.Servico::quantidade).reversed()
                        .thenComparing(s -> s.tipoServico() == null ? "" : s.tipoServico()))
                .toList();
        int total = meta.total();
        return new MetaFisicaResponse(
                meta.getId(),
                meta.getIdBaseOperacional(),
                base != null ? base.nome() : null,
                meta.getMes(),
                total,
                meta.getTotalMesConcessionária(),
                meta.getParcialAte(),
                meta.getDescricao(),
                diasUteis,
                porDia(total, diasUteis),
                servicos,
                meta.isAtivo(),
                meta.getDataCriacao(),
                meta.getUsuarioCriacao(),
                meta.getDataUltimaAlteracao(),
                meta.getUsuarioUltimaAlteracao());
    }

    private static BigDecimal porDia(int quantidade, int diasUteis) {
        return diasUteis <= 0 ? null
                : BigDecimal.valueOf(quantidade).divide(BigDecimal.valueOf(diasUteis), 1, RoundingMode.HALF_UP);
    }
}
