# Status — Tibia Coins (TibiaWiki/Tibia_Coins)

**Fonte:** https://tibia.fandom.com/wiki/Tibia_Coins

## O que foi implementado

### Saldo de Tibia Coins na CONTA (não por personagem)
- No client oficial: *"Once bought, they are available to all characters of
  the same account no matter the Game World"* — Tibia Coins pertencem à
  conta. Aqui o saldo fica num objeto de conta separado no localStorage
  (`tibia-idle-account-v1` = `{v:1, coins:N}`), **compartilhado por todos
  os personagens do save**: trocar de personagem não muda o saldo.

### GIF oficial na topbar com o número ao lado
- O **GIF oficial do Tibia Coin** (32×32, animado, baixado da TibiaWiki —
  `File:Tibia_Coins.gif`) aparece na topbar, ao lado do ouro, com o
  **total de Tibia Coins da conta** ao lado, em dourado (`#d4af37`).
- Tooltip: "Tibia Coins — saldo da conta (vale para todos os personagens)".
- Atualizado automaticamente pelo `renderAll` (chamada
  `renderCoinBalance()`).

### Painel Admin — aba 🪙 Coins
- Nova aba **🪙 Coins** no painel admin (logo após 👤 Personagem):
  - **Saldo atual** da conta com o GIF e o número;
  - **Adicionar**: input numérico (padrão 250) + botão "Adicionar";
  - **Botões rápidos**: +25, +250, +1.000, +2.500, +10.000 e "zerar";
  - Tudo registrado no log do admin (`+N Tibia Coins na conta (saldo: X)`)
    e salvo na conta (persiste após F5 e ao trocar de personagem).
- Lembrete da wiki no painel: 250 TC = 30 dias de Premium Time.

## Arquivos alterados

| Arquivo | Mudança |
| --- | --- |
| `assets/ui/coins/tibia-coins.gif` | **novo** — GIF oficial do Tibia Coin (32×32, da TibiaWiki) |
| `js/tibiacoin.js` | **novo** — conta (`accountLoad/Save/Coins/AddCoins/SetCoins`) + `renderCoinBalance` |
| `js/admin.js` | aba 🪙 Coins + `renderAdminCoins` (saldo, adicionar, rápidos, zerar) |
| `js/game.js` | `renderCoinBalance()` no `renderAll` |
| `index.html` | bloco `#tibia-coins` na topbar (gif + número) + script `tibiacoin.js` |
| `css/style.css` | `.coin-gif` (pixelated) e `.coin-txt` (dourado) |

## Validação (navegador real, headless Chromium)

1. Bloco `#tibia-coins` na topbar com GIF carregando ✓
2. Saldo inicial 0 ✓
3. Aba 🪙 Coins no admin mostra saldo ✓
4. Adicionar 250 → topbar + painel atualizam; localStorage `coins=250` ✓
5. Botões rápidos: +1000 → 1.250; zerar → 0 ✓
6. Adicionar 500 → F5 (Continuar) → saldo mantido ✓
7. **Conta compartilhada**: criar 2º personagem → saldo continua 500 ✓
8. Regressão combate real (22s): topbar coins visível em luta,
   `renderCoinBalance` ok, combate rodando, zero erros ✓
9. Zero erros de console em todos os fluxos ✓
