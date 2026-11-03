package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.financeiro.FinanceiroApi;
import com.nexo.app.modules.frota.application.dto.PreenchimentoFinanceiroResponse;
import com.nexo.app.modules.frota.domain.DespesaVeiculo;
import com.nexo.app.modules.frota.domain.TipoDocumentoFiscal;
import com.nexo.app.modules.frota.infrastructure.persistence.DespesaVeiculoRepository;
import com.nexo.app.shared.domain.events.SolicitacaoFinanceiraCriadaEvent;
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
 * Pagamento da despesa pelo financeiro: o preenchimento da solicitação (origem {@code FROTA_DESPESA}),
 * o vínculo quando o financeiro cria a solicitação e a aprovação ou reprovação depois.
 */
@Service
@RequiredArgsConstructor
public class PagamentoDespesaUseCases {

    public static final String ORIGEM_FINANCEIRO = "FROTA_DESPESA";
    private static final DateTimeFormatter DATA = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    private final DespesaVeiculoRepository repository;
    private final DespesaVeiculoUseCases despesas;
    private final ReferenciasFrota referencias;
    private final FinanceiroApi financeiro;

    /** Valores para o formulário de pagamento: veículo, base, setor, fornecedor, valor, nota e a descrição da despesa. */
    @Transactional(readOnly = true)
    public PreenchimentoFinanceiroResponse preenchimentoFinanceiro(UUID id) {
        DespesaVeiculo d = despesas.buscarEntidade(id);
        d.exigirPodePedirPagamento();
        var veiculo = referencias.veiculos(List.of(d.getIdVeiculo())).get(d.getIdVeiculo());
        String placa = veiculo == null ? "" : veiculo.placa();
        Map<String, Object> valores = new LinkedHashMap<>();
        Map<String, String> rotulos = new LinkedHashMap<>();
        valores.put("veiculoId", d.getIdVeiculo());
        rotulos.put("veiculoId", placa);
        if (d.getIdBaseOperacional() != null) {
            valores.put("baseId", d.getIdBaseOperacional());
            rotulos.put("baseId", referencias.nomesBases(List.of(d.getIdBaseOperacional())).get(d.getIdBaseOperacional()));
        }
        if (d.getIdProcesso() != null) {
            valores.put("processoId", d.getIdProcesso());
        }
        if (d.getIdFornecedor() != null) {
            valores.put("fornecedorId", d.getIdFornecedor());
            rotulos.put("fornecedorId", financeiro.nomesFornecedores(List.of(d.getIdFornecedor())).get(d.getIdFornecedor()));
        } else if (d.getFornecedorNome() != null) {
            valores.put("fornecedorNome", d.getFornecedorNome());
        }
        valores.put("valor", d.getValor());
        boolean notaFiscal = d.getDocumentoTipo() == TipoDocumentoFiscal.NFE || d.getDocumentoTipo() == TipoDocumentoFiscal.NFSE;
        if (notaFiscal) {
            valores.put("temNf", true);
            valores.put("numeroNf", d.getDocumentoNumero());
        }
        String documento = d.getDocumentoTipo() == null ? "" : " (" + d.getDocumentoTipo().getRotulo() + " " + d.getDocumentoNumero() + ")";
        valores.put("descricao", d.descricaoTipo() + " do " + placa + " em " + d.getData().format(DATA) + documento
                + (d.getDescricao() == null ? "." : ": " + d.getDescricao()));
        valores.put("observacoes", "Despesa lançada na frota por veículo.");
        rotulos.values().removeIf(Objects::isNull);
        // Lido como "Solicitação aberta pela despesa lavagem completa do ABC1D23".
        return new PreenchimentoFinanceiroResponse(ORIGEM_FINANCEIRO, "despesa " + d.descricaoTipo().toLowerCase() + " do " + placa, "PADRAO", valores, rotulos);
    }

    /** O financeiro criou a solicitação pedida pela despesa (na mesma transação). */
    @Transactional
    public void vincular(SolicitacaoFinanceiraCriadaEvent evento) {
        if (!ORIGEM_FINANCEIRO.equals(evento.origemTipo())) {
            return;
        }
        var despesa = despesas.buscarEntidade(evento.origemId());
        despesa.vincularSolicitacao(evento.idSolicitacao());
        repository.save(despesa);
    }

    /** Aprovação ou reprovação da solicitação: a despesa mostra a situação do pagamento. */
    @Transactional
    public void registrarDecisao(UUID idSolicitacao, Long numero, boolean aprovada, String motivo) {
        repository.findByIdSolicitacaoFinanceira(idSolicitacao).ifPresent(d -> {
            d.registrarDecisao(numero, aprovada, motivo);
            repository.save(d);
        });
    }
}
