import { Request } from 'express';

export type AuditAction = 'CREATE' | 'OPEN' | 'REVOKE' | 'EXPIRE' | 'DELETE' | 'UPDATE_PERMISSIONS' | 'UPDATE_PASSWORD' | 'UPDATE_EXPIRATION';

export interface AuditLogData {
  share_token: string;
  study_uid: string;
  action: AuditAction;
  ip_address: string;
  device: string;
  browser: string;
}

/**
 * Extracts client metadata (IP Address, Browser, Device) from an Express request object.
 */
export function extractClientMetadata(req: Request): { ip: string; browser: string; device: string } {
  // Extract client IP (handle proxy forwarding headers)
  const forwardedFor = req.headers['x-forwarded-for'];
  let ip = '127.0.0.1';
  if (typeof forwardedFor === 'string') {
    ip = forwardedFor.split(',')[0].trim();
  } else if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    ip = forwardedFor[0].trim();
  } else if (req.socket && req.socket.remoteAddress) {
    ip = req.socket.remoteAddress;
  }

  // Sanitize IPv6 local loopback to IPv4
  if (ip === '::1' || ip === '::ffff:127.0.0.1') {
    ip = '127.0.0.1';
  }

  const userAgent = req.headers['user-agent'] || '';

  // Extract browser details
  let browser = 'Unknown';
  if (userAgent.includes('Firefox/')) {
    browser = 'Firefox';
  } else if (userAgent.includes('Edg/')) {
    browser = 'Edge';
  } else if (userAgent.includes('Chrome/') && !userAgent.includes('Chromium')) {
    browser = 'Chrome';
  } else if (userAgent.includes('Safari/') && !userAgent.includes('Chrome')) {
    browser = 'Safari';
  } else if (userAgent.includes('PostmanRuntime/')) {
    browser = 'Postman';
  } else if (userAgent.includes('MSIE') || userAgent.includes('Trident/')) {
    browser = 'Internet Explorer';
  }

  // Extract device/OS details
  let device = 'Desktop';
  const uaLower = userAgent.toLowerCase();
  if (uaLower.includes('iphone')) {
    device = 'iPhone';
  } else if (uaLower.includes('ipad')) {
    device = 'iPad';
  } else if (uaLower.includes('android')) {
    device = 'Android Phone';
  } else if (uaLower.includes('windows')) {
    device = 'Windows PC';
  } else if (uaLower.includes('macintosh') || uaLower.includes('mac os x')) {
    device = 'Macintosh';
  } else if (uaLower.includes('linux')) {
    device = 'Linux PC';
  }

  return { ip, browser, device };
}
