package com.nexo.app.modules.estoque.application.usecases;

import com.nexo.app.modules.estoque.application.dto.TrocaOcorrenciaTecnicaResponse;
import com.nexo.app.modules.estoque.application.dto.TrocarOcorrenciaTecnicaRequest;
import com.nexo.app.modules.estoque.application.services.ContextoRegistroEventoSolicitacao;
import com.nexo.app.modules.estoque.application.services.GravadorEventoSolicitacaoService;
import com.nexo.app.modules.estoque.application.services.IdempotenciaComandoSolicitacaoService;
import com.nexo.app.modules.estoque.application.services.ObservabilidadeSolicitacaoTecnica;
import com.nexo.app.modules.estoque.application.services.PoliticaAcoesPermitidasSolicitacao;
import com.nexo.app.modules.estoque.domain.AlteracaoEventoSolicitacao;
import com.nexo.app.modules.estoque.domain.ContextoSolicitacaoMaterial;
import com.nexo.app.modules.estoque.domain.OrigemComandoTecnico;
import com.nexo.app.modules.estoque.domain.PayloadEventoSolicitacao;
import com.nexo.app.modules.estoque.domain.SolicitacaoMaterial;
import com.nexo.app.modules.estoque.domain.TipoEventoSolicitacao;
import com.nexo.app.modules.estoque.infrastructure.persistence.SolicitacaoMaterialRepository;
import com.nexo.app.modules.obras.ObraApi.OcorrenciaPublica;
import com.nexo.app.shared.domain.exception.ConflitoVersaoException;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.PreenchimentoInvalidoException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * Troca da OS/OC de uma solicitação técnica a qualquer momento, até depois da entrega. Só muda
 * a referência: saldos, operações e séries ficam como estão. Fica na linha do tempo com motivo.
 */
@Service
@RequiredArgsConstructor
public class TrocaOcorrenciaTecnicaUseCase {

    private static final String PREFIXO_ESCOPO = "OCORRENCIA_TECNICA:";

    private final SolicitacaoMaterialRepository repository;
    private final ReferenciaTecnicaValidator referenciaValidator;
    private final PoliticaAcoesPermitidasSolicitacao politica;
    private final GravadorEventoSolicitacaoService gravadorEvento;
    private final IdempotenciaComandoSolicitacaoService idempotencia;

    @Transactional
    public TrocaOcorrenciaTecnicaResponse trocar(
            UUID idSolicitacao,
            TrocarOcorrenciaTecnicaRequest request,
            UUID idUsuario,
            String chaveIdempotencia
    ) {
        Objects.requireNonNull(request, "Os dados da troca sao obrigatorios");
        Objects.requireNonNull(idUsuario, "O usuario e obrigatorio");
        IdempotenciaComandoSolicitacaoService.Consulta<TrocaOcorrenciaTecnicaResponse> consulta =
                chaveIdempotencia == null || chaveIdempotencia.isBlank() ? null
                        : idempotencia.consultar(PREFIXO_ESCOPO + idSolicitacao, idUsuario, chaveIdempotencia, request,
                                TrocaOcorrenciaTecnicaResponse.class, ObservabilidadeSolicitacaoTecnica.Operacao.PLANEJAMENTO);
        if (consulta != null && consulta.repetida()) {
            return consulta.resposta();
        }
        if (request.justificativa() == null || request.justificativa().isBlank()) {
            throw new PreenchimentoInvalidoException(Map.of("justificativa", "Conte por que a OS/OC mudou."));
        }
        SolicitacaoMaterial solicitacao = repository.findById(idSolicitacao)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Solicitacao tecnica nao encontrada"));
        if (solicitacao.getContexto() != ContextoSolicitacaoMaterial.TECNICO) {
            throw new InvarianteVioladaException("A troca da OS/OC se aplica somente a solicitacao tecnica.");
        }
        if (!Objects.equals(solicitacao.getVersao(), request.versaoEsperada())) {
            throw new ConflitoVersaoException(
                    ConflitoVersaoException.Recurso.SOLICITACAO, request.versaoEsperada(), solicitacao.getVersao());
        }
        if (!politica.podeTrocarOcorrencia(solicitacao)) {
            throw new AccessDeniedException("Só o almoxarifado ou quem abriu a solicitação troca a OS/OC.");
        }
        OcorrenciaPublica nova = referenciaValidator.validarNovaOcorrencia(solicitacao.getIdObra(), request.ocorrencia());
        String anterior = solicitacao.getOcorrencia();
        solicitacao.trocarOcorrencia(nova);
        SolicitacaoMaterial salva = repository.saveAndFlush(solicitacao);
        gravadorEvento.registrarFilho(
                salva,
                TipoEventoSolicitacao.OCORRENCIA_ALTERADA,
                new PayloadEventoSolicitacao("TROCAR_OCORRENCIA",
                        List.of(new AlteracaoEventoSolicitacao("ocorrencia", anterior, salva.getOcorrencia())),
                        Map.of("aposEntrega", salva.possuiFatoOperacional())),
                new ContextoRegistroEventoSolicitacao(
                        idUsuario, "USUARIO " + idUsuario, OrigemComandoTecnico.UI, request.justificativa().trim()));
        TrocaOcorrenciaTecnicaResponse resposta = new TrocaOcorrenciaTecnicaResponse(
                salva.getId(), anterior, salva.getOcorrencia(), salva.getVersao());
        if (consulta != null) {
            idempotencia.registrar(consulta, salva.getId(), null, resposta);
        }
        return resposta;
    }
}
