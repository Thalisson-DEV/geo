## ADDED Requirements

### Requirement: Perfil de Obras no app
O app SHALL mostrar ao usuário de equipe de Obras as abas Hoje, Obras, Material, Frota e Conta, sem as telas de notas comerciais.

#### Scenario: Encarregado de Obras entra
- **WHEN** o encarregado de uma equipe de Obras faz login
- **THEN** o app abre no Hoje com as abas Hoje, Obras, Material, Frota e Conta

### Requirement: Pacote offline automático
O app SHALL baixar sem ação do usuário, sempre que houver conexão, as programações da equipe do dia e dos próximos 7 dias com as
obras, o projeto em PDF, pontos, vãos, kits, modelos de APR e de fotos e o saldo do estoque da equipe, e MUST indicar quando o
aparelho está pronto para trabalhar sem sinal e o horário da última atualização.

#### Scenario: Preparar o dia na base
- **WHEN** o encarregado abre o app com sinal pela manhã
- **THEN** o app baixa o pacote em segundo plano e mostra "Pronto para trabalhar sem sinal" com o horário

#### Scenario: Obra concluída sai do aparelho
- **WHEN** todas as programações de uma obra baixada estão concluídas e enviadas
- **THEN** o app remove o PDF e o planejamento dessa obra do aparelho

#### Scenario: Pouco espaço
- **WHEN** o aparelho não tem espaço para um PDF da agenda
- **THEN** o app avisa qual obra ficou sem projeto offline e o que liberar

### Requirement: Hoje guiado
O Hoje SHALL mostrar o turno, as obras do dia na ordem da programação com turno da intervenção, linha viva, desligamento (horário e
manobra) e se finaliza a obra, o material que falta no estoque da equipe, as pendências e um único botão com o próximo passo.

#### Scenario: Próximo passo sem turno
- **WHEN** a equipe tem programação hoje e não abriu o turno
- **THEN** o botão principal é "Abrir turno"

#### Scenario: Próximo passo com turno aberto
- **WHEN** o turno está aberto e a primeira obra do dia ainda não teve chegada
- **THEN** o botão principal é "Ir para a obra <número>" e abre a ficha da obra com "Como chegar"

### Requirement: Chegada e saída da obra
O app SHALL registrar chegada e saída da equipe na obra com data/hora, GPS e precisão, sugerindo "Cheguei" quando a posição estiver
dentro do raio configurado da obra, e "Como chegar" MUST abrir o app de navegação do aparelho com a coordenada ou o endereço.

#### Scenario: Chegar sem sinal
- **WHEN** o encarregado toca "Cheguei" sem conexão
- **THEN** a chegada fica salva no aparelho com a hora do toque e é enviada ao voltar a conexão

### Requirement: Projeto da obra offline
O app SHALL exibir o PDF mestre da obra sem conexão com os pontos e vãos coloridos por situação (a fazer, parcial, feito, com
pendência) e, no tablet, o projeto ao lado da lista de pontos.

#### Scenario: Ver ponto no projeto
- **WHEN** o encarregado toca no ponto 4 do projeto offline
- **THEN** o app mostra os kits e itens programados do ponto com quantidades previstas, executadas e as fotos pedidas

### Requirement: Marcar execução em campo
O app SHALL permitir marcar o ponto inteiro como feito com um toque e, sob demanda, informar parcial por item, registrando
quantidade, data/hora, GPS, turno e usuário com id gerado no aparelho. Itens não programados para a equipe MUST NOT ser marcados, e
a marcação de serviço sem APR concluída no dia MUST levar o encarregado à APR antes de executar.

#### Scenario: Ponto inteiro offline
- **WHEN** o encarregado toca "Tudo feito" no ponto 4 sem conexão
- **THEN** todos os itens programados do ponto ficam como feitos, com o selo "salvo no aparelho", nunca como enviados antes da
  sincronização

#### Scenario: Sem APR
- **WHEN** o encarregado tenta marcar o ponto 4 sem APR concluída para o serviço hoje
- **THEN** o app abre a APR do serviço já preenchida e volta ao ponto depois de concluída

#### Scenario: Sincronização com conflito
- **WHEN** o item foi retirado da programação no web antes da sincronização do apontamento
- **THEN** o apontamento fica em "conflito" com o motivo e a ação sugerida, sem alterar o item no servidor

### Requirement: Aviso de mudança na agenda
O app SHALL avisar o encarregado quando uma programação baixada for reprogramada, cancelada ou alterada, por notificação quando o
app estiver instalado e permitido, e sempre ao abrir o app.

#### Scenario: Cancelamento durante o dia
- **WHEN** o supervisor cancela no web a programação de amanhã da equipe
- **THEN** ao abrir o app com sinal o encarregado vê o aviso e a programação sai da agenda

### Requirement: Georreferenciamento pela execução
A posição do primeiro apontamento de cada ponto com precisão dentro do limite SHALL ser guardada como coordenada executada do ponto
e usada no mapa de obras.

#### Scenario: Ponto sem coordenada
- **WHEN** o ponto 4 recebe o primeiro apontamento com GPS dentro do limite de precisão
- **THEN** o ponto passa a ter coordenada executada visível no mapa
