import yauzl from 'yauzl';

const MAX_ENTRIES = 2_000;
const MAX_UNCOMPRESSED = 25 * 1024 * 1024;

export type ZipPreflight = { entries: number; uncompressedBytes: number; names: string[] };

/**
 * Counts the bytes actually decompressed from every entry, not just the
 * declared sizes. Rejects traversal, duplicate names, macros and encryption
 * before any XLSX parser sees the file.
 */
export function preflightZip(buffer: Buffer): Promise<ZipPreflight> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, decodeStrings: true }, (error, zipfile) => {
      if (error || !zipfile) {
        reject(new Error('invalid_zip'));
        return;
      }
      let entries = 0;
      let uncompressedBytes = 0;
      const names = new Set<string>();
      let settled = false;

      const fail = (reason: string) => {
        if (settled) return;
        settled = true;
        try {
          zipfile.close();
        } catch {
          // ignore
        }
        reject(new Error(reason));
      };

      zipfile.on('entry', (entry) => {
        entries += 1;
        if (entries > MAX_ENTRIES) {
          fail('zip_too_many_entries');
          return;
        }
        const name = entry.fileName;
        if (name.startsWith('/') || name.includes('..') || /^[a-zA-Z]:/.test(name)) {
          fail('zip_traversal');
          return;
        }
        if (names.has(name)) {
          fail('zip_duplicate_entry');
          return;
        }
        names.add(name);
        if (/vbaProject\.bin$/i.test(name)) {
          fail('zip_macro');
          return;
        }
        if ((entry.generalPurposeBitFlag & 0x1) !== 0) {
          fail('zip_encrypted');
          return;
        }
        zipfile.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) {
            fail('zip_stream');
            return;
          }
          stream.on('data', (chunk: Buffer) => {
            uncompressedBytes += chunk.length;
            if (uncompressedBytes > MAX_UNCOMPRESSED) {
              fail('zip_too_large');
            }
          });
          stream.on('end', () => {
            if (!settled) zipfile.readEntry();
          });
          stream.on('error', () => fail('zip_stream'));
        });
      });

      zipfile.on('end', () => {
        if (settled) return;
        settled = true;
        resolve({ entries, uncompressedBytes, names: [...names] });
      });
      zipfile.on('error', (streamError: Error) => {
        const message = streamError.message ?? '';
        if (message.includes('relative path') || message.includes('absolute path')) {
          fail('zip_traversal');
        } else {
          fail('invalid_zip');
        }
      });
      zipfile.readEntry();
    });
  });
}
