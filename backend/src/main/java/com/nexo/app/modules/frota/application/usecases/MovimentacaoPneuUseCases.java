package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.estoque.EstoqueFrotaApi;
import com.nexo.app.modules.financeiro.FinanceiroApi;
import com.nexo.app.modules.frota.FrotaOdometroApi;
import com.nexo.app.modules.frota.application.dto.DiagramaPneusRequest;
import com.nexo.app.modules.frota.application.dto.MovimentacaoPneusRequest;
import com.nexo.app.modules.frota.application.dto.MovimentacaoPneusRequest.Destino;
import com.nexo.app.modules.frota.application.dto.MovimentacaoPneusRequest.TipoDestino;
import com.nexo.app.modules.frota.application.dto.PneuResponse;
import com.nexo.app.modules.frota.application.dto.VeiculoPneusResponse;
import com.nexo.app.modules.frota.domain.DiagramaPneus;
import com.nexo.app.modules.frota.domain.EventoPneu;
import com.nexo.app.modules.frota.domain.FichaVeiculo;
import com.nexo.app.modules.frota.domain.Pneu;
import com.nexo.app.modules.frota.domain.SituacaoPneu;
import com.nexo.app.modules.frota.domain.TipoEventoPneu;
import com.nexo.app.modules.frota.infrastructure.persistence.EventoPneuRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.FichaVeiculoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.InspecaoPneuRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.PneuRepository;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.infrastructure.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Pneus no veículo: diagrama, o pneu de cada posição e a movimentação em lote (montar, rodízio,
 * desmontar para o almoxarifado, reparo, reforma ou descarte), gravada de uma vez.
 */
@Service
@RequiredArgsConstructor
public class MovimentacaoPneuUseCases {

    private final FichaVeiculoRepository fichas;
    private final PneuRepository pneus;
    private final EventoPneuRepository eventos;
    private final InspecaoPneuRepository inspecoes;
    private final MontadorPneu montador;
    private final FrotaOdometroApi odometro;
    private final EstoqueFrotaApi estoque;
    private final FinanceiroApi financeiro;

    @Transactional(readOnly = true)
    public VeiculoPneusResponse veiculo(UUID idVeiculo) {
        var ficha = ficha(idVeiculo);
        var montados = montador.montar(pneus.findAllByIdVeiculoAndAtivoTrue(idVeiculo));
        Map<String, PneuResponse> porPosicao = montados.stream().collect(Collectors.toMap(PneuResponse::posicao, Function.identity(), (a, b) -> a));
        var diagrama = ficha.diagrama();
        List<VeiculoPneusResponse.Posicao> posicoes = new ArrayList<>();
        if (diagrama != null) {
            diagrama.posicoes().forEach(p -> posicoes.add(new VeiculoPneusResponse.Posicao(p.codigo(), p.eixo(), p.rotulo(), p.estepe(),
                    porPosicao.remove(p.codigo()))));
        }
        // Pneu numa posição que o diagrama não tem mais (não deveria acontecer): aparece mesmo assim.
        porPosicao.forEach((codigo, pneu) -> posicoes.add(new VeiculoPneusResponse.Posicao(codigo, 0, DiagramaPneus.rotulo(codigo), false, pneu)));
        var medicao = odometro.medicaoAtual(idVeiculo);
        var ultima = inspecoes.findFirstByIdVeiculoAndAtivoTrueOrderByRealizadaEmDesc(idVeiculo);
        return new VeiculoPneusResponse(idVeiculo, ficha.getPlaca(), ficha.getTipoVeiculo() == null ? null : ficha.getTipoVeiculo().getNome(),
                diagrama == null ? null : diagrama.texto(), diagrama == null ? ficha.getEstepes() : diagrama.estepes(),
                medicao.map(FrotaOdometroApi.Medicao::valor).orElse(null),
                medicao.map(FrotaOdometroApi.Medicao::unidade).orElse(FrotaOdometroApi.Unidade.KM),
                montador.sulcoMinimo(), ultima.map(i -> i.getRealizadaEm()).orElse(null), posicoes);
    }

