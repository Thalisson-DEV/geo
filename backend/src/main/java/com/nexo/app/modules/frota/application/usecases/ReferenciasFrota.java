package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.iam.UsuarioApi;
import com.nexo.app.modules.rh.BaseOperacionalApi;
import com.nexo.app.modules.rh.BaseOperacionalResponse;
import com.nexo.app.modules.rh.ColaboradorApi;
import com.nexo.app.modules.rh.EquipeApi;
import com.nexo.app.modules.rh.ResumoColaborador;
import com.nexo.app.modules.rh.VeiculoApi;
import com.nexo.app.modules.rh.VeiculoResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * Resolve, em lote, os nomes que a frota exibe mas que pertencem a outros módulos
 * (bases, colaboradores, veículos e usuários). Uma consulta por tipo por página,
 * nunca uma por linha.
 */
@Component
@RequiredArgsConstructor
class ReferenciasFrota {

    private final BaseOperacionalApi baseApi;
    private final ColaboradorApi colaboradorApi;
    private final VeiculoApi veiculoApi;
    private static final String TIPO_ADMINISTRATIVO = "ADMINISTRATIVO";

    private final UsuarioApi usuarioApi;
    private final EquipeApi equipeApi;

    Map<UUID, String> nomesBases(Collection<UUID> ids) {
        var validos = semNulos(ids);
        if (validos.isEmpty()) return new java.util.HashMap<>();
        return baseApi.buscarPorIdsResponse(validos).entrySet().stream()
                .collect(java.util.stream.Collectors.toMap(Map.Entry::getKey, e -> e.getValue().nome()));
    }

    Map<UUID, ResumoColaborador> colaboradores(Collection<UUID> ids) {
        var validos = semNulos(ids);
        return validos.isEmpty() ? new java.util.HashMap<>() : new java.util.HashMap<>(colaboradorApi.buscarResumosPorIds(validos));
    }

    Map<UUID, String> nomesColaboradores(Collection<UUID> ids) {
        return colaboradores(ids).entrySet().stream()
                .collect(java.util.stream.Collectors.toMap(Map.Entry::getKey, e -> e.getValue().nomeCompleto()));
    }

    Map<UUID, VeiculoResponse> veiculos(Collection<UUID> ids) {
        var validos = semNulos(ids);
        return validos.isEmpty() ? new java.util.HashMap<>() : new java.util.HashMap<>(veiculoApi.buscarPorIdsResponse(validos));
    }

    Map<UUID, String> loginsUsuarios(Collection<UUID> ids) {
        var validos = semNulos(ids);
        // Mapa que aceita get(null): a OS aberta pela rotina não tem usuário de abertura.
        return validos.isEmpty() ? new java.util.HashMap<>() : new java.util.HashMap<>(usuarioApi.buscarLoginsPorIds(validos));
    }

    /** Nome da pessoa por trás do usuário (o colaborador vinculado); sem vínculo, o login. */
    Map<UUID, String> nomesPessoasUsuarios(Collection<UUID> ids) {
        var validos = semNulos(ids);
        if (validos.isEmpty()) {
            return new java.util.HashMap<>();
        }
        var contatos = usuarioApi.buscarContatos(validos);
        var nomes = nomesColaboradores(contatos.values().stream().map(c -> c.idColaborador()).filter(Objects::nonNull).toList());
        var resultado = new HashMap<UUID, String>();
        contatos.forEach((id, c) -> resultado.put(id, c.idColaborador() != null && nomes.containsKey(c.idColaborador())
                ? nomes.get(c.idColaborador()) : c.login()));
        return resultado;
    }

    boolean baseExiste(UUID idBase) {
        return idBase != null && baseApi.existeBase(idBase);
    }

    boolean colaboradorAtivo(UUID idColaborador) {
        return idColaborador != null && colaboradorApi.existeColaborador(idColaborador);
    }

    List<UUID> idsColaboradoresPorNome(String trecho) {
        return colaboradorApi.buscarIdsPorTrechoDoNome(trecho);
    }

    List<UUID> idsColaboradoresPorBases(Collection<UUID> idsBase) {
        return colaboradorApi.listarAtivosPorEscopo(idsBase, null).stream().map(c -> c.id()).toList();
    }

    /** Placa sem hífen nem espaço, em maiúsculas → id do veículo (para importações). */
    Map<String, UUID> idsVeiculosPorPlaca() {
        Map<String, UUID> mapa = new java.util.HashMap<>();
        veiculoApi.mapaPlacasIds().forEach((placa, id) -> mapa.put(placa.toUpperCase(java.util.Locale.ROOT).replaceAll("[^A-Z0-9]", ""), id));
        return mapa;
    }

    List<UUID> idsVeiculosPorTrecho(String trecho) {
        return veiculoApi.buscarIdsPorTrecho(trecho);
    }

    /** Veículos ativos das bases; lista com um id impossível quando não há nenhum (o IN vazio não filtra). */
    List<UUID> idsVeiculosAtivosDasBases(Collection<UUID> idsBase) {
        var ids = veiculoApi.listarIdsVeiculosAtivos(List.copyOf(semNulos(idsBase)));
        return ids.isEmpty() ? List.of(new UUID(0, 0)) : ids;
    }

    List<UUID> idsVeiculosAtivosDaBase(UUID idBase) {
        return idBase == null ? List.of() : veiculoApi.listarIdsVeiculosAtivos(List.of(idBase));
    }

    /** Equipe do usuário (a mesma que vai no token do app); vazio para quem não é de equipe. */
    UUID equipeDoUsuario(UUID idUsuario) {
        return idUsuario == null ? null : equipeApi.buscarIdEquipePorUsuario(idUsuario).orElse(null);
    }

