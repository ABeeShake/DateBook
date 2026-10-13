export type Category = 'Food' | 'Activity' | 'Event' | 'Outdoors' | 'Other';
export type IdeaStatus = 'saved' | 'planned' | 'done';
export type Idea = {
  id: string;
  couple_id: string;
  created_by: string;
  title: string;
  venue: string | null;
  source_url: string | null;
  canonical_url: string | null;
  category: Category;
  notes: string | null;
  price_note: string | null;
  status: IdeaStatus;
  created_at: string;
};
export type DatePlan = {
  id: string;
  couple_id: string;
  idea_id: string;
  scheduled_start: string;
  scheduled_end: string;
  created_by: string;
  created_at: string;
};
export type Interest = { idea_id: string; user_id: string; interested: boolean };
export type Member = { couple_id: string; user_id: string; display_name: string };
export type Couple = { id: string; invite_code: string; name: string };
export const CATEGORIES: Category[] = ['Food', 'Activity', 'Event', 'Outdoors', 'Other'];
