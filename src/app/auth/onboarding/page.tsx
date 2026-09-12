'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Building2, Camera, Check, ChevronLeft, ChevronRight, Loader2, LocateFixed, UserRound,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { OutNowWordmark } from '@/components/outnow-wordmark';
import { LocationAutocomplete } from '@/components/location-autocomplete';
import { TAXONOMY_CATEGORIES, categoryLabel } from '@/lib/taxonomy';
import {
  USERNAME_HINT, USERNAME_INVALID, USERNAME_REQUIRED, USERNAME_TAKEN,
  isUsernameUniqueViolation, isValidUsername, normalizeUsernameInput,
} from '@/lib/username';
import {
  MODERATION_BLOCKED_TEXT, containsBlockedContent, enforceRemoteTextModeration, mapModerationError,
} from '@/lib/moderation';
import { uploadModeratedImage } from '@/lib/uploads';
import { brauchtEinrichtung, zielFuerProfil } from '@/lib/onboarding';
import type { Organization, Profile } from '@/types/occuro';

type Kontotyp = 'individual' | 'organization';
type Ort = { label: string; lat: number | null; lng: number | null };
type Vorschlag = { id: string; username: string | null; full_name: string | null; avatar_url: string | null };

const BIO_MAX = 200;
const MAX_INTERESSEN = 3;
const inputClass =
  'w-full px-4 py-3 rounded-xl border border-border-subtle bg-input-bg text-foreground text-sm placeholder:text-muted-fg/60 focus:outline-none focus:ring-2 focus:ring-primary-bg/10 focus:border-primary-bg/30 transition-all duration-200';
const primaerKnopf =
  'flex-1 inline-flex items-center justify-center gap-1.5 py-3.5 rounded-full text-sm font-semibold bg-primary-bg text-primary-text disabled:opacity-50 transition-opacity';
const sekundaerKnopf =
  'flex-1 inline-flex items-center justify-center gap-1.5 py-3.5 rounded-full text-sm font-semibold border border-border-strong hover:bg-elevated transition-colors';

/**
 * Einrichtung nach der Registrierung — Port von UserTypeSelectionPage und
 * ProfileSetupPage der App: erst der Kontotyp (dauerhaft), dann für
 * Personen vier Schritte (Benutzername, Interessen, Bild/Ort/Bio, Freunde),
 * für Veranstalter ein Formular. Die Layouts von /app und /organizer
 * schicken jedes Konto hierher, dessen Einrichtung offen ist.
 *
 * Interessen kommen aus der aktuellen Kategorienachse (taxonomy.ts), damit
 * sie zu den Kategorien der Events passen.
 */
