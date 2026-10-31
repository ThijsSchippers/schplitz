// Category codes are permanent: never renumber or reuse one (docs/v2.0.md §6.1).
export const CATEGORIES = {
  0:  { key: "other",     name: "Something else", label: "Something else", icon: "more_horiz",          prefill: true  },
  1:  { key: "stays",     name: "Stays",          label: "Stays",          icon: "bed",                 prefill: false },
  2:  { key: "meals",     name: "Meals",          label: "Meals",          icon: "restaurant",          prefill: true  },
  3:  { key: "groceries", name: "Groceries",      label: "Groceries",      icon: "shopping_cart",       prefill: true  },
  4:  { key: "transport", name: "Transport",      label: "Transport",      icon: "commute",             prefill: true  },
  5:  { key: "fuel",      name: "Fuel",           label: "Fuel",           icon: "local_gas_station",   prefill: true  },
  6:  { key: "drinks",    name: "Drinks",         label: "Drinks",         icon: "local_bar",           prefill: true  },
  7:  { key: "coffee",    name: "Coffee",         label: "Coffee",         icon: "local_cafe",          prefill: true  },
  8:  { key: "courts",    name: "Sports courts",  label: "Courts",         icon: "sports_tennis",       prefill: true  },
  9:  { key: "gifts",     name: "Gifts",          label: "Gifts",          icon: "redeem",              prefill: true  },
  10: { key: "tickets",   name: "Tickets",        label: "Tickets",        icon: "confirmation_number", prefill: false },
};

export const OTHER = 0;

export const isCategory = (k) => Number.isInteger(k) && k in CATEGORIES;
