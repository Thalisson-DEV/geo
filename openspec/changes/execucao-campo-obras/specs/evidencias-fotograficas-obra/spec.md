## ADDED Requirements

### Requirement: Evidências por ponto e vão
O app SHALL apresentar, ao executar um ponto ou vão, a lista de fotos do modelo (antes, durante, depois), abrir a câmera direto,
aplicar carimbo com obra, ponto, data/hora e GPS, guardar as fotos offline e enviá-las vinculadas ao ponto/vão e ao apontamento.
Foto exigida que falta MUST NOT bloquear a marcação: ela vira pendência visível no ponto, no Hoje, no fechamento do turno e no web.

#### Scenario: Foto exigida faltando
- **WHEN** o modelo exige a foto "Depois" e o encarregado marca o vão como feito sem ela
- **THEN** o vão fica feito com a pendência "falta foto Depois" e o app permite tirá-la depois

#### Scenario: Galeria não permitida
- **WHEN** o modelo não permite foto da galeria para a etapa "Durante"
- **THEN** o app oferece só a câmera para essa foto

### Requirement: Anexação de evidência pelo web
O web SHALL permitir anexar fotos a pontos e vãos executados (ex.: execução anterior à adoção do app), identificadas como
anexação manual.

#### Scenario: Anexar foto manual
- **WHEN** o usuário anexa uma foto ao ponto 2 pelo web
- **THEN** a foto aparece nas evidências do ponto marcada como anexação manual

### Requirement: Revisão de fotos
O usuário com permissão de revisão SHALL aprovar ou reprovar cada foto com motivo; somente fotos aprovadas MUST entrar no
relatório de medição detalhado.

#### Scenario: Reprovar foto
- **WHEN** o revisor reprova uma foto por "foto desfocada"
- **THEN** a foto sai do relatório detalhado, aparece em inconformidades e volta como pendência para a equipe

### Requirement: Inconformidades e ranking
O sistema SHALL listar inconformidades de fotos por período, equipe e motivo, e o ranking de qualidade das fotos por equipe
(percentual de aprovação).

#### Scenario: Ranking do mês
- **WHEN** o usuário abre o ranking de outubro
- **THEN** as equipes aparecem ordenadas pelo percentual de fotos aprovadas