    @Transactional
    public VeiculoPneusResponse definirDiagrama(UUID idVeiculo, DiagramaPneusRequest request) {
        var ficha = ficha(idVeiculo);
        var ocupadas = pneus.findAllByIdVeiculoAndAtivoTrue(idVeiculo).stream().map(Pneu::getPosicao).toList();
        ficha.definirDiagrama(request.eixos(), request.estepes(), ocupadas);
        fichas.save(ficha);
        return veiculo(idVeiculo);
    }

    /**
     * Aplica o destino de cada pneu de uma vez. Primeiro tira do veículo todo pneu que muda de
     * lugar (somando o km rodado), depois monta nas posições novas: assim o rodízio entre duas
     * posições não esbarra na regra de uma roda por posição.
     */
    @Transactional
    public VeiculoPneusResponse movimentar(MovimentacaoPneusRequest request) {
        var ficha = ficha(request.idVeiculo());
        var agora = OffsetDateTime.now();
        var quando = request.realizadaEm() == null ? agora : request.realizadaEm();
        if (quando.isAfter(agora.plusMinutes(10))) {
            throw new InvarianteVioladaException("A data da movimentação não pode ser no futuro.");
        }
        Map<UUID, Destino> destinos = new LinkedHashMap<>();
        for (var d : request.destinos()) {
            if (destinos.put(d.idPneu(), d) != null) {
                throw new InvarianteVioladaException("O mesmo pneu aparece duas vezes na movimentação.");
            }
        }
        var lista = pneus.findAllWithLockByIdIn(destinos.keySet());
        if (lista.size() != destinos.size() || lista.stream().anyMatch(p -> !p.isAtivo())) {
            throw new InvarianteVioladaException("Algum pneu da movimentação não foi encontrado. Atualize a tela.");
        }
        Map<UUID, Pneu> porId = lista.stream().collect(Collectors.toMap(Pneu::getId, Function.identity()));
        validar(ficha, destinos, porId);

        Km km = km(ficha.getIdVeiculo(), request.km());
        UUID lote = UUID.randomUUID();
        registrarLeitura(ficha.getIdVeiculo(), request.km(), quando, lote);
        List<EventoPneu> novos = new ArrayList<>();

        // 1. Tira do veículo quem sai da posição atual.
        Map<UUID, String> origem = new HashMap<>();
        Map<UUID, Integer> rodado = new HashMap<>();
        for (var d : destinos.values()) {
            var pneu = porId.get(d.idPneu());
            boolean noVeiculo = pneu.getSituacao() == SituacaoPneu.EM_USO;
            boolean mesmaPosicao = d.destino() == TipoDestino.POSICAO && d.posicao().equalsIgnoreCase(Objects.toString(pneu.getPosicao(), ""));
            if (noVeiculo && !mesmaPosicao) {
                origem.put(pneu.getId(), pneu.getPosicao());
                rodado.put(pneu.getId(), pneu.desmontar(km.acumulado()));
            }
        }
        pneus.saveAllAndFlush(lista);

        // 2. Leva cada pneu ao destino.
        for (var d : destinos.values()) {
            var pneu = porId.get(d.idPneu());
            String de = origem.get(pneu.getId());
            Integer km1 = rodado.get(pneu.getId());
            switch (d.destino()) {
                case POSICAO -> {
                    if (pneu.getSituacao() == SituacaoPneu.EM_USO) {
                        continue; // já estava nessa posição
                    }
                    pneu.montar(ficha, d.posicao(), km.acumulado(), quando);
                    String para = pneu.getPosicao();
                    var tipo = de == null ? TipoEventoPneu.MONTAGEM : TipoEventoPneu.RODIZIO;
                    String texto = de == null ? "Montado no " + ficha.getPlaca() + ", " + rotulo(para) + "."
                            : "Rodízio no " + ficha.getPlaca() + ": " + rotulo(de) + " → " + rotulo(para) + ".";
                    novos.add(EventoPneu.de(pneu, tipo, quando, texto)
                            .comVeiculo(ficha.getIdVeiculo(), ficha.getPlaca(), de, para, km.painel()).comKmRodado(km1));
                }
                case ESTOQUE -> {
                    var almoxarifado = estoque.almoxarifado(d.idEstoque());
                    pneu.guardar(d.idEstoque());
                    novos.add(desmontagem(pneu, ficha, de, km, km1, quando, TipoEventoPneu.DESMONTAGEM,
                            de == null ? "Guardado no " + almoxarifado.nome() + "."
                                    : "Desmontado do " + ficha.getPlaca() + " (" + rotulo(de) + ") e guardado no " + almoxarifado.nome() + "."));
                }
                case REPARO -> {
                    exigirFornecedor(d.idFornecedor());
                    pneu.enviarReparo(d.idFornecedor(), quando);
                    novos.add(desmontagem(pneu, ficha, de, km, km1, quando, TipoEventoPneu.ENVIO_REPARO,
                            de == null ? "Enviado para reparo." : "Desmontado do " + ficha.getPlaca() + " (" + rotulo(de) + ") e enviado para reparo.")
                            .comCusto(null, d.idFornecedor(), null));
                }
                case REFORMA -> {
                    exigirFornecedor(d.idFornecedor());
                    pneu.enviarReforma(d.idFornecedor(), quando);
                    novos.add(desmontagem(pneu, ficha, de, km, km1, quando, TipoEventoPneu.ENVIO_REFORMA,
                            de == null ? "Enviado para reforma." : "Desmontado do " + ficha.getPlaca() + " (" + rotulo(de) + ") e enviado para reforma.")
                            .comCusto(null, d.idFornecedor(), null));
                }
                case DESCARTE -> {
                    pneu.descartar(d.motivo(), quando);
                    novos.add(desmontagem(pneu, ficha, de, km, km1, quando, TipoEventoPneu.DESCARTE,
                            (de == null ? "" : "Desmontado do " + ficha.getPlaca() + " (" + rotulo(de) + "). ") + "Descartado: " + d.motivo().trim()));
                }
            }
        }
        pneus.saveAllAndFlush(lista);
        novos.forEach(e -> e.noLote(lote, request.observacao()));
        eventos.saveAll(novos);
        return veiculo(ficha.getIdVeiculo());
    }

