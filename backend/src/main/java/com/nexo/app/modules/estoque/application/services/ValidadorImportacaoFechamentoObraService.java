package com.nexo.app.modules.estoque.application.services;

import com.nexo.app.modules.estoque.domain.ContextoSolicitacaoMaterial;
import com.nexo.app.modules.estoque.application.dto.FechamentoImportacaoDTO;
import com.nexo.app.modules.estoque.application.dto.FechamentoObraRequests;
import com.nexo.app.modules.estoque.domain.Estoque;
import com.nexo.app.modules.estoque.domain.Material;
import com.nexo.app.modules.estoque.infrastructure.persistence.EstoqueRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.MaterialRepository;
import com.nexo.app.modules.obras.ObraApi;
import com.nexo.app.modules.obras.ObraApi.ObraPublica;
import com.nexo.app.shared.application.dto.ImportacaoStatus;
import com.nexo.app.shared.domain.HorasUteis;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Valida as linhas da planilha com as regras da criação manual e monta os grupos:
 * cada obra + almoxarifado + tipo + reserva vira uma solicitação.
 */
@Service
@RequiredArgsConstructor
public class ValidadorImportacaoFechamentoObraService {

    private static final Set<String> TIPOS = Set.of("221", "921", "222", "922");
    private static final int TAMANHO_OBSERVACAO = 1000;
    private static final int CASAS_DECIMAIS = 3;
    private static final List<DateTimeFormatter> FORMATOS_DATA = List.of(
            DateTimeFormatter.ISO_LOCAL_DATE,
            DateTimeFormatter.ofPattern("dd/MM/uuuu").withResolverStyle(ResolverStyle.STRICT));

    private final ObraApi obraApi;
    private final EstoqueRepository estoqueRepository;
    private final MaterialRepository materialRepository;
    private final ProcessoMaterialService processoMaterial;

    @Transactional(readOnly = true)
    public Validacao validar(List<FechamentoImportacaoDTO> registros) {
        Map<String, Optional<ObraPublica>> obras = new HashMap<>();
        Map<String, Optional<Estoque>> almoxarifados = new HashMap<>();
        Map<String, Optional<Material>> materiais = new HashMap<>();
        Map<String, GrupoEmMontagem> grupos = new LinkedHashMap<>();
        List<FechamentoImportacaoDTO> validados = new ArrayList<>();

        for (int indice = 0; indice < registros.size(); indice++) {
            FechamentoImportacaoDTO registro = registros.get(indice);
            Erros erros = new Erros();
            ObraPublica obra = obra(registro, obras, erros);
            Estoque almoxarifado = almoxarifado(registro, almoxarifados, erros);
            String tipo = tipo(registro, erros);
            Material material = material(registro, materiais, erros);
            quantidade(registro, erros);
            String reserva = reserva(registro, erros);
            LocalDate dataReserva = dataReserva(registro, erros);
            observacao(registro, erros);

            if (erros.vazio()) {
                String chave = String.join("|", obra.id().toString(), almoxarifado.getId().toString(), tipo,
                        reserva == null ? "" : reserva);
                GrupoEmMontagem grupo = grupos.computeIfAbsent(chave, ignorada -> new GrupoEmMontagem(
                        chave, obra.id(), almoxarifado.getId(), tipo, reserva));
                Integer linhaAnterior = grupo.materiais.putIfAbsent(material.getId(), numeroLinha(registro, indice));
                if (linhaAnterior != null) {
                    erros.adicionar("codigoMaterial", "O material " + material.getCodigo()
                            + " já está na linha " + linhaAnterior + " desta solicitação.");
                } else {
                    grupo.adicionar(indice, material.getId(), registro.quantidade(), dataReserva, registro.observacao());
                }
            }
            String aviso = reserva == null && dataReserva != null
                    ? "Data da reserva ignorada: falta o número da reserva." : null;
            validados.add(registro.validado(
                    obra == null ? null : obra.titulo(),
                    material == null ? null : material.getDescricao(),
                    dataReserva == null ? registro.dataReserva() : dataReserva.toString(),
                    erros.vazio() ? ImportacaoStatus.AGUARDANDO_PROCESSAMENTO : ImportacaoStatus.COM_ERRO,
                    erros.campo(),
                    erros.vazio() ? aviso : erros.mensagem()));
        }
        return new Validacao(validados, grupos.values().stream().map(GrupoEmMontagem::grupo).toList());
    }

