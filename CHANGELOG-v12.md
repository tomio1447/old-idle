# 📦 Atualização Global-Idle — v12 (Party Multiplayer)

**Zip para download:** o arquivo `atualizacao-global-idle.zip` está commitado no repositório em `atualizacoes/` — baixe pelo GitHub:

👉 **https://github.com/tomio1447/old-idle/raw/refs/tags/atualizacao-v1/atualizacoes/atualizacao-global-idle.zip**
(ou abra o repositório → pasta `atualizacoes/` → baixar o zip; a página da release `atualizacao-v1` também tem o link)

> ⚠️ O zip tem ~35 MB e a visualização de arquivos grandes aqui no painel pode falhar — por isso este resumo em texto. O zip em si está íntegro (verificado por CRC, 5.466 arquivos).

---

## ✅ O que tem nesta versão

### 👥 Party Multiplayer (novo)
- Criar party com o botão **PARTY** (topbar) → seu personagem vira o **líder**.
- Convidar jogadores **por nome de personagem** (de qualquer conta).
- **Regra de zona:** o líder só convida na **Cidade (safe zone)** ou **Área de Treino** — validado no servidor.
- **Inbox de convites:** o convite fica **pendente**; o jogador pode trocar de personagem da conta, abrir o menu de Party e **Aceitar/Recusar** — inclusive depois de reiniciar o servidor.
- Badge **✉N** na topbar quando há convites.
- Líder remove membros; membro sai; líder sair = party dissolvida.

### 🧭 Follow (membros seguem o líder)
- Líder muda de mapa → membros vão junto.
- Líder entra em **hunt** ou **sala de boss** → membros teleportados para a **MESMA instância** (non-pvp/pvp, mesmo mapa).
- Funciona com o membro offline: o follow chega quando ele logar.

### 🔒 Anti-exploit
- Teleporte só com **nonce de uso único por membro** (sem replay, sem forçar).
- Validação de conta em toda ação; máquina de estados de zona (saltos impossíveis rejeitados).
- Máx. 5 pessoas, 1 party por personagem, 1 convite pendente por convidado.

### 🗄️ Banco (MySQL)
- Tabelas novas: `parties`, `party_members`, `party_invites` (o servidor cria sozinho no primeiro uso; `database.sql` atualizado).
- Sem MySQL: storage JSON local persiste convites em `data/parties.json`.

---

## 🖥️ Testar ao vivo (previews do painel)
1. Abra o preview **"Jogo Global-Idle"**.
2. No console do navegador (F12):
   ```js
   localStorage.setItem("tibia-idle-api", "<URL do preview 'API server (Global-Idle)'>"); location.reload();
   ```
3. Login **admin 1/1** (conta admin já criada) — ou crie outra conta em outra aba.
4. Teste: criar party → convidar por nome (só na cidade/treino) → trocar de personagem e aceitar na inbox → líder entrar numa hunt e ver o membro teleportar junto.

---

## 🧪 Testes automatizados
- `tools/test_party_api.js` — 16 cenários (zona, inbox, follow, replay, contas) ✔
- `tools/test_party_client.js` — zona, gating da UI, nonce único ✔
- Regressão: market, contas, exercise weapons, spawn, UI ✔
- 90 scripts do jogo carregam sem erro na ordem do `index.html` ✔

---

## 📌 Versões anteriores nesta tag
- **v11:** Exercise weapons animadas no dummy (useitemid onitemid) + texto sem franjas coloridas.
- **v10:** Market P2P fiel ao guia oficial (fee 2%, 30 dias, depot, buy offers, match automático, anônimo, alerta 25%).
- **v1–v9:** DB MySQL de contas, admin 1/1, correções de engine/visual, 5.091 animações de tiles.
