import crypto from 'crypto';
import { ENV } from '../../config/env';

export interface TokenGenerator {
  generate(): string;
}

/**
 * Generates cryptographically secure random hex tokens.
 */
export class CryptoTokenGenerator implements TokenGenerator {
  private length: number;

  constructor(length?: number) {
    this.length = length ?? ENV.SHARE.TOKEN_LENGTH;
  }

  generate(): string {
    // Each random byte produces 2 hex characters.
    const numBytes = Math.ceil(this.length / 2);
    return crypto.randomBytes(numBytes).toString('hex').substring(0, this.length);
  }
}

/**
 * Pluggable generator for future short token support (e.g., MVP-7XK92Q).
 */
export class ShortTokenGenerator implements TokenGenerator {
  private prefix: string;
  private length: number;

  constructor(prefix = 'MVP-', length = 6) {
    this.prefix = prefix;
    this.length = length;
  }

  generate(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude ambiguous characters (like O, 0, I, 1)
    let token = this.prefix;
    for (let i = 0; i < this.length; i++) {
      const randomIndex = crypto.randomInt(0, chars.length);
      token += chars.charAt(randomIndex);
    }
    return token;
  }
}

// Export the default configured generator
export const defaultTokenGenerator = new CryptoTokenGenerator();