    private void validar(FichaVeiculo ficha, Map<UUID, Destino> destinos, Map<UUID, Pneu> porId) {
        var diagrama = ficha.diagrama();
        Set<String> alvos = new HashSet<>();
        for (var d : destinos.values()) {
            var pneu = porId.get(d.idPneu());
            if (pneu.getSituacao() == SituacaoPneu.EM_USO && !ficha.getIdVeiculo().equals(pneu.getIdVeiculo())) {
                throw new InvarianteVioladaException("O pneu " + pneu.getMarcaFogo() + " está montado no " + pneu.getPlaca()
                        + ". Desmonte de lá antes.");
            }
            if (pneu.getSituacao() != SituacaoPneu.EM_USO && pneu.getSituacao() != SituacaoPneu.DISPONIVEL) {
                throw new InvarianteVioladaException("O pneu " + pneu.getMarcaFogo() + " está " + pneu.getSituacao().getRotulo().toLowerCase()
                        + ". Registre o retorno antes de movimentar.");
            }
            switch (d.destino()) {
                case POSICAO -> {
                    if (diagrama == null) {
                        throw new InvarianteVioladaException("Defina o diagrama de pneus do " + ficha.getPlaca() + " antes de montar.");
                    }
                    if (d.posicao() == null || !diagrama.contem(d.posicao())) {
                        throw new InvarianteVioladaException("A posição " + Objects.toString(d.posicao(), "") + " não existe no diagrama do "
                                + ficha.getPlaca() + ".");
                    }
                    if (!alvos.add(d.posicao().toUpperCase())) {
                        throw new InvarianteVioladaException("Dois pneus foram para " + rotulo(d.posicao().toUpperCase()) + ".");
                    }
                }
                case ESTOQUE -> {
                    if (d.idEstoque() == null) {
                        throw new InvarianteVioladaException("Escolha o almoxarifado que recebe o pneu " + pneu.getMarcaFogo() + ".");
                    }
                }
                case DESCARTE -> {
                    if (d.motivo() == null || d.motivo().isBlank()) {
                        throw new InvarianteVioladaException("Informe o motivo do descarte do pneu " + pneu.getMarcaFogo() + ".");
                    }
                }
                default -> {
                }
            }
        }
        // Posição de destino ocupada por um pneu que não sai dela nesta movimentação.
        for (var montado : pneus.findAllByIdVeiculoAndAtivoTrue(ficha.getIdVeiculo())) {
            if (alvos.contains(montado.getPosicao().toUpperCase()) && !destinos.containsKey(montado.getId())) {
                throw new InvarianteVioladaException(rotulo(montado.getPosicao()) + " já tem o pneu " + montado.getMarcaFogo()
                        + ". Tire esse pneu da posição na mesma movimentação.");
            }
        }
    }

