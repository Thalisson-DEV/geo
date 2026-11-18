package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.domain.AcoplamentoImplemento;
import com.nexo.app.modules.frota.domain.ControlePreventivo;
import com.nexo.app.modules.frota.domain.FichaVeiculo;
import com.nexo.app.modules.frota.domain.OrigemBasePreventiva;
import com.nexo.app.modules.frota.domain.PlanoPreventivo;
import com.nexo.app.modules.frota.domain.SituacaoOperacional;
import com.nexo.app.modules.frota.infrastructure.persistence.AcoplamentoImplementoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.ControlePreventivoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.FichaVeiculoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.OrdemServicoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.PlanoPreventivoRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Mantém um controle para cada par veículo × plano que vale para ele: cria o que falta,
 * reativa o que voltou a valer, desativa o que deixou de valer e recomeça o ciclo quando a
 * unidade do veículo muda.
 *
 * <p>Um controle novo começa pela última OS preventiva concluída do veículo com algum item
 * do plano; sem ela, pelo dia de hoje e a medição atual ("Sem histórico").</p>
 */
@Component
@RequiredArgsConstructor
public class SincronizacaoPreventiva {

    private final PlanoPreventivoRepository planos;
    private final ControlePreventivoRepository controles;
    private final FichaVeiculoRepository fichas;
    private final AcoplamentoImplementoRepository acoplamentos;
    private final OrdemServicoRepository ordens;
    private final OdometroUseCases odometro;

    /**
     * @param idsVeiculo veículos a sincronizar; nulo sincroniza a frota inteira
     * @return quantos controles mudaram
     */
    @Transactional(propagation = Propagation.REQUIRED)
    public int sincronizar(Collection<UUID> idsVeiculo) {
        var hoje = LocalDate.now(LiberacaoCnhUseCases.FUSO);
        List<FichaVeiculo> fichasAlvo = idsVeiculo == null ? fichas.findAll() : fichas.findAllByIdVeiculoIn(idsVeiculo);
        List<ControlePreventivo> existentes = idsVeiculo == null ? controles.findAll() : controles.findAllByIdVeiculoIn(idsVeiculo);
        List<PlanoPreventivo> ativos = planos.findAllByAtivoTrue();

        var validas = fichasAlvo.stream()
                .filter(f -> f.isAtivo() && f.getSituacao() != SituacaoOperacional.BAIXADO)
                .collect(Collectors.toMap(FichaVeiculo::getIdVeiculo, Function.identity()));
        Map<UUID, Set<UUID>> implementos = validas.isEmpty() ? Map.of()
                : acoplamentos.findAllByIdVeiculoInAndFimIsNullAndAtivoTrue(validas.keySet()).stream()
                .collect(Collectors.groupingBy(AcoplamentoImplemento::getIdVeiculo,
                        Collectors.mapping(a -> a.getImplemento().getTipoImplemento().getId(), Collectors.toSet())));
        var medicoes = odometro.medicoesAtuais(validas.keySet());

        Map<String, ControlePreventivo> porChave = new HashMap<>();
        existentes.forEach(c -> porChave.put(chave(c.getIdVeiculo(), c.getPlano().getId()), c));

        var devidos = new HashSet<String>();
        var novos = new ArrayList<ControlePreventivo>();
        var alterados = new ArrayList<ControlePreventivo>();
        var semControle = new ArrayList<Par>();
        for (FichaVeiculo ficha : validas.values()) {
            UUID tipo = ficha.getTipoVeiculo() == null ? null : ficha.getTipoVeiculo().getId();
            var tiposImplemento = implementos.getOrDefault(ficha.getIdVeiculo(), Set.of());
            var medicao = medicoes.get(ficha.getIdVeiculo());
            Long atual = medicao != null && medicao.unidade() == ficha.getUnidadeMedicao() ? medicao.acumulado() : null;
            for (PlanoPreventivo plano : ativos) {
                if (!plano.aplicaA(ficha.getIdVeiculo(), tipo, tiposImplemento) || !plano.mede(ficha.getUnidadeMedicao())) continue;
                String chave = chave(ficha.getIdVeiculo(), plano.getId());
                devidos.add(chave);
                ControlePreventivo controle = porChave.get(chave);
                if (controle == null) {
                    semControle.add(new Par(ficha, plano, atual));
                    continue;
                }
                boolean mudou = false;
                if (!controle.isAtivo()) {
                    controle.ativar();
                    mudou = true;
                }
                if (controle.getBaseUnidade() != ficha.getUnidadeMedicao()) {
                    controle.definirBase(hoje, atual, ficha.getUnidadeMedicao(), OrigemBasePreventiva.INICIO);
                    mudou = true;
                } else if (controle.completarMedicaoInicial(atual, ficha.getUnidadeMedicao())) {
                    mudou = true;
                }
                if (mudou) alterados.add(controle);
            }
        }
        for (ControlePreventivo controle : existentes) {
            if (controle.isAtivo() && !devidos.contains(chave(controle.getIdVeiculo(), controle.getPlano().getId()))) {
                controle.desativar();
                alterados.add(controle);
            }
        }
        novos.addAll(criar(semControle, hoje));
        controles.saveAll(alterados);
        controles.saveAll(novos);
        return alterados.size() + novos.size();
    }

