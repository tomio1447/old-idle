# 📦 Atualização Global-Idle — v35 (Painel de Party restaurado + Interface corrigida)

**Zip:** `atualizacoes/atualizacao-global-idle.zip` (tag `atualizacao-v1`).
Link direto: `https://github.com/tomio1447/old-idle/raw/refs/tags/atualizacao-v1/atualizacoes/atualizacao-global-idle.zip`

---

## 🐛 1. Interface corrigida — CSS do painel de party restaurado

- **Bug:** ao consolidar o CSS (consolidate_css.py) nas versões anteriores, o
  `layout.css` foi regenerado e **perdeu o bloco de CSS do painel OTC de
  party** (`.party-panel` e as classes `.party-member-row`, `.ppm-*`,
  `.party-pbar`). Sem o `position: absolute`, o painel **fluía para o final
  da página** em vez de ficar sobreposto à cena — desorganizando a interface.
- **Correção:** o bloco completo do painel de party foi **restaurado no
  `style.css`** (fonte do consolidado) e regenerado no `layout.css` — o
  painel volta ao **canto superior direito da cena**, com as barras de
  HP/mana dos membros e o clique para trocar de personagem.
- Também foram restauradas as **subcategorias das áreas de caça**
  (`.hunt-cat-title`, `.hunts-group`) que haviam sido perdidas no mesmo
  processo.
- O bloco agora vive no `style.css`, então o consolidate **não o perde mais**
  em futuras versões.

## 🧪 2. Testes

- **Novo `test_css_party_v35.js`**: valida que `.party-panel` tem
  `position: absolute`, e que `.party-member-row`, `.party-pbar`, `.ppm-*`,
  `.party-panel-empty` e `.hunt-cat-title` existem no layout.css (e que o
  bloco está no style.css para não se perder).
- Regressão completa (v21→v34, party, BOX, reward chest, combat, dt-seal,
  scan 15.x) — **tudo verde**.

## Como atualizar

1. Baixe o zip e extraia **sobre** a pasta do jogo (substituindo os arquivos).
2. **Ctrl+F5** após atualizar (importante: o cache do CSS antigo precisa ser
   limpo — o Ctrl+F5 força).
