package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.financeiro.FinanceiroApi;
import com.nexo.app.modules.frota.application.dto.PreenchimentoFinanceiroResponse;
import com.nexo.app.modules.frota.domain.Apolice;
import com.nexo.app.modules.frota.domain.ParcelaApolice;
import com.nexo.app.modules.frota.infrastructure.persistence.ParcelaApoliceRepository;
import com.nexo.app.shared.domain.events.SolicitacaoFinanceiraCriadaEvent;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * Pagamento das parcelas da apólice pelo financeiro: o preenchimento da solicitação (origem
 * {@code FROTA_SEGURO}, id da parcela), o vínculo quando o financeiro cria a solicitação e a
 * aprovação ou reprovação depois.
 */
@Service
@RequiredArgsConstructor
public class PagamentoApoliceUseCases {

    public static final String ORIGEM_FINANCEIRO = "FROTA_SEGURO";
    private static final DateTimeFormatter DATA = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    private final ParcelaApoliceRepository parcelas;
    private final ReferenciasFrota referencias;
    private final FinanceiroApi financeiro;

    /** Valores para o formulário de pagamento: seguradora, base, setor, valor, vencimento e a descrição da parcela. */
    @Transactional(readOnly = true)
    public PreenchimentoFinanceiroResponse preenchimentoFinanceiro(UUID idParcela) {
        ParcelaApolice parcela = buscarParcela(idParcela);
        parcela.exigirPodePedirPagamento();
        Apolice apolice = parcela.getApolice();
        Map<String, Object> valores = new LinkedHashMap<>();
        Map<String, String> rotulos = new LinkedHashMap<>();
        String seguradora = financeiro.nomesFornecedores(List.of(apolice.getIdSeguradora())).get(apolice.getIdSeguradora());
        valores.put("fornecedorId", apolice.getIdSeguradora());
        rotulos.put("fornecedorId", seguradora);
        if (apolice.getIdBaseOperacional() != null) {
            valores.put("baseId", apolice.getIdBaseOperacional());
            rotulos.put("baseId", referencias.nomesBases(List.of(apolice.getIdBaseOperacional())).get(apolice.getIdBaseOperacional()));
        }
        if (apolice.getIdProcesso() != null) {
            valores.put("processoId", apolice.getIdProcesso());
        }
        valores.put("valor", parcela.getValor());
        valores.put("vencimento", parcela.getVencimento());
        int total = apolice.getParcelasAtivas().size();
        String descricao = "Parcela " + parcela.getNumero() + "/" + total + " da " + apolice.descricao()
                + (seguradora == null ? "" : " (" + seguradora + ")") + ", vigência " + apolice.getVigenciaInicio().format(DATA)
                + " a " + apolice.getVigenciaFim().format(DATA) + ".";
        valores.put("descricao", descricao);
        // O formulário de pagamento não tem descrição: a identificação da parcela vai também nas observações.
        valores.put("observacoes", "Seguro da frota. " + descricao + " Vencimento em " + parcela.getVencimento().format(DATA) + ".");
        rotulos.values().removeIf(Objects::isNull);
        // Lido como "Solicitação aberta pela parcela 2/12 da apólice 123".
        return new PreenchimentoFinanceiroResponse(ORIGEM_FINANCEIRO,
                "parcela " + parcela.getNumero() + "/" + total + " da apólice " + apolice.getNumero(), "PADRAO", valores, rotulos);
    }

    /** O financeiro criou a solicitação pedida pela parcela (na mesma transação). */
    @Transactional
    public void vincular(SolicitacaoFinanceiraCriadaEvent evento) {
        if (!ORIGEM_FINANCEIRO.equals(evento.origemTipo())) {
            return;
        }
        var parcela = buscarParcela(evento.origemId());
        parcela.vincularSolicitacao(evento.idSolicitacao());
        parcelas.save(parcela);
    }

    /** Aprovação ou reprovação da solicitação: a apólice mostra a situação da parcela. */
    @Transactional
    public void registrarDecisao(UUID idSolicitacao, Long numero, boolean aprovada, String motivo) {
        parcelas.findByIdSolicitacaoFinanceira(idSolicitacao).ifPresent(p -> {
            p.registrarDecisao(numero, aprovada, motivo);
            parcelas.save(p);
        });
    }

    private ParcelaApolice buscarParcela(UUID idParcela) {
        return parcelas.findById(idParcela).orElseThrow(() -> new RecursoNaoEncontradoException("Parcela da apólice não encontrada."));
    }
}
