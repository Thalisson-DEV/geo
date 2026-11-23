package com.nexo.app.modules.obras.application.usecases;

import com.nexo.app.modules.contrato.ContratoApi;
import com.nexo.app.modules.obras.application.dto.ObraProximaResponse;
import com.nexo.app.modules.obras.application.mappers.ObraMapper;
import com.nexo.app.modules.obras.domain.Obra;
import com.nexo.app.modules.obras.infrastructure.persistence.ObraRepository;
import com.nexo.app.modules.rh.MunicipioApi;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.AuditorAware;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CarteiraObraUseCasesTest {

    @Mock
    private ObraRepository repository;
    @Mock
    private ObraUseCases obraUseCases;
    @Mock
    private StatusObraUseCases statusUseCases;
    @Mock
    private DeslocamentoObraService deslocamentoService;
    @Mock
    private ContratoApi contratoApi;
    @Mock
    private MunicipioApi municipioApi;
    @Mock
    private ObraMapper mapper;
    @Mock
    private AuditorAware<String> auditor;
    @Mock
    private EntityManager entityManager;
    @Mock
    private ResumoPlanejamentoObras resumosPlanejamento;

    private CarteiraObraUseCases useCases;
    private Obra obra;

    @BeforeEach
    void setUp() {
        useCases = new CarteiraObraUseCases(repository, obraUseCases, statusUseCases, deslocamentoService,
                contratoApi, municipioApi, mapper, auditor,
                entityManager, resumosPlanejamento);
        obra = obra("100", null, null);
        when(obraUseCases.buscarEntidade(obra.getId())).thenReturn(obra);
        lenient().when(municipioApi.buscarPorIdResponse(any())).thenReturn(Optional.empty());
    }

    @Test
    void obrasProximasFiltraPeloRaioEOrdenaPelaDistancia() {
        obra.atualizarLocalizacao(-9.40, -40.50);
        Obra perto = obra("101", -9.41, -40.50);     // ~1,1 km
        Obra media = obra("102", -9.45, -40.50);     // ~5,6 km
        Obra noCanto = obra("103", -9.48, -40.58);   // dentro do retângulo, ~12,5 km em linha reta
        when(repository.buscarNoRetangulo(eq(obra.getId()), anyDouble(), anyDouble(), anyDouble(), anyDouble()))
                .thenReturn(List.of(noCanto, media, perto));

        List<ObraProximaResponse> proximas = useCases.listarObrasProximas(obra.getId(), null);

        assertThat(proximas).extracting(ObraProximaResponse::numero).containsExactly("101", "102");
        assertThat(proximas.getFirst().distanciaKm()).isBetween(new BigDecimal("1.0"), new BigDecimal("1.2"));
    }

    @Test
    void raioAcimaDoMaximoELimitado() {
        obra.atualizarLocalizacao(-9.40, -40.50);
        when(repository.buscarNoRetangulo(eq(obra.getId()), anyDouble(), anyDouble(), anyDouble(), anyDouble()))
                .thenReturn(List.of());

        useCases.listarObrasProximas(obra.getId(), 1000.0);

        double delta = CarteiraObraUseCases.RAIO_MAXIMO_KM / 111.32;
        verify(repository).buscarNoRetangulo(eq(obra.getId()), eq(-9.40 - delta), eq(-9.40 + delta),
                anyDouble(), anyDouble());
    }

    @Test
    void obraSemCoordenadasNaoTemObrasProximas() {
        assertThat(useCases.listarObrasProximas(obra.getId(), 5.0)).isEmpty();
        verifyNoInteractions(repository);
    }

    private static Obra obra(String numero, Double latitude, Double longitude) {
        Obra obra = ProcessarImportacaoCarteiraServiceTest.novaObra(numero);
        ReflectionTestUtils.setField(obra, "id", UUID.randomUUID());
        if (latitude != null) {
            obra.atualizarLocalizacao(latitude, longitude);
        }
        return obra;
    }
}
