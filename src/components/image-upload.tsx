'use client';

import { useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { Upload, X, Loader2, ImagePlus } from 'lucide-react';

type Bucket = 'avatars' | 'event-images' | 'tickets';

interface ImageUploadProps {
  /** Initial image URL (current avatar/banner/ticket). */
  value?: string | null;
  /** Called with the public URL after upload, or null after clearing. */
  onChange: (url: string | null) => void;
  /** Storage bucket name — must already exist in Supabase. */
  bucket: Bucket;
  /**
   * Subfolder UNDER the user's folder. Files end up at
   *   <bucket>/<userId>/<pathPrefix>/<timestamp>-<random>.<ext>
   * The userId comes first so the standard Supabase RLS pattern
   *   (storage.foldername(name))[1] = auth.uid()::text
   * still matches — putting the prefix before the userId would break it.
   */
  pathPrefix?: string;
  /** Max file size in bytes. Default 5 MB. */
  maxBytes?: number;
  /**
   * Visual variant — `circle` for avatars, `banner` for wide event/profile
   * banners, `square` for everything else.
   */
  variant?: 'circle' | 'banner' | 'square';
  /** Aspect ratio override for the banner variant. Defaults to 21/9. */
  aspect?: string;
  /** Disabled state */
  disabled?: boolean;
}

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Reusable image upload component.
 *
 * Uploads to Supabase Storage and returns the public URL via onChange.
 * Files go to <bucket>/<userId>/<pathPrefix>/<filename> so the standard
 * "users can write into their own folder" RLS pattern works (the userId
 * MUST be the first folder segment, otherwise RLS denies the upload).
 *
 * Renders a clickable area with the current image (or a placeholder),
 * a hover overlay with an upload icon, and a small clear (X) button.
 */
export function ImageUpload({
  value, onChange, bucket, pathPrefix, maxBytes = DEFAULT_MAX_BYTES,
  variant = 'square', aspect, disabled,
}: ImageUploadProps) {
  const { user } = useAuth();
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    if (!user) {
      setError('Du musst angemeldet sein.');
      return;
    }
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setError('Nur JPG, PNG, WEBP oder HEIC erlaubt.');
      return;
    }
    if (file.size > maxBytes) {
      const mb = Math.round(maxBytes / 1024 / 1024);
      setError(`Bild ist zu groß (max. ${mb} MB).`);
      return;
    }

    setUploading(true);

    // Build a unique path under the user's folder. userId comes first
    // so RLS rule (storage.foldername(name))[1] = auth.uid() matches.
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const folder = pathPrefix
      ? `${user.id}/${pathPrefix}`
      : `${user.id}`;
    const path = `${folder}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, file, {
        upsert: false,
        contentType: file.type,
      });

    if (uploadError) {
      setUploading(false);
      setError(uploadError.message);
      return;
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    onChange(data.publicUrl);
    setUploading(false);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    // Reset so picking the same file twice in a row still triggers
    e.target.value = '';
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(null);
    setError(null);
  }

  function openPicker() {
    if (disabled || uploading) return;
    inputRef.current?.click();
  }

  // Variant-specific shape
  const shapeClass =
    variant === 'circle' ? 'rounded-full aspect-square'
    : variant === 'banner' ? 'rounded-2xl'
    : 'rounded-2xl aspect-square';

  const aspectStyle = variant === 'banner' && aspect ? { aspectRatio: aspect } : variant === 'banner' ? { aspectRatio: '21/9' } : undefined;

  return (
    <div>
      <div
        onClick={openPicker}
        className={`group relative ${shapeClass} bg-elevated border border-border-subtle overflow-hidden cursor-pointer hover:border-border-strong transition-colors ${disabled || uploading ? 'cursor-not-allowed' : ''} ${variant === 'circle' ? 'w-24 h-24' : 'w-full'}`}
        style={aspectStyle}
      >
        {value ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
              <Upload size={20} className="text-white" />
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-fg gap-1.5">
            <ImagePlus size={variant === 'circle' ? 22 : 28} strokeWidth={1.5} />
            <span className="text-[11px] font-medium">Bild hochladen</span>
          </div>
        )}

        {/* Loading overlay */}
        {uploading && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <Loader2 size={22} className="animate-spin text-white" />
          </div>
        )}

        {/* Clear button */}
        {value && !uploading && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 backdrop-blur text-white hover:bg-black/80 transition-colors flex items-center justify-center"
            aria-label="Bild entfernen"
          >
            <X size={13} />
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_MIME_TYPES.join(',')}
        onChange={onInputChange}
        className="hidden"
      />

      {error && (
        <p className="text-[11px] text-red-400 mt-1.5">{error}</p>
      )}
    </div>
  );
}