    /** Base pela OS preventiva concluída mais recente com algum item do plano; senão, hoje. */
    private List<ControlePreventivo> criar(List<Par> pares, LocalDate hoje) {
        if (pares.isEmpty()) return List.of();
        var idsVeiculo = pares.stream().map(p -> p.ficha().getIdVeiculo()).collect(Collectors.toSet());
        Map<UUID, List<OrdemServicoRepository.PreventivaConcluidaProjection>> concluidas = ordens.buscarPreventivasConcluidas(idsVeiculo)
                .stream().collect(Collectors.groupingBy(OrdemServicoRepository.PreventivaConcluidaProjection::getIdVeiculo));
        var criados = new ArrayList<ControlePreventivo>();
        for (Par par : pares) {
            FichaVeiculo ficha = par.ficha();
            var itensPlano = par.plano().getItens().stream().map(i -> i.getId()).collect(Collectors.toSet());
            var anterior = concluidas.getOrDefault(ficha.getIdVeiculo(), List.of()).stream()
                    .filter(o -> itensPlano.contains(o.getIdItem()) && o.getFimReal() != null
                            && o.getUnidade() == ficha.getUnidadeMedicao()
                            // Plano por uso precisa da medição da OS para contar o próximo ciclo.
                            && (par.plano().intervalo(ficha.getUnidadeMedicao()) == null
                                || o.getKmEncerramento() != null || o.getKmAbertura() != null))
                    .max(Comparator.comparing(OrdemServicoRepository.PreventivaConcluidaProjection::getFimReal))
                    .orElse(null);
            if (anterior == null) {
                criados.add(ControlePreventivo.iniciar(ficha.getIdVeiculo(), par.plano(), hoje, par.medicaoAtual(),
                        ficha.getUnidadeMedicao(), OrigemBasePreventiva.INICIO));
                continue;
            }
            Long km = anterior.getKmEncerramento() != null ? anterior.getKmEncerramento() : anterior.getKmAbertura();
            Long medicao = km == null ? null : odometro.acumuladoEm(ficha.getIdVeiculo(), km, anterior.getFimReal());
            criados.add(ControlePreventivo.iniciar(ficha.getIdVeiculo(), par.plano(),
                    anterior.getFimReal().atZoneSameInstant(LiberacaoCnhUseCases.FUSO).toLocalDate(), medicao,
                    ficha.getUnidadeMedicao(), OrigemBasePreventiva.ORDEM_SERVICO));
        }
        return criados;
    }

    private static String chave(UUID idVeiculo, UUID idPlano) {
        return idVeiculo + "/" + idPlano;
    }

    private record Par(FichaVeiculo ficha, PlanoPreventivo plano, Long medicaoAtual) {
    }
}
