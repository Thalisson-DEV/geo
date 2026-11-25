package com.nexo.app.modules.estoque.application.services;

import com.nexo.app.modules.estoque.domain.*;
import com.nexo.app.modules.estoque.infrastructure.persistence.AlocacaoObraRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.SaldoRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AlocacaoObraServiceTest {

    @Mock private AlocacaoObraRepository repository;
    @Mock private SaldoRepository saldoRepository;
    @InjectMocks private AlocacaoObraService service;

    private Estoque caminhao;
    private Estoque almox;
    private Material poste;
    private final UUID obraA = UUID.randomUUID();
    private final UUID obraB = UUID.randomUUID();

    @BeforeEach
    void preparar() {
        caminhao = comId(new Estoque("CON-TMN-01", comId(new TipoEstoque("CAMPO"))));
        almox = comId(new Estoque("ALMOX CENTRAL", comId(new TipoEstoque("FISICO"))));
        poste = comId(new Material("300117", "Poste DT 10/300", "UN", "MATR", null, null, false, UUID.randomUUID()));
    }

    @Test
    @DisplayName("Consumo usa primeiro o material da própria obra")
    void consumoDaPropriaObra() {
        AlocacaoObra daObraB = alocacao(obraB, "3");
        fisico("3");
        when(repository.listarDoMaterialComLock(any(), any(), any())).thenReturn(new ArrayList<>(List.of(daObraB)));

        List<AlocacaoObraService.Parcela> parcelas = service.consumir(caminhao, poste, CondicaoMaterial.NOVO, obraB, new BigDecimal("2"));

        assertThat(parcelas).containsExactly(new AlocacaoObraService.Parcela(obraB, new BigDecimal("2"), false));
        assertThat(daObraB.getQuantidade()).isEqualByComparingTo("1");
    }

    @Test
    @DisplayName("Sem material da obra, usa o livre e depois o de outra obra, deixando rastro")
    void consumoComLivreEOutraObra() {
        AlocacaoObra daObraA = alocacao(obraA, "3");
        fisico("4"); // 3 da obra A + 1 livre
        when(repository.listarDoMaterialComLock(any(), any(), any())).thenReturn(new ArrayList<>(List.of(daObraA)));

        List<AlocacaoObraService.Parcela> parcelas = service.consumir(caminhao, poste, CondicaoMaterial.NOVO, obraB, new BigDecimal("3"));

        assertThat(parcelas).containsExactly(
                new AlocacaoObraService.Parcela(null, new BigDecimal("1"), false),
                new AlocacaoObraService.Parcela(obraA, new BigDecimal("2"), false));
        assertThat(daObraA.getQuantidade()).isEqualByComparingTo("1");
    }

    @Test
    @DisplayName("O que não existe no caminhão sai como aplicado sem saldo, sem recusar")
    void consumoSemSaldo() {
        fisico("0");
        when(repository.listarDoMaterialComLock(any(), any(), any())).thenReturn(new ArrayList<>());

        List<AlocacaoObraService.Parcela> parcelas = service.consumir(caminhao, poste, CondicaoMaterial.NOVO, obraB, new BigDecimal("2"));

        assertThat(parcelas).containsExactly(new AlocacaoObraService.Parcela(obraB, new BigDecimal("2"), true));
    }

    @Test
    @DisplayName("Entrega ao caminhão aloca para a obra; o almoxarifado não guarda obra")
    void transferenciaAcompanhaObra() {
        when(repository.buscarComLock(caminhao.getId(), poste.getId(), CondicaoMaterial.NOVO, obraA)).thenReturn(Optional.empty());

        service.acompanharTransferencia(almox, caminhao, poste, CondicaoMaterial.NOVO, obraA, new BigDecimal("3"));

        verify(repository).save(argThatAlocacao(obraA, "3"));
        verify(repository, never()).buscarComLock(eq(almox.getId()), any(), any(), any());
    }

    @Test
    @DisplayName("Liberar nunca deixa a alocação negativa")
    void liberarLimitado() {
        AlocacaoObra daObraA = alocacao(obraA, "2");
        when(repository.buscarComLock(any(), any(), any(), eq(obraA))).thenReturn(Optional.of(daObraA));

        BigDecimal saiu = service.liberar(caminhao, poste, CondicaoMaterial.NOVO, obraA, new BigDecimal("5"));

        assertThat(saiu).isEqualByComparingTo("2");
        assertThat(daObraA.getQuantidade()).isEqualByComparingTo("0");
    }

    private AlocacaoObra argThatAlocacao(UUID obra, String quantidade) {
        return argThat(a -> a.getIdObra().equals(obra) && a.getQuantidade().compareTo(new BigDecimal(quantidade)) == 0);
    }

    private AlocacaoObra alocacao(UUID obra, String quantidade) {
        AlocacaoObra alocacao = new AlocacaoObra(caminhao, poste, CondicaoMaterial.NOVO, obra);
        alocacao.alocar(new BigDecimal(quantidade));
        return alocacao;
    }

    private void fisico(String quantidade) {
        Saldo saldo = new Saldo(caminhao, poste, CondicaoMaterial.NOVO);
        if (new BigDecimal(quantidade).signum() > 0) {
            saldo.adicionarQuantidade(new BigDecimal(quantidade));
        }
        when(saldoRepository.findByEstoqueIdAndMaterialIdAndCondicao(any(), any(), any())).thenReturn(Optional.of(saldo));
    }

    private static <T> T comId(T entidade) {
        ReflectionTestUtils.setField(entidade, "id", UUID.randomUUID());
        return entidade;
    }
}