export default function OnboardingPage() {
  const supabase = createClient();
  const { user, profile, organization, loading, signOut } = useAuth();
  const [typ, setTyp] = useState<Kontotyp | null>(null);
  const [typSpeichert, setTypSpeichert] = useState(false);
  const [typFehler, setTypFehler] = useState('');

  const gespeicherterTyp = profile?.user_type ?? null;
  useEffect(() => {
    if (gespeicherterTyp) setTyp(gespeicherterTyp === 'organization' ? 'organization' : 'individual');
  }, [gespeicherterTyp]);

  // Nicht angemeldet → Login; schon eingerichtet → direkt in die App.
  useEffect(() => {
    if (loading) return;
    if (!user) {
      window.location.replace('/auth/login');
      return;
    }
    if (profile && !brauchtEinrichtung(profile)) window.location.replace(zielFuerProfil(profile));
  }, [loading, user, profile]);

  const sicherstellenOrganisation = async (felder: {
    name: string;
    bio?: string | null;
    location?: string | null;
    avatar_url?: string | null;
  }) => {
    if (!user) return;
    const { data: vorhanden, error: suchFehler } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id)
      .maybeSingle();
    if (suchFehler) throw suchFehler;
    if (vorhanden) {
      const { error } = await supabase.from('organizations').update(felder).eq('id', vorhanden.id);
      if (error) throw mapModerationError(error);
      return;
    }
    const { error } = await supabase
      .from('organizations')
      .insert({ owner_id: user.id, bio: '', location: '', avatar_url: null, category: null, ...felder });
    // 23505: Zeile kam zeitgleich aus einem anderen Tab — dann ist sie da.
    if (error && error.code !== '23505') throw mapModerationError(error);
  };

  const typWaehlen = async (gewaehlt: Kontotyp) => {
    if (!user || typSpeichert) return;
    setTypSpeichert(true);
    setTypFehler('');
    try {
      // Einmalige Wahl: nur schreiben, solange noch keiner gesetzt ist.
      const { data, error } = await supabase
        .from('profiles')
        .update({ user_type: gewaehlt })
        .eq('id', user.id)
        .is('user_type', null)
        .select('user_type')
        .maybeSingle();
      if (error) throw error;
      let endgueltig = (data?.user_type as string | null | undefined) ?? null;
      if (!endgueltig) {
        const { data: aktuell } = await supabase.from('profiles').select('user_type').eq('id', user.id).maybeSingle();
        endgueltig = (aktuell?.user_type as string | null | undefined) ?? null;
      }
      if (!endgueltig) throw new Error('Kontotyp wurde nicht gespeichert');
      const effektiv: Kontotyp = endgueltig === 'organization' ? 'organization' : 'individual';
      if (effektiv === 'organization') {
        await sicherstellenOrganisation({ name: profile?.full_name?.trim() || 'Veranstalter' });
      }
      setTyp(effektiv);
    } catch (err) {
      console.warn('[onboarding] Kontotyp', err);
      setTypFehler('Das hat nicht geklappt. Bitte versuche es erneut.');
    } finally {
      setTypSpeichert(false);
    }
  };

  if (loading || !user || !profile) {
    return (
      <div className="flex-1 flex items-center justify-center py-24">
        <Loader2 size={22} className="animate-spin text-muted-fg" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex justify-center px-4 py-10">
      <div className="w-full max-w-[440px] animate-fade-in">
        <div className="flex justify-center mb-8">
          <OutNowWordmark size={24} layout="stacked" />
        </div>

        {!typ ? (
          <TypWahl onSelect={typWaehlen} speichert={typSpeichert} fehler={typFehler} />
        ) : (
          <Einrichtung
            typ={typ}
            profile={profile}
            organization={organization}
            userId={user.id}
            sicherstellenOrganisation={sicherstellenOrganisation}
          />
        )}

        <div className="text-center mt-10">
          <button
            type="button"
            onClick={() => void signOut()}
            className="text-[12.5px] text-muted-fg underline underline-offset-2 hover:text-foreground transition-colors"
          >
            Abmelden
          </button>
        </div>
      </div>
    </div>
  );
}

function TypWahl({
  onSelect, speichert, fehler,
}: { onSelect: (typ: Kontotyp) => void; speichert: boolean; fehler: string }) {
  const optionen: { typ: Kontotyp; icon: React.ReactNode; titel: string; text: string }[] = [
    {
      typ: 'individual',
      icon: <UserRound size={26} strokeWidth={1.6} />,
      titel: 'Einzelperson',
      text: 'Ich möchte Events entdecken, Erlebnisse erstellen und mich mit Freunden vernetzen.',
    },
    {
      typ: 'organization',
      icon: <Building2 size={26} strokeWidth={1.6} />,
      titel: 'Veranstalter',
      text: 'Ich vertrete einen Veranstalter, ein Unternehmen oder eine Gruppe und möchte professionelle Events veranstalten.',
    },
  ];
  return (
    <div className="space-y-7">
      <div className="text-center">
        <h1 className="text-[26px] font-heading font-bold tracking-tight">Wähle deinen Account-Typ</h1>
        <p className="mt-2 text-sm text-muted-fg">Bist du Veranstalter oder Einzelperson?</p>
      </div>
      {fehler && <div className="p-3.5 rounded-xl bg-destructive/8 text-destructive text-[13px] text-center">{fehler}</div>}
      <div className="space-y-3">
        {optionen.map((o) => (
          <button
            key={o.typ}
            type="button"
            disabled={speichert}
            onClick={() => onSelect(o.typ)}
            className="w-full rounded-[20px] border border-border-strong bg-surface p-6 flex flex-col items-center gap-3 text-center hover:bg-elevated active:scale-[0.99] disabled:opacity-60 transition"
          >
            <span className="w-14 h-14 rounded-2xl bg-elevated flex items-center justify-center">{o.icon}</span>
            <span className="text-base font-semibold">{o.titel}</span>
            <span className="text-[12.5px] leading-relaxed text-muted-fg">{o.text}</span>
          </button>
        ))}
      </div>
      <p className="text-center text-[12px] font-medium text-muted-fg">
        {speichert ? 'Wird gespeichert…' : 'Diese Auswahl ist dauerhaft und kann später nicht geändert werden.'}
      </p>
    </div>
  );
}

