package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.application.dto.ArquivoDocumentoFrota;
import com.nexo.app.modules.frota.application.dto.SituacaoVeiculoAppResponse;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import com.nexo.app.modules.frota.domain.DespesaVeiculo;
import com.nexo.app.modules.frota.domain.DocumentoFrota;
import com.nexo.app.modules.frota.domain.OrdemServico;
import com.nexo.app.modules.frota.domain.PendenciaChecklist;
import com.nexo.app.modules.frota.domain.SituacaoOrdemServico;
import com.nexo.app.modules.frota.domain.SituacaoPendenciaChecklist;
import com.nexo.app.modules.frota.domain.SituacaoVencimento;
import com.nexo.app.modules.frota.infrastructure.persistence.DespesaVeiculoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.DocumentoFrotaRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.OrdemServicoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.PendenciaChecklistRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Situação de um veículo para quem o usa no campo: o app consulta antes de sair com ele e para
 * acompanhar o conserto do que apontou no checklist, sem acesso às telas de gestão da frota.
 */
@Service
@RequiredArgsConstructor
public class SituacaoVeiculoAppUseCases {

    static final String CODIGO_LAVAGEM = "LAVAGEM";

    private static final EnumSet<SituacaoPendenciaChecklist> PENDENCIAS_EM_ABERTO =
            EnumSet.of(SituacaoPendenciaChecklist.ABERTA, SituacaoPendenciaChecklist.OS_ABERTA);

    private final VeiculoFrotaUseCases veiculos;
    private final OrdemServicoRepository ordens;
    private final PendenciaChecklistRepository pendencias;
    private final DocumentoFrotaRepository documentos;
    private final ParametrosFrotaUseCases parametros;
    private final DespesaVeiculoRepository despesas;
    private final PreventivaUseCases preventiva;
    private final com.nexo.app.modules.frota.infrastructure.persistence.AcoplamentoImplementoRepository acoplamentos;
    private final com.nexo.app.shared.infrastructure.storage.ObjectStorageService objectStorage;

    @Transactional(readOnly = true)
    public SituacaoVeiculoAppResponse situacao(UUID idVeiculo) {
        var veiculo = veiculos.detalhar(idVeiculo);
        var abertas = ordens.findAllByIdVeiculoAndSituacaoInAndAtivoTrueOrderByAbertaEmDesc(idVeiculo, SituacaoOrdemServico.ABERTAS);
        var concluidas = ordens.findTop5ByIdVeiculoAndSituacaoAndAtivoTrueOrderByFimRealDesc(idVeiculo, SituacaoOrdemServico.CONCLUIDA);
        var emAberto = pendencias.findAllByIdVeiculoAndSituacaoInAndAtivoTrueOrderByDataCriacaoDesc(idVeiculo, PENDENCIAS_EM_ABERTO);

        Map<UUID, Long> numeros = ordens.findAllById(emAberto.stream().map(PendenciaChecklist::getIdOrdemServico)
                        .filter(Objects::nonNull).distinct().toList()).stream()
                .collect(Collectors.toMap(OrdemServico::getId, OrdemServico::getNumero));
        LocalDate hoje = LocalDate.now();
        int diasAviso = parametros.diasAviso();

        return new SituacaoVeiculoAppResponse(
                veiculo.idVeiculo(),
                veiculo.placa(),
                veiculo.modelo(),
                veiculo.baseOperacional(),
                veiculo.situacao(),
                veiculo.kmAtual(),
                veiculo.kmAtualEm(),
                veiculo.unidadeMedicao(),
                veiculo.condutorAtual() == null ? null : veiculo.condutorAtual().condutor(),
                abertas.stream().map(SituacaoVeiculoAppUseCases::ordem).toList(),
                concluidas.stream().map(SituacaoVeiculoAppUseCases::ordem).toList(),
                emAberto.stream().map(p -> new SituacaoVeiculoAppResponse.Pendencia(p.getId(), p.getResposta().resumo(),
                        p.getSituacao(), numeros.get(p.getIdOrdemServico()), p.getDataCriacao())).toList(),
                documentosComVencimento(idVeiculo, hoje, diasAviso),
                lavagens(idVeiculo),
                preventiva.pendentesDoVeiculo(idVeiculo).stream()
                        .map(p -> new SituacaoVeiculoAppResponse.Preventiva(p.plano(), p.situacao(), p.falta(),
                                p.previsao(), p.numeroOrdemServico()))
                        .toList(),
                documentosDoConjunto(idVeiculo, veiculo.placa(), hoje, diasAviso));
    }

