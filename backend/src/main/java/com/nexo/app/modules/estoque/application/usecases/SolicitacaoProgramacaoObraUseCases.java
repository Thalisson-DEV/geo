package com.nexo.app.modules.estoque.application.usecases;

import com.nexo.app.modules.estoque.application.dto.CriacaoSolicitacaoTecnicaResponse;
import com.nexo.app.modules.estoque.application.dto.CriarSolicitacaoTecnicaRequest;
import com.nexo.app.modules.estoque.application.services.ContextoRegistroEventoSolicitacao;
import com.nexo.app.modules.estoque.application.services.GravadorEventoSolicitacaoService;
import com.nexo.app.modules.estoque.application.services.ProcessoMaterialService;
import com.nexo.app.modules.estoque.domain.ContextoSolicitacaoMaterial;
import com.nexo.app.modules.estoque.domain.Material;
import com.nexo.app.modules.estoque.infrastructure.persistence.MaterialRepository;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.modules.estoque.domain.AlteracaoEventoSolicitacao;
import com.nexo.app.modules.estoque.domain.OrigemComandoTecnico;
import com.nexo.app.modules.estoque.domain.PayloadEventoSolicitacao;
import com.nexo.app.modules.estoque.domain.SolicitacaoMaterial;
import com.nexo.app.modules.estoque.domain.TipoEventoSolicitacao;
import com.nexo.app.modules.estoque.domain.TipoSolicitacaoTecnica;
import com.nexo.app.modules.estoque.infrastructure.persistence.SolicitacaoMaterialRepository;
import com.nexo.app.shared.domain.events.ProgramacaoObraEvent;
import com.nexo.app.shared.infrastructure.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * Solicitação técnica que nasce da programação da obra. Os materiais a instalar da programação são pedidos ao
 * almoxarifado como adição comum (221), com o início da programação como saque previsto. Enquanto o material não
 * andou, a solicitação acompanha a programação: reprogramar muda o saque e a equipe; cancelar ou excluir a cancela.
 * A solicitação manual segue existindo ao lado desta.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SolicitacaoProgramacaoObraUseCases {

    private final SolicitacaoTecnicaUseCases solicitacoes;
    private final SolicitacaoMaterialRepository repository;
    private final GravadorEventoSolicitacaoService gravadorEvento;
    private final MaterialRepository materialRepository;
    private final ProcessoMaterialService processoMaterial;

    @Transactional(propagation = Propagation.MANDATORY)
    public void aplicar(ProgramacaoObraEvent evento) {
        switch (evento.tipo()) {
            case CRIADA -> criar(evento, SecurityUtils.getUsuarioLogadoId());
            case REPROGRAMADA -> reprogramar(evento, SecurityUtils.getUsuarioLogadoId());
            case CANCELADA -> cancelar(evento, SecurityUtils.getUsuarioLogadoId());
        }
    }

    void criar(ProgramacaoObraEvent evento, UUID idUsuario) {
        if (evento.itens().isEmpty()) {
            return;
        }
        exigirMateriaisDeObras(evento);
        List<CriarSolicitacaoTecnicaRequest.Item> itens = evento.itens().stream()
                .map(m -> new CriarSolicitacaoTecnicaRequest.Item(m.idMaterial(), TipoSolicitacaoTecnica.ADICAO_COMUM, m.quantidade()))
                .toList();
        CriacaoSolicitacaoTecnicaResponse criadas = solicitacoes.criar(new CriarSolicitacaoTecnicaRequest(
                evento.idObra(), evento.ocorrencia(), evento.idAlmoxarifadoAtendimento(), evento.idEquipe(), null, false,
                evento.inicio(), limitar(evento.observacao(), 1000), itens), idUsuario, OrigemComandoTecnico.SYSTEM);
        for (CriacaoSolicitacaoTecnicaResponse.SolicitacaoCriada criada : criadas.solicitacoesCriadas()) {
            repository.findById(criada.id())
                    .ifPresent(s -> s.vincularProgramacao(evento.idProgramacao(), evento.numeroProgramacao()));
        }
    }

    void reprogramar(ProgramacaoObraEvent evento, UUID idUsuario) {
        for (SolicitacaoMaterial solicitacao : vinculadas(evento)) {
            if (!solicitacao.acompanhaProgramacao()) {
                continue;
            }
            List<AlteracaoEventoSolicitacao> alteracoes = new ArrayList<>();
            if (!Objects.equals(solicitacao.getDataPrevistaRetirada(), evento.inicio())) {
                alteracoes.add(new AlteracaoEventoSolicitacao("dataPrevista", solicitacao.getDataPrevistaRetirada(), evento.inicio()));
            }
            if (!Objects.equals(solicitacao.getIdEquipeSaque(), evento.idEquipe())) {
                alteracoes.add(new AlteracaoEventoSolicitacao("equipe", solicitacao.getIdEquipeSaque(), evento.idEquipe()));
            }
            if (alteracoes.isEmpty()) {
                continue;
            }
            solicitacao.acompanharReprogramacao(evento.inicio(), evento.idEquipe());
            repository.save(solicitacao);
            gravadorEvento.registrarFilho(solicitacao, TipoEventoSolicitacao.DATA_PREVISTA_ALTERADA,
                    new PayloadEventoSolicitacao("ACOMPANHAR_REPROGRAMACAO", alteracoes, Map.of()),
                    contexto(idUsuario, evento.observacao()));
        }
    }

    void cancelar(ProgramacaoObraEvent evento, UUID idUsuario) {
        for (SolicitacaoMaterial solicitacao : vinculadas(evento)) {
            if (!solicitacao.acompanhaProgramacao()) {
                log.info("Solicitacao {} da programacao #{} ja esta em atendimento; fica com o almoxarifado.",
                        solicitacao.getId(), evento.numeroProgramacao());
                continue;
            }
            SolicitacaoMaterial.StatusSolicitacao anterior = solicitacao.getStatus();
            solicitacao.cancelarPorProgramacao(idUsuario, evento.observacao());
            repository.save(solicitacao);
            gravadorEvento.registrarFilho(solicitacao, TipoEventoSolicitacao.CANCELAMENTO_CONFIRMADO,
                    new PayloadEventoSolicitacao("CANCELAR_POR_PROGRAMACAO",
                            List.of(new AlteracaoEventoSolicitacao("status", anterior, solicitacao.getStatus())), Map.of()),
                    contexto(idUsuario, evento.observacao()));
        }
    }

    /**
     * Confere todos os materiais antes de pedir, para quem programa ver de uma vez o que corrigir no cadastro, em vez
     * do primeiro erro por item da solicitação.
     */
    private void exigirMateriaisDeObras(ProgramacaoObraEvent evento) {
        List<Material> materiais = materialRepository.findAllById(
                evento.itens().stream().map(ProgramacaoObraEvent.Material::idMaterial).toList());
        List<String> fora = materiais.stream()
                .filter(m -> processoMaterial.incompatibilidade(ContextoSolicitacaoMaterial.TECNICO, m).isPresent())
                .map(m -> m.getCodigo() + " - " + m.getDescricao())
                .toList();
        if (!fora.isEmpty()) {
            throw new InvarianteVioladaException("A programação não foi gravada: "
                    + (fora.size() == 1 ? "o material " + fora.getFirst() + " não é" : fora.size() + " materiais não são (" + String.join("; ", fora) + ")")
                    + " do processo Obras e não " + (fora.size() == 1 ? "pode" : "podem") + " ir para a solicitação técnica."
                    + " Ajuste o processo no cadastro do material ou tire o item do kit desta obra.");
        }
    }

    private List<SolicitacaoMaterial> vinculadas(ProgramacaoObraEvent evento) {
        return repository.findAllByIdProgramacaoAndAtivoTrue(evento.idProgramacao());
    }

    private static ContextoRegistroEventoSolicitacao contexto(UUID idUsuario, String justificativa) {
        return new ContextoRegistroEventoSolicitacao(idUsuario, "USUARIO " + idUsuario, OrigemComandoTecnico.SYSTEM,
                limitar(justificativa, 500));
    }

    private static String limitar(String texto, int maximo) {
        return texto == null || texto.length() <= maximo ? texto : texto.substring(0, maximo);
    }
}
