package com.nexo.app.modules.estoque.application.usecases;

import com.nexo.app.modules.estoque.application.dto.FechamentoImportacaoDTO;
import com.nexo.app.modules.estoque.application.dto.FechamentoObraFilter;
import com.nexo.app.modules.estoque.application.dto.FechamentoObraResponses;
import com.nexo.app.modules.estoque.application.services.GravadorEventoSolicitacaoService;
import com.nexo.app.modules.estoque.domain.Estoque;
import com.nexo.app.modules.estoque.domain.Material;
import com.nexo.app.modules.estoque.domain.TipoEstoque;
import com.nexo.app.modules.estoque.infrastructure.persistence.EstoqueRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.MaterialRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.TipoEstoqueRepository;
import com.nexo.app.modules.obras.ObraApi;
import com.nexo.app.modules.obras.ObraApi.ObraPublica;
import com.nexo.app.modules.obras.ObraApi.TipoObraPublico;
import com.nexo.app.shared.application.dto.ImportacaoStatus;
import com.nexo.app.shared.domain.exception.PreenchimentoInvalidoException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

/** Planilha do fechamento: leitura, validação, confirmação por solicitação e exportação do recorte. */
@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:fechamento-importacao;DB_CLOSE_DELAY=-1")
@WithMockUser(authorities = {"obras:fechamento:read", "obras:fechamento:create"})
class FechamentoObraImportacaoExportacaoTest {

    private static final String CABECALHO =
            "Numero Obra;Almoxarifado Atendimento;Tipo Movimentacao;Codigo Material;Quantidade;Numero Reserva;Data Reserva;Observacao\r\n";

    @Autowired private ImportacaoFechamentoObraUseCases importacao;
    @Autowired private ExportarFechamentoObraUseCase exportacao;
    @Autowired private FechamentoObraUseCases fechamento;
    @Autowired private TipoEstoqueRepository tipoEstoqueRepository;
    @Autowired private EstoqueRepository estoqueRepository;
    @Autowired private MaterialRepository materialRepository;

    @MockitoBean private ObraApi obraApi;
    @MockitoBean private GravadorEventoSolicitacaoService gravadorEvento;
    @MockitoBean private EstoqueObraProvisioningService estoqueObraProvisioningService;

    private final UUID idUsuario = UUID.randomUUID();
    private ObraPublica obra;
    private Estoque almoxarifado;
    private Material cabo;
    private Material poste;

    @BeforeEach
    void preparar() {
        TipoEstoque tipoObra = tipoEstoqueRepository.findByNomeIgnoreCase("OBRA")
                .orElseGet(() -> tipoEstoqueRepository.saveAndFlush(new TipoEstoque("OBRA")));
        TipoEstoque tipoFisico = tipoEstoqueRepository.findByNomeIgnoreCase("FISICO")
                .orElseGet(() -> tipoEstoqueRepository.saveAndFlush(new TipoEstoque("FISICO")));
        String sufixo = UUID.randomUUID().toString().substring(0, 8);
        obra = new ObraPublica(UUID.randomUUID(), "OB-" + sufixo, "Obra teste", TipoObraPublico.OBRA, true,
                UUID.randomUUID(), "Processo", true, UUID.randomUUID(), Set.of(), null, List.of());
        Estoque estoqueObra = new Estoque("OBRA " + sufixo, tipoObra);
        estoqueObra.vincularObra(obra.id());
        Estoque salvo = estoqueRepository.saveAndFlush(estoqueObra);
        almoxarifado = estoqueRepository.saveAndFlush(new Estoque("ALMOX " + sufixo, tipoFisico));
        cabo = material("CABO");
        poste = material("POSTE");
        when(obraApi.buscarPorNumero(anyString())).thenReturn(Optional.empty());
        when(obraApi.buscarPorNumero(obra.numero())).thenReturn(Optional.of(obra));
        when(obraApi.buscarPorId(obra.id())).thenReturn(Optional.of(obra));
        when(estoqueObraProvisioningService.resolverOuProvisionar(any())).thenReturn(salvo);
    }

