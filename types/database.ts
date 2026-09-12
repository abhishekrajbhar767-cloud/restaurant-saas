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
export type PlanType = 'free_trial' | 'monthly' | 'yearly';
export type SubscriptionStatus = 'active' | 'expired' | 'trialing';
export type TrackingStatus = 'expired' | 'expiring_soon' | 'active';
export type FoodType = 'veg' | 'non_veg' | 'egg' | 'vegan';
export type OrderStatus =
  | 'pending_waiter_approval'
  | 'placed'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'served'
  | 'cancelled'
  | 'voided';
export type OrderItemStatus = 'active' | 'voided';
export type ServiceRequestType = 'waiter' | 'water' | 'bill';
export type ServiceRequestStatus = 'pending' | 'claimed' | 'resolved' | 'cancelled';
export type WaiterAvailability = 'free' | 'busy' | 'offline';
export type TableStatus = 'empty' | 'dining' | 'billed';
export type SessionEndReason = 'service' | 'eod_reset';
export type InventoryUnit = 'kg' | 'gram' | 'litre' | 'ml' | 'pcs';
export type InventoryChangeType = 'manual_restock' | 'auto_deduct' | 'waste' | 'correction';

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
  google_review_url: string | null;
  require_table_assignment: boolean;
  enable_customer_name: boolean;
  enable_customer_mobile: boolean;
  enable_loyalty_pass: boolean;
  require_waiter_approval: boolean;
  inventory_tracking_enabled: boolean;
  recipe_auto_deduct_enabled: boolean;
  created_at: string;
  updated_at: string;
};

// The switches an owner can flip on /admin/settings, plus the Loyalty Pass
// master switch on /admin/manager.
export type RestaurantFeatureToggle =
  | 'require_table_assignment'
  | 'enable_customer_name'
  | 'enable_customer_mobile'
  | 'enable_loyalty_pass'
  | 'require_waiter_approval'
  | 'inventory_tracking_enabled'
  | 'recipe_auto_deduct_enabled';

export type Customer = {
  id: string;
  restaurant_id: string;
  name: string;
  mobile_number: string;
  visits_count: number;
  created_at: string;
};

export type PromotionalBanner = {
  id: string;
  restaurant_id: string;
  image_url: string;
  title: string;
  is_active: boolean;
  created_at: string;
};

export type LoyaltySettings = {
  restaurant_id: string;
  is_enabled: boolean;
  visit_threshold: number;
  discount_percentage: number;
  custom_text: string;
  banner_image_url: string | null;
  updated_at: string;
};

export type Subscription = {
  id: string;
  restaurant_id: string;
  plan_type: PlanType;
  trial_ends_at: string | null;
  expires_at: string | null;
  subscription_expires_at: string | null;
  status: SubscriptionStatus;
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
  can_take_orders: boolean;
  can_handle_billing: boolean;
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
  // Set by the track_table_session trigger, cleared when the table goes
  // back to empty. Null means nobody is seated.
  occupied_since: string | null;
  // The waiter currently serving this table. Set automatically when a
  // waiter seats it, cleared when it's freed. Null means unclaimed.
  assigned_waiter_id: string | null;
  created_at: string;
};

