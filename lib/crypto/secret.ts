import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
// 자산 계정 비밀번호 암호화 (AES-256-GCM). 키는 ASSET_SECRET 환경변수. 키 없으면 저장 거부.
function key() { const s = process.env.ASSET_SECRET; if (!s || s.length < 16) throw new Error('ASSET_SECRET 환경변수(16자 이상)가 필요합니다'); return createHash('sha256').update(s).digest(); }
export function encrypt(plain: string) { const iv = randomBytes(12); const c = createCipheriv('aes-256-gcm', key(), iv); const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]); return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${enc.toString('base64')}`; }
export function decrypt(s: string) { const [v, iv, tag, data] = s.split(':'); if (v !== 'v1') throw new Error('bad format'); const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64')); d.setAuthTag(Buffer.from(tag, 'base64')); return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8'); }
