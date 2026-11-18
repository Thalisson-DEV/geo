package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.financeiro.FinanceiroApi;
import com.nexo.app.modules.frota.application.dto.DocumentoFiscalOrdemServicoRequest;
import com.nexo.app.modules.frota.domain.Criticidade;
import com.nexo.app.modules.frota.domain.DocumentoFiscalOrdemServico;
import com.nexo.app.modules.frota.domain.FichaVeiculo;
import com.nexo.app.modules.frota.domain.ItemManutencao;
import com.nexo.app.modules.frota.domain.NaturezaServico;
import com.nexo.app.modules.frota.domain.OrdemServico;
import com.nexo.app.modules.frota.domain.OrigemOrdemServico;
import com.nexo.app.modules.frota.domain.TipoDocumentoFiscal;
import com.nexo.app.modules.frota.domain.TipoEventoOrdemServico;
import com.nexo.app.modules.frota.domain.TipoManutencao;
import com.nexo.app.modules.frota.domain.TipoOficina;
import com.nexo.app.modules.frota.infrastructure.persistence.DocumentoFiscalOrdemServicoRepository;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.infrastructure.security.SecurityUtils;
import com.nexo.app.shared.infrastructure.storage.ObjectStorageService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.InputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DocumentoFiscalOrdemServicoUseCasesTest {

    @Mock
    private DocumentoFiscalOrdemServicoRepository repository;
    @Mock
    private OrdemServicoUseCases ordens;
    @Mock
    private FinanceiroApi financeiro;
    @Mock
    private ObjectStorageService objectStorage;
    @InjectMocks
    private DocumentoFiscalOrdemServicoUseCases useCases;

    private OrdemServico os;

    @BeforeEach
    void setUp() {
        var item = new ItemManutencao("PASTILHA", NaturezaServico.SUSPENSAO_FREIOS, null, null);
        ReflectionTestUtils.setField(item, "id", UUID.randomUUID());
        var ficha = FichaVeiculo.provisionar(UUID.randomUUID(), "ABC1D23", UUID.randomUUID());
        os = OrdemServico.abrir(ficha, new OrdemServico.Abertura(TipoManutencao.CORRETIVA, OrigemOrdemServico.VERBAL,
                Criticidade.MEDIA, null, "Freio", null, OffsetDateTime.now().minusHours(3), null, TipoOficina.EXTERNA,
                null, "Oficina do Zé", false), List.of(item), null);
        ReflectionTestUtils.setField(os, "id", UUID.randomUUID());
        lenient().when(ordens.buscarEntidade(os.getId())).thenReturn(os);
        lenient().when(repository.saveAndFlush(any(DocumentoFiscalOrdemServico.class))).thenAnswer(i -> {
            DocumentoFiscalOrdemServico d = i.getArgument(0);
            if (d.getId() == null) ReflectionTestUtils.setField(d, "id", UUID.randomUUID());
            return d;
        });
    }

    private static DocumentoFiscalOrdemServicoRequest nota(String numero) {
        return new DocumentoFiscalOrdemServicoRequest(TipoDocumentoFiscal.NFSE, numero, null, LocalDate.now(), null,
                "Oficina do Zé", new BigDecimal("230.00"));
    }

    @Test
    void lancaComArquivoNoArmazenamentoEGravaNoHistorico() {
        var pdf = new MockMultipartFile("arquivo", "nota 1234.pdf", "application/pdf", new byte[]{1, 2, 3});
        try (MockedStatic<SecurityUtils> s = Mockito.mockStatic(SecurityUtils.class)) {
            var resposta = useCases.criar(os.getId(), nota("1234"), pdf);

            assertThat(resposta.possuiArquivo()).isTrue();
            assertThat(resposta.arquivoNome()).isEqualTo("nota 1234.pdf");
            assertThat(resposta.fornecedor()).isEqualTo("Oficina do Zé");
            verify(objectStorage).enviar(startsWith("frota/os/" + os.getId() + "/documentos-fiscais/"),
                    any(InputStream.class), eq(3L), eq("application/pdf"));
            verify(ordens).registrar(eq(os), eq(TipoEventoOrdemServico.DOCUMENTO_FISCAL_INCLUIDO),
                    eq("NFS-e 1234 de " + LocalDate.now().format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy"))
                            + ", R$ 230,00."), any());
        }
    }

    @Test
    void notaRepetidaNaMesmaOsERecusada() {
        var existente = DocumentoFiscalOrdemServico.registrar(os, new DocumentoFiscalOrdemServico.Dados(
                TipoDocumentoFiscal.NFSE, "1234", null, LocalDate.now(), null, "OFICINA DO ZÉ", BigDecimal.TEN));
        when(repository.findAllByIdOrdemServicoAndAtivoTrueOrderByEmitidoEmAscDataCriacaoAsc(os.getId()))
                .thenReturn(List.of(existente));

        assertThatThrownBy(() -> useCases.criar(os.getId(), nota("1234"), null))
                .isInstanceOf(InvarianteVioladaException.class)
                .hasMessageContaining("já foi lançado");
        verify(repository, never()).saveAndFlush(any());
    }

    @Test
    void arquivoDeTipoNaoSuportadoNaoVaiParaOArmazenamento() {
        var exe = new MockMultipartFile("arquivo", "nota.exe", "application/octet-stream", new byte[]{1});
        try (MockedStatic<SecurityUtils> s = Mockito.mockStatic(SecurityUtils.class)) {
            assertThatThrownBy(() -> useCases.criar(os.getId(), nota("99"), exe))
                    .hasMessageContaining("Tipo de arquivo não suportado");
            verify(objectStorage, never()).enviar(any(), any(), anyLong(), any());
        }
    }

    @Test
    void falhaAoGravarRemoveOArquivoEnviado() {
        var doc = DocumentoFiscalOrdemServico.registrar(os, new DocumentoFiscalOrdemServico.Dados(
                TipoDocumentoFiscal.NFE, "777", "1", LocalDate.now(), null, "Zé", BigDecimal.ONE));
        ReflectionTestUtils.setField(doc, "id", UUID.randomUUID());
        when(repository.findById(doc.getId())).thenReturn(java.util.Optional.of(doc));
        when(repository.saveAndFlush(doc)).thenThrow(new IllegalStateException("banco fora"));
        var xml = new MockMultipartFile("arquivo", "nfe.xml", "text/xml", new byte[]{1});

        assertThatThrownBy(() -> useCases.anexar(os.getId(), doc.getId(), xml)).isInstanceOf(IllegalStateException.class);
        verify(objectStorage).remover(startsWith("frota/os/"));
    }
}
