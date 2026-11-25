package com.nexo.app.modules.obras;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Contrato público mínimo do módulo de obras para consumidores de outros módulos.
 */
public interface ObraApi {

    Optional<ObraPublica> buscarPorId(UUID id);

    Optional<ObraPublica> buscarPorNumero(String numero);

    /** Obras cujo número ou título contém o trecho, sem diferenciar maiúsculas. */
    Set<UUID> buscarIdsPorNumeroOuTitulo(String trecho);

    /** Retorna somente obra ativa vinculada ao processo técnico elegível. */
    Optional<ObraPublica> buscarTecnicaAtivaPorId(UUID id);

    Optional<OcorrenciaPublica> buscarOcorrenciaPorId(UUID id);

    Optional<OcorrenciaPublica> buscarOcorrencia(UUID idObra, String codigo);

    OcorrenciaPublica resolverOuCriarOcorrencia(UUID idObra, String codigo);

    /** Vincula uma equipe ativa ja validada; operacao idempotente. */
    void vincularEquipeSeAusente(UUID idObra, UUID idEquipe);

    /** Material a instalar planejado na obra, por material: previsto e já apontado. */
    java.util.List<MaterialPrevistoPublico> materiaisPrevistos(UUID idObra);

    /** Número de cada obra, para mostrar rastros entre obras. */
    java.util.Map<UUID, String> numerosPorIds(java.util.Collection<UUID> ids);

    /** Apontamentos ativos de material, no mesmo formato do evento de execução (para reprocessar o estoque). */
    java.util.List<com.nexo.app.shared.domain.events.ItemExecutadoEvent> apontamentosDeMaterialAtivos();

    record MaterialPrevistoPublico(UUID idMaterial, java.math.BigDecimal previsto, java.math.BigDecimal executado) {
    }

    record OcorrenciaPublica(UUID id, UUID idObra, String codigo) {
    }

    enum TipoObraPublico {
        OBRA,
        CORRETIVA,
        PREVENTIVA,
        LPT
    }

    enum TipoVinculoProjetoPublico {
        KIT,
        MEDIDOR
    }

    record AgenteResponsavelPublico(
            UUID id,
            String nome,
            String email,
            boolean ativo
    ) {
    }

    record ProjetoRelacionadoPublico(
            UUID id,
            String numero,
            String titulo,
            TipoObraPublico tipoObra,
            TipoVinculoProjetoPublico tipoVinculo,
            boolean ativo
    ) {
    }

    record ObraPublica(
            UUID id,
            String numero,
            String titulo,
            TipoObraPublico tipoObra,
            boolean ativa,
            UUID idProcesso,
            String nomeProcesso,
            boolean processoTecnico,
            UUID idBaseOperacional,
            Set<UUID> idsEquipes,
            AgenteResponsavelPublico agenteResponsavel,
            List<ProjetoRelacionadoPublico> projetosRelacionados
    ) {
        public ObraPublica {
            idsEquipes = idsEquipes == null ? Set.of() : Set.copyOf(idsEquipes);
            projetosRelacionados = projetosRelacionados == null ? List.of() : List.copyOf(projetosRelacionados);
        }
    }
}
