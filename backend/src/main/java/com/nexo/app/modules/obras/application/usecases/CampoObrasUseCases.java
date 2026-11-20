package com.nexo.app.modules.obras.application.usecases;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nexo.app.modules.execucao.TurnoApi;
import com.nexo.app.modules.execucao.application.dto.TurnoResponse;
import com.nexo.app.modules.obras.application.dto.CampoObrasRequests;
import com.nexo.app.modules.obras.application.dto.CampoObrasResponses;
import com.nexo.app.modules.obras.domain.ApontamentoExecucao;
import com.nexo.app.modules.obras.domain.AprTurno;
import com.nexo.app.modules.obras.domain.AtividadeTurno;
import com.nexo.app.modules.obras.domain.EvidenciaPonto;
import com.nexo.app.modules.obras.domain.OcorrenciaTurno;
import com.nexo.app.modules.obras.domain.PresencaObra;
import com.nexo.app.modules.obras.domain.Programacao;
import com.nexo.app.modules.obras.domain.RegistroCampo;
import com.nexo.app.modules.obras.domain.RelatorioTurno;
import com.nexo.app.modules.obras.domain.VaoPlanejamento;
import com.nexo.app.modules.obras.infrastructure.persistence.ApontamentoExecucaoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.AprTurnoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.AtividadeTurnoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.EvidenciaPontoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.ObraRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.OcorrenciaTurnoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.PresencaObraRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.ProgramacaoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.RelatorioTurnoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.VaoPlanejamentoRepository;
import com.nexo.app.modules.rh.EquipeApi;
import com.nexo.app.modules.rh.EquipeResponse;
import com.nexo.app.shared.domain.exception.AcessoNegadoException;
import com.nexo.app.shared.domain.exception.IdLocalReutilizadoException;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Comandos que a equipe de Obras lança pelo app, offline. Cada um traz o id do aparelho: o reenvio igual devolve o que
 * já foi gravado e o mesmo id com outro conteúdo é recusado. O turno é o informado ou, quando o aparelho ainda tem só o
 * id provisório, o que a equipe tinha aberto na hora do registro. O encarregado só lança na própria equipe.
 */
@Service
@RequiredArgsConstructor
public class CampoObrasUseCases {

    private static final ZoneId FUSO = ZoneId.of("America/Sao_Paulo");
    private static final DateTimeFormatter HORA = DateTimeFormatter.ofPattern("dd/MM 'às' HH:mm");

    private final TurnoApi turnoApi;
    private final EquipeApi equipeApi;
    private final ObraRepository obraRepository;
    private final ProgramacaoRepository programacaoRepository;
    private final AprTurnoRepository aprRepository;
    private final OcorrenciaTurnoRepository ocorrenciaRepository;
    private final AtividadeTurnoRepository atividadeRepository;
    private final ApontamentoExecucaoRepository apontamentoRepository;
    private final PresencaObraRepository presencaRepository;
    private final EvidenciaPontoRepository evidenciaRepository;
    private final VaoPlanejamentoRepository vaoRepository;
    private final RelatorioTurnoRepository relatorioRepository;
    private final ApontamentoExecucaoUseCases apontamentos;
    private final EvidenciaPontoUseCases evidencias;
    private final ObjectMapper mapper;

    @Transactional
    public CampoObrasResponses.Resultado registrarApr(CampoObrasRequests.Apr comando, UUID usuario) {
        String hash = hash(new CampoObrasRequests.Apr(comando.campo().semTurno(), comando.idObra(), comando.idProgramacao(),
                comando.atividade(), comando.idResponsavel(), comando.formulario(), comando.assinaturas(), comando.concluir()));
        Optional<AprTurno> existente = aprRepository.findByCampoIdLocal(comando.campo().idLocal());
        if (existente.isPresent()) {
            exigirMesmoConteudo(existente.get().getCampo(), hash, "APR");
            return resultado(comando.campo(), "APR", List.of(existente.get().getId()), true, existente.get().getIdTurno());
        }
        TurnoResponse turno = resolverTurno(comando.campo(), usuario);
        exigirServicoDaEquipe(turno, comando.idObra(), comando.idProgramacao());
        RegistroCampo campo = new RegistroCampo(comando.campo().idLocal(), hash, comando.campo().origem(), OffsetDateTime.now());
        AprTurno apr = AprTurno.doCampo(turno.id(), comando.idObra(), comando.idProgramacao(), comando.atividade(),
                comando.idResponsavel(), comando.formulario(), comando.assinaturas(), campo);
        if (comando.concluir()) {
            apr.concluirEm(campo.momentoConfiavel(), comando.campo().idLocal());
        }
        AprTurno salva = aprRepository.save(apr);
        return resultado(comando.campo(), "APR", List.of(salva.getId()), false, turno.id());
    }

