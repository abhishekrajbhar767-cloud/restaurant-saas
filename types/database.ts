// types/database.ts
// Hand-written to mirror supabase/migrations exactly. If you regenerate this
// with `supabase gen types typescript`, keep the RPC (Functions) section —
// the generator doesn't always pick up custom composite input types cleanly.
//
// NOTE: Every row type must be a `type` alias, not an `interface`. supabase-js
// requires Row/Insert/Update to be assignable to Record<string, unknown>, and
// TypeScript only gives implicit index signatures to type aliases — interfaces
// fail that check, which makes the whole generic Schema resolve to `never`.

export type RestaurantStatus = 'active' | 'suspended' | 'archived';
export type MemberRole = 'super_admin' | 'owner' | 'manager' | 'kitchen' | 'waiter';
export type FoodType = 'veg' | 'non_veg' | 'egg' | 'vegan';
export type OrderStatus = 'placed' | 'accepted' | 'preparing' | 'ready' | 'served' | 'cancelled' | 'voided';
export type OrderItemStatus = 'active' | 'voided';
export type ServiceRequestType = 'waiter' | 'water' | 'bill';
export type ServiceRequestStatus = 'pending' | 'claimed' | 'resolved' | 'cancelled';
export type WaiterAvailability = 'free' | 'busy' | 'offline';
export type TableStatus = 'empty' | 'dining' | 'billed';

export type Restaurant = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  currency: string;
  timezone: string;
  status: RestaurantStatus;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_meters: number | null;
  created_at: string;
  updated_at: string;
};

export type RestaurantMember = {
  id: string;
  restaurant_id: string | null;
  user_id: string;
  role: MemberRole;
  is_active: boolean;
  display_name: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
};

export type RestaurantTable = {
  id: string;
  restaurant_id: string;
  table_number: string;
  qr_token: string;
  is_active: boolean;
  status: TableStatus;
  created_at: string;
};

