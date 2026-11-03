package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.domain.Condutor;
import com.nexo.app.modules.frota.domain.FonteTelemetria;
import com.nexo.app.modules.frota.infrastructure.persistence.CondutorRepository;
import com.nexo.app.shared.infrastructure.security.HashUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.text.Normalizer;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Casa o motorista informado pelo rastreador com um condutor da frota: pela CNH (blind index)
 * quando o provedor informa, senão pelo nome, se ele for de um único condutor ativo.
 */
@Component
@RequiredArgsConstructor
class CondutoresTelemetria {

    private final CondutorRepository condutores;
    private final ReferenciasFrota referencias;

    /** Uma rodada de sincronização: os nomes dos condutores são lidos uma vez só. */
    Rodada novaRodada() {
        return new Rodada();
    }

    final class Rodada {

        private Map<String, UUID> porNome;
        private final Map<String, Optional<UUID>> porCnh = new HashMap<>();

        /** Colaborador do motorista, se casou. */
        Optional<UUID> colaborador(FonteTelemetria.Motorista motorista) {
            if (motorista == null) {
                return Optional.empty();
            }
            if (motorista.cnh() != null && motorista.cnh().length() == 11) {
                var pelaCnh = porCnh.computeIfAbsent(motorista.cnh(), cnh -> {
                    var lista = condutores.findAllByCnhNumeroHashAndAtivoTrue(HashUtils.gerarBlindIndex(cnh));
                    return lista.size() == 1 ? Optional.of(lista.get(0).getIdColaborador()) : Optional.empty();
                });
                if (pelaCnh.isPresent()) {
                    return pelaCnh;
                }
            }
            String nome = normalizar(motorista.nome());
            return nome == null ? Optional.empty() : Optional.ofNullable(nomes().get(nome));
        }

        private Map<String, UUID> nomes() {
            if (porNome == null) {
                var ids = condutores.findAllByAtivoTrue().stream().map(Condutor::getIdColaborador).toList();
                var unicos = new HashMap<String, UUID>();
                Set<String> repetidos = new HashSet<>();
                referencias.nomesColaboradores(ids).forEach((id, nome) -> {
                    String chave = normalizar(nome);
                    if (chave == null || repetidos.contains(chave)) {
                        return;
                    }
                    if (unicos.putIfAbsent(chave, id) != null) {
                        // Homônimos não casam pelo nome: o evento cai no vínculo do instante.
                        unicos.remove(chave);
                        repetidos.add(chave);
                    }
                });
                porNome = unicos;
            }
            return porNome;
        }
    }

    static String normalizar(String nome) {
        if (nome == null || nome.isBlank()) {
            return null;
        }
        return Normalizer.normalize(nome, Normalizer.Form.NFD).replaceAll("\\p{M}", "")
                .toUpperCase(Locale.ROOT).replaceAll("[^A-Z ]", " ").replaceAll("\\s+", " ").trim();
    }
}
