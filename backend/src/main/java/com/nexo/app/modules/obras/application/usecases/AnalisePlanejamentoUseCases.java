package com.nexo.app.modules.obras.application.usecases;

import com.nexo.app.modules.assistente.CopilotoApi;
import com.nexo.app.modules.obras.application.dto.AnexoObraResponse;
import com.nexo.app.modules.obras.application.dto.PlanejamentoObraRequests.AceitarProposta;
import com.nexo.app.modules.obras.application.dto.PlanejamentoObraRequests.AnaliseResponse;
import com.nexo.app.modules.obras.application.dto.PlanejamentoObraRequests.DisponibilidadeAnalise;
import com.nexo.app.modules.obras.application.dto.PlanejamentoObraRequests.NovoPonto;
import com.nexo.app.modules.obras.application.dto.PlanejamentoObraRequests.PontoAceito;
import com.nexo.app.modules.obras.application.dto.PlanejamentoObraRequests.VaoAceito;
import com.nexo.app.modules.obras.application.dto.PlanejamentoObraResponse;
import com.nexo.app.modules.obras.domain.AnalisePlanejamento;
import com.nexo.app.modules.obras.domain.Obra;
import com.nexo.app.modules.obras.domain.OperacaoItemKit;
import com.nexo.app.modules.obras.domain.OrigemPlanejamento;
import com.nexo.app.modules.obras.domain.PlanejamentoObra;
import com.nexo.app.modules.obras.domain.PontoPlanejamento;
import com.nexo.app.modules.obras.domain.StatusAnalisePlanejamento;
import com.nexo.app.modules.obras.domain.VaoPlanejamento;
import com.nexo.app.modules.obras.infrastructure.persistence.AnalisePlanejamentoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.PontoPlanejamentoRepository;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.io.IOException;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Planejamento assistido: pedir a leitura de uma página e gravar só as sugestões que o usuário aceitou, pelos
 * mesmos comandos e invariantes do planejamento manual. O aceite é tudo ou nada.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class AnalisePlanejamentoUseCases {

    /** Folha densa com modelo forte leva alguns minutos; passado isso sem resposta, a leitura foi interrompida. */
    static final Duration PRAZO_LEITURA = Duration.ofMinutes(30);
    /** Registrado no lugar do modelo de visão quando a folha é lida direto do desenho do PDF. */
    static final String MODELO_VETORIAL = "leitura-vetorial";
    /** Registrado no lugar do modelo de visão quando a leitura vem do DXF/DWG da obra. */
    static final String MODELO_CAD = "leitura-cad";

    private final AnalisePlanejamentoRepository analiseRepository;
    private final PontoPlanejamentoRepository pontoRepository;
    private final PlanejamentoObraUseCases planejamento;
    private final ProcessarAnaliseProjetoService processador;
    private final AnexoObraUseCases anexos;
    private final LeitorVetorialProjeto leitorVetorial;
    private final ProjetoCadDaObra projetoCad;
    private final CopilotoApi copiloto;

    @Transactional(readOnly = true)
    public DisponibilidadeAnalise disponibilidade(UUID idObra, int pagina) {
        AnaliseResponse ultima = analiseRepository
                .findFirstByIdObraAndPaginaOrderByDataCriacaoDesc(idObra, pagina)
                .filter(AnalisePlanejamento::isAtivo)
                .map(AnalisePlanejamentoUseCases::paraResponse)
                .orElse(null);
        String arquivoCad = projetoCad.anexo(idObra).map(AnexoObraResponse::nomeArquivo).orElse(null);
        boolean semVisao = arquivoCad != null || folhaVetorial(idObra, pagina);
        return new DisponibilidadeAnalise(semVisao || copiloto.visaoProjetoDisponivel(), semVisao, arquivoCad, ultima);
    }

    /** Projeto mestre com a folha desenhada em vetor (rótulos como letras desenhadas): a leitura é feita sem IA. */
    private boolean folhaVetorial(UUID idObra, int pagina) {
        UUID idAnexo = planejamento.obterPlanejamento(idObra).getIdAnexoMestre();
        if (idAnexo == null) {
            return false;
        }
        try (var stream = anexos.baixar(idObra, idAnexo).stream()) {
            return leitorVetorial.folhaVetorial(stream.readAllBytes(), pagina);
        } catch (IOException | RuntimeException e) {
            log.debug("Não foi possível conferir se a folha {} da obra {} é vetorial", pagina, idObra, e);
            return false;
        }
    }

    @Transactional
    public AnaliseResponse iniciar(UUID idObra, int pagina, boolean orientacaoConferida) {
        planejamento.buscarObra(idObra);
        boolean cad = projetoCad.anexo(idObra).isPresent();
        boolean vetorial = cad || folhaVetorial(idObra, pagina);
        if (!vetorial && !copiloto.visaoProjetoDisponivel()) {
            throw new InvarianteVioladaException("A leitura de projetos pela Bússola não está configurada neste ambiente.");
        }
        PlanejamentoObra dados = planejamento.obterPlanejamento(idObra);
        if (dados.getIdAnexoMestre() == null) {
            throw new InvarianteVioladaException("Anexe o projeto mestre antes de pedir a leitura.");
        }
        AnalisePlanejamento analise = analiseRepository.save(
                new AnalisePlanejamento(idObra, dados.getIdAnexoMestre(), pagina,
                        cad ? MODELO_CAD : vetorial ? MODELO_VETORIAL : copiloto.modeloVisaoProjeto()));
        UUID id = analise.getId();
        // Só processa depois do commit: o processamento roda em outra thread e precisa enxergar o registro.
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                processador.processar(id, orientacaoConferida);
            }
        });
        return paraResponse(analise);
    }

    @Transactional
    public AnaliseResponse buscar(UUID idObra, UUID idAnalise) {
        AnalisePlanejamento analise = buscarAnalise(idObra, idAnalise);
        analise.expirarSeTravada(OffsetDateTime.now(), PRAZO_LEITURA);
        return paraResponse(analise);
    }

    @Transactional
    public PlanejamentoObraResponse aceitar(UUID idObra, UUID idAnalise, AceitarProposta request) {
        AnalisePlanejamento analise = buscarAnalise(idObra, idAnalise);
        if (analise.getStatus() != StatusAnalisePlanejamento.CONCLUIDA) {
            throw new InvarianteVioladaException("Esta leitura do projeto ainda não terminou.");
        }
        Obra obra = planejamento.buscarObra(idObra);

        Map<String, UUID> pontos = new HashMap<>();
        pontoRepository.findByIdObraAndAtivoTrueOrderByPaginaAscNumeroAsc(idObra)
                .forEach(p -> pontos.put(p.getNumero(), p.getId()));
        List<PontoAceito> pontosAceitos = request.pontos() != null ? request.pontos() : List.of();
        for (PontoAceito aceito : pontosAceitos) {
            PontoPlanejamento ponto = planejamento.criarPonto(idObra,
                    new NovoPonto(aceito.numero(), analise.getPagina(), aceito.x(), aceito.y(), aceito.barramento(), aceito.tipo()),
                    OrigemPlanejamento.COPILOTO);
            pontos.put(PontoPlanejamento.normalizarNumero(aceito.referencia()), ponto.getId());
            pontos.put(ponto.getNumero(), ponto.getId());
            aplicarKits(obra, aceito.idsKits(), List.of(ponto.getId()), List.of());
        }

        for (VaoAceito aceito : request.vaos() != null ? request.vaos() : List.<VaoAceito>of()) {
            UUID a = pontos.get(PontoPlanejamento.normalizarNumero(aceito.referenciaA()));
            UUID b = pontos.get(PontoPlanejamento.normalizarNumero(aceito.referenciaB()));
            if (a == null || b == null) {
                throw new InvarianteVioladaException("O vão " + aceito.referenciaA() + " — " + aceito.referenciaB()
                        + " depende de um ponto que não foi aceito.");
            }
            // A rede continua de uma folha para a outra e o trecho da emenda aparece nas duas: o que já existe fica como está.
            if (planejamento.existeVao(idObra, a, b)) {
                continue;
            }
            VaoPlanejamento vao = planejamento.criarVao(idObra, a, b, aceito.metragem(), OrigemPlanejamento.COPILOTO);
            aplicarKits(obra, aceito.idsKits(), List.of(), List.of(vao.getId()));
        }
        // Já virou planejamento: não fica mais disponível para revisar de novo.
        analise.desativar();
        return planejamento.buscar(idObra);
    }

    private void aplicarKits(Obra obra, List<UUID> idsKits, List<UUID> pontos, List<UUID> vaos) {
        if (idsKits != null) {
            idsKits.forEach(idKit -> planejamento.aplicar(obra, idKit, pontos, vaos, OperacaoItemKit.INSTALAR, null));
        }
    }

    private AnalisePlanejamento buscarAnalise(UUID idObra, UUID idAnalise) {
        return analiseRepository.findByIdAndIdObraAndAtivoTrue(idAnalise, idObra)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Leitura do projeto não encontrada nesta obra."));
    }

    private static AnaliseResponse paraResponse(AnalisePlanejamento a) {
        return new AnaliseResponse(a.getId(), a.getPagina(), a.getStatus().name(), a.getMensagem(), a.getProposta());
    }
}
