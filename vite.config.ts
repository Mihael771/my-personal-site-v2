import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { execFileSync } from 'child_process';
import fs from 'fs';
import type { IncomingMessage, ServerResponse } from 'http';
import os from 'os';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';

const DATABASE_DIR = path.join(os.homedir(), 'Documents', 'SiteData');
const DATABASE_FILE = path.join(DATABASE_DIR, 'database.json');
const DOWNLOADS_DIR = path.join(os.homedir(), 'Downloads');
const BACKUPS_DIR = path.resolve(__dirname, 'backups');
const MAX_BACKUP_FILES = 10;

function getLocalYmd(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isSafeBackupFilename(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  if (
    name.includes('/') ||
    name.includes('\\') ||
    name.includes('..') ||
    path.basename(name) !== name
  ) {
    return false;
  }
  const lower = name.toLowerCase();
  return lower.startsWith('database_') && lower.endsWith('.json');
}

function extractDateFromBackupFilename(filename: string): string | null {
  const match = filename.match(/^database_(\d{4}-\d{2}-\d{2})\.json$/i);
  return match ? match[1] : null;
}

function listRotatingBackupFiles(): Array<{
  filename: string;
  fullPath: string;
  mtimeMs: number;
  date: string | null;
}> {
  if (!fs.existsSync(BACKUPS_DIR)) return [];
  let entries: string[];
  try {
    entries = fs.readdirSync(BACKUPS_DIR);
  } catch {
    return [];
  }

  const files: Array<{
    filename: string;
    fullPath: string;
    mtimeMs: number;
    date: string | null;
  }> = [];

  for (const entry of entries) {
    if (!isSafeBackupFilename(entry)) continue;
    const fullPath = path.join(BACKUPS_DIR, entry);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isFile()) {
        files.push({
          filename: entry,
          fullPath,
          mtimeMs: stat.mtimeMs,
          date: extractDateFromBackupFilename(entry),
        });
      }
    } catch {
      // Ignore transient/inaccessible files
    }
  }

  files.sort((a, b) => b.mtimeMs - a.mtimeMs || b.filename.localeCompare(a.filename));
  return files;
}

function createRotatingBackup(): {
  count: number;
  limit: number;
  latestDate: string | null;
  latestFilename: string | null;
  prunedCount: number;
} {
  ensureDatabaseFile();
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }

  const todayYmd = getLocalYmd();
  const todayFilename = `database_${todayYmd}.json`;
  const todayPath = path.join(BACKUPS_DIR, todayFilename);
  fs.copyFileSync(DATABASE_FILE, todayPath);

  // Refresh mtime so today's backup is guaranteed newest
  const now = new Date();
  try {
    fs.utimesSync(todayPath, now, now);
  } catch {
    // Ignore utimes errors on restricted filesystems
  }

  const allFiles = listRotatingBackupFiles();
  let prunedCount = 0;
  if (allFiles.length > MAX_BACKUP_FILES) {
    const excess = allFiles.slice(MAX_BACKUP_FILES);
    for (const file of excess) {
      try {
        if (fs.existsSync(file.fullPath)) {
          moveFileToRecycleBinOrUnlink(file.fullPath);
          prunedCount += 1;
        }
      } catch {
        // Keep backup operation resilient
      }
    }
  }

  const remaining = listRotatingBackupFiles();
  const latest = remaining[0] ?? null;
  return {
    count: remaining.length,
    limit: MAX_BACKUP_FILES,
    latestDate: latest?.date ?? todayYmd,
    latestFilename: latest?.filename ?? todayFilename,
    prunedCount,
  };
}

function getBackupStatus(): {
  count: number;
  limit: number;
  latestDate: string | null;
  latestFilename: string | null;
} {
  const files = listRotatingBackupFiles();
  const latest = files[0] ?? null;
  return {
    count: files.length,
    limit: MAX_BACKUP_FILES,
    latestDate: latest?.date ?? null,
    latestFilename: latest?.filename ?? null,
  };
}

function isSafeHevyWorkoutsFilename(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  if (
    name.includes('/') ||
    name.includes('\\') ||
    name.includes('..') ||
    path.basename(name) !== name
  ) {
    return false;
  }
  const lower = name.toLowerCase();
  return lower.startsWith('workouts') && lower.endsWith('.csv');
}

