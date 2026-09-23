import { Request, Response, NextFunction } from 'express';
import { logger } from '../modules/share/logger';

// In-memory rate limiting map
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

/**
 * In-memory IP-based rate limiter middleware.
 */
export function rateLimiter(limit: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Resolve client IP (handle proxy header forwarding)
    const forwardedFor = req.headers['x-forwarded-for'];
    let ip = '127.0.0.1';
    if (typeof forwardedFor === 'string') {
      ip = forwardedFor.split(',')[0].trim();
    } else if (req.socket?.remoteAddress) {
      ip = req.socket.remoteAddress;
    }

    const now = Date.now();
    const rateData = rateLimitMap.get(ip);

    if (!rateData || now > rateData.resetTime) {
      // First request or window expired, initialize
      rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
      return next();
    }

    rateData.count++;
    if (rateData.count > limit) {
      logger.warn('api', `Rate limit exceeded by IP: ${ip}`, { ip, count: rateData.count });
      return res.status(429).json({
        error: 'Too many requests from this IP. Please try again later.'
      });
    }

    next();
  };
}

/**
 * Production security headers injector middleware.
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  // Prevent mime sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Avoid clickjacking framing attacks
  res.setHeader('X-Frame-Options', 'DENY');
  // Enable browser XSS filtering
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // Content Security Policy
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' *;");
  
  next();
}