export type TableSession = {
  id: string;
  restaurant_id: string;
  table_id: string;
  started_at: string;
  billed_at: string | null;
  ended_at: string | null;
  // Only meaningful once ended_at is set. 'eod_reset' rows were force-closed
  // by the nightly reset and are left out of turnaround averages.
  end_reason: SessionEndReason;
  // Mirrors tables.assigned_waiter_id as it was while this session was open.
  assigned_waiter_id: string | null;
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

// Inventory & Recipes (phase 1 — schema and toggles only; no deduction logic
// or UI reads this yet).
export type InventoryItem = {
  id: string;
  restaurant_id: string;
  name: string;
  unit: InventoryUnit;
  current_stock: number;
  min_alert_limit: number;
  created_at: string;
  updated_at: string;
};

export type MenuItemRecipe = {
  id: string;
  restaurant_id: string;
  menu_item_id: string;
  inventory_item_id: string;
  quantity_required: number;
};

export type InventoryLog = {
  id: string;
  restaurant_id: string;
  inventory_item_id: string;
  change_type: InventoryChangeType;
  quantity: number;
  notes: string | null;
  performed_by: string | null;
  created_at: string;
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
  // Only populated when the restaurant has the matching toggle switched on,
  // or when a Loyalty Pass guest is attached after checkout.
  customer_name: string | null;
  customer_mobile: string | null;
  // Set by increment_loyalty_visit() so a retried cart submit cannot punch twice.
  loyalty_visit_recorded: boolean;
  created_at: string;
  accepted_at: string | null;
  preparing_at: string | null;
  ready_at: string | null;
  served_at: string | null;
  cancelled_at: string | null;
  // Set when the ticket was still live at the end of its service day and
  // process_eod_reset() settled it instead of a waiter.
  auto_closed_at: string | null;
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

export type CustomerRating = {
  id: string;
  restaurant_id: string;
  order_id: string;
  staff_id: string | null;
  rating_value: number;
  created_at: string;
};

// staff_id is null for the bucket of ratings that could not be attributed to
// a waiter, so the identity columns are nullable alongside it.
export type StaffRating = {
  staff_id: string | null;
  display_name: string | null;
  email: string | null;
  role: MemberRole | null;
  rating_count: number;
  average_rating: number;
};

// One row per restaurant the nightly reset actually processed. Restaurants
// whose local clock was not at the requested hour are simply absent.
export type EodResetResult = {
  restaurant_id: string;
  restaurant_name: string;
  day_start: string;
  sessions_closed: number;
  tables_cleared: number;
  orders_closed: number;
  requests_cancelled: number;
};

export type TableTurnaround = {
  completed_sessions: number;
  average_minutes: number | null;
  longest_minutes: number;
  open_sessions: number;
};

// One row per staff member per request type — fetching water and settling a
// bill are different jobs and a single blended average hides that.
export type StaffRequestTiming = {
  staff_id: string;
  display_name: string | null;
  email: string;
  role: MemberRole;
  request_type: ServiceRequestType;
  requests_completed: number;
  average_minutes: number | null;
  longest_minutes: number;
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
  owner_user_id: string | null;
  table_count: number;
  staff_count: number;
  today_order_count: number;
  plan_type: PlanType | null;
  trial_ends_at: string | null;
  expires_at: string | null;
  subscription_expires_at: string | null;
  subscription_status: SubscriptionStatus | null;
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
  can_take_orders: boolean;
  can_handle_billing: boolean;
};

// The transfer-target roster: on-duty waiters only, name only — narrower
// than RestaurantStaffRow because any waiter (not just owner/manager) can
// call get_on_duty_waiters to pick a handover target.
export type OnDutyWaiter = {
  member_id: string;
  display_name: string | null;
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

export type StaffPushToken = {
  id: string;
  member_id: string;
  restaurant_id: string;
  token: string;
  platform: 'android' | 'ios' | 'web';
  created_at: string;
  updated_at: string;
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
      table_sessions: { Row: TableSession; Insert: Partial<TableSession>; Update: Partial<TableSession>; Relationships: [] };
      customer_ratings: { Row: CustomerRating; Insert: Partial<CustomerRating>; Update: Partial<CustomerRating>; Relationships: [] };
      customers: { Row: Customer; Insert: Partial<Customer>; Update: Partial<Customer>; Relationships: [] };
      promotional_banners: { Row: PromotionalBanner; Insert: Partial<PromotionalBanner>; Update: Partial<PromotionalBanner>; Relationships: [] };
      loyalty_settings: { Row: LoyaltySettings; Insert: Partial<LoyaltySettings>; Update: Partial<LoyaltySettings>; Relationships: [] };
      subscriptions: { Row: Subscription; Insert: Partial<Subscription>; Update: Partial<Subscription>; Relationships: [] };
      staff_push_tokens: { Row: StaffPushToken; Insert: Partial<StaffPushToken>; Update: Partial<StaffPushToken>; Relationships: [] };
      inventory_items: { Row: InventoryItem; Insert: Partial<InventoryItem>; Update: Partial<InventoryItem>; Relationships: [] };
      menu_item_recipes: { Row: MenuItemRecipe; Insert: Partial<MenuItemRecipe>; Update: Partial<MenuItemRecipe>; Relationships: [] };
      inventory_logs: { Row: InventoryLog; Insert: Partial<InventoryLog>; Update: Partial<InventoryLog>; Relationships: [] };
    };
    Functions: {
      create_order: {
        Args: {
          p_qr_token: string;
          p_lines: OrderLineInput[];
          p_customer_name?: string | null;
          p_customer_mobile?: string | null;
        };
        Returns: string;
      };
      kitchen_accept_order: { Args: { p_order_id: string; p_estimated_minutes: number }; Returns: void };
      update_order_status: { Args: { p_order_id: string; p_new_status: OrderStatus; p_cancellation_reason?: string | null }; Returns: void };
      create_service_request: { Args: { p_qr_token: string; p_type: ServiceRequestType }; Returns: string };
      register_staff_push_token: { Args: { p_token: string; p_platform?: string }; Returns: void };
      claim_service_request: { Args: { p_request_id: string }; Returns: boolean };
      resolve_service_request: { Args: { p_request_id: string }; Returns: void };
      set_waiter_availability: { Args: { p_restaurant_id: string; p_availability: WaiterAvailability }; Returns: void };
      set_table_status: { Args: { p_table_id: string; p_status: TableStatus }; Returns: void };
      assign_table_to_self: { Args: { p_table_id: string }; Returns: void };
      release_table_assignment: { Args: { p_table_id: string }; Returns: void };
      get_on_duty_waiters: { Args: { p_restaurant_id: string }; Returns: OnDutyWaiter[] };
      transfer_table: { Args: { p_table_id: string; p_to_member_id: string }; Returns: void };
      approve_waiter_order: { Args: { p_order_id: string }; Returns: void };
      reject_waiter_order: { Args: { p_order_id: string; p_reason?: string | null }; Returns: void };
      auth_is_super_admin: { Args: Record<string, never>; Returns: boolean };
      subscription_effective_status: {
        Args: { p_plan_type: string; p_trial_ends_at: string | null; p_expires_at: string | null };
        Returns: SubscriptionStatus;
      };
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
      get_table_turnaround: {
        Args: { p_restaurant_id: string; p_day?: string | null };
        Returns: TableTurnaround;
      };
      get_staff_request_timings: {
        Args: { p_restaurant_id: string; p_day?: string | null };
        Returns: StaffRequestTiming[];
      };
      submit_customer_rating: { Args: { p_order_id: string; p_rating: number }; Returns: void };
      get_customer_rating: { Args: { p_order_id: string }; Returns: number | null };
      set_restaurant_google_review_url: { Args: { p_restaurant_id: string; p_url: string | null }; Returns: void };
      set_restaurant_feature_toggles: {
        // Omitted or null means "leave that switch alone".
        Args: {
          p_restaurant_id: string;
          p_require_table_assignment?: boolean | null;
          p_enable_customer_name?: boolean | null;
          p_enable_customer_mobile?: boolean | null;
          p_enable_loyalty_pass?: boolean | null;
          p_require_waiter_approval?: boolean | null;
          p_inventory_tracking_enabled?: boolean | null;
          p_recipe_auto_deduct_enabled?: boolean | null;
        };
        Returns: void;
      };
      upsert_loyalty_customer: {
        Args: { p_restaurant_id: string; p_name: string; p_mobile: string };
        Returns: Customer;
      };
      get_loyalty_customer: {
        Args: { p_restaurant_id: string; p_mobile: string };
        Returns: Customer | null;
      };
      increment_loyalty_visit: {
        Args: { p_order_id: string; p_mobile: string };
        Returns: number;
      };
      get_staff_ratings: {
        Args: { p_restaurant_id: string; p_day?: string | null };
        Returns: StaffRating[];
      };
      // Normally driven by the eod_reset_hourly cron job. Omitting
      // p_restaurant_id resets the whole fleet and is super-admin only;
      // omitting p_local_hour resets immediately instead of waiting for
      // the restaurant's local 03:00.
      process_eod_reset: {
        Args: { p_restaurant_id?: string | null; p_local_hour?: number | null };
        Returns: EodResetResult[];
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
      session_end_reason: SessionEndReason;
      plan_type: PlanType;
      subscription_status: SubscriptionStatus;
      tracking_status: TrackingStatus;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