    /** Conclusão de uma APR enviada antes, referida pelo id do aparelho (ou pelo id do servidor). */
    @Transactional
    public CampoObrasResponses.Resultado concluirApr(CampoObrasRequests.ConclusaoApr comando, UUID usuario) {
        Optional<AprTurno> jaConcluida = aprRepository.findByIdLocalConclusao(comando.campo().idLocal());
        if (jaConcluida.isPresent()) {
            return resultado(comando.campo(), "APR_CONCLUSAO", List.of(jaConcluida.get().getId()), true, jaConcluida.get().getIdTurno());
        }
        AprTurno apr = aprRepository.findByCampoIdLocal(comando.idApr())
                .or(() -> aprRepository.findById(comando.idApr()).filter(AprTurno::isAtivo))
                .orElseThrow(() -> new InvarianteVioladaException("A APR ainda não chegou ao servidor: aguarde o envio dela."));
        exigirTurnoDaEquipe(turnoApi.buscarPorId(apr.getIdTurno()), usuario);
        RegistroCampo.Origem origem = comando.campo().origem();
        OffsetDateTime momento = origem.instante() != null ? origem.instante() : OffsetDateTime.now();
        apr.concluirEm(momento, comando.campo().idLocal());
        aprRepository.save(apr);
        return resultado(comando.campo(), "APR_CONCLUSAO", List.of(apr.getId()), false, apr.getIdTurno());
    }

    @Transactional
    public CampoObrasResponses.Resultado registrarOcorrencia(CampoObrasRequests.Ocorrencia comando, UUID usuario) {
        String hash = hash(new CampoObrasRequests.Ocorrencia(comando.campo().semTurno(), comando.idObra(), comando.idProgramacao(),
                comando.tipo(), comando.descricao(), comando.impedeExecucao()));
        Optional<OcorrenciaTurno> existente = ocorrenciaRepository.findByCampoIdLocal(comando.campo().idLocal());
        if (existente.isPresent()) {
            exigirMesmoConteudo(existente.get().getCampo(), hash, "ocorrência");
            return resultado(comando.campo(), "OCORRENCIA", List.of(existente.get().getId()), true, existente.get().getIdTurno());
        }
        TurnoResponse turno = resolverTurno(comando.campo(), usuario);
        if (comando.idObra() != null) {
            exigirObra(comando.idObra());
        }
        RegistroCampo campo = new RegistroCampo(comando.campo().idLocal(), hash, comando.campo().origem(), OffsetDateTime.now());
        OcorrenciaTurno salva = ocorrenciaRepository.save(OcorrenciaTurno.doCampo(turno.id(), comando.idObra(),
                comando.idProgramacao(), comando.tipo(), comando.descricao(), comando.impedeExecucao(), campo));
        return resultado(comando.campo(), "OCORRENCIA", List.of(salva.getId()), false, turno.id());
    }

