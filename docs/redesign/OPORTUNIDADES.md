# Oportunidades de melhoria (não implementadas)

Melhorias maiores ou que tocam em regra de negócio, vistas durante o redesign. As pequenas e
seguras foram implementadas na hora (ver PROGRESS.md).

| # | Tela | Problema observado | Proposta | Impacto | Esforço |
|---|---|---|---|---|---|
| O1 | Descontos (lançamento, dashboard, relatórios) | O mesmo status `SOLICITADO` aparece como "Solicitado", "Lançado" e "Aguardando validação" conforme a tela. | Adotar `GET /api/v1/meta/enums/status-desconto` (já existe) como fonte única de rótulos e tons; decidir com o DP o nome oficial. | alto | baixo |
| O2 | Todas as listagens com selects (65 lugares) | Opções carregadas com `size` 500–2000 da listagem paginada; lento e impede limitar `max-page-size`. | Endpoints `GET /{recurso}/options?q=` (≤ 50, com busca) e `geo-select` com busca remota. | alto | alto |
| O3 | Listagens server-side (92 controllers) | `sort` repassado cru ao JPA; hoje um campo inválido devolve 400 (antes 500), mas qualquer propriedade da entidade é ordenável. | Whitelist de ordenação por recurso (mapa coluna da UI → propriedade), como na skill do contrato. | médio | médio |
| O4 | Listagens de status (65 campos enum cru) | Cada tela mantém tabela própria de rótulo/cor/ícone do status. | Devolver `StatusDto {code,label,severity}` nas linhas (`*Row`) e usar `<geo-status-tag>`; os catálogos `EnumDeUi` já existem para chamado e desconto. | alto | médio |
| O5 | 71 controllers | DTO de listagem igual ao de detalhe: listagens trafegam campos que a tabela não mostra. | Separar `XxxRow` (plano, só colunas) de `XxxDetail`. | médio | alto |
| O6 | Carteira de obras (`/obras`) | 18 colunas na tabela; em 1280px metade fica fora da tela. | Colunas configuráveis por usuário (mostrar/ocultar, ordem) persistidas, com um conjunto padrão de 9 colunas. | alto | médio |
| O7 | Rótulos de dados em maiúsculas (status de obra, processos, bases) | Os cadastros gravam nomes em CAIXA ALTA; a interface não consegue apresentá-los em caixa de frase. | Normalizar a exibição no backend (campo `nomeExibicao`) ou migração de dados combinada com o cliente. | médio | médio |
