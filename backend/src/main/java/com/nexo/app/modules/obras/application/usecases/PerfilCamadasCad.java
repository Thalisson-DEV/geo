package com.nexo.app.modules.obras.application.usecases;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Como um programa de projeto organiza a rede em camadas do DXF. Cada projetista/concessionária tem o seu jeito; um
 * perfil novo entra aqui sem mudar a leitura. O perfil é escolhido sozinho pelas camadas presentes no arquivo.
 *
 * @param poste        camada dos blocos de poste (o ponto de inserção é o poste)
 * @param numero       texto com o código do poste, a primeira linha do rótulo
 * @param tipoPoste    texto com o poste (ex.: DT 9/300, 300/11)
 * @param estrutura    textos de estrutura do poste (primário e secundário)
 * @param coordenada   texto "leste / norte" do poste
 * @param equipamento  texto de equipamento instalado no poste (chave, religador)
 * @param trecho       linhas da rede (vãos)
 * @param primario     dentro de {@code trecho} e das cotas: o que é rede primária
 * @param cota         texto de metragem e cabo escrito ao longo do vão
 * @param novo         sufixo de camada do que entra na obra
 * @param retirado     sufixo de camada do que sai na obra
 */
record PerfilCamadasCad(String nome, Pattern poste, Pattern numero, Pattern tipoPoste, Pattern estrutura, Pattern coordenada,
                        Pattern equipamento, Pattern trecho, Pattern primario, Pattern cota, Pattern novo, Pattern retirado) {

    /** GeoRede: TEXTO_PG_* para o rótulo, TRECHO_* para a rede, _PROJ e _RETI para obra. */
    static final PerfilCamadasCad GEOREDE = new PerfilCamadasCad("GeoRede",
            Pattern.compile("^PONTO_GEOGRAFICO(_PROJ|_RETI)?$"),
            Pattern.compile("^TEXTO_PG_NUMERO(_PROJ|_RETI)?$"),
            Pattern.compile("^TEXTO_PG(_PROJ|_RETI)?$"),
            Pattern.compile("^TEXTO_PG_ESTRUTURA_(PRI|SEC)(_PROJ|_RETI)?$"),
            Pattern.compile("^TEXTO_PG_COORD(_PROJ|_RETI)?$"),
            Pattern.compile("^TEXTO_IT(_PROJ|_RETI)?$"),
            Pattern.compile("^TRECHO_(PRIMARIO|SECUNDARIO)(_PROJ|_RETI)?$"),
            Pattern.compile("PRIMARIO|_TP(_|$)"),
            Pattern.compile("^TEXTO_T[PS](_PROJ|_RETI)?$"),
            Pattern.compile("_PROJ$"),
            Pattern.compile("_RETI$"));

    static final List<PerfilCamadasCad> CONHECIDOS = List.of(GEOREDE);

    /** O primeiro perfil que reconhece postes e códigos de poste entre as camadas do arquivo. */
    static Optional<PerfilCamadasCad> detectar(Collection<String> camadas) {
        return CONHECIDOS.stream()
                .filter(p -> camadas.stream().anyMatch(c -> p.poste().matcher(c).matches())
                        && camadas.stream().anyMatch(c -> p.numero().matcher(c).matches()))
                .findFirst();
    }

    boolean ehNovo(String camada) {
        return novo.matcher(camada).find();
    }

    boolean ehRetirado(String camada) {
        return retirado.matcher(camada).find();
    }

    boolean ehRotulo(String camada) {
        return tipoPoste.matcher(camada).matches() || estrutura.matcher(camada).matches() || coordenada.matcher(camada).matches();
    }
}
