'use client';

import { use, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { User, Download, ExternalLink, Globe } from 'lucide-react';

const APP_STORE_URL = 'https://apps.apple.com/app/occuro/id6760317905';
const APP_SCHEME = 'occuro://';

interface PublicProfile {
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  user_type: string | null;
}

export default function PublicProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && user) {
      router.replace(`/app/profile/${slug}`);
      return;
    }
  }, [authLoading, user, router, slug]);

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
      const query = isUuid
        ? supabase.from('profiles').select('full_name, username, avatar_url, bio, user_type').eq('id', slug).maybeSingle()
        : supabase.from('profiles').select('full_name, username, avatar_url, bio, user_type').ilike('username', slug).maybeSingle();
      const { data } = await query;
      setProfile(data as PublicProfile | null);
      setLoading(false);
    }
    load();
  }, [slug]);

  if (authLoading || (!authLoading && user)) {
    return <div className="min-h-screen bg-black flex items-center justify-center"><div className="w-8 h-8 border-2 border-white/70 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 to-black flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8 text-center">
        <div className="space-y-4">
          {loading ? (
            <div className="w-20 h-20 rounded-full bg-gray-800 animate-pulse mx-auto" />
          ) : profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="w-20 h-20 rounded-full mx-auto object-cover border-2 border-white/20" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-white/10 mx-auto flex items-center justify-center">
              <User size={32} className="text-gray-400" />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-white">
              {loading ? '...' : profile?.full_name || 'Profil'}
            </h1>
            {profile?.username && (
              <p className="text-gray-400 text-sm mt-1">@{profile.username}</p>
            )}
            {profile?.bio && (
              <p className="text-gray-400 text-sm mt-3 leading-relaxed">{profile.bio}</p>
            )}
          </div>
        </div>

        <div className="space-y-3 pt-4">
          <a
            href={`${APP_SCHEME}profile/${slug}`}
            className="flex items-center justify-center gap-2 w-full py-3.5 px-6 bg-[#F4F4F5] hover:bg-[#E4E4E7] text-[#111114] font-semibold rounded-2xl transition-colors"
          >
            <ExternalLink size={18} />
            In der App öffnen
          </a>
          <a
            href={`/app/profile/${slug}`}
            className="flex items-center justify-center gap-2 w-full py-3 px-6 border border-white/25 text-gray-300 hover:text-white hover:border-white/50 hover:bg-white/5 font-medium rounded-2xl transition-colors text-sm"
          >
            <Globe size={16} />
            Im Browser öffnen
          </a>
          <a
            href={APP_STORE_URL}
            className="flex items-center justify-center gap-2 w-full py-3 px-6 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 font-medium rounded-2xl transition-colors text-sm"
          >
            <Download size={16} />
            App noch nicht installiert? Herunterladen
          </a>
        </div>

        <div className="pt-6">
          <p className="text-gray-600 text-xs">occuro — Events entdecken, Momente teilen.</p>
        </div>
      </div>
    </div>
  );
}
