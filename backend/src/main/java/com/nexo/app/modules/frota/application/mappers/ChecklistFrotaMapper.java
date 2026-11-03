package com.nexo.app.modules.frota.application.mappers;

import com.nexo.app.modules.frota.application.dto.ModeloChecklistRequest;
import com.nexo.app.modules.frota.application.dto.ModeloChecklistResponse;
import com.nexo.app.modules.frota.application.dto.ModeloChecklistResumoResponse;
import com.nexo.app.modules.frota.application.dto.OpcaoFrota;
import com.nexo.app.modules.frota.domain.AlternativaChecklist;
import com.nexo.app.modules.frota.domain.FotoRecebimentoChecklist;
import com.nexo.app.modules.frota.domain.ModeloChecklist;
import com.nexo.app.modules.frota.domain.ModoFotoPergunta;
import com.nexo.app.modules.frota.domain.PerguntaChecklist;
import com.nexo.app.modules.frota.domain.TipoAlternativaChecklist;
import org.mapstruct.Mapper;
import org.mapstruct.ReportingPolicy;

import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Conversões do checklist. Os nomes dos tipos de veículo e de implemento vêm resolvidos pelo caso de uso. */
@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.IGNORE)
public interface ChecklistFrotaMapper {

    default ModeloChecklist.Dados toDados(ModeloChecklistRequest request) {
        return new ModeloChecklist.Dados(
                request.nome(),
                request.tipo(),
                request.instrucoes(),
                Boolean.TRUE.equals(request.exigeAssinatura()),
                request.idsTiposVeiculo(),
                request.idsTiposImplemento(),
                request.perguntas().stream().map(this::toDados).toList(),
                request.fotosRecebimento() == null ? List.of()
                        : request.fotosRecebimento().stream()
                        .map(f -> new ModeloChecklist.DadosFotoRecebimento(f.id(), f.descricao())).toList());
    }

    default ModeloChecklist.DadosPergunta toDados(ModeloChecklistRequest.Pergunta p) {
        var modo = p.modoFoto() != null ? p.modoFoto()
                : Boolean.TRUE.equals(p.fotoNoNaoOk()) ? ModoFotoPergunta.NAO_OK : ModoFotoPergunta.NUNCA;
        return new ModeloChecklist.DadosPergunta(p.id(), p.grupo(), p.texto(), p.tipoResposta(), modo,
                alternativas(p.opcoes()), alternativas(p.motivos()));
    }

    default ModeloChecklistResponse toResponse(ModeloChecklist modelo, Map<UUID, String> nomesTipos) {
        return new ModeloChecklistResponse(
                modelo.getId(),
                modelo.getNome(),
                modelo.getTipo(),
                modelo.getTipo().getRotulo(),
                modelo.getInstrucoes(),
                modelo.isExigeAssinatura(),
                opcoes(modelo.getIdsTiposVeiculo(), nomesTipos),
                opcoes(modelo.getIdsTiposImplemento(), nomesTipos),
                modelo.perguntasAtivas().stream().map(this::toResponse).toList(),
                modelo.fotosRecebimentoAtivas().stream().map(this::toResponse).toList(),
                modelo.isAtivo());
    }

    default ModeloChecklistResponse.Pergunta toResponse(PerguntaChecklist p) {
        return new ModeloChecklistResponse.Pergunta(p.getId(), p.getOrdem(), p.getGrupo(), p.getTexto(),
                p.getTipoResposta(), p.isFotoNoNaoOk(), p.getModoFoto(),
                p.alternativasAtivas(TipoAlternativaChecklist.OPCAO).stream().map(this::toResponse).toList(),
                p.alternativasAtivas(TipoAlternativaChecklist.MOTIVO).stream().map(this::toResponse).toList());
    }

    default ModeloChecklistResponse.Alternativa toResponse(AlternativaChecklist a) {
        return new ModeloChecklistResponse.Alternativa(a.getId(), a.getTexto(), a.isIndicaProblema());
    }

    default ModeloChecklistResponse.FotoRecebimento toResponse(FotoRecebimentoChecklist f) {
        return new ModeloChecklistResponse.FotoRecebimento(f.getId(), f.getDescricao());
    }

    default ModeloChecklistResumoResponse toResumo(ModeloChecklist modelo, Map<UUID, String> nomesTipos) {
        return new ModeloChecklistResumoResponse(
                modelo.getId(),
                modelo.getNome(),
                modelo.getTipo(),
                modelo.getTipo().getRotulo(),
                nomes(modelo.getIdsTiposVeiculo(), nomesTipos),
                nomes(modelo.getIdsTiposImplemento(), nomesTipos),
                modelo.perguntasAtivas().size(),
                modelo.fotosRecebimentoAtivas().size(),
                modelo.isAtivo());
    }

    private List<ModeloChecklist.DadosAlternativa> alternativas(List<ModeloChecklistRequest.Alternativa> lista) {
        return lista == null ? List.of()
                : lista.stream().map(a -> new ModeloChecklist.DadosAlternativa(a.id(), a.texto(), Boolean.TRUE.equals(a.indicaProblema()))).toList();
    }

    private static List<OpcaoFrota> opcoes(Collection<UUID> ids, Map<UUID, String> nomes) {
        return ids.stream()
                .map(id -> new OpcaoFrota(id.toString(), nomes.getOrDefault(id, "")))
                .sorted(Comparator.comparing(OpcaoFrota::rotulo))
                .toList();
    }

    private static List<String> nomes(Collection<UUID> ids, Map<UUID, String> nomes) {
        return ids.stream().map(id -> nomes.getOrDefault(id, "")).sorted().toList();
    }
}
