package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.application.dto.AnexoOrdemServicoResponse;
import com.nexo.app.modules.frota.application.dto.ArquivoAnexoDespesa;
import com.nexo.app.modules.frota.domain.AnexoOrdemServico;
import com.nexo.app.modules.frota.domain.OrdemServico;
import com.nexo.app.modules.frota.domain.SituacaoOrdemServico;
import com.nexo.app.modules.frota.domain.TipoEventoOrdemServico;
import com.nexo.app.modules.frota.infrastructure.persistence.AnexoOrdemServicoRepository;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import com.nexo.app.shared.infrastructure.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

/**
 * Anexos e evidências da OS (checklist assinado, fotos, laudos). Valem com a OS aberta ou
 * concluída, porque o checklist assinado costuma voltar depois do serviço; a cancelada recusa.
 */
@Service
@RequiredArgsConstructor
public class AnexoOrdemServicoUseCases {

    private final AnexoOrdemServicoRepository anexos;
    private final OrdemServicoUseCases ordens;
    private final AnexosFrota arquivos;

    @Transactional(readOnly = true)
    public List<AnexoOrdemServicoResponse> listar(UUID idOs) {
        ordens.buscarEntidade(idOs);
        return montar(anexos.findAllByIdOrdemServicoAndAtivoTrueOrderByDataCriacaoAsc(idOs));
    }

    @Transactional
    public List<AnexoOrdemServicoResponse> anexar(UUID idOs, String descricao, MultipartFile arquivo) {
        OrdemServico os = ordens.buscarEntidade(idOs);
        if (os.getSituacao() == SituacaoOrdemServico.CANCELADA) {
            throw new InvarianteVioladaException("A OS " + os.getNumero() + " foi cancelada e não recebe anexos.");
        }
        var anexo = arquivos.enviar("frota/ordens-servico/" + idOs + "/anexos", arquivo,
                a -> anexos.saveAndFlush(new AnexoOrdemServico(idOs, descricao, a.chave(), a.nome(), a.contentType(),
                        a.tamanho())));
        ordens.registrar(os, TipoEventoOrdemServico.ANEXO_INCLUIDO, rotulo(anexo) + ".", SecurityUtils.getUsuarioLogadoId());
        return listar(idOs);
    }

    @Transactional(readOnly = true)
    public ArquivoAnexoDespesa baixar(UUID idOs, UUID idAnexo) {
        var anexo = anexo(idOs, idAnexo);
        return new ArquivoAnexoDespesa(anexo.getArquivoNome(), anexo.getArquivoContentType(),
                anexo.getArquivoTamanhoBytes() == null ? -1 : anexo.getArquivoTamanhoBytes(),
                arquivos.baixar(anexo.getArquivoChave()));
    }

    /** Exclusão lógica; o arquivo fica para auditoria. */
    @Transactional
    public List<AnexoOrdemServicoResponse> remover(UUID idOs, UUID idAnexo) {
        OrdemServico os = ordens.buscarEntidade(idOs);
        if (os.getSituacao() == SituacaoOrdemServico.CANCELADA) {
            throw new InvarianteVioladaException("A OS " + os.getNumero() + " foi cancelada; os anexos ficam como estão.");
        }
        var anexo = anexo(idOs, idAnexo);
        anexo.desativar();
        anexos.save(anexo);
        ordens.registrar(os, TipoEventoOrdemServico.ANEXO_EXCLUIDO, rotulo(anexo) + ".", SecurityUtils.getUsuarioLogadoId());
        return listar(idOs);
    }

    private static String rotulo(AnexoOrdemServico anexo) {
        return anexo.getDescricao() == null ? anexo.getArquivoNome()
                : anexo.getDescricao() + " (" + anexo.getArquivoNome() + ")";
    }

    private AnexoOrdemServico anexo(UUID idOs, UUID idAnexo) {
        return anexos.findById(idAnexo).filter(AnexoOrdemServico::isAtivo)
                .filter(a -> a.getIdOrdemServico().equals(idOs))
                .orElseThrow(() -> new RecursoNaoEncontradoException("Anexo não encontrado nesta OS."));
    }

    private List<AnexoOrdemServicoResponse> montar(List<AnexoOrdemServico> lista) {
        return lista.stream().map(a -> new AnexoOrdemServicoResponse(a.getId(), a.getDescricao(), a.getArquivoNome(),
                a.getArquivoContentType(), a.getArquivoTamanhoBytes(), a.getDataCriacao(), a.getUsuarioCriacao())).toList();
    }
}