    /** Arquivo de um documento do veículo ou de implemento acoplado a ele agora, para o app abrir. */
    @Transactional(readOnly = true)
    public ArquivoDocumentoFrota arquivo(UUID idVeiculo, UUID idDocumento) {
        DocumentoFrota documento = documentos.findById(idDocumento).filter(DocumentoFrota::isAtivo)
                .filter(DocumentoFrota::possuiArquivo)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Documento sem arquivo ou não encontrado."));
        boolean doVeiculo = idVeiculo.equals(documento.getIdVeiculo());
        boolean doImplemento = documento.getIdImplemento() != null && acoplamentos.findAllByIdVeiculoInAndFimIsNullAndAtivoTrue(
                List.of(idVeiculo)).stream().anyMatch(a -> a.getImplemento().getId().equals(documento.getIdImplemento()));
        if (!doVeiculo && !doImplemento) {
            throw new RecursoNaoEncontradoException("Este documento não é deste veículo.");
        }
        var objeto = objectStorage.baixar(documento.getArquivoChave());
        return new ArquivoDocumentoFrota(documento.getArquivoNome(), documento.getArquivoContentType(),
                documento.getArquivoTamanhoBytes(), objeto.conteudo());
    }

    /** Veículo primeiro (pelo vencimento mais próximo), depois os implementos acoplados agora. */
    private List<SituacaoVeiculoAppResponse.DocumentoConjunto> documentosDoConjunto(UUID idVeiculo, String placa, LocalDate hoje,
                                                                                 int diasAviso) {
        var resultado = new java.util.ArrayList<SituacaoVeiculoAppResponse.DocumentoConjunto>();
        documentos.findAllByIdVeiculoAndAtivoTrueOrderByDataVencimentoAsc(idVeiculo)
                .forEach(d -> resultado.add(documentoConjunto(d, placa, false, hoje, diasAviso)));
        var acoplados = acoplamentos.findAllByIdVeiculoInAndFimIsNullAndAtivoTrue(List.of(idVeiculo));
        if (!acoplados.isEmpty()) {
            Map<UUID, String> nomes = acoplados.stream().collect(Collectors.toMap(a -> a.getImplemento().getId(),
                    a -> a.getImplemento().getIdentificacao(), (a, b) -> a));
            documentos.findAllByIdImplementoInAndAtivoTrue(nomes.keySet())
                    .forEach(d -> resultado.add(documentoConjunto(d, nomes.get(d.getIdImplemento()), true, hoje, diasAviso)));
        }
        return resultado;
    }

    private static SituacaoVeiculoAppResponse.DocumentoConjunto documentoConjunto(DocumentoFrota d, String titular,
                                                                                boolean doImplemento, LocalDate hoje,
                                                                                int diasAviso) {
        boolean comArquivo = d.possuiArquivo();
        return new SituacaoVeiculoAppResponse.DocumentoConjunto(d.getId(), d.getTipo(), d.getDescricao(), titular, doImplemento,
                d.getDataVencimento(), d.getDataVencimento() == null ? SituacaoVencimento.SEM_VENCIMENTO
                        : SituacaoVencimento.calcular(d.getDataVencimento(), hoje, diasAviso),
                comArquivo ? d.getArquivoNome() : null, comArquivo ? d.getArquivoContentType() : null,
                comArquivo ? d.getArquivoTamanhoBytes() : null,
                comArquivo ? d.getArquivoChave() + ":" + d.getVersao() : null);
    }

    private List<SituacaoVeiculoAppResponse.Lavagem> lavagens(UUID idVeiculo) {
        var lista = despesas.findTop5ByIdVeiculoAndTipoCodigoAndAtivoTrueOrderByDataDescDataCriacaoDesc(idVeiculo, CODIGO_LAVAGEM);
        return lista.stream().map(d -> new SituacaoVeiculoAppResponse.Lavagem(d.getData(),
                d.getSubtipo() == null ? null : d.getSubtipo().getNome(), d.getUsuarioCriacao())).toList();
    }

    private List<SituacaoVeiculoAppResponse.Documento> documentosComVencimento(UUID idVeiculo, LocalDate hoje, int diasAviso) {
        return documentos.findAllByIdVeiculoAndAtivoTrueOrderByDataVencimentoAsc(idVeiculo).stream()
                .filter(d -> d.getDataVencimento() != null)
                .map(d -> documento(d, hoje, diasAviso))
                .toList();
    }

    private static SituacaoVeiculoAppResponse.Documento documento(DocumentoFrota d, LocalDate hoje, int diasAviso) {
        return new SituacaoVeiculoAppResponse.Documento(d.getTipo(), d.getDescricao(), d.getDataVencimento(),
                SituacaoVencimento.calcular(d.getDataVencimento(), hoje, diasAviso));
    }

    private static SituacaoVeiculoAppResponse.Ordem ordem(OrdemServico o) {
        return new SituacaoVeiculoAppResponse.Ordem(o.getId(), o.getNumero(), o.getTipoManutencao(), o.getSituacao(),
                o.getCriticidade(), o.getDescricao(), o.getOficinaNome(), o.isVeiculoParado(), o.getAbertaEm(),
                o.getAgendadaPara(), o.getLocalAgendamento(), o.getPrevisaoTermino(), o.getFimReal());
    }
}
