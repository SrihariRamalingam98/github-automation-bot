// Verify the real built Angular shell through production Nest HTTP middleware.
// No AppModule, database configuration, providers, workers or credentials are loaded.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('reflect-metadata');
const { Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { configureHttp, frontendDirectory } = require('../apps/backend/dist/http');

class ArtifactVerificationModule {}
Module({})(ArtifactVerificationModule);

(async () => {
    const app = await NestFactory.create(ArtifactVerificationModule, {
        bodyParser: false,
        logger: false,
    });
    try {
        const directory = frontendDirectory();
        const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
        assert.match(html, /<base\s+href="\/"\s*\/?>/);
        assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
        configureHttp(app, { production: true, trustProxyHops: 1 }, directory);
        await app.listen(0, '127.0.0.1');
        const origin = await app.getUrl();
        for (const route of ['/', '/login', '/dashboard', '/repositories', '/rules', '/events']) {
            const response = await fetch(origin + route, { headers: { Accept: 'text/html' } });
            if (response.status !== 200)
                console.error('Artifact route failure: ' + route + ' status=' + response.status);
            assert.equal(response.status, 200, route);
            assert.equal(await response.text(), html, route);
            const policy = response.headers.get('content-security-policy');
            assert.match(policy, /script-src-attr 'none'/);
        }
        const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
        const styles = [...html.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map((m) => m[1]);
        assert.ok(scripts.length && styles.length, 'Built scripts/styles must exist');
        for (const asset of [...scripts, ...styles]) {
            const response = await fetch(origin + '/' + asset);
            assert.equal(response.status, 200, asset);
            assert.match(
                response.headers.get('content-type'),
                asset.endsWith('.css') ? /text\/css/ : /javascript/,
            );
        }
        for (const route of [
            '/api/missing',
            '/auth/missing',
            '/webhooks/missing',
            '/health/missing',
        ]) {
            const response = await fetch(origin + route, { headers: { Accept: 'text/html' } });
            assert.equal(response.status, 404, route);
            assert.match(response.headers.get('content-type'), /application\/json/);
            assert.ok((await response.json()).requestId, route);
        }
        assert.equal((await fetch(origin + '/missing-asset.js')).status, 404);
        console.log(
            'Verified production Angular route refresh, built JS/CSS, CSP and server namespace errors without database access.',
        );
    } finally {
        await app.close();
    }
})().catch((error) => {
    console.error(
        'Production HTTP artifact verification failed: ' + String(error.message).slice(0, 500),
    );
    process.exitCode = 1;
});
