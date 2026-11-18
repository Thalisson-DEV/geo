package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.application.dto.AptidaoConducaoResponse;
import com.nexo.app.modules.frota.application.dto.LiberacaoCnhRequest;
import com.nexo.app.modules.frota.application.dto.LiberacaoCnhResponse;
import com.nexo.app.modules.frota.domain.AptidaoConducao;
import com.nexo.app.modules.frota.domain.FichaVeiculo;
import com.nexo.app.modules.frota.domain.LiberacaoCnh;
import com.nexo.app.modules.frota.infrastructure.persistence.FichaVeiculoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.LiberacaoCnhRepository;
import com.nexo.app.shared.application.dto.PageResponse;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.infrastructure.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

/** Situação da CNH para conduzir e liberação do gestor (vale para o condutor, o veículo e o dia). */
@Service
@RequiredArgsConstructor
public class LiberacaoCnhUseCases {

    static final ZoneId FUSO = ZoneId.of("America/Sao_Paulo");

    private final LiberacaoCnhRepository repository;
    private final VinculoCondutorUseCases vinculos;
    private final FichaVeiculoRepository fichas;
    private final ReferenciasFrota referencias;

    @Transactional(readOnly = true)
    public AptidaoConducaoResponse aptidao(UUID idColaborador, UUID idVeiculo, LocalDate dia) {
        var data = dia == null ? LocalDate.now(FUSO) : dia;
        var aptidao = vinculos.aptidao(idColaborador, idVeiculo, data);
        var liberacao = aptidao.isApto() ? Optional.<LiberacaoCnh>empty() : liberacao(idColaborador, idVeiculo, data);
        return new AptidaoConducaoResponse(aptidao.situacao(), aptidao.mensagem(), aptidao.validade(),
                aptidao.exigida() == null ? null : aptidao.exigida().name(),
                aptidao.atual() == null ? null : aptidao.atual().name(),
                liberacao.map(LiberacaoCnh::getId).orElse(null));
    }

    @Transactional
    public LiberacaoCnhResponse liberar(LiberacaoCnhRequest request) {
        var hoje = LocalDate.now(FUSO);
        var dia = request.dia() == null ? hoje : request.dia();
        if (!referencias.colaboradorAtivo(request.idCondutor())) {
            throw new InvarianteVioladaException("Condutor não encontrado ou desligado.");
        }
        if (liberacao(request.idCondutor(), request.idVeiculo(), dia).isPresent()) {
            throw new InvarianteVioladaException("O condutor já está liberado para este veículo neste dia.");
        }
        var aptidao = vinculos.aptidao(request.idCondutor(), request.idVeiculo(), dia);
        var liberacao = repository.save(new LiberacaoCnh(request.idCondutor(), request.idVeiculo(), dia,
                request.justificativa(), SecurityUtils.getUsuarioLogadoId(), aptidao, hoje));
        return montar(List.of(liberacao)).getFirst();
    }

    @Transactional(readOnly = true)
    public PageResponse<LiberacaoCnhResponse> listar(List<UUID> idsBase, Pageable pageable) {
        // Com base, só as liberações dos veículos dela: cada gestor vê a sua frota.
        var pagina = idsBase == null || idsBase.isEmpty()
                ? repository.findAllByAtivoTrueOrderByDiaDescDataCriacaoDesc(pageable)
                : repository.findAllByAtivoTrueAndIdVeiculoInOrderByDiaDescDataCriacaoDesc(
                        referencias.idsVeiculosAtivosDasBases(idsBase), pageable);
        return PageResponse.fromPage(new PageImpl<>(montar(pagina.getContent()), pageable, pagina.getTotalElements()));
    }

    /** Liberação válida para o condutor, o veículo e o dia. */
    Optional<LiberacaoCnh> liberacao(UUID idCondutor, UUID idVeiculo, LocalDate dia) {
        return repository.findByIdCondutorAndIdVeiculoAndDiaAndAtivoTrue(idCondutor, idVeiculo, dia);
    }

    /** Liberações de hoje, para o app não bloquear quem o gestor já liberou. */
    List<LiberacaoCnh> liberacoesDoDia(LocalDate dia) {
        return repository.findAllByDiaAndAtivoTrue(dia);
    }

    /** Recusa o checklist de quem a CNH impede, salvo liberação do gestor para o dia; devolve a liberação usada. */
    Optional<LiberacaoCnh> exigirAptoOuLiberado(UUID idCondutor, UUID idVeiculo, LocalDate dia) {
        AptidaoConducao aptidao = vinculos.aptidao(idCondutor, idVeiculo, dia);
        if (aptidao.isApto()) return Optional.empty();
        return Optional.of(liberacao(idCondutor, idVeiculo, dia).orElseThrow(() -> new InvarianteVioladaException(
                aptidao.mensagem() + " Peça ao gestor da frota a liberação para hoje.")));
    }

    private List<LiberacaoCnhResponse> montar(List<LiberacaoCnh> liberacoes) {
        var nomes = referencias.nomesColaboradores(liberacoes.stream().map(LiberacaoCnh::getIdCondutor).toList());
        var logins = referencias.loginsUsuarios(liberacoes.stream().map(LiberacaoCnh::getIdUsuarioLiberacao).toList());
        var placas = fichas.findAllByIdVeiculoIn(liberacoes.stream().map(LiberacaoCnh::getIdVeiculo).toList()).stream()
                .collect(Collectors.toMap(FichaVeiculo::getIdVeiculo, FichaVeiculo::getPlaca));
        return liberacoes.stream().map(l -> new LiberacaoCnhResponse(
                l.getId(),
                l.getIdCondutor(),
                nomes.get(l.getIdCondutor()),
                l.getIdVeiculo(),
                placas.get(l.getIdVeiculo()),
                l.getDia(),
                l.getJustificativa(),
                l.getIdUsuarioLiberacao() == null ? null : logins.get(l.getIdUsuarioLiberacao()),
                l.getDataCriacao())).toList();
    }
}
