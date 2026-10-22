// Pontos iniciais. Cada um é criado uma única vez (se for excluído, não volta);
// pontos novos adicionados aqui aparecem para quem já usa o site.
const C = 'https://commons.wikimedia.org/wiki/File:';
const W = 'https://en.wikipedia.org/wiki/';

// ids que já existiam antes do controle individual de pontos iniciais
export const LEGACY_SEED_IDS = ['seed-haleakala', 'seed-vouves', 'seed-socotra', 'seed-cedros'];

// revisão dos dados iniciais: ao aumentar, pontos que ninguém editou recebem
// os textos e fotos novos (os editados por Marco ou Estela ficam como estão)
export const SEED_REV = 2;

// crédito da foto: arquivo do Wikimedia Commons ou link completo (Flickr etc.)
const credit = (c) => (c.startsWith('http') ? c : C + c);

// atalho para os pontos de viagem (todos em nome do Marco)
// cover: [arquivo, link da fonte, texto do crédito?]
const trip = (seedId, place, trip, cover, challenge) => ({
  seedId,
  owner: 'Marco',
  place: { source: '', ...place },
  trip,
  cover: cover ? { type: 'image', url: `assets/seed/${cover[0]}.jpg`, credit: credit(cover[1]), ...(cover[2] ? { creditText: cover[2] } : {}) } : null,
  challenge: { source: 'catalogo', ...challenge, image: `assets/seed/${challenge.image}.jpg`, imageCredit: credit(challenge.imageCredit) },
});

