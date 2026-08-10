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

## Dimensões das instâncias

As hunts OTBM não são mais limitadas ao grid legado de 21×13. A instância
adota automaticamente a largura e a altura reais do arquivo, e o editor web
divide mapas maiores que 256×256 em múltiplas `TILE_AREA` do formato OTBM.
O único teto do arquivo é o campo `u16` do padrão: 65.535×65.535 SQMs (na
prática, memória e desempenho do navegador serão o limite antes disso).

A câmera de combate fica travada no centro geométrico da instância e nunca
aplica zoom-out. O mundo inteiro é renderizado com SQMs na escala nativa; o
canvas funciona como uma janela fixa de 21×13 SQMs e recorta apenas o que
fica fora do FOV. Assim mapas grandes continuam legíveis e jogáveis.