export type MenuCategory = {
  id: string;
  restaurant_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type MenuItem = {
  id: string;
  restaurant_id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  food_type: FoodType;
  prep_time: number;
  is_available: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type Order = {
  id: string;
  restaurant_id: string;
  table_id: string;
  order_number: number;
  status: OrderStatus;
  subtotal: number;
  discount_amount: number;
  void_reason: string | null;
  estimated_minutes: number | null;
  cancellation_reason: string | null;
  created_at: string;
  accepted_at: string | null;
  preparing_at: string | null;
  ready_at: string | null;
  served_at: string | null;
  cancelled_at: string | null;
};

export type OrderItem = {
  id: string;
  order_id: string;
  menu_item_id: string | null;
  item_name: string;
  unit_price: number;
  quantity: number;
  special_instructions: string | null;
  discount_amount: number;
  void_reason: string | null;
  status: OrderItemStatus;
  created_at: string;
};

export type ServiceRequest = {
  id: string;
  restaurant_id: string;
  table_id: string;
  type: ServiceRequestType;
  status: ServiceRequestStatus;
  claimed_by: string | null;
  created_at: string;
  claimed_at: string | null;
  resolved_at: string | null;
};

export type WaiterStatusRow = {
  member_id: string;
  restaurant_id: string;
  availability: WaiterAvailability;
  updated_at: string;
};

export type StaffShift = {
  id: string;
  restaurant_id: string;
  staff_id: string;
  clock_in_time: string;
  clock_out_time: string | null;
  total_offline_minutes: number;
  clock_in_latitude: number | null;
  clock_in_longitude: number | null;
};

export type EodSummary = {
  order_count: number;
  items_sold: number;
  gross_revenue: number;
  discount_total: number;
  net_revenue: number;
  average_order_value: number | null;
  voided_order_count: number;
  voided_item_count: number;
  voided_value: number;
};

export type TopSellingItem = {
  item_name: string;
  quantity_sold: number;
  order_count: number;
  net_revenue: number;
};

export type StaffShiftHistoryRow = {
  shift_id: string;
  staff_id: string;
  display_name: string | null;
  email: string;
  role: MemberRole;
  clock_in_time: string;
  clock_out_time: string | null;
  minutes_worked: number;
  is_open: boolean;
  clock_in_latitude: number | null;
  clock_in_longitude: number | null;
};

export type ActiveShiftRow = {
  shift_id: string;
  staff_id: string;
  display_name: string | null;
  email: string;
  role: MemberRole;
  clock_in_time: string;
  clock_in_latitude: number | null;
  clock_in_longitude: number | null;
  total_offline_minutes: number;
};

export type OrderLineInput = {
  menu_item_id: string;
  quantity: number;
  special_instructions?: string | null;
};

export type PlatformStats = {
  total_restaurants: number;
  active_restaurants: number;
  suspended_restaurants: number;
  total_orders: number;
  today_orders: number;
  total_revenue: number;
  active_staff: number;
  active_tables: number;
};

export type RestaurantOverviewRow = {
  restaurant_id: string;
  name: string;
  slug: string;
  status: RestaurantStatus;
  created_at: string;
  owner_name: string | null;
  owner_email: string | null;
  table_count: number;
  staff_count: number;
  today_order_count: number;
};

export type RestaurantStaffRow = {
  member_id: string;
  role: MemberRole;
  display_name: string | null;
  phone: string | null;
  is_active: boolean;
  email: string;
  created_at: string;
  availability: WaiterAvailability | null;
};

export type RestaurantStats = {
  total_orders: number;
  today_orders: number;
  total_revenue: number;
  today_revenue: number;
  table_count: number;
  active_table_count: number;
  staff_count: number;
  pending_service_requests: number;
  preparing_orders: number;
  ready_orders: number;
};

export type OrderWithItems = Order & {
  items: OrderItem[];
  table_number: string;
};

export type ServiceRequestWithTable = ServiceRequest & {
  table_number: string;
};

export type Database = {
  public: {
    Tables: {
      restaurants: { Row: Restaurant; Insert: Partial<Restaurant>; Update: Partial<Restaurant>; Relationships: [] };
      restaurant_members: { Row: RestaurantMember; Insert: Partial<RestaurantMember>; Update: Partial<RestaurantMember>; Relationships: [] };
      tables: { Row: RestaurantTable; Insert: Partial<RestaurantTable>; Update: Partial<RestaurantTable>; Relationships: [] };
      menu_categories: { Row: MenuCategory; Insert: Partial<MenuCategory>; Update: Partial<MenuCategory>; Relationships: [] };
      menu_items: { Row: MenuItem; Insert: Partial<MenuItem>; Update: Partial<MenuItem>; Relationships: [] };
      orders: { Row: Order; Insert: Partial<Order>; Update: Partial<Order>; Relationships: [] };
      order_items: { Row: OrderItem; Insert: Partial<OrderItem>; Update: Partial<OrderItem>; Relationships: [] };
      service_requests: { Row: ServiceRequest; Insert: Partial<ServiceRequest>; Update: Partial<ServiceRequest>; Relationships: [] };
      waiter_status: { Row: WaiterStatusRow; Insert: Partial<WaiterStatusRow>; Update: Partial<WaiterStatusRow>; Relationships: [] };
      staff_shifts: { Row: StaffShift; Insert: Partial<StaffShift>; Update: Partial<StaffShift>; Relationships: [] };
    };
    Functions: {
      create_order: { Args: { p_qr_token: string; p_lines: OrderLineInput[] }; Returns: string };
      kitchen_accept_order: { Args: { p_order_id: string; p_estimated_minutes: number }; Returns: void };
      update_order_status: { Args: { p_order_id: string; p_new_status: OrderStatus; p_cancellation_reason?: string | null }; Returns: void };
      create_service_request: { Args: { p_qr_token: string; p_type: ServiceRequestType }; Returns: string };
      claim_service_request: { Args: { p_request_id: string }; Returns: boolean };
      resolve_service_request: { Args: { p_request_id: string }; Returns: void };
      set_waiter_availability: { Args: { p_restaurant_id: string; p_availability: WaiterAvailability }; Returns: void };
      auth_is_super_admin: { Args: Record<string, never>; Returns: boolean };
      get_platform_stats: { Args: Record<string, never>; Returns: PlatformStats };
      get_restaurant_overview: { Args: Record<string, never>; Returns: RestaurantOverviewRow[] };
      get_restaurant_staff: { Args: { p_restaurant_id: string }; Returns: RestaurantStaffRow[] };
      get_restaurant_stats: { Args: { p_restaurant_id: string }; Returns: RestaurantStats };
      void_order: { Args: { p_order_id: string; p_reason: string }; Returns: void };
      void_order_item: { Args: { p_item_id: string; p_reason: string }; Returns: void };
      apply_order_discount: { Args: { p_order_id: string; p_amount: number }; Returns: void };
      apply_order_item_discount: { Args: { p_item_id: string; p_amount: number }; Returns: void };
      set_restaurant_geofence: {
        Args: {
          p_restaurant_id: string;
          p_latitude: number | null;
          p_longitude: number | null;
          p_radius_meters: number | null;
        };
        Returns: void;
      };
      clock_in: { Args: { p_restaurant_id: string; p_latitude?: number | null; p_longitude?: number | null }; Returns: string };
      clock_out: { Args: { p_shift_id?: string | null }; Returns: void };
      get_active_shifts: { Args: { p_restaurant_id: string }; Returns: ActiveShiftRow[] };
      get_eod_summary: { Args: { p_restaurant_id: string; p_day?: string | null }; Returns: EodSummary };
      get_top_selling_items: {
        Args: { p_restaurant_id: string; p_day?: string | null; p_limit?: number };
        Returns: TopSellingItem[];
      };
      get_staff_shift_history: {
        Args: { p_restaurant_id: string; p_day?: string | null };
        Returns: StaffShiftHistoryRow[];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Enums: {
      restaurant_status: RestaurantStatus;
      member_role: MemberRole;
      food_type: FoodType;
      order_status: OrderStatus;
      service_request_type: ServiceRequestType;
      service_request_status: ServiceRequestStatus;
      waiter_availability: WaiterAvailability;
      table_status: TableStatus;
      order_item_status: OrderItemStatus;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
