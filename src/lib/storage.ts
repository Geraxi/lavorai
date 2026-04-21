import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Storage abstraction — 3 driver in priorità:
 *
 * 1. **Vercel Blob** se `BLOB_READ_WRITE_TOKEN` set
 *    (autoinjected da Vercel quando linki uno store al progetto).
 * 2. **Supabase Storage** se `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` set
 * 3. **Filesystem locale** ./storage/ (default dev)
 *
 * `storagePath` returnato è opaco:
 *  - vercel: URL pubblico del blob (es. https://xxx.public.blob.vercel-storage.com/users/...)
 *  - supabase: key bucket (es. "users/abc/cv-source/cv.pdf")
 *  - fs: percorso assoluto
 */

const FS_ROOT = join(process.cwd(), "storage");

type Driver = "vercel" | "supabase" | "fs";

function driver(): Driver {
  if (process.env.BLOB_READ_WRITE_TOKEN) return "vercel";
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
    return "supabase";
  return "fs";
}

let cachedSupabase: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (cachedSupabase) return cachedSupabase;
  cachedSupabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  return cachedSupabase;
}

function bucket(): string {
  return process.env.SUPABASE_STORAGE_BUCKET ?? "lavorai";
}

export async function saveUserFile(
  userId: string,
  subdir: string,
  filename: string,
  data: Buffer,
): Promise<string> {
  const safeName = sanitize(filename);
  const key = `users/${userId}/${subdir}/${safeName}`;
  const drv = driver();

  if (drv === "vercel") {
    const { put } = await import("@vercel/blob");
    const result = await put(key, data, {
      access: "public",
      contentType: contentTypeFor(safeName),
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return result.url;
  }

  if (drv === "supabase") {
    const { error } = await sb()
      .storage.from(bucket())
      .upload(key, data, { upsert: true, contentType: contentTypeFor(safeName) });
    if (error) throw new Error(`supabase upload failed: ${error.message}`);
    return key;
  }

  // fs
  const dir = join(FS_ROOT, userId, subdir);
  await mkdir(dir, { recursive: true });
  const path = join(dir, safeName);
  await writeFile(path, data);
  return path;
}

export async function readUserFile(storagePath: string): Promise<Buffer> {
  const drv = driver();

  if (drv === "vercel") {
    // storagePath qui è una URL pubblica del blob
    const res = await fetch(storagePath);
    if (!res.ok)
      throw new Error(`vercel blob fetch failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  if (drv === "supabase") {
    const { data, error } = await sb()
      .storage.from(bucket())
      .download(storagePath);
    if (error || !data) throw new Error(`supabase read failed: ${error?.message}`);
    return Buffer.from(await data.arrayBuffer());
  }

  return readFile(storagePath);
}

/**
 * Sposta un file dal path staging a quello dell'utente reale.
 * Best-effort: se source non esiste ritorna l'originale.
 */
export async function moveFile(
  fromPath: string,
  toUserId: string,
  subdir: string,
  filename: string,
): Promise<string> {
  const safeName = sanitize(filename);
  const drv = driver();

  if (drv === "vercel") {
    // Vercel Blob non ha rename nativo: scarica + ricarica + delete vecchio
    try {
      const data = await readUserFile(fromPath);
      const newPath = await saveUserFile(toUserId, subdir, safeName, data);
      // Cancella il vecchio
      const { del } = await import("@vercel/blob");
      await del(fromPath).catch(() => void 0);
      return newPath;
    } catch (err) {
      console.warn("[storage.moveFile] vercel move fallita", err);
      return fromPath;
    }
  }

  if (drv === "supabase") {
    const newKey = `users/${toUserId}/${subdir}/${safeName}`;
    if (fromPath === newKey) return newKey;
    const { error } = await sb().storage.from(bucket()).move(fromPath, newKey);
    if (error) {
      console.warn("[storage.moveFile] supabase move fallita", error.message);
      return fromPath;
    }
    return newKey;
  }

  // fs
  const newDir = join(FS_ROOT, toUserId, subdir);
  const newPath = join(newDir, safeName);
  try {
    await mkdir(dirname(newPath), { recursive: true });
    await rename(fromPath, newPath);
    return newPath;
  } catch (err) {
    console.warn("[storage.moveFile] fs rename fallita", err);
    return fromPath;
  }
}

function sanitize(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 180);
}

function contentTypeFor(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx"))
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "application/octet-stream";
}
