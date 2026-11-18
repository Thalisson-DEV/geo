package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.estoque.EstoqueFrotaApi;
import com.nexo.app.modules.frota.domain.OrigemPeca;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import java.time.OffsetDateTime;
import com.nexo.app.modules.frota.application.dto.AjustesOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.MecanicoParaTodosRequest;
import com.nexo.app.modules.frota.application.dto.OrdemServicoDetalheResponse;
import com.nexo.app.modules.frota.application.dto.PecaOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.ServicoOrdemServicoRequest;
import com.nexo.app.modules.frota.domain.ItemManutencao;
import com.nexo.app.modules.frota.domain.OrdemServico;
import com.nexo.app.modules.frota.domain.PecaOrdemServico;
import com.nexo.app.modules.frota.domain.ServicoOrdemServico;
import com.nexo.app.modules.frota.domain.TipoEventoOrdemServico;
import com.nexo.app.modules.frota.infrastructure.persistence.OrdemServicoRepository;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.infrastructure.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.text.NumberFormat;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Execução da OS: mão de obra com mecânico e peças com origem. Cada alteração entra no
 * histórico da OS e devolve a ficha atualizada.
 */
@Service
@RequiredArgsConstructor
public class ExecucaoOrdemServicoUseCases {

    private static final Locale PT_BR = Locale.of("pt", "BR");

    private final OrdemServicoRepository repository;
    private final OrdemServicoUseCases ordens;
    private final ItemManutencaoUseCases itens;
    private final ReferenciasFrota referencias;
    private final MontadorOrdemServico montador;
    private final EstoqueFrotaApi estoqueFrota;

    @Transactional
    public OrdemServicoDetalheResponse lancarServico(UUID idOs, ServicoOrdemServicoRequest request) {
        OrdemServico os = ordens.buscarEntidade(idOs);
        ServicoOrdemServico servico = os.lancarServico(dadosServico(request));
        os.definirSemCusto(servico, Boolean.TRUE.equals(request.semCusto()));
        return salvar(os, "Serviço incluído: " + descrever(servico));
    }

    @Transactional
    public OrdemServicoDetalheResponse alterarServico(UUID idOs, UUID idServico, ServicoOrdemServicoRequest request) {
        OrdemServico os = ordens.buscarEntidade(idOs);
        ServicoOrdemServico servico = os.alterarServico(idServico, dadosServico(request));
        os.definirSemCusto(servico, Boolean.TRUE.equals(request.semCusto()));
        return salvar(os, "Serviço alterado: " + descrever(servico));
    }

    @Transactional
    public OrdemServicoDetalheResponse excluirServico(UUID idOs, UUID idServico) {
        OrdemServico os = ordens.buscarEntidade(idOs);
        ServicoOrdemServico servico = os.excluirServico(idServico);
        return salvar(os, "Serviço excluído: " + descrever(servico));
    }

    @Transactional
    public OrdemServicoDetalheResponse definirMecanicoParaTodos(UUID idOs, MecanicoParaTodosRequest request) {
        OrdemServico os = ordens.buscarEntidade(idOs);
        exigirMecanicoAtivo(request.idMecanico());
        os.definirMecanicoParaTodos(request.idMecanico(), request.mecanicoNome());
        String mecanico = request.idMecanico() != null
                ? referencias.nomesColaboradores(List.of(request.idMecanico())).get(request.idMecanico())
                : request.mecanicoNome().trim();
        return salvar(os, "Mesmo mecânico para todos os serviços: " + mecanico + ".");
    }

