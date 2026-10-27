// Card definitions. kind: help (own team), prank (own driver), attack (rivals)
export const CARDS = {
  nitro:   { id:"nitro",   name:"НИТРО",          icon:"🔥", color:"#3fae4a", cost:30, kind:"help",
             desc:"+40% к скорости на 4 сек" },
  minus_wheel:{ id:"minus_wheel", name:"МИНУС КОЛЕСО", icon:"🛞", color:"#3fae4a", cost:25, kind:"prank",
             desc:"Твой водитель теряет колесо (да, серьёзно)", descH:"У лидера отваливается колесо" },
  monkey:  { id:"monkey",  name:"СКРИМЕР МАКАКИ", icon:"🐵", color:"#e8b62a", cost:35, kind:"prank",
             desc:"Пугает твоего водителя на пару секунд", descH:"Пугает водителя прямо впереди" },
  oil:     { id:"oil",     name:"МАСЛЯНАЯ ЛУЖА",  icon:"🛢️", color:"#c93b2e", cost:40, kind:"attack",
             desc:"Лужа за спиной: соперники позади в заносе" },
  repair:  { id:"repair",  name:"БЫСТРЫЙ РЕМОНТ", icon:"🔧", color:"#3a7bd5", cost:30, kind:"help",
             desc:"Чинит колесо и резину на месте" },
  aero:    { id:"aero",    name:"АЭРОПРИЖИМ",     icon:"🪽", color:"#3fae4a", cost:30, kind:"help",
             desc:"+сцепление в поворотах 10 сек" },
  smoke:   { id:"smoke",   name:"ДЫМОВАЯ ЗАВЕСА", icon:"💨", color:"#c93b2e", cost:35, kind:"attack",
             desc:"Слепит соперников позади 5 сек" },
  turborisk:{ id:"turborisk", name:"ТУРБО-РИСК",  icon:"⚠️", color:"#e8b62a", cost:0,  kind:"help",
             desc:"+60% мощности… или двигатель взорвётся" },
  mirror:  { id:"mirror",  name:"ЗЕРКАЛЬНЫЙ РУЛЬ", icon:"🔄", color:"#c93b2e", cost:35, kind:"attack",
             desc:"У лидирующего соперника руль наоборот 3 сек" },
};
export const HAND_SIZE = 3;
// pools per game mode
export const POOLS = {
  coop:    ["nitro", "repair", "aero", "turborisk"], // prank/attack cards (minus_wheel, monkey, oil, smoke, mirror) disabled: user asked to remove them; mechanic still undecided
  hostile: ["nitro", "repair", "aero", "turborisk"],
};
export function drawCard(mode, rng = Math.random) {
  const pool = POOLS[mode] || POOLS.coop;
  return CARDS[pool[Math.floor(rng() * pool.length)]];
}

// rejected by the user (prank/attack cards); never dealt, never playable
export const DISABLED_CARDS = new Set(["minus_wheel", "monkey", "oil", "smoke", "mirror"]);
