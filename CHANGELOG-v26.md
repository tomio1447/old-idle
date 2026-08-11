# 📦 Atualização Global-Idle — v26 (Knight BOX checa spot x/y + Modo SAFE + Modo de Hunt no topo)

**Zip:** `atualizacoes/atualizacao-global-idle.zip` (tag `atualizacao-v1`).
Link direto: `https://github.com/tomio1447/old-idle/raw/refs/tags/atualizacao-v1/atualizacoes/atualizacao-global-idle.zip`

---

## 🧭 1. Modo BOX do Knight — checagem de células x/y para o melhor spot

- O knight **não para mais cegamente no centro**: faz uma **checagem de
  células x/y** (grid 7×7 ao redor do centro) e escolhe o **MELHOR SPOT** —
  a célula livre com **mais mobs no alcance do exeta (7 SQM) e do melee**,
  com leve preferência por ficar central.
- Se os monstros estiverem clusterados fora do centro, o knight **desloca
  para o cluster** (sempre dentro de ~3 SQMs do meio) e segue parado
  tankando + castando exeta res/amp res.
- Reavaliado a cada ~1s (os mobs andam, o melhor spot muda).

## 🛟 2. Novo modo SAFE (cantos da tela)

- Novo modo de ataque **SAFE**: o personagem vai para um dos **CANTOS da
  tela**, **longe da box**, mas **ainda dentro do alcance das spells
  (raio 7)**.
- A IA escolhe o canto livre com **mais mobs no range** (empate → o mais
  longe da box, mais seguro). Funciona para o personagem ativo e para os
  aliados do party combat.

## 🎯 3. "Modo de Hunt" no alto dos ataques (acima das instâncias)

- O seletor de modo agora se chama **🎯 Modo de Hunt** e fica **no topo da
  aba Ataque** do Helper (antes das stances/buffs) — com os botões
  **Chase / Stand / Kiting / BOX / SAFE**.
- O **mesmo seletor aparece no topo do modal de instância** da hunt, **acima
  dos botões non-pvp/pvp**: escolher o modo ali aplica para a hunt inteira
  (e para a party — `c.huntMode` vale para todos os membros na mesma
  instância).

## 🧪 4. Testes

- **Novo `test_safe_v26.js`**: knight BOX acha o melhor spot (centro com
  mobs em volta / desloca p/ cluster), SAFE escolhe canto longe da box com
  mobs no range das spells, formationMode lê config ou c.huntMode, e o
  seletor Modo de Hunt no topo (aba + modal de instância).
- Regressão completa (box v24, magic shield v25, party, combat, exercise,
  dt-seal, v21/v22/v23, scan 15.x) — **tudo verde**.

## Como atualizar

1. Baixe o zip e extraia **sobre** a pasta do jogo (substituindo os arquivos).
2. **Ctrl+F5** após atualizar.