    /** Obra não programada: a equipe atuou fora da agenda. */
    @Transactional
    public CampoObrasResponses.Resultado registrarAtividade(CampoObrasRequests.Atividade comando, UUID usuario) {
        String hash = hash(new CampoObrasRequests.Atividade(comando.campo().semTurno(), comando.idObra(), comando.motivo()));
        Optional<AtividadeTurno> existente = atividadeRepository.findByCampoIdLocal(comando.campo().idLocal());
        if (existente.isPresent()) {
            exigirMesmoConteudo(existente.get().getCampo(), hash, "atividade");
            return resultado(comando.campo(), "ATIVIDADE", List.of(existente.get().getId()), true, existente.get().getIdTurno());
        }
        TurnoResponse turno = resolverTurno(comando.campo(), usuario);
        exigirObra(comando.idObra());
        if (atividadeRepository.existsByIdTurnoAndIdObraAndIdProgramacaoIsNullAndAtivoTrue(turno.id(), comando.idObra())) {
            throw new InvarianteVioladaException("Esta obra não programada já está nas atividades do turno.");
        }
        RegistroCampo campo = new RegistroCampo(comando.campo().idLocal(), hash, comando.campo().origem(), OffsetDateTime.now());
        AtividadeTurno salva = atividadeRepository.save(AtividadeTurno.doCampo(turno.id(), comando.idObra(), comando.motivo(), campo));
        return resultado(comando.campo(), "ATIVIDADE", List.of(salva.getId()), false, turno.id());
    }

    /** Apontamento por item ou "Tudo feito" no ponto. */
    @Transactional
    public CampoObrasResponses.Resultado apontar(CampoObrasRequests.Apontamento comando, UUID usuario) {
        String hash = hash(new CampoObrasRequests.Apontamento(comando.campo().semTurno(), comando.idProgramacao(),
                comando.idPonto(), comando.pontoInteiro(), comando.pontoInteiro() ? null : comando.itens(), comando.idApr()));
        List<ApontamentoExecucao> existentes = apontamentoRepository.findByCampoIdLocal(comando.campo().idLocal());
        if (!existentes.isEmpty()) {
            exigirMesmoConteudo(existentes.get(0).getCampo(), hash, "apontamento");
            return resultado(comando.campo(), "APONTAMENTO", existentes.stream().map(ApontamentoExecucao::getId).toList(), true,
                    existentes.get(0).getIdTurno());
        }
        if (comando.pontoInteiro() && comando.idPonto() == null) {
            throw new InvarianteVioladaException("Informe o ponto do \"Tudo feito\".");
        }
        TurnoResponse turno = resolverTurno(comando.campo(), usuario);
        Programacao programacao = programacaoRepository.findById(comando.idProgramacao())
                .orElseThrow(() -> new RecursoNaoEncontradoException("Programação não encontrada."));
        if (!programacao.getIdEquipe().equals(turno.idEquipe())) {
            throw new InvarianteVioladaException("A programação #" + programacao.getNumero() + " não é mais desta equipe: ela foi passada para outra.");
        }
        RegistroCampo campo = new RegistroCampo(comando.campo().idLocal(), hash, comando.campo().origem(), OffsetDateTime.now());
        List<ApontamentoExecucao> criados = apontamentos.apontarDoCampo(comando.idProgramacao(), turno.id(), campo,
                comando.idPonto(), comando.pontoInteiro(), comando.itens());
        return resultado(comando.campo(), "APONTAMENTO", criados.stream().map(ApontamentoExecucao::getId).toList(), false, turno.id());
    }

    @Transactional
    public CampoObrasResponses.Resultado registrarPresenca(CampoObrasRequests.Presenca comando, UUID usuario) {
        String hash = hash(new CampoObrasRequests.Presenca(comando.campo().semTurno(), comando.idObra(), comando.idProgramacao(), comando.tipo()));
        Optional<PresencaObra> existente = presencaRepository.findByCampoIdLocal(comando.campo().idLocal());
        if (existente.isPresent()) {
            exigirMesmoConteudo(existente.get().getCampo(), hash, "chegada/saída");
            return resultado(comando.campo(), "PRESENCA", List.of(existente.get().getId()), true, existente.get().getIdTurno());
        }
        TurnoResponse turno = resolverTurno(comando.campo(), usuario);
        exigirObra(comando.idObra());
        RegistroCampo campo = new RegistroCampo(comando.campo().idLocal(), hash, comando.campo().origem(), OffsetDateTime.now());
        PresencaObra salva = presencaRepository.save(new PresencaObra(turno.id(), turno.idEquipe(), comando.idObra(),
                comando.idProgramacao(), comando.tipo(), campo));
        return resultado(comando.campo(), "PRESENCA", List.of(salva.getId()), false, turno.id());
    }