    /** Nome de quem usa o sistema: o do colaborador ligado ao usuário ou, sem ele, o login. */
    Map<UUID, String> nomesPessoas(Collection<UUID> idsUsuario) {
        var validos = semNulos(idsUsuario);
        if (validos.isEmpty()) return new java.util.HashMap<>();
        var contatos = usuarioApi.buscarContatos(validos);
        var nomes = nomesColaboradores(contatos.values().stream().map(c -> c.idColaborador()).filter(Objects::nonNull).toList());
        var resultado = new HashMap<UUID, String>();
        contatos.forEach((id, c) -> {
            var nome = c.idColaborador() == null ? null : nomes.get(c.idColaborador());
            resultado.put(id, nome != null ? nome : c.login());
        });
        return resultado;
    }

    /** Colaborador ligado ao usuário (o condutor que ele é), ou nulo. */
    UUID colaboradorDoUsuario(UUID idUsuario) {
        if (idUsuario == null) return null;
        var contato = usuarioApi.buscarContatos(List.of(idUsuario)).get(idUsuario);
        return contato == null ? null : contato.idColaborador();
    }

    String loginUsuario(UUID idUsuario) {
        return loginsUsuarios(List.of(idUsuario)).getOrDefault(idUsuario, "");
    }

    List<UUID> idsUsuariosComPermissao(String permissao) {
        return usuarioApi.buscarIdsAtivosComPermissao(permissao);
    }

    List<UUID> idsUsuariosAdministrativos() {
        return usuarioApi.buscarIdsAtivosPorTipo(TIPO_ADMINISTRATIVO);
    }

    boolean usuarioAdministrativo(UUID idUsuario) {
        return idUsuario != null && usuarioApi.buscarContextoAudiencia(idUsuario)
                .map(c -> TIPO_ADMINISTRATIVO.equals(c.tipoUsuario())).orElse(false);
    }

    BaseOperacionalResponse base(UUID idBase) {
        return idBase == null ? null : baseApi.buscarPorIdResponse(idBase).orElse(null);
    }

    /** Equipe com o código e a base (com coordenada e raio), para as análises de turno. */
    record EquipeComBase(UUID idEquipe, String codigo, BaseOperacionalResponse base) {
    }

    /** Equipes informadas: as ativas numa consulta; as desativadas (turnos antigos) uma a uma. */
    Map<UUID, EquipeComBase> equipesComBase(Collection<UUID> ids) {
        var validos = semNulos(ids);
        if (validos.isEmpty()) return new java.util.HashMap<>();
        var resultado = new HashMap<UUID, EquipeComBase>();
        equipeApi.listarEquipesAtivas().stream().filter(e -> validos.contains(e.id()))
                .forEach(e -> resultado.put(e.id(), new EquipeComBase(e.id(), e.codigo(), e.baseOperacional())));
        validos.stream().filter(id -> !resultado.containsKey(id)).forEach(id -> equipeApi.buscarPublicaPorId(id)
                .ifPresent(e -> resultado.put(id, new EquipeComBase(id, e.codigo(), base(e.idBaseOperacional())))));
        return resultado;
    }

    /** Equipe ativa que usa o veículo, com processo, supervisor e coordenador; vazio se nenhuma. */
    java.util.Optional<com.nexo.app.modules.rh.EquipeResponse> equipeDoVeiculo(UUID idVeiculo) {
        if (idVeiculo == null) return java.util.Optional.empty();
        var vinculo = veiculoApi.listarVinculosEquipeAtivos().get(idVeiculo);
        return vinculo == null || vinculo.equipeId() == null ? java.util.Optional.empty()
                : equipeApi.buscarPorIdResponse(vinculo.equipeId());
    }

    /**
     * Usuários de quem responde pelo veículo: supervisor e coordenador da equipe que o usa
     * (o coordenador vem do supervisor quando a equipe não tem um próprio). Vazio sem equipe.
     */
    record GestoresVeiculo(java.util.Set<UUID> supervisores, java.util.Set<UUID> coordenadores) {
        static final GestoresVeiculo NENHUM = new GestoresVeiculo(java.util.Set.of(), java.util.Set.of());
    }

    GestoresVeiculo gestoresDoVeiculo(UUID idVeiculo) {
        var equipe = equipeDoVeiculo(idVeiculo).orElse(null);
        if (equipe == null) return GestoresVeiculo.NENHUM;
        var supervisores = new java.util.HashSet<UUID>();
        var coordenadores = new java.util.HashSet<UUID>();
        if (equipe.supervisor() != null && equipe.supervisor().ativo() && equipe.supervisor().colaborador() != null
                && equipe.supervisor().colaborador().idUsuario() != null) {
            supervisores.add(equipe.supervisor().colaborador().idUsuario());
        }
        var coordenador = equipe.coordenador() != null ? equipe.coordenador()
                : equipe.supervisor() != null ? equipe.supervisor().coordenador() : null;
        if (coordenador != null && coordenador.ativo() && coordenador.colaborador() != null
                && coordenador.colaborador().idUsuario() != null) {
            coordenadores.add(coordenador.colaborador().idUsuario());
        }
        return new GestoresVeiculo(java.util.Set.copyOf(supervisores), java.util.Set.copyOf(coordenadores));
    }

    private static List<UUID> semNulos(Collection<UUID> ids) {
        return ids == null ? List.of() : ids.stream().filter(Objects::nonNull).distinct().toList();
    }
}
