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

## Templo Oficial de Thais

`templo.otbm` vem de `game/beta-maps/templo.otbm`, no formato moderno do
Canary Map Editor. O mapa absoluto ocupa `(1009,1014,7)..(1038,1034,7)` e o
jogador nasce em `(1020,1021,7)`, célula local `(11,7)`. As posições antigas
de NPC `(1013,1018,7)` e `(1013,1020,7)` não geram entidades; o sidecar
`templo-npc.xml` permanece vazio e a interface do templo não publica atalhos
de NPC. O renderer mantém o FOV de 21×13 SQMs e desenha chão, jogador e
objetos bloqueantes na mesma ordem das hunts.

## Timira's Room

`timiraroom.otbm` é publicado integralmente com limites absolutos
`(174,157,2)..(194,175,2)`; as âncoras externas não são recortadas. A arena
lógica é `(175,159,2)..(193,175,2)`, Timira nasce em `(184,162,2)` e o player
em `(182,170,2)`. Após o padding mínimo do conversor, o runtime fica 24×19,
com player local `(9,13)` e boss local `(11,5)`.

## Cobra Bastion

`cobra_bastion.otbm` vem integralmente do commit `f366081`: fonte e runtime
medem 24×17, nos limites absolutos `(146,155,2)..(169,171,2)`. As zonas e o
spawn continuam exatamente nos valores já configurados: monstros em
`(154,160,2)` com área 10×12 e player em `(157,165,2)`. Grounds que possuem
patterns internos no DAT (como 1128 em 4×4 e 10113 em 2×2) são escolhidos
pela coordenada do SQM, evitando a repetição quadriculada da variante `(0,0)`.

## Marapur — Nagas

`nagas_marapur.otbm` seleciona o piso `z=7` completo, 23×21 nos limites
`(1008,1008,7)..(1030,1028,7)`. O retângulo `(1009,1012,7)..(1027,1026,7)`
é apenas a FOV inicial informada no RME: ele não recorta nem apaga o restante
do mapa. O mundo recebe padding para 30×30. O player nasce em
`(1017,1019,7)`, posição `(12,15)` no runtime.

## MOTA Extension

`MOTA.otbm` usa integralmente o piso `z=7`, 25×20 nos limites
`(1040,1006,7)..(1064,1025,7)`, dentro de um mundo runtime 30×30. A FOV
informada é `(1042,1009,7)..(1062,1024,7)` e o player nasce globalmente em
`(1051,1016,7)`, posição runtime `(13,15)`. A hunt usa Floating Savant,
Retching Horror, Fury, Hellhound e Demon.

## DT Seal

`dt_seal.otbm` usa integralmente o piso `z=7`, 25×21 nos limites
`(1006,1008,7)..(1030,1028,7)`, também em runtime 30×30. A FOV informada é
`(1009,1010,7)..(1027,1024,7)`; o player nasce em `(1018,1018,7)`, posição
runtime `(14,14)`. Em todos estes mapas, FOV descreve somente o que o jogador
vê inicialmente — nunca os limites do mundo renderizado.

## Mirrored Nightmare

`mirrored_nightmare_sw.otbm` seleciona integralmente o piso `z=7`, 19×15 nos
limites `(1014,1013,7)..(1032,1027,7)`, e o centraliza num mundo 30×30. O
valor `1332` informado inicialmente era um erro de digitação; o próprio OTBM
confirma `1032`. O player nasce em `(1018,1020,7)`, posição runtime `(9,14)`.
A FOV padrão 21×13 foi reduzida em 1×1 para 20×12; o mundo continua 30×30. Monstros só podem
nascer no retângulo `(1016,1019,7)..(1023,1026,7)` (8×8), que contém 52 SQMs
livres após a colisão. A hunt contém Many Faces, as cinco Apparitions e
Distorted Phantom. A missão exige 25 mortes de cada criatura e concede acesso
a Goshnar's Greed.

## Rotten Wasteland

`rotten_wasteland.otbm` publica integralmente o novo beta-map `Rotten
Wasteland.otbm`: piso `z=7` de 21×15, limites `(1040,1012,7)..(1060,1026,7)`,
centralizado num mundo runtime 30×30. O player nasce em `(1045,1022,7)` e os
respawns usam a região `(1047,1017,7)..(1058,1023,7)`. A hunt contém Rotten
Golem, Branchy Crawler e Mould Phantom. Eliminar 50 Rotten Golems libera
Goshnar's Hatred.

## Goshnar's Hatred

