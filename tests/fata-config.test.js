const test = require('node:test');
const assert = require('node:assert/strict');

const { getConfig } = require('../server/oauth-configs');

test('Fata config accepts the real production env names and exposes the binding scope', () => {
  process.env.FATA_CLIENT_ID = 'xera1-test-client';
  process.env.FATA_CLIENT_SECRET = 'test-secret';
  process.env.FATA_OIDC_ISSUER = 'https://fata.app/oidc';
  process.env.FATA_API_BASE_URL = 'https://fata.app/api';

  const config = getConfig('fata');

  assert.equal(config.clientId, 'xera1-test-client');
  assert.equal(config.clientSecret, 'test-secret');
  assert.equal(config.issuer, 'https://fata.app/oidc');
  assert.equal(config.apiBase, 'https://fata.app/api');
  assert.match(config.scope, /action-completions:connect/);
});