    private static int numeroLinha(FechamentoImportacaoDTO registro, int indice) {
        return registro.linha() == null ? indice + 1 : registro.linha();
    }

    private ObraPublica obra(
            FechamentoImportacaoDTO registro, Map<String, Optional<ObraPublica>> cache, Erros erros) {
        String numero = texto(registro.numeroObra());
        if (numero == null) {
            erros.adicionar("numeroObra", "Informe o número da obra.");
            return null;
        }
        ObraPublica obra = cache.computeIfAbsent(numero.toUpperCase(Locale.ROOT), ignorada -> obraApi.buscarPorNumero(numero))
                .orElse(null);
        if (obra == null) {
            erros.adicionar("numeroObra", "A obra " + numero + " não foi encontrada.");
            return null;
        }
        if (!obra.ativa()) {
            erros.adicionar("numeroObra", "A obra " + numero + " está inativa.");
            return null;
        }
        return obra;
    }

    private Estoque almoxarifado(
            FechamentoImportacaoDTO registro, Map<String, Optional<Estoque>> cache, Erros erros) {
        String nome = texto(registro.almoxarifado());
        if (nome == null) {
            erros.adicionar("almoxarifado", "Informe o almoxarifado de atendimento.");
            return null;
        }
        Estoque estoque = cache.computeIfAbsent(nome.toUpperCase(Locale.ROOT),
                ignorada -> estoqueRepository.findByNomeIdentificadorIgnoreCase(nome)).orElse(null);
        if (estoque == null) {
            erros.adicionar("almoxarifado", "O almoxarifado " + nome + " não foi encontrado.");
            return null;
        }
        boolean fisico = estoque.getTipoEstoque() != null && "FISICO".equalsIgnoreCase(estoque.getTipoEstoque().getNome());
        if (!estoque.isAtivo() || !fisico) {
            erros.adicionar("almoxarifado", "O estoque " + nome + " precisa ser um almoxarifado físico ativo.");
            return null;
        }
        return estoque;
    }

    private static String tipo(FechamentoImportacaoDTO registro, Erros erros) {
        String tipo = texto(registro.tipo());
        if (tipo == null || !TIPOS.contains(tipo)) {
            erros.adicionar("tipo", "O tipo deve ser 221, 921, 222 ou 922.");
            return null;
        }
        return tipo;
    }

    private Material material(
            FechamentoImportacaoDTO registro, Map<String, Optional<Material>> cache, Erros erros) {
        String codigo = texto(registro.codigoMaterial());
        if (codigo == null) {
            erros.adicionar("codigoMaterial", "Informe o código do material.");
            return null;
        }
        Material material = cache.computeIfAbsent(codigo.toUpperCase(Locale.ROOT),
                ignorada -> materialRepository.findByCodigoIgnoreCase(codigo)).orElse(null);
        if (material == null) {
            erros.adicionar("codigoMaterial", "O material " + codigo + " não foi encontrado.");
            return null;
        }
        if (!material.isAtivo()) {
            erros.adicionar("codigoMaterial", "O material " + codigo + " está inativo.");
            return null;
        }
        String incompativel = processoMaterial.incompatibilidade(ContextoSolicitacaoMaterial.FECHAMENTO, material).orElse(null);
        if (incompativel != null) {
            erros.adicionar("codigoMaterial", incompativel);
            return null;
        }
        return material;
    }

    private static void quantidade(FechamentoImportacaoDTO registro, Erros erros) {
        BigDecimal quantidade = registro.quantidade();
        if (quantidade == null || quantidade.signum() <= 0) {
            erros.adicionar("quantidade", "Informe uma quantidade positiva.");
        } else if (quantidade.stripTrailingZeros().scale() > CASAS_DECIMAIS) {
            erros.adicionar("quantidade", "A quantidade aceita até 3 casas decimais.");
        }
    }

