package com.nexo.app.modules.obras.application.usecases;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nexo.app.modules.obras.CampoObrasApi;
import com.nexo.app.modules.obras.application.dto.CampoObrasRequests;
import com.nexo.app.modules.obras.application.dto.CampoObrasResponses;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class CampoObrasApiAdapter implements CampoObrasApi {

    private final CampoObrasUseCases useCases;
    private final ObjectMapper mapper;
    private final Validator validator;

    @Override
    @Transactional
    public Aplicado aplicar(Comando comando, Map<String, Object> payload, UUID atorOrigem, Arquivo arquivo) {
        CampoObrasResponses.Resultado resultado;
        try {
            resultado = switch (comando) {
                case APR -> useCases.registrarApr(validar(payload, CampoObrasRequests.Apr.class), atorOrigem);
                case APR_CONCLUSAO -> useCases.concluirApr(validar(payload, CampoObrasRequests.ConclusaoApr.class), atorOrigem);
                case OCORRENCIA -> useCases.registrarOcorrencia(validar(payload, CampoObrasRequests.Ocorrencia.class), atorOrigem);
                case ATIVIDADE -> useCases.registrarAtividade(validar(payload, CampoObrasRequests.Atividade.class), atorOrigem);
                case APONTAMENTO -> useCases.apontar(validar(payload, CampoObrasRequests.Apontamento.class), atorOrigem);
                case PRESENCA -> useCases.registrarPresenca(validar(payload, CampoObrasRequests.Presenca.class), atorOrigem);
                case RELATORIO -> useCases.salvarRelatorio(validar(payload, CampoObrasRequests.Relatorio.class), atorOrigem);
                case EVIDENCIA -> {
                    if (arquivo == null || arquivo.conteudo() == null || arquivo.conteudo().length == 0) {
                        throw new InvarianteVioladaException("A foto não veio junto do registro.");
                    }
                    yield useCases.registrarEvidencia(validar(payload, CampoObrasRequests.Evidencia.class),
                            arquivo.conteudo(), arquivo.nome(), arquivo.contentType(), atorOrigem);
                }
            };
        } catch (IllegalArgumentException e) {
            throw new InvarianteVioladaException("O registro de " + comando.name().toLowerCase().replace('_', ' ')
                    + " veio num formato que o servidor não reconhece.");
        }
        return new Aplicado(resultado.ids(), resultado.jaRecebido());
    }

    private <T> T validar(Map<String, Object> payload, Class<T> tipo) {
        T comando = mapper.convertValue(payload, tipo);
        Set<ConstraintViolation<T>> violacoes = validator.validate(comando);
        if (!violacoes.isEmpty()) {
            throw new InvarianteVioladaException(violacoes.stream().map(ConstraintViolation::getMessage).sorted()
                    .collect(Collectors.joining("; ")));
        }
        return comando;
    }
}
