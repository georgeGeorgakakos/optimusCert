// Backwards-compatible entry point: the app's data access is now the pluggable
// async `store` (sqlite or optimusdb). Routes import this default and call
// `await db.get(...) / db.all(...) / db.run(...)`.
import store, { initStore, BACKEND } from './store/index.js';

export { initStore, BACKEND };
export default store;