    @Test
    void modeloAbreNaValidacaoComAsColunasEsperadas() {
        String modelo = new String(importacao.modeloCsv(), StandardCharsets.UTF_8);

        var resposta = importacao.validarArquivo(arquivo(modelo));

        assertThat(resposta.registros()).hasSize(3);
        assertThat(resposta.registros().getFirst().linha()).isEqualTo(5);
        assertThat(resposta.registros().getFirst().quantidade()).isEqualByComparingTo("10.5");
    }

    @Test
    void agrupaPorObraAlmoxarifadoTipoEReservaEApontaErroPorLinha() {
        var resposta = importacao.validarArquivo(arquivo(CABECALHO
                + linha("221", cabo, "10", "", "", "Primeira observação")
                + linha("221", poste, "2,5", "", "", "")
                + linha("222", cabo, "1", "123", "01/11/2026", "")
                + linha("221", cabo, "3", "", "", "")
                + linha("999", cabo, "1", "", "", "")
                + obra.numero() + ";" + almoxarifado.getNomeIdentificador() + ";921;NAO-EXISTE;abc;12A;31/02/2026;=SOMA(A1)\r\n"
                + "OBRA-X;" + almoxarifado.getNomeIdentificador() + ";221;" + cabo.getCodigo() + ";1;;;\r\n"));

        assertThat(resposta.totalProcessados()).isEqualTo(7);
        assertThat(resposta.totalSucesso()).isEqualTo(3);
        assertThat(resposta.totalFalha()).isEqualTo(4);
        assertThat(resposta.totalSolicitacoes()).isEqualTo(2);

        List<FechamentoImportacaoDTO> linhas = resposta.registros();
        assertThat(linhas.get(0).tituloObra()).isEqualTo("Obra teste");
        assertThat(linhas.get(0).nomeMaterial()).isEqualTo("Material CABO");
        assertThat(linhas.get(1).quantidade()).isEqualByComparingTo("2.5");
        assertThat(linhas.get(2).dataReserva()).isEqualTo("2026-11-01");
        assertThat(linhas.get(3).campoErro()).isEqualTo("codigoMaterial");
        assertThat(linhas.get(3).mensagemErro()).contains("já está na linha 2");
        assertThat(linhas.get(4).campoErro()).isEqualTo("tipo");
        assertThat(linhas.get(5).campoErro()).isEqualTo("codigoMaterial");
        assertThat(linhas.get(5).mensagemErro())
                .contains("quantidade positiva", "só números", "DD/MM/AAAA", "não pode começar");
        assertThat(linhas.get(6).mensagemErro()).contains("OBRA-X");
    }

    @Test
    void recusaArquivoForaDoModelo() {
        assertThatThrownBy(() -> importacao.validarArquivo(arquivo("Obra;Material\r\n1;2\r\n")))
                .isInstanceOf(PreenchimentoInvalidoException.class);
        assertThatThrownBy(() -> importacao.validarArquivo(new MockMultipartFile(
                "arquivo", "fechamento.csv", "text/csv", (CABECALHO + "Almoxarifado São\r\n").getBytes(StandardCharsets.ISO_8859_1))))
                .isInstanceOf(PreenchimentoInvalidoException.class);
        assertThatThrownBy(() -> importacao.validarArquivo(new MockMultipartFile(
                "arquivo", "fechamento.xlsx", "application/octet-stream", new byte[] {1})))
                .isInstanceOf(PreenchimentoInvalidoException.class);
    }