function findLatestHevyWorkoutsCsv(): {
  filename: string;
  filenames: string[];
  content: string;
} | null {
  if (!fs.existsSync(DOWNLOADS_DIR)) return null;
  let entries: string[];
  try {
    entries = fs.readdirSync(DOWNLOADS_DIR);
  } catch {
    return null;
  }

  const candidates: Array<{ filename: string; fullPath: string; mtimeMs: number }> = [];
  for (const entry of entries) {
    if (!isSafeHevyWorkoutsFilename(entry)) continue;
    const fullPath = path.join(DOWNLOADS_DIR, entry);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isFile() && stat.size > 0) {
        candidates.push({ filename: entry, fullPath, mtimeMs: stat.mtimeMs });
      }
    } catch {
      // Ignore transient/inaccessible files
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const newest = candidates[0];
  const content = fs.readFileSync(newest.fullPath, 'utf-8');
  return {
    filename: newest.filename,
    filenames: candidates.map((c) => c.filename),
    content,
  };
}

function moveFileToRecycleBinOrUnlink(targetPath: string): 'recycle_bin' | 'unlink' {
  if (process.platform === 'win32') {
    try {
      const psCommand =
        "Add-Type -AssemblyName Microsoft.VisualBasic; " +
        "[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile(" +
        "$env:HEVY_RECYCLE_TARGET, 'OnlyErrorDialogs', 'SendToRecycleBin')";
      execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', psCommand],
        {
          env: {
            ...process.env,
            HEVY_RECYCLE_TARGET: targetPath,
          },
          stdio: 'ignore',
          timeout: 8000,
          windowsHide: true,
        },
      );
      if (!fs.existsSync(targetPath)) {
        return 'recycle_bin';
      }
    } catch {
      // Fall back to fs.unlinkSync below if PowerShell fails
    }
  }

  fs.unlinkSync(targetPath);
  return 'unlink';
}

const EMPTY_INITIAL_DATABASE = {
  profile: {
    name: '',
    heightCm: '',
    weightKg: '',
  },
  themeAccent: 'blue',
  logs: {},
  goals: [],
};

function ensureDatabaseDirectory(): void {
  if (!fs.existsSync(DATABASE_DIR)) {
    fs.mkdirSync(DATABASE_DIR, { recursive: true });
  }
}

function ensureDatabaseFile(): void {
  ensureDatabaseDirectory();
  if (!fs.existsSync(DATABASE_FILE)) {
    fs.writeFileSync(
      DATABASE_FILE,
      `${JSON.stringify(EMPTY_INITIAL_DATABASE, null, 2)}\n`,
      'utf-8',
    );
  }
}

function readDatabaseJson(): string {
  ensureDatabaseFile();
  const raw = fs.readFileSync(DATABASE_FILE, 'utf-8').trim();
  if (!raw) {
    return `${JSON.stringify(EMPTY_INITIAL_DATABASE, null, 2)}\n`;
  }
  // Validate stored JSON; if corrupted, return valid raw fallback
  JSON.parse(raw);
  return raw;
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
}

