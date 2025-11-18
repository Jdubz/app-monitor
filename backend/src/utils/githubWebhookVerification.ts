import crypto from 'crypto';

/**
 * Verify GitHub webhook HMAC signature
 *
 * GitHub signs webhooks using HMAC-SHA256 and sends the signature in the
 * X-Hub-Signature-256 header as "sha256=<signature>"
 *
 * @param payload - Raw request body as string or Buffer
 * @param signature - The X-Hub-Signature-256 header value
 * @param secret - The webhook secret configured in GitHub
 * @returns true if signature is valid, false otherwise
 */
export function verifyGitHubWebhookSignature(
  payload: string | Buffer,
  signature: string | undefined,
  secret: string
): boolean {
  // If no secret is configured, skip verification (development mode)
  if (!secret) {
    return true;
  }

  // Signature is required when secret is configured
  if (!signature) {
    return false;
  }

  // GitHub sends signature as "sha256=<hex_signature>"
  const signatureParts = signature.split('=');
  if (signatureParts.length !== 2 || signatureParts[0] !== 'sha256') {
    return false;
  }

  const providedSignature = signatureParts[1];

  // Compute expected signature
  const hmac = crypto.createHmac('sha256', secret);
  const payloadBuffer = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload;
  hmac.update(payloadBuffer);
  const expectedSignature = hmac.digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(providedSignature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch (_error) {
    // timingSafeEqual throws if buffers have different lengths
    return false;
  }
}
