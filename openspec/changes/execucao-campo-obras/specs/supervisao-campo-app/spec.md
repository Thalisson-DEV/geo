## ADDED Requirements

### Requirement: Documentação técnica pelo supervisor no app
O app SHALL permitir ao supervisor lançar visita prévia, ficha As Built, equipamentos e book com os mesmos modelos de checklist do
web, com fotos e localização, offline.

#### Scenario: Visita pelo supervisor
- **WHEN** o supervisor preenche a visita prévia no app sem sinal
- **THEN** a visita é enviada ao voltar a conexão e a obra passa a "Visita realizada" no web

### Requirement: Acompanhamento das equipes no app
O app SHALL mostrar ao supervisor as equipes sob sua responsabilidade com status em tempo real, obra atual, agenda do dia, APR
pendente e ocorrências que impedem execução, com o horário da última atualização.

#### Scenario: Serviço travado
- **WHEN** uma equipe registra "Sem condição de executar" numa obra do supervisor
- **THEN** a equipe aparece no topo da lista do supervisor com a ocorrência e o motivo
