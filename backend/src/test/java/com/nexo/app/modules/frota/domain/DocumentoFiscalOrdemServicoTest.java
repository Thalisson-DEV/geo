package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DocumentoFiscalOrdemServicoTest {

    private final OrdemServico os = abrir();

    private static OrdemServico abrir() {
        var item = new ItemManutencao("PASTILHA", "SUSPENSAO_FREIOS", null, null);
        ReflectionTestUtils.setField(item, "id", UUID.randomUUID());
        var ficha = FichaVeiculo.provisionar(UUID.randomUUID(), "ABC1D23", UUID.randomUUID());
        var os = OrdemServico.abrir(ficha, new OrdemServico.Abertura(TipoManutencao.CORRETIVA, OrigemOrdemServico.VERBAL,
                Criticidade.MEDIA, null, "Freio", null, OffsetDateTime.now().minusHours(3), null, TipoOficina.EXTERNA,
                null, "Oficina do Zé", false), List.of(item), null);
        ReflectionTestUtils.setField(os, "id", UUID.randomUUID());
        return os;
    }

    private static DocumentoFiscalOrdemServico.Dados nota(String numero, String serie, String fornecedor) {
        return new DocumentoFiscalOrdemServico.Dados(TipoDocumentoFiscal.NFSE, numero, serie, LocalDate.now(), null,
                fornecedor, new BigDecimal("230.00"));
    }

    @Test
    void registraNotaNormalizandoNumeroESerie() {
        var doc = DocumentoFiscalOrdemServico.registrar(os, nota(" a1234 ", "u", "Oficina do Zé"));

        assertThat(doc.getIdOrdemServico()).isEqualTo(os.getId());
        assertThat(doc.getNumero()).isEqualTo("A1234");
        assertThat(doc.getSerie()).isEqualTo("U");
        assertThat(doc.possuiArquivo()).isFalse();
    }

    @Test
    void aceitaOsConcluidaERecusaCancelada() {
        os.concluir(new OrdemServico.Encerramento(OffsetDateTime.now().minusHours(2), OffsetDateTime.now().minusHours(1),
                "Feito", null, new BigDecimal("230"), null, TipoOficina.EXTERNA, null, "Oficina do Zé",
                "AVARIA"));
        assertThat(DocumentoFiscalOrdemServico.registrar(os, nota("1", null, "Zé")).getNumero()).isEqualTo("1");

        var cancelada = abrir();
        cancelada.cancelar("Aberta por engano", OffsetDateTime.now());
        assertThatThrownBy(() -> DocumentoFiscalOrdemServico.registrar(cancelada, nota("1", null, "Zé")))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("cancelada");
    }

    @Test
    void recusaEmissaoFuturaFornecedorAusenteEValorNegativo() {
        assertThatThrownBy(() -> DocumentoFiscalOrdemServico.registrar(os, new DocumentoFiscalOrdemServico.Dados(
                TipoDocumentoFiscal.NFE, "1", null, LocalDate.now().plusDays(1), null, "Zé", BigDecimal.ONE)))
                .hasMessageContaining("futuro");
        assertThatThrownBy(() -> DocumentoFiscalOrdemServico.registrar(os, nota("1", null, " ")))
                .hasMessageContaining("fornecedor");
        assertThatThrownBy(() -> DocumentoFiscalOrdemServico.registrar(os, new DocumentoFiscalOrdemServico.Dados(
                TipoDocumentoFiscal.NFE, "1", null, LocalDate.now(), null, "Zé", new BigDecimal("-1"))))
                .hasMessageContaining("valor");
    }

    @Test
    void mesmaNotaComparaTipoNumeroSerieEFornecedor() {
        var a = DocumentoFiscalOrdemServico.registrar(os, nota("555", "1", "Oficina do Zé"));

        assertThat(a.mesmaNota(DocumentoFiscalOrdemServico.registrar(os, nota("555", "1", "OFICINA DO ZÉ")))).isTrue();
        assertThat(a.mesmaNota(DocumentoFiscalOrdemServico.registrar(os, nota("555", "2", "Oficina do Zé")))).isFalse();
        assertThat(a.mesmaNota(DocumentoFiscalOrdemServico.registrar(os, nota("555", "1", "Outra oficina")))).isFalse();
    }
}