function attachDatabaseMiddleware(middlewares: {
  use: (
    fn: (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => void,
  ) => void;
}): void {
  ensureDatabaseFile();
  try {
    createRotatingBackup();
  } catch {
    // Backup creation should never prevent server startup
  }

  middlewares.use((req, res, next) => {
    const pathname = (req.url ?? '').split('?')[0];

    if (pathname === '/api/backup-status') {
      if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'Method Not Allowed' });
        return;
      }
      try {
        sendJson(res, 200, getBackupStatus());
      } catch (err) {
        sendJson(res, 500, {
          error: 'Failed to inspect backups folder',
          details: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }

    if (pathname !== '/api/data') {
      next();
      return;
    }

    if (req.method === 'GET') {
      try {
        const jsonText = readDatabaseJson();
        sendJson(res, 200, jsonText);
      } catch (err) {
        sendJson(res, 500, {
          error: 'Failed to read database.json',
          details: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }

    if (req.method === 'POST') {
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      const MAX_BODY_BYTES = 5 * 1024 * 1024;
      let aborted = false;

      req.on('data', (chunk: Buffer) => {
        if (aborted) return;
        totalBytes += chunk.length;
        if (totalBytes > MAX_BODY_BYTES) {
          aborted = true;
          sendJson(res, 413, { error: 'Payload too large' });
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });

      req.on('end', () => {
        if (aborted) return;
        try {
          const rawBody = Buffer.concat(chunks).toString('utf-8').trim();
          const parsed = rawBody ? JSON.parse(rawBody) : EMPTY_INITIAL_DATABASE;
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            sendJson(res, 400, { error: 'Invalid database payload: expected JSON object' });
            return;
          }
          const formatted = `${JSON.stringify(parsed, null, 2)}\n`;
          ensureDatabaseDirectory();
          fs.writeFileSync(DATABASE_FILE, formatted, 'utf-8');
          try {
            createRotatingBackup();
          } catch {
            // Backup failure must not fail primary database save
          }
          sendJson(res, 200, { ok: true });
        } catch (err) {
          sendJson(res, 400, {
            error: 'Invalid JSON body',
            details: err instanceof Error ? err.message : String(err),
          });
        }
      });

      req.on('error', (err) => {
        if (aborted) return;
        sendJson(res, 500, {
          error: 'Request stream error',
          details: err instanceof Error ? err.message : String(err),
        });
      });
      return;
    }

    sendJson(res, 405, { error: 'Method Not Allowed' });
  });

  // Auto-detect and clean up Hevy CSV exports (workouts*.csv) from ~/Downloads
  middlewares.use((req, res, next) => {
    const pathname = (req.url ?? '').split('?')[0];

    if (pathname === '/api/hevy-downloads-check') {
      if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'Method Not Allowed' });
        return;
      }
      try {
        const match = findLatestHevyWorkoutsCsv();
        if (!match) {
          sendJson(res, 200, { found: false, filenames: [] });
          return;
        }
        sendJson(res, 200, {
          found: true,
          filename: match.filename,
          filenames: match.filenames,
          content: match.content,
        });
      } catch (err) {
        sendJson(res, 500, {
          found: false,
          filenames: [],
          error: 'Failed to inspect Downloads folder',
          details: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }

    if (pathname === '/api/hevy-downloads-cleanup') {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'Method Not Allowed' });
        return;
      }

      const chunks: Buffer[] = [];
      let totalBytes = 0;
      const MAX_BODY_BYTES = 16 * 1024;
      let aborted = false;

      req.on('data', (chunk: Buffer) => {
        if (aborted) return;
        totalBytes += chunk.length;
        if (totalBytes > MAX_BODY_BYTES) {
          aborted = true;
          sendJson(res, 413, { error: 'Payload too large' });
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });

      req.on('end', () => {
        if (aborted) return;
        try {
          const rawBody = Buffer.concat(chunks).toString('utf-8').trim();
          const parsed = rawBody
            ? (JSON.parse(rawBody) as { filename?: unknown; filenames?: unknown })
            : {};

          const requestedNames: string[] = [];
          if (Array.isArray(parsed.filenames)) {
            for (const item of parsed.filenames) {
              if (typeof item === 'string' && item.trim()) {
                requestedNames.push(item.trim());
              }
            }
          }
          if (typeof parsed.filename === 'string' && parsed.filename.trim()) {
            requestedNames.push(parsed.filename.trim());
          }

          const uniqueNames = Array.from(new Set(requestedNames));
          if (uniqueNames.length === 0) {
            sendJson(res, 400, {
              error: 'Missing filename(s): expected workouts*.csv inside Downloads',
            });
            return;
          }

          const resolvedDir = path.resolve(DOWNLOADS_DIR);
          const validatedTargets: Array<{ filename: string; targetPath: string }> = [];

          for (const fname of uniqueNames) {
            if (!isSafeHevyWorkoutsFilename(fname)) {
              sendJson(res, 400, {
                error: 'Invalid filename: must be a workouts*.csv file inside Downloads',
              });
              return;
            }
            const targetPath = path.resolve(resolvedDir, fname);
            if (path.dirname(targetPath) !== resolvedDir) {
              sendJson(res, 400, { error: 'Path traversal blocked' });
              return;
            }
            validatedTargets.push({ filename: fname, targetPath });
          }

          const cleaned: string[] = [];
          const methods = new Set<'recycle_bin' | 'unlink'>();

          for (const { filename, targetPath } of validatedTargets) {
            if (fs.existsSync(targetPath)) {
              const usedMethod = moveFileToRecycleBinOrUnlink(targetPath);
              methods.add(usedMethod);
              cleaned.push(filename);
            }
          }

          const method =
            methods.size === 0
              ? 'none'
              : methods.size === 1
                ? Array.from(methods)[0]
                : 'mixed';

          sendJson(res, 200, {
            ok: true,
            deleted: cleaned.length > 0,
            filename: cleaned[0] ?? uniqueNames[0],
            filenames: cleaned,
            method,
          });
        } catch (err) {
          sendJson(res, 400, {
            error: 'Invalid JSON body',
            details: err instanceof Error ? err.message : String(err),
          });
        }
      });

      req.on('error', (err) => {
        if (aborted) return;
        sendJson(res, 500, {
          error: 'Request stream error',
          details: err instanceof Error ? err.message : String(err),
        });
      });
      return;
    }

    next();
  });
}

function localJsonDatabasePlugin(): Plugin {
  return {
    name: 'local-json-database',
    configureServer(server) {
      attachDatabaseMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      attachDatabaseMiddleware(server.middlewares);
    },
  };
}

export default defineConfig(() => {
  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      localJsonDatabasePlugin(),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, { recursive: true, force: true });
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch:
        process.env.DISABLE_HMR === 'true'
          ? null
          : { ignored: ['**/database.json', '**/backups/**'] },
    },
  };
});
