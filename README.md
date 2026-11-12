# Campus 3D · UniEVANGÉLICA

Maquete interativa do setor leste da UniEVANGÉLICA em Anápolis (GO), com **12 destinos**. O recorte reúne os blocos A a I, com B1 e B2 separados, o Ginásio Poliesportivo e o Centro Tecnológico.

## Abrir

[Abrir o mapa online](https://mapa3d-unievangelica.vercel.app) e testar **Minha localização** no celular.

Para ver a maquete sem servidor, abra o arquivo `dist/Campus-3D-UniEVANGELICA.html` no Chrome ou Edge. Se você tem apenas o código-fonte, instale as dependências com Node.js 22.12 ou superior e gere o HTML:

```sh
npm install
npm run build:portable
```

Para desenvolvimento, use `npm run dev` e abra [http://localhost:4173](http://localhost:4173). O modo principal usa Three.js com WebGL 2. Quando o navegador estiver sem WebGL 2, o renderizador em Canvas usa os mesmos modelos 3D e controles de câmera. No modo servido, o MapLibre também pode exibir os volumes caso a maquete detalhada não inicie.

## Navegar

- Alterne entre **Maquete 3D** e **Satélite** no topo do mapa. Os dois modos compartilham os balões, a seleção e as informações de acesso. Em Satélite, arraste para mover o mapa e use a roda, a pinça ou os botões para mudar o zoom.
- A vista de satélite carrega imagens do [Esri World Imagery](https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer) pela internet, inclusive no HTML portátil. Quando a imagem estiver indisponível, a vista exibe os contornos locais. A maquete continua disponível offline.
- Clique em **Minha localização** e autorize o navegador para ver o ponto azul e a área de precisão. O botão também encerra o acompanhamento. **Centralizar** reenquadra o ponto. Fora da área mapeada, **Ver no satélite** mostra a posição no mapa 2D.
- A localização é comparada com os contornos dos blocos no navegador, sem salvar as coordenadas no projeto. O nome do bloco aparece como estimativa quando toda a área de precisão cabe em um único contorno. A identificação do pavimento fica fora do escopo. Para testar no celular, abra o site por HTTPS. Em desenvolvimento, use o localhost do próprio dispositivo.
- Arraste para girar, use a roda ou a pinça para aproximar e arraste com o botão direito ou dois dedos para mover a vista.
- A vista inicial enquadra os contornos dos prédios com a câmera mais baixa. No modo Canvas, a imagem ganha resolução assim que a câmera para de se mover.
- Busque pelo código do bloco ou por nome. A lista mantém todos os destinos acessíveis quando as fichas do mapa se sobrepõem.
- Selecione um destino para aproximar. Use o botão com o ícone de pessoa para baixar a câmera ao nível do campus. O painel **Dados e fontes** informa a precisão do contorno, da identificação e do acesso.

## Fontes e precisão

- **Geometria de base.** Os contornos, vias e áreas verdes foram extraídos do [OpenStreetMap](https://www.openstreetmap.org/#map=17/-16.2940/-48.9450), a partir da exportação de 11 de novembro de 2026, com recorte a leste da Avenida Universitária. O [ginásio](https://www.openstreetmap.org/way/288589263) é identificado no próprio OSM. A cobertura de duas águas do modelo segue a forma observada no guia aéreo institucional.
- **Identificação dos blocos.** O [mapa institucional de 2014](https://www4.unievangelica.edu.br/noticia/4461-confira-os-horarios-de-aula-e-localizacao-de-salas-para-o-inicio-do-semestre) e a [vista aérea do setor leste no Guia Acadêmico de 2017](https://www.unievangelica.edu.br/novo/img/pdf/Guia%20Acad%C3%AAmico.pdf#page=29) foram cruzados com o [PDI revisado em 2023](https://www4.unievangelica.edu.br/storage/9971/UniEVANGE%CC%81LICA---PDI-2019-2023-Rev-28.6.2023-compactado.pdf) e com as fontes individuais disponíveis em cada ficha.
- **Referência visual.** A [vista de satélite do Google Maps](https://www.google.com/maps/@-16.29422,-48.9451,17.7z/data=!3m1!1e3) foi consultada para conferir a disposição do conjunto, os telhados e a posição do ginásio. O [tour 360° institucional](https://www4.unievangelica.edu.br/pagina/tour-360) e a panorâmica de 2019 ficam como referências externas. O HTML contém geometria própria da maquete e dados OSM locais.
- **Associações aproximadas.** B1/B2 e H/I usam divisões ilustrativas de contornos compartilhados no OSM. A posição do Bloco G precisa de confirmação em campo. Um volume de apoio aparece sem ficha de destino.
- **Acessos e fachadas.** Alturas, materiais e detalhes das fachadas são estimativas para visualização. Os pontos de acesso de A, B1, C e do Ginásio são demonstrativos. Nos demais destinos, a marquise ilustrativa ajuda a posicionar a câmera e a ficha informa que a porta de acesso está pendente de confirmação.

## Dados locais

- `public/data/buildings.geojson` contém contornos e alturas em metros. `osmWayId` liga o contorno ao elemento de origem. `geometryStatus: "subdivision"` identifica subdivisões ilustrativas.
- `public/data/context.geojson` contém vias e áreas verdes recortadas do OSM, além de terreno e árvores ilustrativos.
- `public/data/destinations.json` reúne as fontes, as âncoras de rótulo e o status de cada acesso. As coordenadas usam a ordem `[longitude, latitude]`. `approachCoordinates` enquadra a câmera na fachada. `entry.coordinates` é reservado ao marcador de acesso exibido no mapa.

Os dados cartográficos e suas adaptações são disponibilizados sob a [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/). © [Contribuidores do OpenStreetMap](https://www.openstreetmap.org/copyright).
