import { createHmac, randomBytes } from 'node:crypto';
import {
    decrypt,
    encrypt,
    sign,
    verify,
    verifyWebhook,
} from '../src/common/security';
import { redact } from '../src/common/redact';
describe('Security primitives used by production', () => {
    const raw = Buffer.from('{"action":"opened", "title":"B?g"}');
    const secret = 'test-secret';
    const signature =
        'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
    it('verifies exact bytes including unicode and whitespace', () => {
        expect(verifyWebhook(raw, signature, secret)).toBe(true);
        expect(
            verifyWebhook(
                Buffer.from(JSON.stringify(JSON.parse(raw.toString()))),
                signature,
                secret,
            ),
        ).toBe(false);
    });
    it.each([
        '',
        'sha256=no',
        'sha256=' + '0'.repeat(64),
        'sha256=' + '?'.repeat(64),
    ])('rejects malformed signatures without throwing: %s', (value) => {
        expect(verifyWebhook(raw, value, secret)).toBe(false);
    });
    it('rejects tampered session signatures', () => {
        expect(verify(sign('session', 'secret'), 'secret')).toBe('session');
        expect(verify(sign('session', 'secret') + 'x', 'secret')).toBeNull();
        expect(verify(undefined, 'secret')).toBeNull();
    });
    it('preserves AES-GCM legacy token encoding and detects tampering', () => {
        const key = randomBytes(32),
            encoded = encrypt('fake-test-token', key);
        expect(decrypt(encoded, key)).toBe('fake-test-token');
        expect(() => decrypt(encoded, randomBytes(32))).toThrow();
    });
    it('redacts URLs and bearer tokens', () => {
        const result = redact(
            'https://hooks.slack.com/services/test/test/test Bearer test-token',
        );
        expect(result).not.toContain('hooks.slack');
        expect(result).not.toContain('test-token');
    });
});