export const SEED_POINTS = [
  {
    seedId: 'seed-haleakala',
    owner: 'Marco',
    place: {
      name: 'Cratera do Haleakalā', city: 'Maui', state: 'Havaí', country: 'Estados Unidos', countryCode: 'US',
      lat: 20.7101, lon: -156.2530,
      about: 'Vulcão de 3.055 m cuja cratera parece uma paisagem lunar. Lá em cima, frio, vento e sol forte só permitem plantas muito especializadas.',
      source: 'https://pt.wikipedia.org/wiki/Haleakal%C4%81',
    },
    cover: { type: 'image', url: 'assets/seed/haleakala-capa.jpg', credit: C + 'Haleakala_crater_(1).jpg' },
    challenge: {
      name: 'Espada-de-prata', sci: 'Argyroxiphium sandwicense subsp. macrocephalum', tag: 'Endêmica',
      description: 'Só existe na cratera do Haleakalā. As folhas prateadas refletem o sol de altitude. Vive até 90 anos, floresce uma única vez com uma haste de até 2 m e depois morre.',
      image: 'assets/seed/silversword.jpg', imageCredit: C + 'Haleakalasilversword.jpg',
      url: 'https://en.wikipedia.org/wiki/Argyroxiphium_sandwicense', source: 'catalogo',
    },
  },
  {
    seedId: 'seed-vouves',
    owner: 'Marco',
    place: {
      name: 'Oliveira de Vouves', city: 'Vouves', state: 'Creta', country: 'Grécia', countryCode: 'GR',
      lat: 35.4869, lon: 23.7868,
      about: 'Vilarejo no oeste de Creta, ilha com cerca de 200 plantas que só existem lá. Ao lado da árvore funciona um pequeno museu da oliveira.',
      source: 'https://en.wikipedia.org/wiki/Olive_tree_of_Vouves',
    },
    cover: { type: 'image', url: 'assets/seed/vouves-capa.jpg', credit: C + 'Olive_Tree_Museum_of_Vouves_2021-10-16.jpg' },
    challenge: {
      name: 'Oliveira de Vouves', sci: 'Olea europaea', tag: 'Árvore histórica',
      description: 'Uma das oliveiras mais antigas do mundo: pode ter mais de 3.000 anos e ainda dá azeitonas. Ramos dela foram usados nas coroas dos campeões da maratona olímpica de Atenas 2004.',
      image: 'assets/seed/vouves.jpg', imageCredit: C + 'Olive_tree_of_Vouves.jpg',
      url: 'https://en.wikipedia.org/wiki/Olive_tree_of_Vouves', source: 'catalogo',
    },
  },
  {
    seedId: 'seed-socotra',
    owner: 'Marco',
    place: {
      name: 'Planalto de Dixam', city: 'Socotra', state: 'Arquipélago de Socotra', country: 'Iêmen', countryCode: 'YE',
      lat: 12.48, lon: 54.01,
      about: 'A “ilha mais alienígena da Terra”: isolada há milhões de anos, cerca de um terço das suas plantas não existe em nenhum outro lugar. No planalto de Dixam ficam as maiores florestas de dragoeiros.',
      source: 'https://pt.wikipedia.org/wiki/Socotor%C3%A1',
    },
    cover: { type: 'image', url: 'assets/seed/socotra-capa.jpg', credit: C + 'Dixam_plateau_(6407168437).jpg' },
    challenge: {
      name: 'Árvore-sangue-de-dragão', sci: 'Dracaena cinnabari', tag: 'Endêmica',
      description: 'Só existe em Socotra. A copa em forma de guarda-chuva captura a neblina e faz sombra para as próprias raízes. A resina vermelha é usada há milênios como corante.',
      image: 'assets/seed/cinnabari.jpg', imageCredit: C + 'Dragonblood_tree_in_Socotra_2.jpg',
      url: 'https://en.wikipedia.org/wiki/Dracaena_cinnabari', source: 'catalogo',
    },
  },
  {
    seedId: 'seed-cedros',
    owner: 'Marco',
    place: {
      name: 'Cedros de Deus', city: 'Bsharri', state: 'Norte do Líbano', country: 'Líbano', countryCode: 'LB',
      lat: 34.2436, lon: 36.0486,
      about: 'Bosque sagrado no Vale de Qadisha, um dos últimos restos das florestas de cedro que cobriam o Monte Líbano. Patrimônio Mundial da UNESCO.',
      source: 'https://en.wikipedia.org/wiki/Cedars_of_God',
    },
    cover: { type: 'image', url: 'assets/seed/cedars.jpg', credit: C + 'Forest_of_The_cedars_of_God.jpg' },
    challenge: {
      name: 'Cedro-do-líbano', sci: 'Cedrus libani', tag: 'Árvore histórica',
      description: 'Algumas árvores do bosque têm mais de mil anos. O cedro está na bandeira do Líbano e é citado dezenas de vezes na Bíblia.',
      image: 'assets/seed/cedrus-libani.jpg', imageCredit: C + 'C%C3%A8dre_du_Liban_Barouk_2005.jpg',
      url: 'https://en.wikipedia.org/wiki/Cedrus_libani', source: 'catalogo',
    },
  },

  // ---------- Alemanha ----------
  trip('seed-nurburgring',
    { name: 'Nürburgring Nordschleife', city: 'Nürburg', state: 'Renânia-Palatinado', country: 'Alemanha', countryCode: 'DE', lat: 50.3526, lon: 6.9830,
      about: 'O lendário traçado norte do Nürburgring, nas montanhas Eifel: cerca de 20,8 km de curvas no meio da floresta, que Jackie Stewart apelidou de “Inferno Verde”. Nos dias de Touristenfahrten, qualquer pessoa pode rodar na pista com o próprio carro.' },
    'Dar uma volta na Nordschleife nos dias abertos ao público (ou de carona num “ring taxi”), assistir aos carros na curva Brünnchen e conhecer o vilarejo e o castelo de Nürburg.',
    ['nurburgring-capa', 'Steilstreckenkurve_auf_der_N%C3%BCrburgring_Nordschleife.jpg'],
    { name: 'Giesta', sci: 'Cytisus scoparius', tag: 'Típica da região',
      description: 'Arbusto de flores amarelo-vivo que cobre as encostas da Eifel no fim da primavera (a “Ginsterblüte”). Procure ao longo da pista e das estradas ao redor; fica mais bonita entre maio e junho.',
      image: 'giesta', imageCredit: 'Cytisus_scoparius_by_Danny_S._-_001.JPG', url: W + 'Cytisus_scoparius' }),

  // ---------- Egito ----------
  trip('seed-cairo-copta',
    { name: 'Cairo Copta', city: 'Cairo', state: 'Cairo', country: 'Egito', countryCode: 'EG', lat: 30.0053, lon: 31.2300,
      about: 'O bairro cristão mais antigo do Cairo, dentro das muralhas da fortaleza romana da Babilônia. Sob a igreja de Abu Serga fica a famosa gruta onde, segundo a tradição, a Sagrada Família se abrigou na fuga para o Egito. Ali perto estão a Igreja Suspensa, a Sinagoga Ben Ezra e o Museu Copta.' },
    'Descer à gruta da Sagrada Família, sob a igreja de Abu Serga, caminhar pelas vielas do Cairo Copta e visitar a Igreja Suspensa, a Sinagoga Ben Ezra e o Museu Copta.',
    ['copta-capa', 'https://www.flickr.com/photos/43714545@N06/52087179201', 'Prof. Mortel (CC BY 2.0)'],
    { name: 'Papiro', sci: 'Cyperus papyrus', tag: 'Símbolo do Egito',
      description: 'A planta que deu origem ao “papel” dos antigos egípcios e que cresce às margens do Nilo. Há registros dela perto do bairro: procure nos jardins e à beira do rio.',
      image: 'papiro', imageCredit: 'Papyrus_%28Cyperus_papyrus%29_%287079191471%29.jpg', url: W + 'Cyperus_papyrus' }),

  trip('seed-hurghada',
    { name: 'Hurghada', city: 'Hurghada', state: 'Mar Vermelho', country: 'Egito', countryCode: 'EG', lat: 27.2226, lon: 33.8307,
      about: 'Cidade litorânea no Mar Vermelho, famosa pelos recifes de coral de águas claras e pelas ilhas Giftun, ótimas para mergulho e snorkel.' },
    'Passeio de barco até as ilhas Giftun, com snorkel nos recifes de coral, e fim de tarde na praia.',
    ['hurghada-capa', 'https://www.flickr.com/photos/25554263@N04/8645636940', 'Peer.Gynt (CC BY-SA 2.0)'],
    { name: 'Peixe-palhaço-do-mar-vermelho', sci: 'Amphiprion bicinctus', tag: 'Endêmico da região',
      description: 'Peixe-palhaço de duas faixas brancas que vive entre os tentáculos das anêmonas. É encontrado quase só no Mar Vermelho (e no arquipélago de Chagos). Fotografe durante o snorkel, perto de uma anêmona.',
      image: 'palhaco', imageCredit: 'Pez_payaso_%28Amphiprion_bicinctus%29_en_una_an%C3%A9mona_magn%C3%ADfica_%28Heteractis_magnifica%29%2C_mar_Rojo%2C_Egipto%2C_2023-04-18%2C_DD_93.jpg', url: W + 'Amphiprion_bicinctus' }),

  trip('seed-luxor',
    { name: 'Templo de Luxor', city: 'Luxor', state: 'Luxor', country: 'Egito', countryCode: 'EG', lat: 25.6995, lon: 32.6391,
      about: 'A antiga Tebas, capital do Egito no Império Novo. Na margem leste do Nilo ficam os templos de Luxor e Karnak; na oeste, o Vale dos Reis, com as tumbas dos faraós.' },
    'Voo de balão ao nascer do sol sobre a margem oeste e o templo de Hatshepsut, Vale dos Reis, templo de Karnak e o templo de Luxor iluminado à noite.',
    ['luxor-capa', 'https://commons.wikimedia.org/w/index.php?curid=85624869', 'Garyow77 (CC BY-SA 4.0)'],
    { name: 'Palmeira-dum', sci: 'Hyphaene thebaica', tag: 'Típica da região',
      description: 'Palmeira de tronco que se divide em “Y”, coisa rara entre as palmeiras. O nome científico homenageia Tebas, a antiga Luxor, e seus frutos foram encontrados em tumbas de faraós.',
      image: 'palmeira-dum', imageCredit: 'Hyphaene_thebaica.JPG', url: W + 'Hyphaene_thebaica' }),

  trip('seed-abu-simbel',
    { name: 'Templos de Abu Simbel', city: 'Abu Simbel', state: 'Assuã', country: 'Egito', countryCode: 'EG', lat: 22.3371, lon: 31.6258,
      about: 'Dois templos escavados na rocha por Ramsés II há mais de 3.200 anos. Nos anos 1960 foram cortados em blocos e remontados 65 m acima, para escapar das águas do Lago Nasser. Em 22 de fevereiro e 22 de outubro o sol nascente ilumina o fundo do santuário.' },
    'Chegar cedo, antes do calor, para ver as quatro estátuas colossais de Ramsés II e o templo de Nefertari. Se der, ir num dos dias do Festival do Sol.',
    ['abu-simbel-capa', 'Ramsis%2C_Aswan_Governorate%2C_Egypt_-_panoramio.jpg'],
    { name: 'Escinco-arco-íris', sci: 'Trachylepis quinquetaeniata', tag: 'Típico da região',
      description: 'Lagarto de cauda azul brilhante que toma sol nas rochas do vale do Nilo e da Núbia. Fique de olho nas pedras ao redor dos templos.',
      image: 'escinco', imageCredit: 'Trachylepis_quinquetaeniata.jpg', url: W + 'Trachylepis_quinquetaeniata' }),

  trip('seed-marsa-alam',
    { name: 'Marsa Alam', city: 'Marsa Alam', state: 'Mar Vermelho', country: 'Egito', countryCode: 'EG', lat: 25.0700, lon: 34.8938,
      about: 'Litoral sul do Mar Vermelho, mais tranquilo que Hurghada, com recifes preservados e baías de pradarias marinhas onde tartarugas e, com sorte, dugongos vêm se alimentar.' },
    'Snorkel na baía de Abu Dabbab procurando tartarugas e dugongos, e um dia de praia nos recifes.',
    ['marsa-alam-capa', 'https://www.flickr.com/photos/95142644@N00/54241146', 'Ruth and Dave (CC BY 2.0)'],
    { name: 'Tartaruga-verde', sci: 'Chelonia mydas', tag: 'Vida marinha',
      description: 'Tartaruga marinha que pasta as gramíneas do fundo das baías. Em Abu Dabbab é comum vê-las de perto: fotografe sem tocar e mantendo distância.',
      image: 'tartaruga', imageCredit: 'Green_sea_turtle_%28Chelonia_mydas%29_Moorea.jpg', url: W + 'Green_sea_turtle' }),

  trip('seed-giza',
    { name: 'Pirâmides de Gizé', city: 'Gizé', state: 'Gizé', country: 'Egito', countryCode: 'EG', lat: 29.9792, lon: 31.1342,
      about: 'A Grande Pirâmide de Quéops, de cerca de 2560 a.C., é a única das Sete Maravilhas do Mundo Antigo ainda de pé. Ao lado estão as pirâmides de Quéfren e Miquerinos e a Grande Esfinge.' },
    'Visitar as três pirâmides e a Esfinge, fazer um passeio de camelo com vista do conjunto e ver o pôr do sol no mirante panorâmico.',
    ['giza-capa', 'Pyramids_of_the_Giza_Necropolis.jpg'],
    { name: 'Poupa', sci: 'Upupa epops', tag: 'Ave dos hieróglifos',
      description: 'Ave de crista em leque, comum nos gramados e jardins perto das pirâmides. Aparece em pinturas e hieróglifos do Antigo Egito.',
      image: 'poupa', imageCredit: 'Israel._Eurasian_Hoopoe_%286497645007%29.jpg', url: W + 'Eurasian_hoopoe' }),

  // ---------- Chile ----------
  trip('seed-valle-nevado',
    { name: 'Valle Nevado', city: 'Lo Barnechea', state: 'Região Metropolitana de Santiago', country: 'Chile', countryCode: 'CL', lat: -33.3530, lon: -70.2487,
      about: 'Estação de esqui a cerca de 60 km de Santiago, com pistas até uns 3.600 m de altitude. Faz parte dos “Três Vales” dos Andes, com La Parva e El Colorado.' },
    'Dia de esqui ou snowboard (ou aula para iniciantes) e almoço com vista para os Andes nevados.',
    ['valle-nevado-capa', 'https://www.flickr.com/photos/80487073@N00/14444524797', 'alobos life (CC BY-NC-ND 2.0)'],
    { name: 'Condor-dos-andes', sci: 'Vultur gryphus', tag: 'Símbolo do Chile',
      description: 'Uma das maiores aves voadoras do mundo, com até 3 m de envergadura, e símbolo nacional do Chile. É vista com frequência planando sobre as encostas de Valle Nevado.',
      image: 'condor', imageCredit: 'AndeanCondorMale.jpg', url: W + 'Andean_condor' }),

  trip('seed-el-colorado',
    { name: 'El Colorado', city: 'Lo Barnechea', state: 'Região Metropolitana de Santiago', country: 'Chile', countryCode: 'CL', lat: -33.3480, lon: -70.2960,
      about: 'Estação de esqui colada ao vilarejo de Farellones, uma das mais próximas de Santiago, com pistas variadas e vista para a cidade lá embaixo.' },
    'Esquiar em El Colorado, subir de teleférico até o topo e tomar um chocolate quente em Farellones.',
    ['el-colorado-capa', 'El_Colorado_%2810005200815%29.jpg'],
    { name: 'Raposa-culpeu', sci: 'Lycalopex culpaeus', tag: 'Fauna dos Andes',
      description: 'A raposa-dos-andes, de pelagem avermelhada, circula perto das estações mesmo no inverno. Costuma aparecer no fim do dia, nas bordas das pistas e das estradas.',
      image: 'culpeo', imageCredit: 'Culpeo.jpg', url: W + 'Culpeo' }),

  trip('seed-la-parva',
    { name: 'La Parva', city: 'Lo Barnechea', state: 'Região Metropolitana de Santiago', country: 'Chile', countryCode: 'CL', lat: -33.3356, lon: -70.2900,
      about: 'Estação de esqui tradicional, com chalés na encosta e pistas voltadas para o vale de Santiago.' },
    'Esquiar em La Parva e ver o pôr do sol sobre Santiago lá do alto.',
    ['la-parva-capa', 'La_Parva.jpg'],
    { name: 'Frangel', sci: 'Kageneckia angustifolia', tag: 'Endêmica do Chile',
      description: 'Árvore endêmica do Chile que marca o limite superior das árvores nos Andes centrais. Fica verde o ano todo, então dá para encontrá-la mesmo no inverno, na subida da estrada para as estações.',
      image: 'frangel', imageCredit: 'Kageneckia_angustifolia_Chile_21_Nov_2010.JPG', url: W + 'Kageneckia_angustifolia' }),

  trip('seed-valle-colina',
    { name: 'Termas Valle de Colina', city: 'San José de Maipo', state: 'Região Metropolitana de Santiago', country: 'Chile', countryCode: 'CL', lat: -33.8513, lon: -69.9843,
      about: 'Piscinas naturais de águas termais em terraços na encosta, no alto do Cajón del Maipo, aquecidas pela atividade do vulcão San José. O trecho final da estrada é de cascalho e pode fechar depois de nevascas.' },
    'Chegar no inverno, com neve ao redor, e ficar nas piscinas naturalmente quentes com vista para as montanhas. Antes de ir, confirmar se as termas e a estrada estão abertas.',
    ['valle-colina-capa', 'https://www.flickr.com/photos/17594319@N00/4045367364', 'leo.prie.to (CC BY-NC-ND 2.0)'],
    { name: 'Canário-montês-de-cabeça-cinzenta', sci: 'Phrygilus gayi', tag: 'Fauna dos Andes',
      description: 'Pássaro amarelo de capuz cinza-azulado, a espécie mais registrada na região das termas. Fica nas pedras e arbustos ao redor das piscinas.',
      image: 'phrygilus', imageCredit: 'Gray-hooded_Sierra-Finch_%28Phrygilus_gayi%29_%2815961513085%29.jpg', url: W + 'Grey-hooded_sierra_finch' }),

  trip('seed-atacama',
    { name: 'San Pedro de Atacama', city: 'San Pedro de Atacama', state: 'Região de Antofagasta', country: 'Chile', countryCode: 'CL', lat: -22.9108, lon: -68.2001,
      about: 'Vilarejo-oásis no Deserto do Atacama, um dos lugares mais secos do planeta. O ar seco, a altitude e a falta de poluição luminosa deixam o céu noturno entre os mais limpos do mundo, por isso a região concentra observatórios como o ALMA.' },
    'Tour astronômico à noite com telescópios, além do Vale da Lua, das lagunas altiplânicas e dos gêiseres de El Tatio ao amanhecer.',
    ['atacama-capa', 'https://www.flickr.com/photos/119551085@N06/15418169222', 'benjohnlamb (CC BY-NC-SA 2.0)'],
    { name: 'Nuvens de Magalhães', sci: 'Grande e Pequena Nuvem de Magalhães', tag: 'Céu do hemisfério sul',
      description: 'Duas galáxias-satélite da Via Láctea, visíveis a olho nu só no hemisfério sul, como manchas de nuvem no céu. No tour astronômico, peçam ao guia para apontá-las e fotografem com tripé e exposição longa.',
      image: 'magalhaes', imageCredit: 'Eso1021d.jpg', url: W + 'Magellanic_Clouds' }),

  trip('seed-marmol',
    { name: 'Capelas de Mármore', city: 'Puerto Río Tranquilo', state: 'Região de Aysén', country: 'Chile', countryCode: 'CL', lat: -46.6586, lon: -72.6275,
      about: 'Cavernas e colunas de mármore esculpidas pelas águas do Lago General Carrera ao longo de milhares de anos. O reflexo da água turquesa pinta as paredes de tons de azul que mudam com a estação e o nível do lago.' },
    'Passeio de barco ou caiaque saindo de Puerto Río Tranquilo para entrar nas cavernas e capelas de mármore.',
    ['marmol-capa', 'https://www.flickr.com/photos/78837739@N07/8413127928', 'Javier Vieras (CC BY 2.0)'],
    { name: 'Chilco (fúcsia-de-magalhães)', sci: 'Fuchsia magellanica', tag: 'Nativa da Patagônia',
      description: 'Arbusto de flores vermelhas e roxas em forma de brinco, típico das margens úmidas da Patagônia. Procure nas margens do lago e em Puerto Río Tranquilo; floresce no verão.',
      image: 'fuchsia', imageCredit: 'Fuchsia_magellanica.jpg', url: W + 'Fuchsia_magellanica' }),

  trip('seed-pascoa',
    { name: 'Ilha de Páscoa (Rapa Nui)', city: 'Hanga Roa', state: 'Região de Valparaíso', country: 'Chile', countryCode: 'CL', lat: -27.1481, lon: -109.4273,
      about: 'A ilha dos moais, a terra habitada mais isolada do planeta. Quase toda a floresta original desapareceu antes da chegada dos europeus.' },
    'Ver o nascer do sol nos 15 moais de Ahu Tongariki, visitar a pedreira de Rano Raraku, onde os moais eram esculpidos, e a praia de Anakena.',
    ['pascoa-capa', 'https://www.flickr.com/photos/37035967@N07/5804374210', 'Ndecam (CC BY 2.0)'],
    { name: 'Toromiro', sci: 'Sophora toromiro', tag: 'Endêmica',
      description: 'Árvore que só existia em Rapa Nui e foi extinta na natureza em 1960. Sobreviveu graças a sementes levadas por Thor Heyerdahl e hoje está sendo reintroduzida: procurem os exemplares replantados na ilha.',
      image: 'toromiro', imageCredit: 'Toromiroadultog2.jpg', url: W + 'Sophora_toromiro' }),

  // ---------- Brasil: Chapada dos Veadeiros ----------
  trip('seed-chapada-parque',
    { name: 'Parque Nacional da Chapada dos Veadeiros', city: 'São Jorge', state: 'Goiás', country: 'Brasil', countryCode: 'BR', lat: -14.1778, lon: -47.8151,
      about: 'Patrimônio Natural da Humanidade pela UNESCO, no cerrado de altitude do Planalto Central. A entrada mais usada fica na vila de São Jorge, de onde saem as trilhas dos Saltos do Rio Preto (quedas de 80 e 120 m), dos Cânions e das Corredeiras.' },
    'Trilha dos Saltos do Rio Preto e dos Cânions, com banho de rio e piquenique no caminho.',
    ['chapada-capa', 'https://commons.wikimedia.org/w/index.php?curid=58796359', 'Aline Fortuna (CC BY-SA 4.0)'],
    { name: 'Canela-de-ema', sci: 'Vellozia squamata', tag: 'Símbolo do cerrado',
      description: 'Planta de tronco fibroso e retorcido, típica dos campos rupestres. Resiste ao fogo e, depois das queimadas, se cobre de flores lilases ou brancas. Há muitas ao longo das trilhas do parque.',
      image: 'canela-de-ema', imageCredit: 'https://www.inaturalist.org/photos/258446442', url: 'https://www.inaturalist.org/taxa/748681' }),

  trip('seed-chapada-dragao',
    { name: 'Cachoeira do Dragão (rapel)', city: 'Alto Paraíso de Goiás', state: 'Goiás', country: 'Brasil', countryCode: 'BR', lat: -14.1737, lon: -47.3335,
      about: 'Cachoeira na região do Rio Macaquinhos, a leste de Alto Paraíso, alcançada a partir do “Encontro das Águas”, o último poço aberto à visitação do complexo. Fica em área particular: o acesso e o rapel são feitos com operadoras e guias locais. A posição no mapa é aproximada.' },
    'Descer a Cachoeira do Dragão de rapel, com guia, e depois relaxar nos poços do Macaquinhos.',
    null, // sem foto com licença livre: o cartão mostra a do desafio até vocês colocarem uma
    { name: 'Algodão-do-cerrado', sci: 'Cochlospermum regium', tag: 'Flor do cerrado',
      description: 'Arbusto de flores amarelo-ouro grandes, que aparecem na seca, quando a planta está quase sem folhas. Os frutos se abrem soltando uma paina branca, como algodão. Há registros na região do Macaquinhos.',
      image: 'algodao-cerrado', imageCredit: 'https://www.inaturalist.org/photos/22148074', url: 'https://www.inaturalist.org/taxa/430862' }),

  trip('seed-chapada-caracol',
    { name: 'Cachoeira do Caracol', city: 'Alto Paraíso de Goiás', state: 'Goiás', country: 'Brasil', countryCode: 'BR', lat: -14.0516, lon: -47.3918,
      about: 'Parte do Complexo de Cachoeiras Rio Caldeira: a água escavou a rocha em espiral, formando um poço em forma de caracol. Fica a 19 km de Alto Paraíso pela GO-239 (sentido Sertão) e mais 25 km de estrada de terra; a visita exige guia credenciado e taxa. A posição no mapa é aproximada.' },
    'Trilha de cerca de 1,8 km, com um trecho de escada de ferro na rocha, até o poço em espiral, e banho na cachoeira.',
    null, // idem
    { name: 'Chuveirinho (sempre-viva)', sci: 'Paepalanthus', tag: 'Sempre-viva da Chapada',
      description: 'Sempre-vivas de hastes finas com flores em bolinhas brancas, como um chuveirinho. Formam campos nas áreas de rocha e são um símbolo da Chapada; há registros perto da cachoeira.',
      image: 'chuveirinho', imageCredit: 'https://www.inaturalist.org/photos/221937004', url: 'https://www.inaturalist.org/taxa/82151' }),

  trip('seed-chapada-vale-lua',
    { name: 'Vale da Lua', city: 'São Jorge', state: 'Goiás', country: 'Brasil', countryCode: 'BR', lat: -14.1867, lon: -47.7894,
      about: 'Rochas cinzentas esculpidas pelo Rio São Miguel em crateras, buracos e canais que lembram a superfície da Lua. Fica a poucos quilômetros de São Jorge, numa área particular com taxa de visitação.' },
    'Caminhar pelas formações de rocha, se refrescar nos poços do Rio São Miguel e fotografar o cenário “lunar”.',
    ['vale-da-lua-capa', 'https://www.flickr.com/photos/99111367@N02/9347723428', 'Explora 4x4 (CC BY-NC-SA 2.0)'],
    { name: 'Bromélia-da-lua', sci: 'Dyckia lunaris', tag: 'Bromélia das rochas',
      description: 'Bromélia de folhas duras e espinhosas que cresce agarrada às pedras, com flores alaranjadas em hastes compridas. É a planta mais registrada no Vale da Lua, e o nome científico, “lunaris”, combina com o lugar.',
      image: 'dyckia', imageCredit: 'https://www.inaturalist.org/photos/206658303', url: 'https://www.inaturalist.org/taxa/844210' }),

  trip('seed-chapada-astro',
    { name: 'Jardim de Maytrea (rolê astronômico)', city: 'Alto Paraíso de Goiás', state: 'Goiás', country: 'Brasil', countryCode: 'BR', lat: -14.1320, lon: -47.6831,
      about: 'Campo de veredas e buritis à beira da GO-239, entre Alto Paraíso e São Jorge, famoso pelo pôr do sol. O céu da Chapada é dos mais escuros do Brasil (níveis 1 a 3 da escala de Bortle), ótimo para ver a Via Láctea. Confirmem com um guia se o acesso à noite é permitido.' },
    'Ver o pôr do sol entre os buritis e ficar para a noite: deitar no chão, ver a Via Láctea e procurar estrelas cadentes. A melhor época é a seca, de maio a setembro.',
    ['maytrea-capa', 'https://www.flickr.com/photos/21916270@N02/7553083868', 'Everaldo Vilela (CC BY-NC-SA 2.0)'],
    { name: 'Cruzeiro do Sul', sci: 'Constelação Crux', tag: 'Céu do hemisfério sul',
      description: 'A constelação mais famosa do céu do sul, que está na bandeira do Brasil. Procurem quatro estrelas brilhantes em forma de cruz (e a “Intrometida”, uma quinta estrela menor). Dá para fotografar com o celular no modo noite, apoiado no chão.',
      image: 'cruzeiro', imageCredit: 'https://www.flickr.com/photos/29225114@N08/14016692823', url: 'https://pt.wikipedia.org/wiki/Cruzeiro_do_Sul_(constela%C3%A7%C3%A3o)' }),
];

// Carta que aparece em qualquer aparelho enquanto nenhuma outra for salva pelo site.
export const DEFAULT_LETTER = {
  from: 'Marco',
  to: 'Estela',
  updatedAt: 1792713600000,
  text: `Primeiramente, meu amor, eu quero te desejar um feliz aniversário. Você não faz ideia de como você é especial pra mim, não sabe 1% do quanto você me ajudou. Eu nunca vou conseguir pôr em atos ou palavras o quanto sou grato, e isso me chateia: você merece saber o quanto é foda.

Não me importa quais são as dificuldades ou quem estará contra, eu sei que posso enfrentar um mundo tendo você ao meu lado. Você é tudo que eu mais preciso e tenho de valioso, e a maior prova disso é isso aqui.

Nada tem sentido sem você. Nenhum desses lugares vale a pena se não estiver com você. Eu quero visitar cada um desses lugares com você, porque só assim as coisas têm sentido.

Eu espero que você curta muito o seu dia, porque é só o começo.`,
};
