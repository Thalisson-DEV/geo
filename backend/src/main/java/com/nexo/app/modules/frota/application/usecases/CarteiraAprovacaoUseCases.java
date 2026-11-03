package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.application.dto.CarteiraAprovacaoResponse;
import com.nexo.app.modules.frota.domain.CarteiraAprovacao;
import com.nexo.app.modules.frota.infrastructure.persistence.CarteiraAprovacaoRepository;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Quem aprova quais placas no abastecimento. Aprovador é o usuário administrativo com a
 * permissão de aprovar; sem placas na carteira, não aprova nada. O usuário de campo só pede,
 * nunca aprova, mesmo com a permissão no perfil (gestores, 23/10/2026).
 */
@Service
@RequiredArgsConstructor
public class CarteiraAprovacaoUseCases {

    static final String PERMISSAO_APROVAR = "frota:abastecimento:aprovar";

    private final CarteiraAprovacaoRepository repository;
    private final ReferenciasFrota referencias;

    /** Todos os aprovadores, com ou sem placas, em ordem de login. */
    @Transactional(readOnly = true)
    public List<CarteiraAprovacaoResponse> listar() {
        List<UUID> aprovadores = aprovadores();
        Map<UUID, CarteiraAprovacao> carteiras = repository.findAllByIdUsuarioInAndAtivoTrue(aprovadores).stream()
                .collect(Collectors.toMap(CarteiraAprovacao::getIdUsuario, Function.identity()));
        var logins = referencias.loginsUsuarios(aprovadores);
        var nomes = referencias.nomesPessoas(aprovadores);
        var idsVeiculo = carteiras.values().stream().flatMap(c -> c.getIdsVeiculo().stream()).collect(Collectors.toSet());
        var placas = placas(idsVeiculo);
        return aprovadores.stream()
                .map(id -> new CarteiraAprovacaoResponse(id, logins.getOrDefault(id, "—"), nomes.getOrDefault(id, logins.getOrDefault(id, "—")),
                        carteiras.containsKey(id) ? placasDe(carteiras.get(id), placas) : List.of()))
                .sorted(Comparator.comparing(CarteiraAprovacaoResponse::nome, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    @Transactional(readOnly = true)
    public CarteiraAprovacaoResponse buscar(UUID idUsuario) {
        exigirAprovador(idUsuario);
        var carteira = repository.findByIdUsuarioAndAtivoTrue(idUsuario).orElse(null);
        return responder(idUsuario, carteira);
    }

    @Transactional
    public CarteiraAprovacaoResponse definirPlacas(UUID idUsuario, Collection<UUID> idsVeiculo) {
        exigirAprovador(idUsuario);
        var validos = new HashSet<>(idsVeiculo);
        if (referencias.veiculos(validos).size() != validos.size()) {
            throw new InvarianteVioladaException("Alguma placa informada não existe.");
        }
        var carteira = carteira(idUsuario);
        carteira.definirPlacas(validos);
        return responder(idUsuario, repository.save(carteira));
    }

    /** Atalho: as placas ativas da base entram agora; placa nova na base depois não entra sozinha. */
    @Transactional
    public CarteiraAprovacaoResponse incluirBase(UUID idUsuario, UUID idBase) {
        exigirAprovador(idUsuario);
        if (!referencias.baseExiste(idBase)) {
            throw new InvarianteVioladaException("A base operacional informada não existe.");
        }
        var carteira = carteira(idUsuario);
        carteira.incluirPlacas(referencias.idsVeiculosAtivosDaBase(idBase));
        return responder(idUsuario, repository.save(carteira));
    }

    /** Quem aprova a placa (para a fila e para o aviso de nova solicitação). */
    @Transactional(readOnly = true)
    public List<UUID> aprovadoresDaPlaca(UUID idVeiculo) {
        var aprovadores = new HashSet<>(aprovadores());
        return repository.aprovadoresDaPlaca(idVeiculo).stream().filter(aprovadores::contains).toList();
    }

    /** Placas que o usuário aprova (vazio se não tiver carteira ou se não for administrativo). */
    @Transactional(readOnly = true)
    public java.util.Set<UUID> placasDoAprovador(UUID idUsuario) {
        if (!referencias.usuarioAdministrativo(idUsuario)) {
            return java.util.Set.of();
        }
        return repository.findByIdUsuarioAndAtivoTrue(idUsuario).map(c -> java.util.Set.copyOf(c.getIdsVeiculo())).orElse(java.util.Set.of());
    }

    private CarteiraAprovacao carteira(UUID idUsuario) {
        return repository.findByIdUsuarioAndAtivoTrue(idUsuario).orElseGet(() -> new CarteiraAprovacao(idUsuario));
    }

    /** A aprovação é do administrativo: o usuário de campo só pede o abastecimento. */
    public void exigirAdministrativo(UUID idUsuario) {
        if (!referencias.usuarioAdministrativo(idUsuario)) {
            throw new InvarianteVioladaException("A aprovação do abastecimento é do administrativo. O usuário de campo só pede.");
        }
    }

    private List<UUID> aprovadores() {
        var administrativos = new HashSet<>(referencias.idsUsuariosAdministrativos());
        return referencias.idsUsuariosComPermissao(PERMISSAO_APROVAR).stream().filter(administrativos::contains).toList();
    }

    private void exigirAprovador(UUID idUsuario) {
        exigirAdministrativo(idUsuario);
        if (!referencias.idsUsuariosComPermissao(PERMISSAO_APROVAR).contains(idUsuario)) {
            throw new InvarianteVioladaException("Este usuário não tem a permissão de aprovar abastecimentos.");
        }
    }

    private CarteiraAprovacaoResponse responder(UUID idUsuario, CarteiraAprovacao carteira) {
        var login = referencias.loginsUsuarios(List.of(idUsuario)).getOrDefault(idUsuario, "—");
        var nome = referencias.nomesPessoas(List.of(idUsuario)).getOrDefault(idUsuario, login);
        if (carteira == null) {
            return new CarteiraAprovacaoResponse(idUsuario, login, nome, List.of());
        }
        return new CarteiraAprovacaoResponse(idUsuario, login, nome, placasDe(carteira, placas(carteira.getIdsVeiculo())));
    }

    private Map<UUID, CarteiraAprovacaoResponse.Placa> placas(Collection<UUID> idsVeiculo) {
        return referencias.veiculos(idsVeiculo).values().stream().collect(Collectors.toMap(v -> v.id(), v -> new CarteiraAprovacaoResponse.Placa(
                v.id(), v.placa(), v.modelo(),
                v.baseOperacional() == null ? null : v.baseOperacional().id(),
                v.baseOperacional() == null ? null : v.baseOperacional().nome())));
    }

    private static List<CarteiraAprovacaoResponse.Placa> placasDe(CarteiraAprovacao carteira, Map<UUID, CarteiraAprovacaoResponse.Placa> placas) {
        return carteira.getIdsVeiculo().stream().map(placas::get).filter(java.util.Objects::nonNull)
                .sorted(Comparator.comparing(CarteiraAprovacaoResponse.Placa::placa)).toList();
    }
}
