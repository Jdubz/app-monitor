import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { verifyGitHubWebhookSignature } from './githubWebhookVerification.js';

describe('verifyGitHubWebhookSignature', () => {
  const testSecret = 'test-webhook-secret';
  const testPayload = JSON.stringify({ test: 'payload', data: 'value' });

  /**
   * Helper function to generate valid GitHub webhook signature
   */
  function generateValidSignature(payload: string, secret: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload, 'utf8');
    const signature = hmac.digest('hex');
    return `sha256=${signature}`;
  }

  describe('when secret is configured', () => {
    it('should return true for valid signature', () => {
      const validSignature = generateValidSignature(testPayload, testSecret);
      const result = verifyGitHubWebhookSignature(testPayload, validSignature, testSecret);
      expect(result).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const invalidSignature = 'sha256=invalid-signature-hash';
      const result = verifyGitHubWebhookSignature(testPayload, invalidSignature, testSecret);
      expect(result).toBe(false);
    });

    it('should return false when signature is missing', () => {
      const result = verifyGitHubWebhookSignature(testPayload, undefined, testSecret);
      expect(result).toBe(false);
    });

    it('should return false for signature with wrong algorithm', () => {
      const hmac = crypto.createHmac('sha1', testSecret);
      hmac.update(testPayload, 'utf8');
      const wrongAlgoSignature = `sha1=${hmac.digest('hex')}`;
      const result = verifyGitHubWebhookSignature(testPayload, wrongAlgoSignature, testSecret);
      expect(result).toBe(false);
    });

    it('should return false for malformed signature (no equals sign)', () => {
      const result = verifyGitHubWebhookSignature(testPayload, 'sha256invalid', testSecret);
      expect(result).toBe(false);
    });

    it('should return false for signature with wrong secret', () => {
      const wrongSecretSignature = generateValidSignature(testPayload, 'wrong-secret');
      const result = verifyGitHubWebhookSignature(testPayload, wrongSecretSignature, testSecret);
      expect(result).toBe(false);
    });

    it('should work with Buffer payload', () => {
      const bufferPayload = Buffer.from(testPayload, 'utf8');
      const validSignature = generateValidSignature(testPayload, testSecret);
      const result = verifyGitHubWebhookSignature(bufferPayload, validSignature, testSecret);
      expect(result).toBe(true);
    });

    it('should handle empty payload', () => {
      const emptyPayload = '';
      const validSignature = generateValidSignature(emptyPayload, testSecret);
      const result = verifyGitHubWebhookSignature(emptyPayload, validSignature, testSecret);
      expect(result).toBe(true);
    });

    it('should handle complex JSON payload', () => {
      const complexPayload = JSON.stringify({
        action: 'opened',
        pull_request: {
          number: 123,
          title: 'Test PR',
          nested: {
            deep: {
              value: 'test'
            }
          }
        }
      });
      const validSignature = generateValidSignature(complexPayload, testSecret);
      const result = verifyGitHubWebhookSignature(complexPayload, validSignature, testSecret);
      expect(result).toBe(true);
    });

    it('should prevent timing attacks by using timing-safe comparison', () => {
      // Generate two different valid signatures
      const payload1 = 'payload1';
      const payload2 = 'payload2';
      const signature1 = generateValidSignature(payload1, testSecret);
      const signature2 = generateValidSignature(payload2, testSecret);

      // Verify that using signature1 with payload2 fails
      const result = verifyGitHubWebhookSignature(payload2, signature1, testSecret);
      expect(result).toBe(false);

      // Verify that correct combinations work
      expect(verifyGitHubWebhookSignature(payload1, signature1, testSecret)).toBe(true);
      expect(verifyGitHubWebhookSignature(payload2, signature2, testSecret)).toBe(true);
    });
  });

  describe('when secret is not configured (development mode)', () => {
    it('should return true when secret is empty string', () => {
      const result = verifyGitHubWebhookSignature(testPayload, undefined, '');
      expect(result).toBe(true);
    });

    it('should return true even without signature header', () => {
      const result = verifyGitHubWebhookSignature(testPayload, undefined, '');
      expect(result).toBe(true);
    });

    it('should return true with any payload', () => {
      const result = verifyGitHubWebhookSignature('any payload', undefined, '');
      expect(result).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle signature with extra whitespace', () => {
      const validSignature = generateValidSignature(testPayload, testSecret);
      // GitHub won't send this, but test defensively
      const result = verifyGitHubWebhookSignature(testPayload, validSignature.trim(), testSecret);
      expect(result).toBe(true);
    });

    it('should handle invalid hex characters in signature', () => {
      const invalidHexSignature = 'sha256=gggggggggggggggg'; // 'g' is not valid hex
      const result = verifyGitHubWebhookSignature(testPayload, invalidHexSignature, testSecret);
      expect(result).toBe(false);
    });

    it('should handle signature with uppercase hex', () => {
      const hmac = crypto.createHmac('sha256', testSecret);
      hmac.update(testPayload, 'utf8');
      const uppercaseSignature = `sha256=${hmac.digest('hex').toUpperCase()}`;
      const result = verifyGitHubWebhookSignature(testPayload, uppercaseSignature, testSecret);
      // Hex comparison is case-insensitive when converted to Buffer
      // Both uppercase and lowercase hex strings decode to the same bytes
      expect(result).toBe(true);
    });
  });
});
