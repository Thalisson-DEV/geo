package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.application.dto.AbastecimentoFilter;
import com.nexo.app.modules.frota.application.dto.AbastecimentoResumoResponse;
import com.nexo.app.modules.frota.application.dto.AprovacaoAbastecimentoAppResponse;
import com.nexo.app.modules.frota.application.dto.ArquivoFotoChecklist;
import com.nexo.app.modules.frota.domain.AlvoAnaliseIa;
import com.nexo.app.modules.frota.domain.SituacaoAbastecimento;
import com.nexo.app.shared.application.dto.PageResponse;
import com.nexo.app.shared.infrastructure.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Aprovação do abastecimento pelo celular: o gestor quase não usa computador nem lê e-mail
 * (gestores, 23/10/2026). Mesmas regras da web: só o usuário administrativo, só as placas da
 * carteira, com a quantidade de cada item. O usuário de campo só pede. Precisa de sinal,
 * porque decide sobre o estado do servidor.
 */
@Service
@RequiredArgsConstructor
public class AprovacaoAbastecimentoAppUseCases {

    private static final int LIMITE_FILA = 50;

    private final AbastecimentoUseCases abastecimentos;
    private final AnaliseIaFrotaUseCases analises;
    private final CarteiraAprovacaoUseCases carteiras;

    /** Aguardando aprovação nas placas da carteira de quem consulta, do mais antigo para o mais novo. */
    public List<AbastecimentoResumoResponse> fila() {
        carteiras.exigirAdministrativo(SecurityUtils.getUsuarioLogadoId());
        var filtro = new AbastecimentoFilter(AbastecimentoUseCases.FILA_APROVAR, null, null, null, null, null, null, null, null, null);
        return abastecimentos.listar(filtro, PageRequest.of(0, LIMITE_FILA, Sort.by("solicitadoEm"))).getContent();
    }

    /**
     * Acompanhamento no celular: todos os pedidos das placas da carteira, de qualquer situação
     * (aprovados à espera da liberação, liberados, realizados, encerrados), com filtro.
     */
    public PageResponse<AbastecimentoResumoResponse> carteira(List<SituacaoAbastecimento> situacoes, String busca,
                                                              LocalDate de, LocalDate ate, Pageable pageable) {
        carteiras.exigirAdministrativo(SecurityUtils.getUsuarioLogadoId());
        var filtro = new AbastecimentoFilter(AbastecimentoUseCases.FILA_CARTEIRA, busca, situacoes, null, null, null, de, ate, null, null);
        return abastecimentos.listar(filtro, pageable);
    }

    public AprovacaoAbastecimentoAppResponse detalhar(UUID id) {
        abastecimentos.exigirNaCarteira(id);
        var detalhe = abastecimentos.detalhar(id);
        return new AprovacaoAbastecimentoAppResponse(detalhe, analises.estado(AlvoAnaliseIa.ABASTECIMENTO, id).ultima());
    }

    public AprovacaoAbastecimentoAppResponse aprovar(UUID id, Map<UUID, BigDecimal> quantidades) {
        abastecimentos.aprovar(id, quantidades);
        return detalhar(id);
    }

    public AprovacaoAbastecimentoAppResponse reprovar(UUID id, String motivo) {
        abastecimentos.reprovar(id, motivo);
        return detalhar(id);
    }

    /** Foto do pedido para quem tem a placa na carteira. */
    public ArquivoFotoChecklist baixarFoto(UUID id, UUID idFoto) {
        abastecimentos.exigirNaCarteira(id);
        return abastecimentos.baixarFoto(id, idFoto);
    }
}