    private EventoPneu desmontagem(Pneu pneu, FichaVeiculo ficha, String de, Km km, Integer rodado, OffsetDateTime quando,
                                   TipoEventoPneu tipo, String texto) {
        var evento = EventoPneu.de(pneu, tipo, quando, texto);
        return de == null ? evento : evento.comVeiculo(ficha.getIdVeiculo(), ficha.getPlaca(), de, null, km.painel()).comKmRodado(rodado);
    }

    /**
     * @param painel    o que o painel mostra (vai para o histórico)
     * @param acumulado o painel mais as trocas de painel (base do km rodado do pneu)
     */
    private record Km(Long painel, long acumulado) {
    }

    private Km km(UUID idVeiculo, Long informado) {
        var medicao = odometro.medicaoAtual(idVeiculo);
        if (informado == null) {
            return medicao.map(m -> new Km(m.valor(), m.acumulado())).orElse(new Km(null, 0));
        }
        long deslocamento = medicao.map(m -> m.acumulado() - m.valor()).orElse(0L);
        return new Km(informado, informado + deslocamento);
    }

    /** km maior que o do painel entra no livro-razão, para o próximo lançamento partir dele. */
    private void registrarLeitura(UUID idVeiculo, Long km, OffsetDateTime quando, UUID idOrigem) {
        if (km != null && km > odometro.kmAtual(idVeiculo).orElse(-1L)) {
            odometro.registrarLeitura(idVeiculo, km, quando, FrotaOdometroApi.OrigemLeitura.MANUTENCAO, idOrigem, SecurityUtils.getUsuarioLogadoId());
        }
    }

    private void exigirFornecedor(UUID idFornecedor) {
        if (idFornecedor != null && !financeiro.nomesFornecedores(List.of(idFornecedor)).containsKey(idFornecedor)) {
            throw new InvarianteVioladaException("Fornecedor não encontrado no financeiro.");
        }
    }

    private FichaVeiculo ficha(UUID idVeiculo) {
        return fichas.findByIdVeiculo(idVeiculo).filter(FichaVeiculo::isAtivo)
                .orElseThrow(() -> new InvarianteVioladaException("Veículo não encontrado na frota."));
    }

    private static String rotulo(String codigo) {
        String texto = DiagramaPneus.rotulo(codigo);
        return Character.toLowerCase(texto.charAt(0)) + texto.substring(1);
    }
}