    @Test
    void confirmaSoAsLinhasValidasEReenvioNaoDuplica() {
        var validacao = importacao.validarArquivo(arquivo(CABECALHO
                + linha("221", cabo, "10", "", "", "Sobra da vistoria")
                + linha("221", poste, "2", "", "", "")
                + linha("222", cabo, "1", "123", "01/11/2026", "")
                + linha("999", cabo, "1", "", "", "")));

        var resposta = importacao.confirmar(validacao.registros(), idUsuario, "chave-1");

        assertThat(resposta.totalSolicitacoes()).isEqualTo(2);
        assertThat(resposta.registros()).extracting(FechamentoImportacaoDTO::status).containsExactly(
                ImportacaoStatus.CONCLUIDO, ImportacaoStatus.CONCLUIDO, ImportacaoStatus.CONCLUIDO, ImportacaoStatus.COM_ERRO);

        FechamentoObraFilter daObra = filtro(idUsuario);
        var criadas = fechamento.listar(daObra, PageRequest.of(0, 20)).getContent();
        assertThat(criadas).extracting(FechamentoObraResponses.Resumo::tipo).containsExactlyInAnyOrder("221", "222");
        var adicao = criadas.stream().filter(item -> "221".equals(item.tipo())).findFirst().orElseThrow();
        assertThat(adicao.totalItens()).isEqualTo(2);
        assertThat(fechamento.detalhe(adicao.id()).observacao()).isEqualTo("Sobra da vistoria");
        var devolucao = criadas.stream().filter(item -> "222".equals(item.tipo())).findFirst().orElseThrow();
        assertThat(devolucao.numeroReserva()).isEqualTo("123");

        importacao.confirmar(validacao.registros(), idUsuario, "chave-1");
        assertThat(fechamento.listar(daObra, PageRequest.of(0, 20)).getContent()).hasSize(2);
    }

    @Test
    void exportaUmaLinhaPorSolicitacaoOuPorMaterialRespeitandoORecorte() {
        var validacao = importacao.validarArquivo(arquivo(CABECALHO
                + linha("221", cabo, "10.5", "", "", "=perigo")
                + linha("221", poste, "2", "", "", "")));
        var semFormula = validacao.registros().stream()
                .map(registro -> new FechamentoImportacaoDTO(registro.linha(), registro.numeroObra(), null,
                        registro.almoxarifado(), registro.tipo(), registro.codigoMaterial(), null, registro.quantidade(),
                        null, null, null, null, null, null))
                .toList();
        importacao.confirmar(semFormula, idUsuario, null);

        String[] resumo = csv(exportacao.resumo(filtro(idUsuario)));
        String[] detalhado = csv(exportacao.detalhado(filtro(idUsuario)));
        String[] deOutraPessoa = csv(exportacao.resumo(filtro(UUID.randomUUID())));

        assertThat(resumo).hasSize(2);
        assertThat(resumo[0]).startsWith("﻿ID Solicitação;Tipo;Situação").endsWith("Qtd Total Pendente");
        assertThat(resumo[1]).contains(";221;Aguardando reserva;", obra.numero()).endsWith(";2;12.5;0;12.5");
        assertThat(detalhado).hasSize(3);
        assertThat(detalhado[0]).endsWith("Pendência do Material");
        assertThat(detalhado[1] + detalhado[2]).contains(cabo.getCodigo(), poste.getCodigo(), ";10.5;0;10.5;");
        assertThat(deOutraPessoa).hasSize(1);
    }

    private FechamentoObraFilter filtro(UUID idSolicitante) {
        return new FechamentoObraFilter(idSolicitante, obra.id(), null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null);
    }

    private String linha(String tipo, Material material, String quantidade, String reserva, String data, String observacao) {
        return String.join(";", obra.numero(), almoxarifado.getNomeIdentificador(), tipo, material.getCodigo(),
                quantidade, reserva, data, observacao) + "\r\n";
    }

    private static MockMultipartFile arquivo(String conteudo) {
        return new MockMultipartFile("arquivo", "fechamento.csv", "text/csv", conteudo.getBytes(StandardCharsets.UTF_8));
    }

    private static String[] csv(byte[] conteudo) {
        return new String(conteudo, StandardCharsets.UTF_8).split("\r\n");
    }

    private Material material(String prefixo) {
        return materialRepository.saveAndFlush(new Material(
                prefixo + "-" + UUID.randomUUID().toString().substring(0, 8), "Material " + prefixo, "UN", "MATR",
                null, null, false, UUID.randomUUID()));
    }
}