function Einrichtung({
  typ, profile, organization, userId, sicherstellenOrganisation,
}: {
  typ: Kontotyp;
  profile: Profile;
  organization: Organization | null;
  userId: string;
  sicherstellenOrganisation: (felder: { name: string; bio?: string | null; location?: string | null; avatar_url?: string | null }) => Promise<void>;
}) {
  const supabase = createClient();
  const istVeranstalter = typ === 'organization';
  const gesamt = istVeranstalter ? 1 : 4;
  const [schritt, setSchritt] = useState(1);
  const [username, setUsername] = useState(profile.username ?? '');
  const [usernameFehler, setUsernameFehler] = useState('');
  const [pruefeName, setPruefeName] = useState(false);
  const [interessen, setInteressen] = useState<string[]>(
    (profile.interests ?? []).filter((i) => (TAXONOMY_CATEGORIES as readonly string[]).includes(i)).slice(0, MAX_INTERESSEN),
  );
  // BESTEHENDE VERANSTALTER NICHT LEERSCHREIBEN. Konten, die vor dieser
  // Einrichtung angelegt wurden, pflegen Beschreibung, Ort und Logo oft nur in
  // der organizations-Zeile (Profil-Seite im Veranstalterbereich). Die Felder
  // starten deshalb mit diesen Werten, und der Abschluss schreibt unten nur,
  // was nicht leer ist.
  const [bio, setBio] = useState(profile.bio || organization?.bio || '');
  const vorbelegterOrt = useRef(profile.location || organization?.location || '');
  const [ort, setOrt] = useState<Ort>({
    label: vorbelegterOrt.current,
    lat: profile.lat ?? null,
    lng: profile.lng ?? null,
  });
  const [ortFehler, setOrtFehler] = useState('');
  const [ortLaedt, setOrtLaedt] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatar_url || organization?.avatar_url || null);
  const [avatarLaedt, setAvatarLaedt] = useState(false);
  const [avatarFehler, setAvatarFehler] = useState('');
  const [vorschlaege, setVorschlaege] = useState<Vorschlag[] | null>(null);
  const [angefragt, setAngefragt] = useState<Set<string>>(new Set());
  const [speichert, setSpeichert] = useState(false);
  const [fehler, setFehler] = useState('');
  const dateiRef = useRef<HTMLInputElement>(null);

  // Ein vorhandener Name (von Google oder aus der bestehenden
  // Veranstalter-Zeile) hat Vorrang vor dem Benutzernamen — sonst würde er
  // hier überschrieben. Der Platzhalter aus der Typwahl zählt nicht.
  const orgName = organization?.name?.trim() ?? '';
  const vorhandenerName =
    profile.full_name?.trim() || (orgName && orgName !== 'Veranstalter' && orgName !== 'Organization' ? orgName : '');
  const normalisiert = normalizeUsernameInput(username);
  const usernameGueltig = isValidUsername(normalisiert);

  // Freundesvorschläge erst im vierten Schritt laden. Nur Personen: Eine
  // Anfrage an ein Veranstalterkonto taucht in keiner Freundesliste auf.
  useEffect(() => {
    if (istVeranstalter || schritt !== 4 || vorschlaege !== null) return;
    let aktiv = true;
    void (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .neq('id', userId)
        .not('full_name', 'is', null)
        .or('user_type.eq.individual,user_type.is.null')
        .order('created_at', { ascending: false })
        .limit(15);
      if (!aktiv) return;
      const liste = ((data ?? []) as Vorschlag[]).filter((p) => (p.full_name ?? '').trim() || p.username);
      liste.sort((a, b) =>
        (a.full_name ?? a.username ?? '').localeCompare(b.full_name ?? b.username ?? '', 'de', { sensitivity: 'base' }),
      );
      setVorschlaege(liste);
    })();
    return () => {
      aktiv = false;
    };
  }, [istVeranstalter, schritt, vorschlaege, supabase, userId]);

  const benutzernamePruefen = async (): Promise<string | null> => {
    setUsernameFehler('');
    if (!normalisiert) {
      setUsernameFehler(USERNAME_REQUIRED);
      return null;
    }
    if (!usernameGueltig) {
      setUsernameFehler(USERNAME_INVALID);
      return null;
    }
    if (containsBlockedContent(normalisiert)) {
      setUsernameFehler(MODERATION_BLOCKED_TEXT);
      return null;
    }
    if (profile.username && profile.username.toLowerCase() === normalisiert) return normalisiert;
    setPruefeName(true);
    try {
      const { data: vergeben, error } = await supabase.rpc('is_username_taken', { p_username: normalisiert });
      if (!error && vergeben === true) {
        setUsernameFehler(USERNAME_TAKEN);
        return null;
      }
      return normalisiert;
    } finally {
      setPruefeName(false);
    }
  };

  const bildWaehlen = async (datei: File) => {
    setAvatarFehler('');
    setAvatarLaedt(true);
    try {
      setAvatarUrl(await uploadModeratedImage(supabase, datei, 'avatars', 'avatar'));
    } catch (err) {
      setAvatarFehler(err instanceof Error ? err.message : 'Bild konnte nicht gespeichert werden.');
    } finally {
      setAvatarLaedt(false);
    }
  };

  // Aktuellen Standort nur auf STADT-Ebene übernehmen (zoom=10 liefert den
  // Ort und dessen Mittelpunkt) — wie die App, die nie GPS-genaue
  // Koordinaten ins Profil schreibt.
  const standortVerwenden = () => {
    if (!('geolocation' in navigator)) {
      setOrtFehler('Standort konnte nicht ermittelt werden.');
      return;
    }
    setOrtLaedt(true);
    setOrtFehler('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&addressdetails=1&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`,
            { headers: { 'Accept-Language': 'de' } },
          );
          const data = (await res.json()) as { lat?: string; lon?: string; address?: Record<string, string> };
          const a = data.address ?? {};
          const primaer = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? a.state ?? null;
          const sekundaer =
            a.state && a.state !== primaer ? a.state : a.country && a.country !== primaer ? a.country : null;
          const label = [primaer, sekundaer].filter(Boolean).join(', ');
          const lat = Number(data.lat);
          const lng = Number(data.lon);
          if (!label || !Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('kein Ort');
          setOrt({ label, lat, lng });
        } catch {
          setOrtFehler('Standort konnte nicht ermittelt werden.');
        } finally {
          setOrtLaedt(false);
        }
      },
      (err) => {
        setOrtLaedt(false);
        setOrtFehler(err.code === err.PERMISSION_DENIED ? 'Standort-Zugriff wurde verweigert.' : 'Standort konnte nicht ermittelt werden.');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  };

  const ortGueltig = () => {
    if (!ort.label.trim()) return true;
    if (ort.lat != null && ort.lng != null) return true;
    // Unverändert übernommener Ort eines Bestandskontos — nicht erneut
    // zur Auswahl aus den Vorschlägen zwingen.
    if (vorbelegterOrt.current && ort.label.trim() === vorbelegterOrt.current.trim()) return true;
    setOrtFehler('Bitte wähle einen Ort aus den Vorschlägen aus.');
    return false;
  };

  const abschliessen = async () => {
    if (speichert) return;
    setFehler('');
    const name = await benutzernamePruefen();
    if (!name) {
      if (!istVeranstalter) setSchritt(1);
      return;
    }
    if (!ortGueltig()) {
      if (!istVeranstalter) setSchritt(3);
      return;
    }
    const anzeigename = vorhandenerName || name;
    const ortText = ort.label.trim();
    const bioText = bio.trim();
    if ([anzeigename, bioText, ortText].some((t) => containsBlockedContent(t))) {
      setFehler(MODERATION_BLOCKED_TEXT);
      return;
    }

    setSpeichert(true);
    try {
      // Kontext 'sign_up' und nicht 'profile_update': Nur bei der
      // Registrierung laesst die Pruefung durch, wenn der Dienst nicht
      // erreichbar ist (src/lib/moderation.ts). Am 12.09.2026 antwortete
      // content-moderation mit 500, weil der Aufruf beim Anbieter scheiterte —
      // und niemand kam mehr durch den letzten Schritt der Einrichtung. Die
      // lokale Wortliste oben prueft weiterhin, und jede spaetere Aenderung am
      // Profil laeuft wieder gegen die scharfe Pruefung.
      await enforceRemoteTextModeration(supabase, [anzeigename, name, bioText, ortText], 'sign_up');

      // Freundschaftsanfragen sind eine Zugabe — scheitern sie, soll das die
      // Einrichtung nicht aufhalten.
      if (!istVeranstalter && angefragt.size > 0) {
        const rows = [...angefragt].map((friendId) => ({ user_id: userId, friend_id: friendId, status: 'pending' }));
        const { error: friendError } = await supabase.from('friendships').upsert(rows, { onConflict: 'user_id,friend_id' });
        if (friendError) console.warn('[onboarding] Freundschaftsanfragen', friendError);
      }

      const patch: Partial<Profile> = {
        full_name: anzeigename,
        username: name,
        bio: bioText || null,
        location: ortText || null,
        ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
        ...(!istVeranstalter ? { interests: interessen } : {}),
        ...(ort.lat != null && ort.lng != null && ortText ? { lat: ort.lat, lng: ort.lng } : {}),
      };
      const { data: neu, error } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', userId)
        .select('*')
        .single();
      if (error) {
        if (isUsernameUniqueViolation(error)) throw new Error(USERNAME_TAKEN);
        throw mapModerationError(error);
      }

      if (istVeranstalter) {
        await sicherstellenOrganisation({
          name: anzeigename,
          ...(bioText ? { bio: bioText } : {}),
          ...(ortText ? { location: ortText } : {}),
          ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
        });
      }
      window.location.href = zielFuerProfil(neu as Profile);
    } catch (err) {
      setFehler(err instanceof Error && err.message ? err.message : 'Profil konnte nicht gespeichert werden. Bitte versuche es erneut.');
      setSpeichert(false);
    }
  };

  const avatarFeld = (beschriftung: string) => (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => dateiRef.current?.click()}
        disabled={avatarLaedt}
        className="relative w-24 h-24 rounded-full bg-elevated border border-border-strong overflow-hidden flex items-center justify-center"
        aria-label={beschriftung}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <UserRound size={34} strokeWidth={1.4} className="text-muted-fg" />
        )}
        {avatarLaedt && (
          <span className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <Loader2 size={20} className="animate-spin text-white" />
          </span>
        )}
      </button>
      <span className="-mt-8 ml-16 w-8 h-8 rounded-full bg-primary-bg text-primary-text flex items-center justify-center pointer-events-none">
        <Camera size={15} />
      </span>
      <span className="text-[12px] text-muted-fg">{beschriftung}</span>
      {avatarFehler && <span className="text-[12px] text-destructive text-center">{avatarFehler}</span>}
      <input
        ref={dateiRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        className="hidden"
        onChange={(e) => {
          const datei = e.target.files?.[0];
          if (datei) void bildWaehlen(datei);
          e.target.value = '';
        }}
      />
    </div>
  );

  const usernameFeld = (
    <div className="space-y-1.5">
      <label htmlFor="username" className="block text-[13px] font-medium text-foreground/70">
        Benutzername <span className="text-destructive">*</span>
      </label>
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted-fg">@</span>
        <input
          id="username"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={username}
          onChange={(e) => {
            setUsername(normalizeUsernameInput(e.target.value));
            setUsernameFehler('');
          }}
          className={`${inputClass} pl-8`}
          placeholder="deinname"
        />
      </div>
      <p className="text-[12px] text-muted-fg">{USERNAME_HINT}</p>
      {(usernameFehler || (normalisiert && !usernameGueltig)) && (
        <p className="text-[12px] text-destructive">{usernameFehler || USERNAME_INVALID}</p>
      )}
    </div>
  );

  const ortFeld = (
    <div className="space-y-1.5">
      <span className="block text-[13px] font-medium text-foreground/70">Ort</span>
      <LocationAutocomplete
        value={ort.label}
        onChange={(v) => {
          setOrt(v);
          setOrtFehler('');
        }}
        placeholder="z. B. Berlin, Deutschland"
      />
      <button
        type="button"
        onClick={standortVerwenden}
        disabled={ortLaedt}
        className="w-full mt-1 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border-subtle bg-elevated text-[13px] font-medium hover:border-border-strong disabled:opacity-60 transition-colors"
      >
        {ortLaedt ? <Loader2 size={15} className="animate-spin" /> : <LocateFixed size={15} />}
        {ortLaedt ? 'Standort wird ermittelt…' : 'Aktuellen Standort verwenden'}
      </button>
      <p className="text-[12px] text-muted-fg">
        Wähle einen Ort aus den Vorschlägen oder nutze deinen aktuellen Standort – damit der Ort wirklich existiert.
      </p>
      {ortFehler && <p className="text-[12px] text-destructive">{ortFehler}</p>}
    </div>
  );

  const bioFeld = (beschriftung: string, platzhalter: string) => (
    <div className="space-y-1.5">
      <label htmlFor="bio" className="block text-[13px] font-medium text-foreground/70">{beschriftung}</label>
      <textarea
        id="bio"
        value={bio}
        maxLength={BIO_MAX}
        onChange={(e) => setBio(e.target.value)}
        rows={4}
        className={`${inputClass} resize-none`}
        placeholder={platzhalter}
      />
      <p className="text-[12px] text-muted-fg text-right">{bio.length}/{BIO_MAX} Zeichen</p>
    </div>
  );

  const fehlerBox = fehler ? (
    <div className="p-3.5 rounded-xl bg-destructive/8 text-destructive text-[13px] text-center">{fehler}</div>
  ) : null;

  if (istVeranstalter) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h1 className="text-[24px] font-heading font-bold tracking-tight">Erstelle dein Veranstalterprofil</h1>
          <p className="mt-2 text-sm text-muted-fg">Erzähle anderen von dir als Veranstalter</p>
        </div>
        {avatarFeld('Logo hochladen')}
        {usernameFeld}
        {ortFeld}
        {bioFeld('Über den Veranstalter', 'Erzähle uns von dir als Veranstalter…')}
        {fehlerBox}
        <div className="flex">
          <button
            type="button"
            onClick={abschliessen}
            disabled={speichert || avatarLaedt || pruefeName || !usernameGueltig}
            className={primaerKnopf}
          >
            {speichert ? 'Wird gespeichert…' : 'Profil erstellen'}
          </button>
        </div>
        <p className="text-center text-[12px] text-muted-fg">
          Damit du öffentliche Events veranstalten kannst, verifizierst du dich danach als Veranstalter.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-2">
        <div className="flex gap-2">
          {Array.from({ length: gesamt }, (_, i) => i + 1).map((s) => (
            <span
              key={s}
              className={`h-2 rounded-full transition-all ${s === schritt ? 'w-8 bg-foreground' : s < schritt ? 'w-2 bg-foreground' : 'w-2 bg-muted'}`}
            />
          ))}
        </div>
        <span className="text-[12px] text-muted-fg">Schritt {schritt} von {gesamt}</span>
      </div>

      {schritt === 1 && (
        <>
          <div className="text-center">
            <h1 className="text-[24px] font-heading font-bold tracking-tight">Wie heißt du?</h1>
            <p className="mt-2 text-sm text-muted-fg">Lass uns mit den Basics starten</p>
          </div>
          {usernameFeld}
          <div className="flex">
            <button
              type="button"
              disabled={!usernameGueltig || pruefeName}
              onClick={async () => {
                if (await benutzernamePruefen()) setSchritt(2);
              }}
              className={primaerKnopf}
            >
              {pruefeName ? 'Prüfe…' : 'Weiter'} <ChevronRight size={17} />
            </button>
          </div>
        </>
      )}

      {schritt === 2 && (
        <>
          <div className="text-center">
            <h1 className="text-[24px] font-heading font-bold tracking-tight">Was interessiert dich?</h1>
            <p className="mt-2 text-sm text-muted-fg">Wähle bis zu 3 Kategorien (optional)</p>
          </div>
          <div>
            <p className="text-[13px] font-medium mb-3">Kategorien ({interessen.length}/{MAX_INTERESSEN})</p>
            <div className="flex flex-wrap gap-2">
              {TAXONOMY_CATEGORIES.map((kategorie) => {
                const gewaehlt = interessen.includes(kategorie);
                const gesperrt = !gewaehlt && interessen.length >= MAX_INTERESSEN;
                return (
                  <button
                    key={kategorie}
                    type="button"
                    disabled={gesperrt}
                    onClick={() =>
                      setInteressen((vorher) =>
                        gewaehlt ? vorher.filter((i) => i !== kategorie) : [...vorher, kategorie],
                      )
                    }
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border text-[12.5px] font-medium transition-colors ${
                      gewaehlt
                        ? 'bg-primary-bg text-primary-text border-primary-bg'
                        : 'bg-surface border-border-strong hover:bg-elevated disabled:opacity-40 disabled:hover:bg-surface'
                    }`}
                  >
                    {gewaehlt && <Check size={13} />}
                    {categoryLabel(kategorie)}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setSchritt(1)} className={sekundaerKnopf}>
              <ChevronLeft size={17} /> Zurück
            </button>
            <button type="button" onClick={() => setSchritt(3)} className={primaerKnopf}>
              Weiter <ChevronRight size={17} />
            </button>
          </div>
        </>
      )}

      {schritt === 3 && (
        <>
          <div className="text-center">
            <h1 className="text-[24px] font-heading font-bold tracking-tight">Vervollständige dein Profil</h1>
            <p className="mt-2 text-sm text-muted-fg">Füge ein Foto hinzu und erzähle mehr (optional)</p>
          </div>
          {avatarFeld('Profilbild hochladen')}
          {ortFeld}
          {bioFeld('Über mich', 'Erzähl uns etwas über dich und deine Interessen…')}
          {fehlerBox}
          <div className="flex gap-3">
            <button type="button" onClick={() => setSchritt(2)} className={sekundaerKnopf}>
              <ChevronLeft size={17} /> Zurück
            </button>
            <button
              type="button"
              disabled={avatarLaedt}
              onClick={() => {
                if (ortGueltig()) setSchritt(4);
              }}
              className={primaerKnopf}
            >
              Weiter <ChevronRight size={17} />
            </button>
          </div>
          <button
            type="button"
            onClick={abschliessen}
            disabled={speichert || avatarLaedt}
            className="w-full text-center text-[12.5px] text-muted-fg hover:text-foreground disabled:opacity-60 transition-colors"
          >
            {speichert ? 'Wird gespeichert…' : 'Jetzt überspringen'}
          </button>
        </>
      )}

      {schritt === 4 && (
        <>
          <div className="text-center">
            <h1 className="text-[24px] font-heading font-bold tracking-tight">Finde Freunde</h1>
            <p className="mt-2 text-sm text-muted-fg">Entdecke Personen auf OutNow und vernetze dich direkt.</p>
          </div>
          {vorschlaege === null ? (
            <p className="text-center text-sm text-muted-fg py-8">Vorschläge werden geladen…</p>
          ) : vorschlaege.length === 0 ? (
            <p className="text-center text-sm text-muted-fg py-8">Noch keine Vorschläge verfügbar.</p>
          ) : (
            <ul className="space-y-2">
              {vorschlaege.map((person) => {
                const gesendet = angefragt.has(person.id);
                return (
                  <li
                    key={person.id}
                    className="flex items-center gap-3 px-3.5 py-2.5 rounded-2xl border border-border-subtle bg-surface"
                  >
                    <span className="w-11 h-11 rounded-full bg-elevated overflow-hidden flex items-center justify-center shrink-0">
                      {person.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={person.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <UserRound size={20} className="text-muted-fg" />
                      )}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold truncate">{person.full_name || person.username}</span>
                      {person.username && <span className="block text-[12px] text-muted-fg truncate">@{person.username}</span>}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setAngefragt((vorher) => {
                          const neu = new Set(vorher);
                          if (neu.has(person.id)) neu.delete(person.id);
                          else neu.add(person.id);
                          return neu;
                        })
                      }
                      className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-colors ${
                        gesendet ? 'bg-elevated text-muted-fg' : 'bg-primary-bg text-primary-text'
                      }`}
                    >
                      {gesendet ? 'Angefragt' : 'Hinzufügen'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {fehlerBox}
          <div className="flex gap-3">
            <button type="button" onClick={() => setSchritt(3)} className={sekundaerKnopf}>
              <ChevronLeft size={17} /> Zurück
            </button>
            <button type="button" onClick={abschliessen} disabled={speichert} className={primaerKnopf}>
              {speichert ? 'Wird gespeichert…' : 'Profil erstellen'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
