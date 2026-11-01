import { connect } from 'node:net';

export type ScanResult = { clean: true } | { clean: false; signature: string };

/** Checks an upload before it is stored. Null in FilesService means scanning is switched off. */
export interface VirusScanner {
  scan(body: Buffer): Promise<ScanResult>;
}

const CHUNK_BYTES = 64 * 1024;
const TIMEOUT_MS = 60_000;

/** Talks to a clamd daemon over TCP with its INSTREAM command. */
export class ClamAvScanner implements VirusScanner {
  constructor(
    private readonly host: string,
    private readonly port: number,
  ) {}

  scan(body: Buffer) {
    return new Promise<ScanResult>((resolve, reject) => {
      const socket = connect({ host: this.host, port: this.port });
      const replies: Buffer[] = [];
      socket.setTimeout(TIMEOUT_MS, () => socket.destroy(new Error('clamd timed out')));
      socket.on('error', reject);
      socket.on('data', (data) => replies.push(Buffer.from(data)));
      socket.on('close', () => {
        try {
          resolve(parseReply(Buffer.concat(replies).toString('utf8')));
        } catch (error) {
          reject(error as Error);
        }
      });
      socket.on('connect', () => {
        socket.write('zINSTREAM\0');
        for (let start = 0; start < body.length; start += CHUNK_BYTES) {
          const chunk = body.subarray(start, start + CHUNK_BYTES);
          const size = Buffer.alloc(4);
          size.writeUInt32BE(chunk.length);
          socket.write(size);
          socket.write(chunk);
        }
        // A zero-length chunk ends the stream.
        socket.write(Buffer.alloc(4));
      });
    });
  }
}

/** clamd answers `stream: OK`, `stream: <signature> FOUND` or `<problem> ERROR`. */
export function parseReply(reply: string): ScanResult {
  const text = reply.replace(/\0/g, '').trim();
  if (text.endsWith(' OK')) return { clean: true };
  const found = /^stream: (.+) FOUND$/.exec(text);
  if (found) return { clean: false, signature: found[1] };
  throw new Error(`Unexpected clamd reply: ${text || '(empty)'}`);
}
