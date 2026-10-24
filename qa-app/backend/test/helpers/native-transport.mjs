export const control = { listener: null, removed: 0, cancelled: [], request: null };
export function registerPlugin() {
  return {
    async addListener(_, callback) {
      control.listener = callback;
      return { remove: async () => { control.removed++; control.listener = null; } };
    },
    request(options) { return control.request(options); },
    async cancel({ id }) { control.cancelled.push(id); },
  };
}