    /** Foto do modelo no ponto ou vão, com carimbo. O arquivo vem à parte. */
    @Transactional
    public CampoObrasResponses.Resultado registrarEvidencia(CampoObrasRequests.Evidencia comando, byte[] conteudo,
                                                           String nomeArquivo, String contentType, UUID usuario) {
        String hash = hash(new Object[]{new CampoObrasRequests.Evidencia(comando.campo().semTurno(), comando.idObra(), comando.idPonto(),
                comando.idVao(), comando.idProgramacao(), comando.idApontamento(), comando.idModelo(), comando.idItem(),
                comando.etapa(), comando.legenda()), sha256(conteudo)});
        Optional<EvidenciaPonto> existente = evidenciaRepository.findByIdLocal(comando.campo().idLocal());
        if (existente.isPresent()) {
            if (!hash.equalsIgnoreCase(existente.get().getHashCampo())) {
                throw new IdLocalReutilizadoException("A foto " + comando.campo().idLocal() + " já foi recebida com outro conteúdo.");
            }
            return resultado(comando.campo(), "EVIDENCIA", List.of(existente.get().getId()), true, null);
        }
        exigirObraDaEquipe(comando.idObra(), usuario);
        UUID idPonto = comando.idPonto();
        if (idPonto == null && comando.idVao() != null) {
            idPonto = vaoRepository.findByIdAndIdObraAndAtivoTrue(comando.idVao(), comando.idObra())
                    .map(VaoPlanejamento::getIdPontoA)
                    .orElseThrow(() -> new RecursoNaoEncontradoException("Vão não encontrado nesta obra."));
        }
        if (idPonto == null) {
            throw new InvarianteVioladaException("Informe o ponto ou o vão da foto.");
        }
        RegistroCampo.Origem origem = comando.campo().origem();
        EvidenciaPonto salva = evidencias.registrarDoCampo(comando.idObra(), idPonto, comando.idModelo(), comando.idItem(),
                comando.legenda(), conteudo, nomeArquivo, contentType,
                new EvidenciaPonto.Captura(comando.etapa(), origem.latitude(), origem.longitude(), origem.instante()),
                new EvidenciaPonto.OrigemCampo(comando.campo().idLocal(), hash, comando.idVao(), comando.idProgramacao(),
                        comando.idApontamento(), origem.precisao()));
        return resultado(comando.campo(), "EVIDENCIA", List.of(salva.getId()), false, null);
    }

    /** Relatório do dia: o reenvio grava o mesmo texto de novo, sem duplicar (um relatório por turno). */
    @Transactional
    public CampoObrasResponses.Resultado salvarRelatorio(CampoObrasRequests.Relatorio comando, UUID usuario) {
        TurnoResponse turno = resolverTurno(comando.campo(), usuario);
        RelatorioTurno relatorio = relatorioRepository.findByIdTurno(turno.id())
                .map(existente -> {
                    existente.informar(comando.observacao());
                    return existente;
                })
                .orElseGet(() -> new RelatorioTurno(turno.id(), comando.observacao()));
        RelatorioTurno salvo = relatorioRepository.save(relatorio);
        return resultado(comando.campo(), "RELATORIO", List.of(salvo.getId()), false, turno.id());
    }

    /** A equipe de que o usuário é o encarregado; vazio para quem não lidera equipe (supervisor, backoffice). */
    public Optional<UUID> equipeDoUsuario(UUID usuario) {
        return usuario == null ? Optional.empty() : equipeApi.buscarIdEquipePorUsuario(usuario);
    }

