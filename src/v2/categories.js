// Category codes are permanent: never renumber or reuse one (docs/v2.0.md §6.1).
//   name   full name (details, accessible names)     label  short tile label
//   icon   Material Symbols name (ui/icons.js)         prefill  suggest the usual amount
//   one / many  the category as a social unit: "about a coffee", "about 2 coffees"
export const CATEGORIES = {
  0:  { key: "other",     name: "Something else", label: "Something else", icon: "more_horiz",          prefill: true,  one: null,               many: null },
  1:  { key: "stays",     name: "Stays",          label: "Stays",          icon: "bed",                 prefill: false, one: "a night's stay",   many: "nights' stay" },
  2:  { key: "meals",     name: "Meals",          label: "Meals",          icon: "restaurant",          prefill: true,  one: "a meal",           many: "meals" },
  3:  { key: "groceries", name: "Groceries",      label: "Groceries",      icon: "shopping_cart",       prefill: true,  one: "a grocery run",    many: "grocery runs" },
  4:  { key: "transport", name: "Transport",      label: "Transport",      icon: "commute",             prefill: true,  one: "a ride",           many: "rides" },
  5:  { key: "fuel",      name: "Fuel",           label: "Fuel",           icon: "local_gas_station",   prefill: true,  one: "a fill-up",        many: "fill-ups" },
  6:  { key: "drinks",    name: "Drinks",         label: "Drinks",         icon: "local_bar",           prefill: true,  one: "a round of drinks", many: "rounds of drinks" },
  7:  { key: "coffee",    name: "Coffee",         label: "Coffee",         icon: "local_cafe",          prefill: true,  one: "a coffee",         many: "coffees" },
  8:  { key: "courts",    name: "Sports courts",  label: "Courts",         icon: "sports_tennis",       prefill: true,  one: "a court booking",  many: "court bookings" },
  9:  { key: "gifts",     name: "Gifts",          label: "Gifts",          icon: "redeem",              prefill: true,  one: "a gift",           many: "gifts" },
  10: { key: "tickets",   name: "Tickets",        label: "Tickets",        icon: "confirmation_number", prefill: false, one: "a ticket",         many: "tickets" },
};

export const OTHER = 0;

/** Tile order on the logging screen (fixed, so people learn where things are). */
export const TILE_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export const isCategory = (k) => Number.isInteger(k) && Object.hasOwn(CATEGORIES, k);
