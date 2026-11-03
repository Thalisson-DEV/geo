package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.domain.AlvoAnaliseIa;

import java.util.List;

/** Textos enviados ao modelo de visão nas análises dos relatórios da frota. */
final class PromptAnaliseIaFrota {

    private PromptAnaliseIaFrota() {
    }

    static String sistema(AlvoAnaliseIa alvo) {
        return """
                Você é o Assistente, o assistente do C.E.S (NEXO), atuando como analista de frota. Analise o registro de %s e as fotos anexadas.
                Regras:
                1. Você só aponta. Nunca aprova, reprova ou decide: quem decide é o gestor da frota.
                2. Compare o que as fotos mostram com o que foi informado no registro.
                3. Não invente. Se a foto não permite ler, o resultado é ILEGIVEL.
                4. Português do Brasil, frases curtas e objetivas, sem emojis, números no formato brasileiro.
                5. As datas e horas do JSON estão em UTC. Ao citar uma data ou hora, converta para o horário de Brasília (UTC-3).
                6. %s
                Responda somente com um JSON válido, sem texto fora dele, neste formato:
                {"parecer":"SEM_RESSALVAS|ATENCAO|CRITICO","resumo":"2 a 3 frases",
                 "pontos":[{"titulo":"...","detalhe":"...","gravidade":"INFO|ATENCAO|CRITICO"}],
                 "fotos":[{"ref":"F1","leitura":"o que se vê ou se lê na foto","resultado":"CONFERE|DIVERGE|ILEGIVEL|SEM_RELACAO","observacao":"..."}],
                 "recomendacoes":["..."]%s}
                Inclua uma entrada em "fotos" para cada foto recebida, usando a referência indicada.
                """.formatted(alvo.getRotulo().toLowerCase(), foco(alvo), alvo == AlvoAnaliseIa.ABASTECIMENTO
                ? ",\n \"precosCupom\":[{\"produto\":\"nome do item como está no registro\",\"precoUnitario\":6.490}]"
                : "");
    }

    static String usuario(AlvoAnaliseIa alvo, String dadosJson, List<AnaliseIaFrotaUseCases.FotoEnviada> fotos) {
        var texto = new StringBuilder("Dados do registro de ").append(alvo.getRotulo().toLowerCase()).append(" (JSON):\n")
                .append(dadosJson).append("\n\n");
        if (fotos.isEmpty()) {
            texto.append("Nenhuma foto foi recebida. Analise só os dados e deixe \"fotos\" vazio.");
        } else {
            texto.append("Fotos, na ordem em que foram anexadas:\n");
            fotos.forEach(f -> texto.append(f.ref()).append(" — ").append(f.rotulo()).append('\n'));
        }
        return texto.toString();
    }

    private static String foco(AlvoAnaliseIa alvo) {
        return switch (alvo) {
            case ORDEM_SERVICO -> "Verifique a coerência entre o problema relatado, os serviços e peças lançados, valores, causa,"
                    + " tempo parado, atraso e repetição da manutenção. Na nota fiscal, confira valor, fornecedor e data."
                    + " Nas fotos do checklist de origem, diga se o problema descrito aparece.";
            case CHECKLIST -> "Em cada item Não OK, diga se a foto mostra o problema descrito e a gravidade aparente."
                    + " Nas fotos de recebimento, aponte avarias visíveis que não foram registradas. Considere o histórico do item.";
            case ABASTECIMENTO -> "No painel, leia KM ou horas e o ponteiro do tanque e compare com o informado. Diga se o nível do"
                    + " tanque no pedido justifica abastecer. Se vier o painel do pedido anterior do veículo, compare: a mesma foto"
                    + " ou uma foto parecida demais (mesmo ângulo, mesmos números) é ponto de ATENCAO; painéis do mesmo carro são"
                    + " parecidos, então só aponte quando os números ou o ponteiro forem os mesmos. Compare o painel antes e depois:"
                    + " o tanque deve ter subido. No cupom, leia litros, valor, preço por litro, combustível, posto e data e compare"
                    + " com o realizado e com o preço cadastrado do posto (valorUnitario dos itens). Em \"precosCupom\", liste o"
                    + " preço por litro lido no cupom de cada item entregue, com o nome do item como está no registro; deixe vazio"
                    + " se não houver cupom legível. Considere os alertas já calculados.";
        };
    }
}
