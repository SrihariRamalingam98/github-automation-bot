import {
    createCipheriv,
    createDecipheriv,
    createHmac,
    randomBytes,
    timingSafeEqual,
} from 'node:crypto';

export function safeEqual(left: string, right: string): boolean {
    const a = Buffer.from(left),
        b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
}
export function verifyWebhook(
    raw: Buffer,
    signature: string,
    secret: string,
): boolean {
    if (!isWebhookSignature(signature) || !secret) return false;
    return safeEqual(
        signature,
        `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`,
    );
}
export function sign(value: string, secret: string): string {
    return `${value}.${createHmac('sha256', secret).update(value).digest('base64url')}`;
}
export function isWebhookSignature(value: unknown): value is string {
    return typeof value === 'string' && /^sha256=[a-f0-9]{64}$/.test(value);
}
export function verify(value: unknown, secret: string): string | null {
    if (typeof value !== 'string') return null;
    const dot = value.lastIndexOf('.');
    if (dot < 1) return null;
    const payload = value.slice(0, dot);
    return safeEqual(value, sign(payload, secret)) ? payload : null;
}
export function encrypt(value: string, key: Buffer): string {
    const iv = randomBytes(12),
        cipher = createCipheriv('aes-256-gcm', key, iv);
    const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
}
export function decrypt(value: string, key: Buffer): string {
    const data = Buffer.from(value, 'base64url');
    const cipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
    cipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([
        cipher.update(data.subarray(28)),
        cipher.final(),
    ]).toString('utf8');
}
