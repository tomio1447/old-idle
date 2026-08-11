# 📦 Atualização Global-Idle — v22 (Sprite centralizada no SQM + Ícone ranged/melee reposicionado)

**Zip:** `atualizacoes/atualizacao-global-idle.zip` (tag `atualizacao-v1`).
Link direto: `https://github.com/tomio1447/old-idle/raw/refs/tags/atualizacao-v1/atualizacoes/atualizacao-global-idle.zip`

---

## 🧍 1. Personagem projetado no MEIO do SQM

- **Antes:** a sprite era ancorada com os pés na **borda inferior** do SQM e o
  personagem parecia "afundado" no canto inferior do tile.
- **Agora:** a sprite fica **centralizada no SQM exatamente** — tanto na
  horizontal quanto na vertical (o meio da sprite coincide com o centro do
  tile). A sombra sob os pés acompanha e fica no centro do SQM.
- Vale para o **personagem ativo** e também para os **aliados do Party Combat**
  (todos os membros na mesma instância usam a mesma regra).

## 🏹 2. Ícone de ranged/melee menor e na lateral direita da sprite

- O ícone de **tipo de ataque** (🏹 flecha = ranged / ⚔ espadas = melee) dos
  monstros agora é **menor (9px)** e sai de perto do nome.
- Nova posição: **lateral DIREITA da sprite, no meio dela, logo abaixo do
  nome** — como o indicador do OTC client.
- Os ícones de condição (Sap Strength / Expose Weakness / Challenge) continuam
  ao lado do nome, sem o indicador de ataque no meio deles.

## 🧪 3. Testes

- **Novo `test_sprite_center.js`**: captura os drawImage do renderer e
  verifica que o personagem é desenhado centralizado no SQM (centro da sprite
  == centro do tile) e que o ícone de ataque usa 9px na lateral direita.
- Regressão completa (party, combat, exercise, dt-seal, v21, scan 15.x etc.) —
  **tudo verde**.

## Como atualizar

1. Baixe o zip e extraia **sobre** a pasta do jogo (substituindo os arquivos).
2. **Ctrl+F5** após atualizar.
