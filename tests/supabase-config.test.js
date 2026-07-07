const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createAuthContext() {
  const storage = new Map();

  const localStorage = {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      storage.set(key, String(value));
    },
    removeItem(key) {
      storage.delete(key);
    },
    clear() {
      storage.clear();
    },
  };

  const window = {
    localStorage,
    sessionStorage: { ...localStorage },
    location: {
      origin: 'https://example.com',
      href: 'https://example.com/login.html',
      search: '',
    },
    dispatchEvent() {},
    CustomEvent: class {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    addEventListener() {},
    removeEventListener() {},
    supabaseClient: null,
    supabase: null,
  };

  const context = {
    console,
    window,
    self: window,
    globalThis: null,
    localStorage,
    sessionStorage: window.sessionStorage,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (cb) => cb(),
    cancelAnimationFrame: () => {},
  };

  context.globalThis = context;
  context.global = context;

  return context;
}

test('signInWithGoogle initializes the client before checking OAuth support', async () => {
  const context = createAuthContext();
  const script = fs.readFileSync(path.join(__dirname, '..', 'js', 'supabase-config.js'), 'utf8');

  const oauthCalls = [];
  context.window.supabase = {
    createClient() {
      return {
        auth: {
          signInWithOAuth: async (options) => {
            oauthCalls.push(options);
            return { data: { url: 'https://provider.example/oauth' }, error: null };
          },
          onAuthStateChange() {
            return { data: { subscription: {} } };
          },
          getSession: async () => ({ data: { session: null }, error: null }),
          getUser: async () => ({ data: { user: null }, error: null }),
        },
      };
    },
  };

  vm.createContext(context);
  vm.runInContext(script, context);

  const result = await context.signInWithGoogle('https://example.com/dashboard');

  assert.equal(result.success, true);
  assert.equal(result.data.url, 'https://provider.example/oauth');
  assert.equal(oauthCalls.length, 1);
});
