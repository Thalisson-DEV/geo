# Padrão de relatório

Vale para toda tela que mostra um registro como documento (inspeção, evento, desconto,
compra/pagamento, nota comercial, turno, solicitações e movimentações do almoxarifado,
encerramento de obra, OS/checklist/abastecimento da frota).

## Anatomia

```
moldura (fundo da aplicação, até 86rem, respiro 24/32px, 64px no fim)
├─ barra de ações (no topo, fora da folha, presa ao rolar)
│    Voltar (fantasma, à esquerda) · Analisar com Bússola · Imprimir · Editar … · ação principal por último
└─ folha (superfície, borda, raio 8px, padding 32/40px)
     ├─ timbre institucional — só na impressão
     ├─ título (16px/600, à esquerda) + identificação · data · situação
     ├─ faixa de situação / pontos de atenção
     ├─ dados em três colunas · indicadores
     └─ seções (título com barra lateral + tabela/conteúdo)
```

## Como usar

- Rota: `data: { fullscreen: true, relatorio: true }`. O shell aplica a moldura (`.geo-relatorio-moldura`)
  e o fundo (`.geo-relatorio-fundo`); em `?mode=print` a moldura sai.
- Barra: `<div class="geo-relatorio-acoes print:hidden">` com `geo-button`. Primeiro botão é sempre
  "Voltar" (`variant="ghost"`). Neutras em `outline`; destrutivas em `destructive`; conclusão
  financeira em `success`; uma única ação principal sem variante. Rótulos em caixa de frase.
- Folha: `class="geo-relatorio-folha"` no contêiner do documento.
- Timbre: `class="geo-relatorio-timbre"` (some na tela). Título: `class="geo-relatorio-titulo"`.
- CSS em `frontend/src/app/design-system/styles/report.css`.

## Não fazer

- Barra de ações flutuante no rodapé, rótulos em caixa alta, `styleClass` com `!important`.
- Padding/fundo próprios na raiz da tela (`p-4 md:p-8`, `min-h-screen bg-…`): a moldura já cuida.
- "NOME DA EMPRESA"/logos na tela.
