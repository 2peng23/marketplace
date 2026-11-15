import type { Listing, ListingPage } from '@/lib/marketplace';

// This contract mirrors the SQL migrations. Update both when the schema changes.
type ListingRow = Listing & {
  updated_at: string;
  seller_id: string | null;
  reserved_order_id: string | null;
};
type ListingDefaults =
  'id' | 'created_at' | 'updated_at' | 'seller_id' | 'reserved_order_id' | 'sale_status';
type ListingInsert = Omit<ListingRow, ListingDefaults> & Partial<Pick<ListingRow, ListingDefaults>>;
export type SellerRow = {
  id: string;
  email: string;
  stripe_account_id: string | null;
  stripe_country: string | null;
  stripe_payment_status: string;
  updated_at: string;
};
export type OrderRow = {
  id: string;
  listing_id: string;
  seller_id: string;
  buyer_token_hash: string;
  title: string;
  currency: 'usd';
  amount_cents: number;
  platform_fee_cents: number;
  stripe_account_id: string;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  status: 'creating' | 'pending' | 'paid' | 'expired' | 'cancelled' | 'failed';
  expires_at: string;
  created_at: string;
  paid_at: string | null;
  updated_at: string;
};
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
      sellers: Table<SellerRow, Pick<SellerRow, 'id' | 'email'> & Partial<SellerRow>>;
      orders: Table<OrderRow, OrderRow>;
      stripe_webhook_events: Table<
        { id: string; event_type: string; processed_at: string },
        { id: string; event_type: string }
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
      claim_listing: {
        Args: { listing_identifier: string; seller_identifier: string };
        Returns: undefined;
      };
      reserve_order: {
        Args: { listing_identifier: string; order_identifier: string; buyer_hash: string };
        Returns: OrderRow;
      };
      release_order: {
        Args: {
          order_identifier: string;
          terminal_status: string;
          event_identifier?: string;
          event_name?: string;
        };
        Returns: undefined;
      };
      confirm_order: {
        Args: {
          order_identifier: string;
          session_identifier: string;
          payment_identifier: string;
          event_identifier: string;
          event_name: string;
        };
        Returns: undefined;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
