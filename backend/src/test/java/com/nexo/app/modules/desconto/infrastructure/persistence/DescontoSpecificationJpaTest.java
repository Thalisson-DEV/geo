package com.nexo.app.modules.desconto.infrastructure.persistence;

import com.nexo.app.modules.desconto.application.dto.DescontoFilter;
import com.nexo.app.modules.desconto.domain.Desconto;
import com.nexo.app.modules.desconto.domain.MotivoDesconto;
import com.nexo.app.modules.desconto.domain.StatusDesconto;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

// Banco próprio: o teste confere a lista inteira, e o contexto compartilhado traz dados de outros testes.
@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:desconto-specification-jpa;DB_CLOSE_DELAY=-1")
class DescontoSpecificationJpaTest {

    @Autowired
    private DescontoRepository descontoRepository;

    @Autowired
    private MotivoDescontoRepository motivoRepository;

    private final UUID ana = UUID.randomUUID();
    private final UUID bruno = UUID.randomUUID();
    private final UUID carla = UUID.randomUUID();

    @Test
    @Transactional
    void buscaRapidaProcuraEmMotivoObservacoesColaboradorEStatus() {
        MotivoDesconto avaria = motivoRepository.save(new MotivoDesconto("AVARIA DE VEICULO", 6));
        MotivoDesconto perda = motivoRepository.save(new MotivoDesconto("PERDA DE FERRAMENTA", 6));
        Desconto porMotivo = salvar(ana, avaria, "sem observacao", StatusDesconto.SOLICITADO);
        Desconto porObservacao = salvar(bruno, perda, "Retrovisor quebrado", StatusDesconto.SOLICITADO);
        Desconto porColaborador = salvar(carla, perda, null, StatusDesconto.SOLICITADO);
        Desconto porStatus = salvar(ana, perda, null, StatusDesconto.VALIDADO);

        assertThat(buscar("avaria", DescontoSpecification.BuscaGlobal.nenhuma())).containsExactly(porMotivo.getId());
        assertThat(buscar("RETROVISOR", DescontoSpecification.BuscaGlobal.nenhuma())).containsExactly(porObservacao.getId());
        assertThat(buscar("carla", new DescontoSpecification.BuscaGlobal(List.of(carla), List.of())))
                .containsExactly(porColaborador.getId());
        assertThat(buscar("valid", new DescontoSpecification.BuscaGlobal(List.of(), List.of(StatusDesconto.VALIDADO))))
                .containsExactly(porStatus.getId());
        String codigo = porMotivo.getId().toString().substring(0, 8);
        assertThat(buscar("#" + codigo, DescontoSpecification.BuscaGlobal.nenhuma())).contains(porMotivo.getId());
    }

    @Test
    @Transactional
    void filtraVariosStatusEOrdenaPeloNomeDoColaborador() {
        MotivoDesconto motivo = motivoRepository.save(new MotivoDesconto("MAU USO", 6));
        Desconto deCarla = salvar(carla, motivo, null, StatusDesconto.SOLICITADO);
        Desconto deAna = salvar(ana, motivo, null, StatusDesconto.VALIDADO);
        Desconto deBruno = salvar(bruno, motivo, null, StatusDesconto.BAIXADO);
        salvar(ana, motivo, null, StatusDesconto.REJEITADO);

        var filtro = new DescontoFilter(null, null, List.of(StatusDesconto.SOLICITADO, StatusDesconto.VALIDADO, StatusDesconto.BAIXADO),
                null, null, null, null, null, null);
        var spec = DescontoSpecification.comFiltros(filtro).and(DescontoSpecification.ordenadoPorColaborador(
                Map.of(ana, 0, bruno, 1, carla, 2), Sort.Direction.ASC, Sort.unsorted()));

        var pagina = descontoRepository.findAll(spec, PageRequest.of(0, 10));

        assertThat(pagina.getTotalElements()).isEqualTo(3);
        assertThat(pagina.getContent()).extracting(Desconto::getId)
                .containsExactly(deAna.getId(), deBruno.getId(), deCarla.getId());
    }

    private List<UUID> buscar(String termo, DescontoSpecification.BuscaGlobal busca) {
        var filtro = new DescontoFilter(null, null, null, null, null, null, null, null, termo);
        return descontoRepository.findAll(DescontoSpecification.comFiltros(filtro, busca)).stream().map(Desconto::getId).toList();
    }

    private Desconto salvar(UUID colaborador, MotivoDesconto motivo, String observacoes, StatusDesconto status) {
        Desconto desconto = new Desconto(colaborador, motivo, observacoes, 1, OffsetDateTime.now(), UUID.randomUUID());
        ReflectionTestUtils.setField(desconto, "status", status);
        return descontoRepository.saveAndFlush(desconto);
    }
}
