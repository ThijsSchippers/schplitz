// Navigation transitions keep the active tally, screen, and sheet consistent.
export const initialNavigation = {
  view: { name: "loading" }, current: null, sheet: null, present: [],
};

export function navigationReducer(state, action) {
  switch (action.type) {
    case "home":
      return { ...initialNavigation, view: { name: "home" } };
    case "openTally":
      return {
        view: { name: "tally" }, current: { tally: action.tally, key: action.key },
        sheet: action.sheet ?? null, present: action.tally.members.map(member => member.id),
      };
    case "join":
      return { ...initialNavigation, view: { name: "join", url: action.url, header: action.header } };
    case "oldLink":
      return { ...initialNavigation, view: { name: "oldLink", share: action.share, needsName: action.needsName } };
    case "reload":
      // A tab notification can finish after the user has opened another tally.
      if (state.current?.tally.id !== action.id) return state;
      if (!action.tally || !action.key) return { ...initialNavigation, view: { name: "home" } };
      return { ...state, current: { tally: action.tally, key: action.key } };
    case "view":
      return { ...state, view: action.view };
    case "sheet":
      return { ...state, sheet: action.sheet };
    case "present":
      return { ...state, present: action.members };
    case "memberAdded":
      return { ...state, present: [...state.present, action.id] };
    case "paymentSaved":
      // Saving can finish after Close, another link, or a new payment form.
      if (state.current?.tally.id !== action.id || state.view !== action.fromView) return state;
      return {
        ...state, view: { name: action.editing ? "details" : "tally" },
        sheet: { kind: "share", request: action.editing ? {} : { lastCategory: action.category } },
      };
    case "cancelPayment":
      return { ...state, view: { name: state.view.edit ? "details" : "tally" } };
    default:
      throw new Error(`Unknown navigation action: ${action.type}`);
  }
}
