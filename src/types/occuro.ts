export type UserType = 'individual' | 'organization' | 'artist';
export type EventVisibility = 'public' | 'private';
export type EventStatus = 'interested' | 'confirmed' | 'attended' | 'not-interested' | 'saved' | null;
export type InvitationStatus = 'pending' | 'accepted' | 'declined';
export type FriendshipStatus = 'pending' | 'accepted';
export type TicketVerificationStatus = 'pending' | 'approved' | 'rejected';

export interface Profile {
  id: string;
  full_name: string;
  username?: string | null;
  bio?: string | null;
  location?: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  birth_date?: string | null;
  website?: string | null;
  instagram?: string | null;
  user_type?: UserType | null;
  is_admin?: boolean;
  interests?: string[] | null;
  event_types?: string[] | null;
  lat?: number | null;
  lng?: number | null;
  notification_radius_km?: number | null;
}

export interface Organization {
  id: string;
  owner_id: string;
  name: string;
  bio?: string | null;
  location?: string | null;
  avatar_url?: string | null;
  category?: string | null;
  verified?: boolean;
  follower_count?: number;
}

export interface Event {
  id: string;
  title: string;
  slogan?: string | null;
  date: string;
  end_date?: string | null;
  time: string;
  end_time?: string | null;
  location: string;
  description: string;
  category: string;
  subcategory: string;
  event_type: string;
  max_participants: number;
  interested_count: number;
  confirmed_count: number;
  organizer_profile_id: string | null;
  organizer_org_id: string | null;
  organizer_artist_id?: string | null;
  organizer_name?: string | null;
  image_url?: string | null;
  banner_url?: string | null;
  gallery_urls?: string[] | null;
  latitude: number | null;
  longitude: number | null;
  is_completed?: boolean | null;
  website?: string | null;
  ticket_shop_url?: string | null;
  visibility: EventVisibility;
  requires_ticket?: boolean | null;
  available_tickets?: number | null;
  chat_enabled?: boolean;
  source?: 'user' | 'ai_discovered';
  created_at?: string | null;
}

export interface Friend {
  id: string;
  name: string;
  avatar?: string | null;
  bio?: string | null;
  location?: string | null;
}

export interface TicketSubmission {
  event_id: string;
  user_id: string;
  user_name: string;
  user_avatar?: string | null;
  ticket_image_url?: string | null;
  verification_status: TicketVerificationStatus;
  rejection_reason?: string | null;
  reviewed_at?: string | null;
  created_at?: string | null;
  scanned_at?: string | null;
}