    /**
     * O turno informado, se existe e é da equipe; senão (id provisório do aparelho), o turno que a equipe tinha aberto
     * no instante do registro.
     */
    TurnoResponse resolverTurno(CampoObrasRequests.Campo campo, UUID usuario) {
        Optional<UUID> equipe = equipeDoUsuario(usuario);
        if (campo.idTurno() != null) {
            Optional<TurnoResponse> informado = buscarTurno(campo.idTurno());
            if (informado.isPresent()) {
                exigirTurnoDaEquipe(informado.get(), usuario);
                exigirEquipeDeObras(informado.get().idEquipe());
                return informado.get();
            }
        }
        UUID idEquipe = equipe.orElseThrow(() -> new InvarianteVioladaException(
                "Informe o turno: o usuário não é encarregado de uma equipe."));
        exigirEquipeDeObras(idEquipe);
        OffsetDateTime instante = campo.instante() != null && !campo.instante().isAfter(OffsetDateTime.now().plus(RegistroCampo.TOLERANCIA_RELOGIO))
                ? campo.instante() : OffsetDateTime.now();
        return turnoApi.listarSobrepostosAoPeriodo(instante, instante.plusSeconds(1), List.of(idEquipe)).stream()
                .filter(t -> !t.dataInicio().isAfter(instante))
                .max(Comparator.comparing(TurnoResponse::dataInicio))
                .orElseThrow(() -> new InvarianteVioladaException("A equipe não tinha turno aberto em "
                        + instante.atZoneSameInstant(FUSO).format(HORA) + ". Abra o turno antes de lançar."));
    }

    private Optional<TurnoResponse> buscarTurno(UUID id) {
        try {
            return Optional.ofNullable(turnoApi.buscarPorId(id));
        } catch (RecursoNaoEncontradoException e) {
            return Optional.empty();
        }
    }

    private void exigirTurnoDaEquipe(TurnoResponse turno, UUID usuario) {
        Optional<UUID> equipe = equipeDoUsuario(usuario);
        if (equipe.isPresent() && !equipe.get().equals(turno.idEquipe())) {
            throw new AcessoNegadoException("O turno informado é de outra equipe.");
        }
    }

    private void exigirObraDaEquipe(UUID idObra, UUID usuario) {
        exigirObra(idObra);
        Optional<UUID> equipe = equipeDoUsuario(usuario);
        if (equipe.isEmpty()) {
            return;
        }
        boolean programada = programacaoRepository.listarDaObraComItens(idObra).stream()
                .anyMatch(p -> p.getIdEquipe().equals(equipe.get()));
        if (!programada) {
            throw new AcessoNegadoException("A obra não está na agenda da sua equipe.");
        }
    }

    private void exigirServicoDaEquipe(TurnoResponse turno, UUID idObra, UUID idProgramacao) {
        exigirObra(idObra);
        if (idProgramacao == null) {
            return;
        }
        Programacao programacao = programacaoRepository.findById(idProgramacao)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Programação não encontrada."));
        if (!programacao.getIdObra().equals(idObra) || !programacao.getIdEquipe().equals(turno.idEquipe())) {
            throw new InvarianteVioladaException("A programação #" + programacao.getNumero() + " não é desta obra e desta equipe.");
        }
    }

    private void exigirEquipeDeObras(UUID idEquipe) {
        EquipeResponse equipe = equipeApi.buscarPorIdResponse(idEquipe)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Equipe não encontrada."));
        if (equipe.processo() == null || !obraRepository.listarProcessosComObras().contains(equipe.processo().id())) {
            throw new InvarianteVioladaException("A equipe " + equipe.codigo() + " não é de um processo com obras.");
        }
    }

    private void exigirObra(UUID idObra) {
        if (!obraRepository.existsById(idObra)) {
            throw new RecursoNaoEncontradoException("Obra não encontrada com o ID: " + idObra);
        }
    }

    private static void exigirMesmoConteudo(RegistroCampo campo, String hash, String oQue) {
        if (campo == null || !campo.mesmoConteudo(hash)) {
            throw new IdLocalReutilizadoException("O id do aparelho desta " + oQue + " já foi usado com outro conteúdo.");
        }
    }

    private static CampoObrasResponses.Resultado resultado(CampoObrasRequests.Campo campo, String tipo, List<UUID> ids,
                                                           boolean jaRecebido, UUID idTurno) {
        return new CampoObrasResponses.Resultado(campo.idLocal(), tipo, ids, jaRecebido, OffsetDateTime.now(), idTurno);
    }

    /** Hash do conteúdo do comando, para distinguir reenvio de reuso do id. */
    String hash(Object comando) {
        try {
            return sha256(mapper.writeValueAsBytes(comando));
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new InvarianteVioladaException("Não foi possível conferir o conteúdo do registro.");
        }
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes == null ? new byte[0] : bytes));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
