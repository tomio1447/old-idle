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

## Goshnar's Greed

`goshnarsgreed.otbm` vem do beta-map atualizado em `beta-maps/bossesroom/`,
seleciona integralmente o piso `z=7` de 20×14 (`1048,1011` até `1067,1024`)
e o centraliza num mundo 30×30. A FOV informada continua registrada como
`(1042,1009,7)..(1060,1024,7)`, sem recortar o mundo. O player nasce em
`(1052,1022,7)`, runtime `(9,19)`, e Goshnar em `(1052,1011,7)`, runtime
`(9,8)`. A recompensa da Mirrored Nightmare já registra o acesso, mas
requisito e cooldown estão temporariamente desligados para testes. Durante a
luta aparecem até seis adds sem defesa/imunidade; cada nascimento tem 30% de
chance de ser Greedbeast. A cada cinco Greedbeasts mortos, o boss perde a
imunidade durante 40 segundos.
