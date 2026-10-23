import { isIP } from 'node:net';
import type { IncomingMessage } from 'node:http';

/** Only the explicitly trusted loopback nginx may supply a single real IP. */
export function clientIp(req: IncomingMessage, trustLoopbackProxy = false): string {
  const peer = req.socket.remoteAddress ?? 'unknown';
  const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer);
  const supplied = req.headers['x-real-ip'];
  if (trustLoopbackProxy && loopback && typeof supplied === 'string' && isIP(supplied)) return supplied;
  return peer;
}
