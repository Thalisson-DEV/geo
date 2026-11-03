package com.nexo.app.modules.desconto.application.usecases;

import com.nexo.app.modules.desconto.application.dto.DescontoBaixaRequest;
import com.nexo.app.modules.desconto.application.dto.DescontoItemRequest;
import com.nexo.app.modules.desconto.application.dto.DescontoRequest;
import com.nexo.app.modules.desconto.application.dto.DescontoValidacaoRequest;
import com.nexo.app.modules.desconto.application.mappers.DescontoMapper;
import com.nexo.app.modules.desconto.domain.Desconto;
import com.nexo.app.modules.desconto.domain.MotivoDesconto;
import com.nexo.app.modules.desconto.domain.StatusDesconto;
import com.nexo.app.modules.desconto.domain.TipoEquipamento;
import com.nexo.app.modules.desconto.infrastructure.persistence.DescontoRepository;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.infrastructure.storage.ObjectStorageService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class DescontoUseCasesTest {

    @Mock private DescontoRepository repository;
    @Mock private DescontoMapper mapper;
    @Mock private MotivoDescontoUseCases motivoUseCases;
    @Mock private TipoEquipamentoUseCases equipamentoUseCases;
    @Mock private ObjectStorageService storageService;
    @Mock private org.springframework.context.ApplicationEventPublisher eventPublisher;
    @Mock private com.nexo.app.modules.rh.ColaboradorApi colaboradorApi;
    @Mock private com.nexo.app.modules.desconto.infrastructure.persistence.EventoDescontoRepository eventoRepository;
    @Mock private com.nexo.app.modules.iam.UsuarioApi usuarioApi;

    @InjectMocks
    private DescontoUseCases useCases;

    private final UUID colaboradorId = UUID.randomUUID();
    private final UUID solicitanteId = UUID.randomUUID();
    private final UUID validadorId = UUID.randomUUID();
    private final UUID baixaId = UUID.randomUUID();
    private final UUID motivoId = UUID.randomUUID();
    private final UUID equipamentoId = UUID.randomUUID();
    private final UUID descontoId = UUID.randomUUID();

    private MotivoDesconto buildMotivo() {
        var m = new MotivoDesconto("Mau Uso", 5);
        ReflectionTestUtils.setField(m, "id", motivoId);
        return m;
    }

    private TipoEquipamento buildEquipamento() {
        var eq = new TipoEquipamento("Ferramental");
        ReflectionTestUtils.setField(eq, "id", equipamentoId);
        return eq;
    }

    private Desconto buildDesconto(MotivoDesconto motivo) {
        var d = new Desconto(colaboradorId, motivo, "Obs", 3, OffsetDateTime.now(), solicitanteId);
        ReflectionTestUtils.setField(d, "id", descontoId);
        return d;
    }

    @Test
    @DisplayName("Deve solicitar desconto com sucesso")
    void deveSolicitarDesconto() {
        var motivo = buildMotivo();
        when(motivoUseCases.buscarEntity(motivoId)).thenReturn(motivo);

        when(repository.save(any(Desconto.class))).thenAnswer(inv -> {
            ReflectionTestUtils.setField((Object) inv.getArgument(0), "id", descontoId);
            return inv.getArgument(0);
        });
        var request = new DescontoRequest(colaboradorId, motivoId, "Teste", 3, OffsetDateTime.now());
        useCases.solicitar(request, solicitanteId);

        verify(repository).save(any(Desconto.class));
        verify(eventoRepository).save(any(com.nexo.app.modules.desconto.domain.EventoDesconto.class));
    }

    @Test
    @DisplayName("Não deve permitir solicitar desconto com parcelas superiores ao teto do motivo")
    void naoDeveSolicitarAcimaTeto() {
        var motivo = buildMotivo(); // teto = 5
        when(motivoUseCases.buscarEntity(motivoId)).thenReturn(motivo);

        var request = new DescontoRequest(colaboradorId, motivoId, "Teste", 6, OffsetDateTime.now()); // Acima de 5
        
        assertThrows(InvarianteVioladaException.class, () -> useCases.solicitar(request, solicitanteId));
    }

    @Test
    @DisplayName("Deve validar o desconto apenas se tiver itens")
    void deveValidarApenasComItens() {
        var motivo = buildMotivo();
        var desconto = buildDesconto(motivo);
        when(repository.findById(descontoId)).thenReturn(Optional.of(desconto));

        var validacao = new DescontoValidacaoRequest(new BigDecimal("150.00"));

        // Sem itens ainda
        assertThrows(InvarianteVioladaException.class, () -> useCases.validar(descontoId, validadorId, validacao));

        // Adicionando um item
        var eq = buildEquipamento();
        desconto.adicionarItem("Furadeira", eq, new BigDecimal("150.00"));

        assertDoesNotThrow(() -> useCases.validar(descontoId, validadorId, validacao));
        assertEquals(StatusDesconto.VALIDADO, desconto.getStatus());
        assertNotNull(desconto.getDataValidacao());
        assertEquals(validadorId, desconto.getUsuarioValidadorId());
    }

    @Test
    @DisplayName("Valor sugerido deve refletir o somatório dos itens lançados")
    void valorSugeridoDeveSomarItens() {
        var motivo = buildMotivo();
        var eq = buildEquipamento();
        var desconto = buildDesconto(motivo);

        assertEquals(0, BigDecimal.ZERO.compareTo(desconto.getValorSugerido()));

        desconto.adicionarItem("Furadeira", eq, new BigDecimal("150.00"));
        desconto.adicionarItem("Lixadeira", eq, new BigDecimal("200.50"));

        assertEquals(0, new BigDecimal("350.50").compareTo(desconto.getValorSugerido()));
    }

    @Test
    @DisplayName("Deve registrar valor, usuário e data em cada etapa do desconto")
    void deveRastrearValoresPorEtapa() {
        var motivo = buildMotivo();
        var eq = buildEquipamento();
        var desconto = buildDesconto(motivo);
        desconto.adicionarItem("Furadeira", eq, new BigDecimal("150.00"));

        when(repository.findById(descontoId)).thenReturn(Optional.of(desconto));

        useCases.validar(descontoId, validadorId, new DescontoValidacaoRequest(new BigDecimal("120.00")));
        useCases.baixar(descontoId, baixaId, new DescontoBaixaRequest(new BigDecimal("100.00")));

        // Etapa 1 - sugestão (somatório dos itens)
        assertEquals(0, new BigDecimal("150.00").compareTo(desconto.getValorSugerido()));
        assertEquals(solicitanteId, desconto.getUsuarioSolicitanteId());

        // Etapa 2 - validação
        assertEquals(0, new BigDecimal("120.00").compareTo(desconto.getValorValidado()));
        assertEquals(validadorId, desconto.getUsuarioValidadorId());
        assertNotNull(desconto.getDataValidacao());

        // Etapa 3 - baixa (valor que conta no fim)
        assertEquals(0, new BigDecimal("100.00").compareTo(desconto.getValorBaixado()));
        assertEquals(baixaId, desconto.getUsuarioBaixaId());
        assertNotNull(desconto.getDataBaixa());
    }

    @Test
    @DisplayName("Deve alterar o termo por completo, inclusive o colaborador, antes da validação")
    void deveAlterarTermoAntesDaValidacao() {
        var motivo = buildMotivo();
        var desconto = buildDesconto(motivo);
        var outroColaborador = UUID.randomUUID();

        when(repository.findById(descontoId)).thenReturn(Optional.of(desconto));
        when(motivoUseCases.buscarEntity(motivoId)).thenReturn(motivo);

        var request = new DescontoRequest(outroColaborador, motivoId, "Corrigido", 2, OffsetDateTime.now());
        useCases.atualizar(descontoId, request, solicitanteId);

        assertEquals(outroColaborador, desconto.getColaboradorId());
        assertEquals("Corrigido", desconto.getObservacoes());
        assertEquals(2, desconto.getQuantidadeParcelas());
    }

    @Test
    @DisplayName("Não deve alterar o termo após a validação")
    void naoDeveAlterarTermoAposValidacao() {
        var motivo = buildMotivo();
        var eq = buildEquipamento();
        var desconto = buildDesconto(motivo);
        desconto.adicionarItem("Furadeira", eq, new BigDecimal("150.00"));
        desconto.validar(validadorId, new BigDecimal("150.00"));

        when(repository.findById(descontoId)).thenReturn(Optional.of(desconto));
        when(motivoUseCases.buscarEntity(motivoId)).thenReturn(motivo);

        var request = new DescontoRequest(colaboradorId, motivoId, "Tentativa", 2, OffsetDateTime.now());

        assertThrows(InvarianteVioladaException.class, () -> useCases.atualizar(descontoId, request, solicitanteId));
    }

    @Test
    @DisplayName("Não deve permitir alterar itens após validação")
    void naoDeveAlterarItensPosValidacao() {
        var motivo = buildMotivo();
        var eq = buildEquipamento();
        var desconto = buildDesconto(motivo);
        desconto.adicionarItem("Furadeira", eq, new BigDecimal("150.00"));
        desconto.validar(validadorId, new BigDecimal("150.00")); // Status -> VALIDADO

        when(repository.findById(descontoId)).thenReturn(Optional.of(desconto));
        when(equipamentoUseCases.buscarEntity(equipamentoId)).thenReturn(eq);

        var request = new DescontoItemRequest("Lixadeira", equipamentoId, new BigDecimal("200.00"));
        
        var ex = assertThrows(InvarianteVioladaException.class, () -> useCases.adicionarItem(descontoId, request));
        assertEquals("Não é possível adicionar itens a um desconto que não está no status SOLICITADO.", ex.getMessage());
    }
    
    @Test
    @DisplayName("Deve baixar um desconto validado com sucesso")
    void deveBaixarDesconto() {
        var motivo = buildMotivo();
        var eq = buildEquipamento();
        var desconto = buildDesconto(motivo);
        desconto.adicionarItem("Furadeira", eq, new BigDecimal("150.00"));
        desconto.validar(validadorId, new BigDecimal("150.00")); // Status -> VALIDADO

        when(repository.findById(descontoId)).thenReturn(Optional.of(desconto));

        useCases.baixar(descontoId, baixaId, new DescontoBaixaRequest(new BigDecimal("150.00")));

        assertEquals(StatusDesconto.BAIXADO, desconto.getStatus());
        assertNotNull(desconto.getDataBaixa());
    }
    
    @Test
    @DisplayName("Não deve baixar um desconto não validado")
    void naoDeveBaixarNaoValidado() {
        var motivo = buildMotivo();
        var desconto = buildDesconto(motivo);
        
        when(repository.findById(descontoId)).thenReturn(Optional.of(desconto));

        // Status atual é SOLICITADO
        var baixa = new DescontoBaixaRequest(new BigDecimal("150.00"));
        assertThrows(InvarianteVioladaException.class, () -> useCases.baixar(descontoId, baixaId, baixa));
    }

    @Test
    @DisplayName("Deve permitir adicionar anexo de áudio OGG com sucesso")
    void devePermitirAnexoAudioOgg() {
        var motivo = buildMotivo();
        var desconto = buildDesconto(motivo);
        when(repository.findById(descontoId)).thenReturn(Optional.of(desconto));

        var arquivo = new MockMultipartFile(
                "arquivo", "gravacao.ogg", "audio/ogg", "audio-content".getBytes());

        assertDoesNotThrow(() -> useCases.adicionarAnexo(descontoId, arquivo, solicitanteId));
        assertEquals(1, desconto.getAnexos().size());
        assertEquals("audio/ogg", desconto.getAnexos().get(0).getContentType());
        verify(repository).saveAndFlush(desconto);
    }

    @Test
    @DisplayName("Deve permitir adicionar anexo de vídeo MP4 com sucesso")
    void devePermitirAnexoVideoMp4() {
        var motivo = buildMotivo();
        var desconto = buildDesconto(motivo);
        when(repository.findById(descontoId)).thenReturn(Optional.of(desconto));

        var arquivo = new MockMultipartFile(
                "arquivo", "evidencia.mp4", "video/mp4", "video-content".getBytes());

        assertDoesNotThrow(() -> useCases.adicionarAnexo(descontoId, arquivo, solicitanteId));
        assertEquals(1, desconto.getAnexos().size());
        assertEquals("video/mp4", desconto.getAnexos().get(0).getContentType());
        verify(repository).saveAndFlush(desconto);
    }

    @Test
    @DisplayName("Deve inferir tipo de áudio OGG pela extensão quando contentType for genérico")
    void deveInferirAudioOggPorExtensao() {
        var motivo = buildMotivo();
        var desconto = buildDesconto(motivo);
        when(repository.findById(descontoId)).thenReturn(Optional.of(desconto));

        var arquivo = new MockMultipartFile(
                "arquivo", "depoimento.ogg", "application/octet-stream", "audio-content".getBytes());

        assertDoesNotThrow(() -> useCases.adicionarAnexo(descontoId, arquivo, solicitanteId));
        assertEquals(1, desconto.getAnexos().size());
        assertEquals("audio/ogg", desconto.getAnexos().get(0).getContentType());
        verify(repository).saveAndFlush(desconto);
    }

    @Test
    @DisplayName("Deve rejeitar anexo com formato não suportado")
    void deveRejeitarAnexoNaoPermitido() {
        var motivo = buildMotivo();
        var desconto = buildDesconto(motivo);
        when(repository.findById(descontoId)).thenReturn(Optional.of(desconto));

        var arquivo = new MockMultipartFile(
                "arquivo", "virus.exe", "application/x-msdownload", "bin".getBytes());

        var ex = assertThrows(InvarianteVioladaException.class, () -> useCases.adicionarAnexo(descontoId, arquivo, solicitanteId));
        assertTrue(ex.getMessage().contains("Tipo de arquivo não suportado"));
    }

    @Test
    @DisplayName("Ordenar por colaborador resolve o nome no RH e não repassa o UUID como ordenação")
    @SuppressWarnings("unchecked")
    void deveOrdenarPeloNomeDoColaborador() {
        var ana = UUID.randomUUID();
        var bruno = UUID.randomUUID();
        when(repository.listarColaboradoresComDesconto()).thenReturn(java.util.List.of(bruno, ana));
        when(colaboradorApi.buscarResumosPorIds(any())).thenReturn(java.util.Map.of(
                bruno, new com.nexo.app.modules.rh.ResumoColaborador(bruno, "BRUNO LIMA", null, null, true),
                ana, new com.nexo.app.modules.rh.ResumoColaborador(ana, "ÁUREA COSTA", null, null, true)));
        when(repository.findAll(any(org.springframework.data.jpa.domain.Specification.class), any(org.springframework.data.domain.Pageable.class)))
                .thenReturn(org.springframework.data.domain.Page.empty());

        var filtro = new com.nexo.app.modules.desconto.application.dto.DescontoFilter(null, null, null, null, null, null, null, null, null);
        useCases.listar(filtro, org.springframework.data.domain.PageRequest.of(0, 20,
                org.springframework.data.domain.Sort.by("colaborador").ascending()));

        var pageable = org.mockito.ArgumentCaptor.forClass(org.springframework.data.domain.Pageable.class);
        verify(repository).findAll(any(org.springframework.data.jpa.domain.Specification.class), pageable.capture());
        assertTrue(pageable.getValue().getSort().isUnsorted());
        verify(colaboradorApi).buscarResumosPorIds(java.util.List.of(bruno, ana));
    }

    @Test
    @DisplayName("O termo traz o nome de quem fez cada etapa, e não o login")
    void deveResolverNomesDosResponsaveis() {
        var desconto = buildDesconto(buildMotivo());
        ReflectionTestUtils.setField(desconto, "usuarioValidadorId", validadorId);
        when(repository.findById(descontoId)).thenReturn(Optional.of(desconto));
        when(mapper.toResponse(desconto)).thenReturn(new com.nexo.app.modules.desconto.application.dto.DescontoResponse(
                descontoId, colaboradorId, null, null, 3, null, null, null, StatusDesconto.VALIDADO,
                solicitanteId, validadorId, null, null, null, null, null, null, null, null, null, null, null, null,
                java.util.List.of(), java.util.List.of(), null));
        when(colaboradorApi.buscarNomeCompletoPorUsuario(solicitanteId)).thenReturn(Optional.of("ANA SOUZA"));
        when(colaboradorApi.buscarNomeCompletoPorUsuario(validadorId)).thenReturn(Optional.empty());

        var responsaveis = useCases.buscarPorId(descontoId).responsaveis();

        assertEquals("ANA SOUZA", responsaveis.solicitante());
        assertNull(responsaveis.validador());
        assertNull(responsaveis.baixa());
    }

    @Test
    @DisplayName("Busca rápida procura também pelo nome do colaborador")
    @SuppressWarnings("unchecked")
    void buscaRapidaConsultaNomeDoColaborador() {
        when(repository.findAll(any(org.springframework.data.jpa.domain.Specification.class), any(org.springframework.data.domain.Pageable.class)))
                .thenReturn(org.springframework.data.domain.Page.empty());
        var filtro = new com.nexo.app.modules.desconto.application.dto.DescontoFilter(
                null, null, java.util.List.of(StatusDesconto.VALIDADO, StatusDesconto.BAIXADO), null, null, null, null, null, " maria ");

        useCases.listar(filtro, org.springframework.data.domain.PageRequest.of(0, 20));

        verify(colaboradorApi).buscarIdsPorTrechoDoNome("maria");
    }

    private Desconto descontoBaixado() {
        var desconto = buildDesconto(buildMotivo());
        desconto.adicionarItem("Multímetro", buildEquipamento(), new BigDecimal("300.00"));
        desconto.validar(validadorId, new BigDecimal("280.00"));
        desconto.baixar(baixaId, new BigDecimal("270.00"));
        return desconto;
    }

    @Test
    @DisplayName("Desfazer a validação volta a aguardar validação e registra o valor que deixou de valer")
    void deveDesfazerValidacaoERegistrarNaLinhaDoTempo() {
        var desconto = buildDesconto(buildMotivo());
        desconto.adicionarItem("Multímetro", buildEquipamento(), new BigDecimal("300.00"));
        desconto.validar(validadorId, new BigDecimal("280.00"));
        when(repository.findById(descontoId)).thenReturn(Optional.of(desconto));

        useCases.desfazer(descontoId, validadorId, "Valor digitado errado");

        assertEquals(StatusDesconto.SOLICITADO, desconto.getStatus());
        assertNull(desconto.getValorValidado());
        assertNull(desconto.getUsuarioValidadorId());
        var evento = org.mockito.ArgumentCaptor.forClass(com.nexo.app.modules.desconto.domain.EventoDesconto.class);
        verify(eventoRepository).save(evento.capture());
        assertEquals(com.nexo.app.modules.desconto.domain.TipoEventoDesconto.DECISAO_DESFEITA, evento.getValue().getTipo());
        assertEquals(StatusDesconto.VALIDADO, evento.getValue().getStatusAnterior());
        assertEquals(StatusDesconto.SOLICITADO, evento.getValue().getStatusNovo());
        assertEquals(0, new BigDecimal("280.00").compareTo(evento.getValue().getValor()));
        assertTrue(evento.getValue().getTexto().startsWith("Valor digitado errado"));
    }

    @Test
    @DisplayName("Desfazer a baixa volta a aguardar a baixa, mantendo a validação")
    void deveDesfazerBaixa() {
        var desconto = descontoBaixado();
        desconto.desfazer();
        assertEquals(StatusDesconto.VALIDADO, desconto.getStatus());
        assertNull(desconto.getValorBaixado());
        assertNull(desconto.getDataBaixa());
        assertEquals(0, new BigDecimal("280.00").compareTo(desconto.getValorValidado()));
    }

    @Test
    @DisplayName("Finalizar exige a baixa, marca o termo assinado e desfazer a finalização desmarca sem apagar o arquivo")
    void deveFinalizarEDesfazerFinalizacao() {
        var validado = buildDesconto(buildMotivo());
        validado.adicionarItem("Bota", buildEquipamento(), new BigDecimal("90.00"));
        validado.validar(validadorId, new BigDecimal("90.00"));
        assertThrows(InvarianteVioladaException.class,
                () -> validado.finalizar(baixaId, "termo.pdf", "chave", "application/pdf", 10L));

        var desconto = descontoBaixado();
        var termo = desconto.finalizar(baixaId, "termo.pdf", "chave", "application/pdf", 10L);
        assertEquals(StatusDesconto.FINALIZADO, desconto.getStatus());
        assertTrue(termo.isTermoAssinado());
        assertTrue(desconto.termoAssinado().isPresent());
        assertThrows(InvarianteVioladaException.class,
                () -> desconto.adicionarAnexo("foto.jpg", "k", "image/jpeg", 1L));

        var desfeito = desconto.desfazer();
        assertEquals(StatusDesconto.FINALIZADO, desfeito.statusAnterior());
        assertSame(termo, desfeito.termoAnterior());
        assertEquals(StatusDesconto.BAIXADO, desconto.getStatus());
        assertFalse(termo.isTermoAssinado());
        assertEquals(1, desconto.getAnexos().size());
    }

    @Test
    @DisplayName("Não há o que desfazer enquanto o desconto aguarda validação")
    void naoDesfazQuandoSolicitado() {
        var desconto = buildDesconto(buildMotivo());
        assertThrows(InvarianteVioladaException.class, desconto::desfazer);
    }

    @Test
    @DisplayName("Desfazer validação e rejeição é de quem valida; baixa e finalização, de quem baixa")
    void devePedirPermissaoDaEtapa() {
        var desconto = descontoBaixado();
        when(repository.findById(descontoId)).thenReturn(Optional.of(desconto));
        assertEquals("desconto:baixar", useCases.permissaoParaDesfazer(descontoId));
        desconto.desfazer();
        assertEquals("desconto:validar", useCases.permissaoParaDesfazer(descontoId));
    }
}
