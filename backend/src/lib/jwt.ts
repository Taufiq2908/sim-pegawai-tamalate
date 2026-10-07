import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export function signAccess(payload: object) {
  return jwt.sign(payload, env.accessSecret, { expiresIn: env.accessExpires } as any);
}
export function signRefresh(payload: object) {
  return jwt.sign(payload, env.refreshSecret, { expiresIn: env.refreshExpires } as any);
}
export function verifyAccess(token: string) {
  return jwt.verify(token, env.accessSecret) as any;
}
export function verifyRefresh(token: string) {
  return jwt.verify(token, env.refreshSecret) as any;
}