    /** Com a peça do catálogo da frota, dá baixa no almoxarifado pelo custo médio. */
    @Transactional
    public OrdemServicoDetalheResponse lancarPeca(UUID idOs, PecaOrdemServicoRequest request) {
        OrdemServico os = ordens.buscarEntidade(idOs);
        if (request.idMaterial() == null) {
            PecaOrdemServico peca = os.lancarPeca(dadosPeca(request));
            os.vincularPecaAoItem(peca, request.idItemManutencao());
            os.definirSemCusto(peca, Boolean.TRUE.equals(request.semCusto()));
            return salvar(os, "Peça incluída: " + descrever(peca));
        }
        var saida = baixar(os, request);
        PecaOrdemServico peca = os.lancarPecaDoEstoque(dadosDoEstoque(request, saida), request.idMaterial(), request.idEstoque(), saida.id());
        os.definirSemCusto(peca, Boolean.TRUE.equals(request.semCusto()));
        return salvar(os, "Peça incluída do " + saida.estoqueOrigem() + ": " + descrever(peca));
    }

    /**
     * A peça que saiu do estoque volta ao almoxarifado antes da alteração; se continuar vindo do
     * estoque, sai de novo com a quantidade nova.
     */
    @Transactional
    public OrdemServicoDetalheResponse alterarPeca(UUID idOs, UUID idPeca, PecaOrdemServicoRequest request) {
        OrdemServico os = ordens.buscarEntidade(idOs);
        PecaOrdemServico atual = buscarPeca(os, idPeca);
        String devolvida = estornar(os, atual);
        if (request.idMaterial() == null) {
            os.vincularPecaAoEstoque(idPeca, null, null, null);
            PecaOrdemServico peca = os.alterarPeca(idPeca, dadosPeca(request));
            os.vincularPecaAoItem(idPeca, request.idItemManutencao());
            os.definirSemCusto(peca, Boolean.TRUE.equals(request.semCusto()));
            return salvar(os, "Peça alterada: " + descrever(peca) + devolvida);
        }
        var saida = baixar(os, request);
        PecaOrdemServico peca = os.alterarPeca(idPeca, dadosDoEstoque(request, saida));
        os.vincularPecaAoEstoque(idPeca, request.idMaterial(), request.idEstoque(), saida.id());
        os.definirSemCusto(peca, Boolean.TRUE.equals(request.semCusto()));
        return salvar(os, "Peça alterada (saída do " + saida.estoqueOrigem() + "): " + descrever(peca) + devolvida);
    }

    @Transactional
    public OrdemServicoDetalheResponse excluirPeca(UUID idOs, UUID idPeca) {
        OrdemServico os = ordens.buscarEntidade(idOs);
        String devolvida = estornar(os, buscarPeca(os, idPeca));
        PecaOrdemServico peca = os.excluirPeca(idPeca);
        return salvar(os, "Peça excluída: " + descrever(peca) + devolvida);
    }

    private EstoqueFrotaApi.Movimento baixar(OrdemServico os, PecaOrdemServicoRequest request) {
        if (request.origem() != OrigemPeca.ESTOQUE) {
            throw new InvarianteVioladaException("A peça do almoxarifado tem origem estoque.");
        }
        if (request.idEstoque() == null) {
            throw new InvarianteVioladaException("Escolha o almoxarifado de onde sai a peça.");
        }
        os.exigirPodeLancar();
        var contexto = new EstoqueFrotaApi.Contexto(EstoqueFrotaApi.Motivo.ORDEM_SERVICO, null, "OS " + os.getNumero(),
                os.getIdVeiculo(), null, os.getId());
        return estoqueFrota.saida(request.idEstoque(), List.of(new EstoqueFrotaApi.ItemSaida(request.idMaterial(), request.quantidade())),
                contexto, SecurityUtils.getUsuarioLogadoId(), OffsetDateTime.now()).get(0);
    }

    /** Devolve ao almoxarifado a saída da peça, se houver; o texto vai para o histórico da OS. */
    private String estornar(OrdemServico os, PecaOrdemServico peca) {
        if (!peca.isBaixadaNoEstoque()) {
            return "";
        }
        os.exigirPodeLancar();
        var estorno = estoqueFrota.estornarSaida(peca.getIdMovimentacaoEstoque(), "Peça retirada da OS " + os.getNumero() + ".",
                SecurityUtils.getUsuarioLogadoId(), OffsetDateTime.now());
        return " Devolvida ao " + estorno.estoqueDestino() + ".";
    }