`goshnars_hatred_room.otbm` publica o mapa Canary
`beta-maps/bossesroom/goshnar_hatred_room.otbm` (piso `z=7`,
`(1042,1009)..(1063,1026)`, 22×18). `tools/build_soulwar_boss_rooms.js`
copia essa fonte para `maps/` e `beta-maps/bossesroom/goshnars_hatred_room.otbm`.
O mundo runtime continua 30×30; o player nasce em `(1052,1023,7)` (runtime
`(14,20)`, ao norte do portal sul) e o boss em `(1052,1017,7)` (runtime
`(14,14)`, centro da arena). Após 20–40s, Dread's Torment ativa: os
contadores sobem a cada 5s, elevando em 10% por ponto o dano de Hatred. A
sala mantém até cinco summons; Dreadful Harvester tem 15.000 HP e reduz os
contadores em 1 ao morrer, enquanto Hateful Soul tem 10% de chance de
nascer, 50.000 HP, dano escalado e zera todos os contadores.

## Goshnar's Greed

`goshnars_greed_room.otbm` é uma boss room dedicada de 20×14, gerada por
`tools/build_soulwar_boss_rooms.js`, sem reutilizar o terreno de Rotten
Wasteland. O mapa é centralizado num mundo runtime 30×30; o player nasce em
`(10,12)` (runtime `(15,20)`) e Goshnar em `(10,2)` (runtime `(15,10)`).
Quatro ilhas laterais separam os pontos dos adds do corredor do boss.
A recompensa da Mirrored Nightmare já registra o acesso, mas
requisito e cooldown estão temporariamente desligados para testes. Durante a
luta aparecem até seis adds sem defesa/imunidade; cada nascimento tem 30% de
chance de ser Greedbeast. A cada cinco Greedbeasts mortos, o boss perde a
imunidade durante 40 segundos.

## Goshnar's Spite

`goshnars_spite_room.otbm` publica o mapa Canary
`beta-maps/bossesroom/goshnar_spite_room.otbm` (piso `z=7`,
`(1040,1011)..(1063,1029)`, 24×19). `tools/build_soulwar_boss_rooms.js`
copia essa fonte para `maps/` e `beta-maps/bossesroom/goshnars_spite_room.otbm`.
O mundo runtime continua 30×30. Spawns do Map Editor: player
`(1046,1020,7)` (oeste) e boss `(1057,1020,7)` (leste) — runtime
`(9,14)` e `(20,14)` após pad 3×5. FOV de câmera `22×13` cobre a
largura útil da câmara (~22 SQM) e a distância player↔boss (11 SQM);
o mapa integral permanece 24×19.

Mecânicas Canary: Searing Fire a cada 14s (estampar em 5s ou +10
defesa), Weeping Soul com 10% de curar 10% do HP do boss, trash
aleatório (Dreadful Harvester / Spiteful Spitter / Weeping Soul) até
8 com respawn 15s. Extra idle: Bubble QTE a cada 40s — falha aplica
−25% de dano no boss até o próximo QTE resolver. Cooldown do boss
desligado para testes. Matar Spite concede mácula Soul War.

## Goshnar's Malice

`goshars_malice_room.otbm` (typo *goshars* no arquivo entregue) publica
o mapa Canary de `beta-maps/bossesroom/` (piso `z=7`,
`(1040,1009)..(1063,1030)`, 24×22). `tools/build_soulwar_boss_rooms.js`
copia essa fonte para `maps/` e `beta-maps/bossesroom/`. Mundo runtime
30×30. Spawns Map Editor: player `(1046,1020,7)` e boss
`(1057,1020,7)` — runtime `(9,15)` e `(20,15)` após pad 3×4. FOV de
câmera `22×15` segue o player na arena circular de mármore (~17–19 Ø
centrada ~1052,1020).

Canary usa white tiles a cada 40s; no idle o Maze QTE roda a cada 30s:
matriz 30×30, azul→vermelho em 5s, blocos caindo top→bottom. Falha =
6000 death em todos os players. Trash: Dreadful Harvester / Malicious
Soul até 8, respawn 20s. Cooldown desligado para testes. Kill concede
mácula Soul War.

## Goshnar's Megalomania

`goshnars_megalomania.otbm` publica o mapa Canary (piso `z=7`,
`(1039,1010)..(1062,1030)`, 24×21). `tools/build_soulwar_boss_rooms.js`
copia a fonte para `maps/` e `beta-maps/bossesroom/`. Mundo runtime
30×30. Spawns Map Editor: player `(1051,1022,7)` e boss
`(1051,1014,7)` — runtime `(15,16)` e `(15,8)` após pad 3×4. FOV de
câmera `22×15` na arena circular de areia.

Boss final Soul War: exige as **5 máculas ativas** (Malice, Spite,
Greed, Hatred e Cruelty). Começa Purple (imune); mate **4 Aspects of
Power** para abrir Green 70s (Blue burst 7s após 60s); depois volta a
Purple. White tiles / Maze QTE a cada 40s — falha = 6000 death.
Bag You Desire com **0.15%** (+50% vs mini-bosses em 0.1%). HP 620k /
EXP 3M (forma Green). Cooldown desligado para testes.
