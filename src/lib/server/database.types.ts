import type { Listing, ListingPage } from '@/lib/marketplace';

// This contract mirrors the SQL migrations. Update both when the schema changes.
type ListingRow = Listing & { updated_at: string };
type ListingInsert = Omit<ListingRow, 'id' | 'created_at' | 'updated_at'> &
  Partial<Pick<ListingRow, 'id' | 'created_at' | 'updated_at'>>;
export type MessageRow = {
  id: string;
  listing_id: string;
  buyer_email: string;
  seller_email: string;
  message: string;
  created_at: string;
  email_sent_at: string | null;
  email_send_started_at: string | null;
};
type MessageInsert = Omit<
  MessageRow,
  'id' | 'created_at' | 'email_sent_at' | 'email_send_started_at'
> &
  Partial<Pick<MessageRow, 'id' | 'created_at' | 'email_sent_at' | 'email_send_started_at'>>;
type Table<Row, Insert> = { Row: Row; Insert: Insert; Update: Partial<Insert>; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      listings: Table<ListingRow, ListingInsert>;
      messages: Table<MessageRow, MessageInsert>;
      request_limits: Table<
        { bucket: string; window_started: string; hits: number },
        { bucket: string; window_started: string; hits: number }
      >;
    };
    Views: Record<never, never>;
    Functions: {
      browse_listings: {
        Args: {
          category_filter?: string;
          search_term?: string;
          page_offset?: number;
          page_size?: number;
        };
        Returns: ListingPage;
      };
      consume_rate_limit: { Args: { bucket_key: string; maximum_hits: number }; Returns: boolean };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
