import type { SupabaseClient } from '@supabase/supabase-js';
import { MODERATION_UNAVAILABLE } from '@/lib/moderation';
import { fehlertextAusFunktion } from '@/lib/functions-error';

/**
 * Bild-Uploads durch die Moderation — Port von uploadModeratedImage aus
 * occuroapp/src/lib/uploads.ts. Die Edge Function `upload-moderated-image`
 * prüft das Bild und legt es selbst im Bucket ab.
 *
 * Die Web-App lud bisher direkt in den Storage, ohne jede Bildprüfung: Was
 * die App als Profilbild oder Banner ablehnt, ging hier durch.
 */

export type ModeratedImageBucket = 'avatars' | 'event-images' | 'tickets';
export type ModeratedImagePurpose = 'avatar' | 'event_banner' | 'ticket_proof';

// Dieselben Grenzen wie in der App. Fotos werden vorher verkleinert und
// liegen danach deutlich darunter; Ticket-Belege brauchen mehr Reserve, damit
// Barcodes lesbar bleiben.
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

const MAX_KANTE: Record<ModeratedImagePurpose, number> = {
  avatar: 1024,
  event_banner: 2048,
  ticket_proof: 2048,
};

export const UPLOAD_BLOCKED = 'Dieses Bild verstößt gegen unsere Richtlinien und konnte nicht hochgeladen werden.';
export const UPLOAD_FAILED = 'Bild konnte nicht gespeichert werden. Bitte versuche es erneut.';

export const purposeForBucket = (bucket: ModeratedImageBucket): ModeratedImagePurpose =>
  bucket === 'avatars' ? 'avatar' : bucket === 'tickets' ? 'ticket_proof' : 'event_banner';

/**
 * Auf die Zielgröße verkleinern (wie resizeImageForUpload in der App).
 * createImageBitmap wendet die EXIF-Drehung an. Kann der Browser das Format
 * nicht dekodieren (HEIC in Chrome), bleibt die Originaldatei.
 */
async function verkleinern(file: File, purpose: ModeratedImagePurpose): Promise<{ blob: Blob; mimeType: string }> {
  try {
    const bitmap = await createImageBitmap(file);
    const kante = MAX_KANTE[purpose];
    const faktor = Math.min(1, kante / Math.max(bitmap.width, bitmap.height));
    const breite = Math.max(1, Math.round(bitmap.width * faktor));
    const hoehe = Math.max(1, Math.round(bitmap.height * faktor));
    const canvas = document.createElement('canvas');
    canvas.width = breite;
    canvas.height = hoehe;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.drawImage(bitmap, 0, 0, breite, hoehe);
    bitmap.close();
    // PNG behält Transparenz (Logos); alles andere wird JPEG.
    const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const quality = purpose === 'ticket_proof' ? 0.9 : 0.85;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mimeType, quality));
    if (!blob) throw new Error('toBlob');
    return { blob, mimeType };
  } catch {
    return { blob: file, mimeType: file.type || 'image/jpeg' };
  }
}

function blobZuBase64(bytes: Uint8Array): string {
  let binaer = '';
  const block = 0x8000;
  for (let i = 0; i < bytes.length; i += block) {
    binaer += String.fromCharCode(...bytes.subarray(i, i + block));
  }
  return btoa(binaer);
}

/** Lädt hoch und liefert die öffentliche URL (bei Tickets den Objektpfad). */
export async function uploadModeratedImage(
  supabase: SupabaseClient,
  file: File,
  bucket: ModeratedImageBucket,
  purpose: ModeratedImagePurpose = purposeForBucket(bucket),
): Promise<string> {
  const { blob, mimeType } = await verkleinern(file, purpose);
  const grenze = purpose === 'ticket_proof' ? MAX_DOCUMENT_BYTES : MAX_IMAGE_BYTES;
  if (blob.size > grenze) {
    throw new Error(`Das Bild ist zu groß (maximal ${Math.round(grenze / 1024 / 1024)} MB).`);
  }
  const imageBase64 = blobZuBase64(new Uint8Array(await blob.arrayBuffer()));

  const { data, error } = await supabase.functions.invoke('upload-moderated-image', {
    body: { bucket, purpose, mimeType, imageBase64 },
  });
  if (error) {
    throw new Error((await fehlertextAusFunktion(error)) ?? MODERATION_UNAVAILABLE);
  }

  const payload = (data ?? {}) as {
    ok?: boolean;
    blocked?: boolean;
    providerConfigured?: boolean;
    publicUrl?: string;
    path?: string;
    error?: string;
  };
  if (payload.ok === false) throw new Error(payload.error?.trim() || UPLOAD_FAILED);
  if (payload.blocked) throw new Error(UPLOAD_BLOCKED);
  if (payload.providerConfigured === false) throw new Error(MODERATION_UNAVAILABLE);
  if (bucket === 'tickets' && payload.path) return payload.path;
  if (payload.publicUrl) return payload.publicUrl;
  throw new Error(UPLOAD_FAILED);
}
