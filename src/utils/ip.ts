import type { Request } from 'express';

export function extractClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded)) {
    return forwarded[0].split(',')[0].trim();
  }
  return req.socket.remoteAddress || req.ip || '127.0.0.1';
}

export function isValidIp(ip: string): boolean {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  return ipv4Regex.test(ip) || ip.includes(':');
}
