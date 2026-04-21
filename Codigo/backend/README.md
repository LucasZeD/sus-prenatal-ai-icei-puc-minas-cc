npm run test:unit — passa sem Docker (só unidade).

npm run test:integration — passou com Docker (Testcontainers + migrate deploy + 15 casos).

npm test — passa com Docker; sem Docker ou sem runtime de container, a integração falha (a menos que use SKIP_INTEGRATION_TESTS=1).