    private static OrdemServico.DadosPeca dadosDoEstoque(PecaOrdemServicoRequest request, EstoqueFrotaApi.Movimento saida) {
        return new OrdemServico.DadosPeca(saida.descricao(), saida.codigo(), OrigemPeca.ESTOQUE, request.quantidade(),
                saida.unidade(), saida.valorUnitario() == null ? BigDecimal.ZERO : saida.valorUnitario());
    }

    private static PecaOrdemServico buscarPeca(OrdemServico os, UUID idPeca) {
        return os.getPecas().stream().filter(p -> idPeca.equals(p.getId())).findFirst()
                .orElseThrow(() -> new RecursoNaoEncontradoException("Peça não encontrada na OS."));
    }

    @Transactional
    public OrdemServicoDetalheResponse definirAjustes(UUID idOs, AjustesOrdemServicoRequest request) {
        OrdemServico os = ordens.buscarEntidade(idOs);
        os.definirAjustes(request.desconto(), request.acrescimo());
        return salvar(os, "Ajustes: desconto de " + moeda(os.getDesconto()) + " e acréscimo de "
                + moeda(os.getAcrescimo()) + ".");
    }

    private OrdemServicoDetalheResponse salvar(OrdemServico os, String historico) {
        UUID usuario = SecurityUtils.getUsuarioLogadoId();
        os.atualizarValorPelaExecucao();
        boolean finalizada = os.finalizarSeCompleta(usuario);
        OrdemServico salva = repository.saveAndFlush(os);
        ordens.registrar(salva, TipoEventoOrdemServico.EXECUCAO_ALTERADA, historico, usuario);
        ordens.registrarFinalizacao(salva, finalizada, usuario);
        return montador.detalhar(salva, List.of());
    }

    private OrdemServico.DadosServico dadosServico(ServicoOrdemServicoRequest request) {
        exigirMecanicoAtivo(request.idMecanico());
        ItemManutencao item = request.idItemManutencao() == null ? null : itens.buscarEntidade(request.idItemManutencao());
        return new OrdemServico.DadosServico(request.descricao(), item, request.idMecanico(), request.mecanicoNome(),
                request.quantidade(), request.valorUnitario());
    }

    private static OrdemServico.DadosPeca dadosPeca(PecaOrdemServicoRequest request) {
        if (request.valorUnitario() == null) {
            throw new InvarianteVioladaException("Informe o valor unitário.");
        }
        return new OrdemServico.DadosPeca(request.descricao(), request.codigo(), request.origem(), request.quantidade(),
                request.unidade(), request.valorUnitario());
    }

    private void exigirMecanicoAtivo(UUID idMecanico) {
        if (idMecanico != null && !referencias.colaboradorAtivo(idMecanico)) {
            throw new InvarianteVioladaException("Mecânico não encontrado ou desativado no cadastro de colaboradores.");
        }
    }

    private static String descrever(ServicoOrdemServico s) {
        return s.getDescricao() + " — " + numero(s.getQuantidade()) + " × " + moeda(s.getValorUnitario())
                + " = " + moeda(s.getSubtotal()) + ".";
    }

    private static String descrever(PecaOrdemServico p) {
        return p.getDescricao() + " (" + p.getOrigem().getRotulo().toLowerCase(PT_BR) + ") — " + numero(p.getQuantidade())
                + " " + p.getUnidade() + " × " + moeda(p.getValorUnitario()) + " = " + moeda(p.getSubtotal()) + ".";
    }

    private static String numero(BigDecimal valor) {
        var formato = NumberFormat.getNumberInstance(PT_BR);
        formato.setMaximumFractionDigits(3);
        return formato.format(valor);
    }

    private static String moeda(BigDecimal valor) {
        var formato = NumberFormat.getCurrencyInstance(PT_BR);
        formato.setMaximumFractionDigits(valor.stripTrailingZeros().scale() > 2 ? 4 : 2);
        return formato.format(valor).replace(' ', ' ');
    }
}
