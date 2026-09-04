/**
 * Дизайн-концепції залів «Сільпо».
 * MCP філії не віддає тему — її немає в silpo_list_branches.
 * Тому впізнаємо відомі дизайнерські магазини за містом і вулицею.
 */
const THEMES = [
  {
    id: 'stalker',
    title: 'S.T.A.L.K.E.R.',
    lead: 'Зона відчуження · бункер Сидоровича',
    keys: ['березнев'],
    floor: 0xc9c4b0,
    wall: 0x6b6a5e,
    sky: 0x3d4a32
  },
  {
    id: 'biker',
    title: 'Байкерський лофт',
    lead: 'Мотоцикли, шкіра і неон',
    keys: ['мироцьк'],
    floor: 0xd9d3cc,
    wall: 0x4a403c,
    sky: 0x1a1412
  },
  {
    id: 'olympic',
    title: 'Швидкість і Олімпіада',
    lead: 'Піт-стоп, світлофори, реквізит Ігор-2020',
    keys: ['перов'],
    floor: 0xe8edf5,
    wall: 0xffffff,
    sky: 0x0b3d91
  },
  {
    id: 'mavka',
    title: 'Мавка. Лісова пісня',
    lead: 'Blockbuster Mall · світ Лісової пісні',
    keys: ['київ', 'бандер'],
    floor: 0xe7f0d8,
    wall: 0xf7fbe9,
    sky: 0x1d3d28
  },
  {
    id: 'steampunk',
    title: 'Стімпанк',
    lead: 'Дирижабль над овочами',
    keys: ['вишгород', 'набережн'],
    floor: 0xe6d7c3,
    wall: 0xc4b49a,
    sky: 0x5c3d24
  },
  {
    id: 'manga',
    title: 'Мука-манга',
    lead: 'Японські комікси в Мукачеві',
    keys: ['мукачев'],
    floor: 0xfff4fb,
    wall: 0xffffff,
    sky: 0xf472b6
  },
  {
    id: 'cyberpunk',
    title: 'Китайський кіберпанк',
    lead: 'Troeschina 2049',
    keys: ['бальзак'],
    floor: 0xdbe4f0,
    wall: 0x1b2430,
    sky: 0x0b1020
  },
  {
    id: 'cropcircles',
    title: 'Кола на полях',
    lead: 'НЛО, фермери й прибулець на тракторі',
    keys: ['погреб'],
    floor: 0xe8f0d4,
    wall: 0xf4f7ea,
    sky: 0x7cb342
  },
  {
    id: 'maps',
    title: 'Географічні міфи',
    lead: 'Земля на китах і порожниста планета',
    keys: ['крюківщин'],
    floor: 0xe7efe8,
    wall: 0xf3f6f2,
    sky: 0x1b4f72
  },
  {
    id: 'mondrian',
    title: 'Неопластицизм',
    lead: 'Мондріан: червоний, синій, жовтий',
    keys: ['калуш'],
    floor: 0xffffff,
    wall: 0xffffff,
    sky: 0x2358d1
  },
  {
    id: 'cherry',
    title: 'Вишеньки',
    lead: 'Район Вишенька і бог Вішну з вишнями',
    keys: ['келецьк'],
    floor: 0xfde8ec,
    wall: 0xfff7f8,
    sky: 0x880e4f
  },
  {
    id: 'music',
    title: 'Забуті інструменти',
    lead: 'Трембіти, ліра, дримба',
    keys: ['дрогобич'],
    floor: 0xf3e6d0,
    wall: 0xfff8ee,
    sky: 0x6d4c41
  },
  {
    id: 'veles',
    title: 'Велес',
    lead: 'Дерево життя і тотеми достатку',
    keys: ['вовчинець'],
    floor: 0xe8dcc8,
    wall: 0xf6edd9,
    sky: 0x3e2723
  },
  {
    id: 'sinatra',
    title: 'Come Fly With Me',
    lead: 'Бориспіль · джет Френка Сінатри',
    keys: ['бориспіль'],
    floor: 0xe8eef6,
    wall: 0xffffff,
    sky: 0x1565c0
  },
  {
    id: 'default',
    title: 'Сільпо',
    lead: 'Дизайнерський зал мережі',
    keys: [],
    floor: 0xffffff,
    wall: 0xffffff,
    sky: 0xf2f4f9
  }
];

const DEFAULT_THEME = THEMES[THEMES.length - 1];

function haystack(store) {
  return `${store.city || ''} ${store.address || ''} ${store.title || ''}`
    .toLowerCase()
    .replace(/['’`]/g, '');
}

export function matchTheme(store = {}) {
  const text = haystack(store);
  const found = THEMES.find((theme) => theme.id !== 'default' && theme.keys.every((key) => text.includes(key)));
  const theme = found || DEFAULT_THEME;
  return {
    id: theme.id,
    title: theme.title,
    lead: theme.lead,
    floor: theme.floor,
    wall: theme.wall,
    sky: theme.sky,
    known: theme.id !== 'default'
  };
}

export { THEMES };
