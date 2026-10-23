export function redact(value: string): string {
    return value
        .replace(/(?:https?|postgres(?:ql)?):\/\/[^\s"']+/gi, '[URL REDACTED]')
        .replace(
            /(?:Bearer\s+|gh[pousr]_|github_pat_)[\w.-]+/gi,
            '[TOKEN REDACTED]',
        )
        .replace(
            /(["']?(?:password|secret|token|authorization|client_secret|access_token|refresh_token|session|cookie|csrfToken)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi,
            '$1[REDACTED]',
        )
        .slice(0, 300);
}
