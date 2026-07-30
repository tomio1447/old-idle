# game/maps — arenas .otbm das hunts

Mapas criados no editor **OTI RME** (botão `🗺 OPEN RME` no painel admin,
ou abrindo `rme/index.html` direto). Fluxo:

1. Desenhe a arena no editor (pincel/retângulo, camadas Chão+Itens, zonas
   **S** = spawn do jogador e **G** = zona dos monstros, colisão vem das
   flags do .dat 8.60 automaticamente).
2. `Baixar .otbm` e copie o arquivo para esta pasta
   (ex.: `amazoncamp_venore.otbm`).
3. Extraia as sprites que faltam no jogo:
   ```
   TIBIA860=/home/user/work/15x860_repo/extracted \
     python3 tools/import_otbm_sprites.py game/maps/amazoncamp_venore.otbm
   ```
   (o editor avisa sozinho quais ids faltam na hora de salvar).
4. Aponte a hunt para o nome do arquivo em `js/huntmapdata.js`:
   ```js
   GAMEDATA.hunts["amazon-camp"].otbm = "amazoncamp_venore";
   ```
   Ao entrar na hunt o jogo baixa e instancia a arena (paredes colidem,
   spawn sai do marcador S, monstros nascem na zona G). Se o arquivo
   faltar, a hunt abre com o cenário padrão sem quebrar.

O arquivo `.otbm` gravado é o formato real do Remere's Map Editor (v2): ele
abre no RME, CipSoft-style tools e nosso próprio `js/otbm.js`. As zonas
S/G viajam numa linha `OTIDLE:{...}` da descrição do mapa — se re-salvar o
mapa PELO RME oficial, a linha pode ser perdida (limitação documentada,
refaça as zonas no editor web nesse caso).