    private static String reserva(FechamentoImportacaoDTO registro, Erros erros) {
        String numero = texto(registro.numeroReserva());
        if (numero != null && !numero.matches("[0-9]{1,20}")) {
            erros.adicionar("numeroReserva", "O número da reserva deve ter só números, até 20 dígitos.");
            return null;
        }
        return numero;
    }

    private static LocalDate dataReserva(FechamentoImportacaoDTO registro, Erros erros) {
        String valor = texto(registro.dataReserva());
        if (valor == null) {
            return null;
        }
        for (DateTimeFormatter formato : FORMATOS_DATA) {
            try {
                LocalDate data = LocalDate.parse(valor, formato);
                if (data.isAfter(LocalDate.now(HorasUteis.FUSO))) {
                    erros.adicionar("dataReserva", "A data da reserva não pode ser futura.");
                    return null;
                }
                return data;
            } catch (DateTimeParseException ignorada) {
                // Tenta o próximo formato aceito.
            }
        }
        erros.adicionar("dataReserva", "Use a data da reserva no formato DD/MM/AAAA.");
        return null;
    }

    private static void observacao(FechamentoImportacaoDTO registro, Erros erros) {
        String observacao = texto(registro.observacao());
        if (observacao == null) {
            return;
        }
        if (observacao.length() > TAMANHO_OBSERVACAO) {
            erros.adicionar("observacao", "A observação deve ter até 1000 caracteres.");
        } else if ("=+-@".indexOf(observacao.charAt(0)) >= 0) {
            erros.adicionar("observacao", "A observação não pode começar com =, +, - ou @.");
        }
    }

    private static String texto(String valor) {
        return valor == null || valor.isBlank() ? null : valor.trim();
    }

    /** Solicitação que a confirmação vai criar, com o índice das linhas que a formam. */
    public record Grupo(
            String chave,
            UUID idObra,
            UUID idAlmoxarifado,
            String tipo,
            String numeroReserva,
            LocalDate dataReserva,
            String observacao,
            List<FechamentoObraRequests.Criar.Item> itens,
            List<Integer> indices
    ) {
    }

    public record Validacao(List<FechamentoImportacaoDTO> registros, List<Grupo> grupos) {
    }

    private static final class GrupoEmMontagem {
        private final String chave;
        private final UUID idObra;
        private final UUID idAlmoxarifado;
        private final String tipo;
        private final String numeroReserva;
        private final Map<UUID, Integer> materiais = new HashMap<>();
        private final List<FechamentoObraRequests.Criar.Item> itens = new ArrayList<>();
        private final List<Integer> indices = new ArrayList<>();
        private LocalDate dataReserva;
        private String observacao;

        private GrupoEmMontagem(String chave, UUID idObra, UUID idAlmoxarifado, String tipo, String numeroReserva) {
            this.chave = chave;
            this.idObra = idObra;
            this.idAlmoxarifado = idAlmoxarifado;
            this.tipo = tipo;
            this.numeroReserva = numeroReserva;
        }

        private void adicionar(int indice, UUID idMaterial, BigDecimal quantidade, LocalDate data, String texto) {
            indices.add(indice);
            itens.add(new FechamentoObraRequests.Criar.Item(idMaterial, quantidade));
            dataReserva = dataReserva == null ? data : dataReserva;
            observacao = observacao == null ? ValidadorImportacaoFechamentoObraService.texto(texto) : observacao;
        }

        private Grupo grupo() {
            return new Grupo(chave, idObra, idAlmoxarifado, tipo, numeroReserva,
                    numeroReserva == null ? null : dataReserva, observacao, List.copyOf(itens), List.copyOf(indices));
        }
    }

    private static final class Erros {
        private final List<String> mensagens = new ArrayList<>();
        private String campo;

        private void adicionar(String nome, String mensagem) {
            campo = campo == null ? nome : campo;
            mensagens.add(mensagem);
        }

        private boolean vazio() {
            return mensagens.isEmpty();
        }

        private String campo() {
            return campo;
        }

        private String mensagem() {
            return String.join(" ", mensagens);
        }
    }
}
