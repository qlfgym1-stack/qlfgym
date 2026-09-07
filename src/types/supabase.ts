export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: { id: string; name: string; slug: string; logo_url: string | null; address: string | null; phone: string | null; email: string | null; created_at: string; coach_default_salary: number | null; coach_default_rate_per_member: number | null }
        Insert: { id?: string; name: string; slug: string; logo_url?: string | null; address?: string | null; phone?: string | null; email?: string | null; created_at?: string; coach_default_salary?: number | null; coach_default_rate_per_member?: number | null }
        Update: { id?: string; name?: string; slug?: string; logo_url?: string | null; address?: string | null; phone?: string | null; email?: string | null; created_at?: string; coach_default_salary?: number | null; coach_default_rate_per_member?: number | null }
        Relationships: []
      }
      user_roles: {
        Row: { id: string; user_id: string; organization_id: string; role: 'admin' | 'coach' | 'staff' | 'receptionist' | 'cleaner'; created_at: string }
        Insert: { id?: string; user_id: string; organization_id: string; role: 'admin' | 'coach' | 'staff' | 'receptionist' | 'cleaner'; created_at?: string }
        Update: { id?: string; user_id?: string; organization_id?: string; role?: 'admin' | 'coach' | 'staff' | 'receptionist' | 'cleaner'; created_at?: string }
        Relationships: []
      }
      members: {
        Row: { id: string; organization_id: string; user_id: string | null; first_name: string; last_name: string; full_name?: string | null; email: string | null; phone: string | null; gender: string | null; birth_date: string | null; address: string | null; emergency_contact: string | null; emergency_phone: string | null; photo_url: string | null; status: 'active' | 'inactive' | 'suspended' | 'blocked'; last_visit: string | null; notes: string | null; created_at: string; updated_at: string; member_number: string | null; coach_id: string | null; corporate_id: string | null }
        Insert: { id?: string; organization_id: string; user_id?: string | null; first_name: string; last_name: string; email?: string | null; phone?: string | null; gender?: string | null; birth_date?: string | null; address?: string | null; emergency_contact?: string | null; emergency_phone?: string | null; photo_url?: string | null; status?: 'active' | 'inactive' | 'suspended' | 'blocked'; last_visit?: string | null; notes?: string | null; created_at?: string; updated_at?: string; member_number?: string | null; coach_id?: string | null; corporate_id?: string | null }
        Update: { id?: string; organization_id?: string; user_id?: string | null; first_name?: string; last_name?: string; email?: string | null; phone?: string | null; gender?: string | null; birth_date?: string | null; address?: string | null; emergency_contact?: string | null; emergency_phone?: string | null; photo_url?: string | null; status?: 'active' | 'inactive' | 'suspended' | 'blocked'; last_visit?: string | null; notes?: string | null; created_at?: string; updated_at?: string; member_number?: string | null; coach_id?: string | null; corporate_id?: string | null }
        Relationships: []
      }
      subscription_types: {
        Row: { id: string; organization_id: string; name: string; description: string | null; duration_days: number; price: number; max_classes: number | null; is_active: boolean; is_drop_in: boolean; created_at: string }
        Insert: { id?: string; organization_id: string; name: string; description?: string | null; duration_days: number; price: number; max_classes?: number | null; is_active?: boolean; is_drop_in?: boolean; created_at?: string }
        Update: { id?: string; organization_id?: string; name?: string; description?: string | null; duration_days?: number; price?: number; max_classes?: number | null; is_active?: boolean; is_drop_in?: boolean; created_at?: string }
        Relationships: []
      }
      member_subscriptions: {
        Row: { id: string; organization_id: string; member_id: string; subscription_type_id: string; start_date: string; end_date: string; total_amount: number; amount_paid: number; status: 'active' | 'expired' | 'cancelled' | 'pending_payment'; created_at: string }
        Insert: { id?: string; organization_id: string; member_id: string; subscription_type_id: string; start_date: string; end_date: string; total_amount: number; amount_paid?: number; status?: 'active' | 'expired' | 'cancelled' | 'pending_payment'; created_at?: string }
        Update: { id?: string; organization_id?: string; member_id?: string; subscription_type_id?: string; start_date?: string; end_date?: string; total_amount?: number; amount_paid?: number; status?: 'active' | 'expired' | 'cancelled' | 'pending_payment'; created_at?: string }
        Relationships: []
      }
      payments: {
        Row: { id: string; organization_id: string; member_id: string; subscription_id: string | null; amount: number; payment_date: string; payment_method: 'cash' | 'card' | 'transfer' | 'other'; status: 'completed' | 'pending' | 'cancelled'; notes: string | null; created_at: string; cancelled_at: string | null; cancelled_by: string | null; cancellation_reason: string | null }
        Insert: { id?: string; organization_id: string; member_id: string; subscription_id?: string | null; amount: number; payment_date?: string; payment_method: 'cash' | 'card' | 'transfer' | 'other'; status?: 'completed' | 'pending' | 'cancelled'; notes?: string | null; created_at?: string; cancelled_at?: string | null; cancelled_by?: string | null; cancellation_reason?: string | null }
        Update: { id?: string; organization_id?: string; member_id?: string; subscription_id?: string | null; amount?: number; payment_date?: string; payment_method?: 'cash' | 'card' | 'transfer' | 'other'; status?: 'completed' | 'pending' | 'cancelled'; notes?: string | null; created_at?: string; cancelled_at?: string | null; cancelled_by?: string | null; cancellation_reason?: string | null }
        Relationships: []
      }
      classes: {
        Row: { id: string; organization_id: string; name: string; description: string | null; coach_id: string | null; start_time: string; end_time: string; max_capacity: number | null; color: string | null; recurring: boolean; day_of_week: number | null; created_at: string }
        Insert: { id?: string; organization_id: string; name: string; description?: string | null; coach_id?: string | null; start_time: string; end_time: string; max_capacity?: number | null; color?: string | null; recurring?: boolean; day_of_week?: number | null; created_at?: string }
        Update: { id?: string; organization_id?: string; name?: string; description?: string | null; coach_id?: string | null; start_time?: string; end_time?: string; max_capacity?: number | null; color?: string | null; recurring?: boolean; day_of_week?: number | null; created_at?: string }
        Relationships: []
      }
      class_enrollments: {
        Row: { id: string; class_id: string; member_id: string; status: 'confirmed' | 'cancelled' | 'attended'; created_at: string }
        Insert: { id?: string; class_id: string; member_id: string; status?: 'confirmed' | 'cancelled' | 'attended'; created_at?: string }
        Update: { id?: string; class_id?: string; member_id?: string; status?: 'confirmed' | 'cancelled' | 'attended'; created_at?: string }
        Relationships: []
      }
      attendance: {
        Row: { id: string; organization_id: string; member_id: string; check_in: string | null; check_out: string | null; type: 'check-in' | 'class'; class_id: string | null; source: 'rfid' | 'manual' | 'app'; access_control_id: string | null; created_by: string | null; created_at: string }
        Insert: { id?: string; organization_id: string; member_id: string; check_in?: string | null; check_out?: string | null; type?: 'check-in' | 'class'; class_id?: string | null; source?: 'rfid' | 'manual' | 'app'; access_control_id?: string | null; created_by?: string | null; created_at?: string }
        Update: { id?: string; organization_id?: string; member_id?: string; check_in?: string | null; check_out?: string | null; type?: 'check-in' | 'class'; class_id?: string | null; source?: 'rfid' | 'manual' | 'app'; access_control_id?: string | null; created_by?: string | null; created_at?: string }
        Relationships: []
      }
      rfid_cards: {
        Row: { id: string; member_id: string; rfid_uid: string; status: 'ACTIF' | 'REMPLACÉ' | 'DÉSACTIVÉ' | 'PERDU' | 'VOLÉ' | 'BLACKLISTÉ' | 'ARCHIVÉ'; assigned_at: string; replaced_at: string | null; replaced_by: string | null; reason: string | null; notes: string | null; created_by: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; member_id: string; rfid_uid: string; status?: 'ACTIF' | 'REMPLACÉ' | 'DÉSACTIVÉ' | 'PERDU' | 'VOLÉ' | 'BLACKLISTÉ' | 'ARCHIVÉ'; assigned_at?: string; replaced_at?: string | null; replaced_by?: string | null; reason?: string | null; notes?: string | null; created_by?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; member_id?: string; rfid_uid?: string; status?: 'ACTIF' | 'REMPLACÉ' | 'DÉSACTIVÉ' | 'PERDU' | 'VOLÉ' | 'BLACKLISTÉ' | 'ARCHIVÉ'; assigned_at?: string; replaced_at?: string | null; replaced_by?: string | null; reason?: string | null; notes?: string | null; created_by?: string | null; created_at?: string; updated_at?: string }
        Relationships: []
      }
      rfid_read_logs: {
        Row: { id: string; card_uid: string; member_id: string | null; terminal: string; event_type: 'check-in' | 'check-out' | 'denied'; result: 'granted' | 'denied' | 'pending'; reason: string | null; user_id: string | null; read_at: string }
        Insert: { id?: string; card_uid: string; member_id?: string | null; terminal: string; event_type: 'check-in' | 'check-out' | 'denied'; result: 'granted' | 'denied' | 'pending'; reason?: string | null; user_id?: string | null; read_at?: string }
        Update: { id?: string; card_uid?: string; member_id?: string | null; terminal?: string; event_type?: 'check-in' | 'check-out' | 'denied'; result?: 'granted' | 'denied' | 'pending'; reason?: string | null; user_id?: string | null; read_at?: string }
        Relationships: []
      }
      rfid_audit_log: {
        Row: { id: string; member_id: string; old_rfid_uid: string | null; new_rfid_uid: string; action: 'ASSIGN' | 'REPLACE' | 'DEACTIVATE' | 'REACTIVATE' | 'ARCHIVE'; reason: string | null; notes: string | null; created_by: string | null; ip_address: string | null; created_at: string }
        Insert: { id?: string; member_id: string; old_rfid_uid?: string | null; new_rfid_uid: string; action: 'ASSIGN' | 'REPLACE' | 'DEACTIVATE' | 'REACTIVATE' | 'ARCHIVE'; reason?: string | null; notes?: string | null; created_by?: string | null; ip_address?: string | null; created_at?: string }
        Update: { id?: string; member_id?: string; old_rfid_uid?: string | null; new_rfid_uid?: string; action?: 'ASSIGN' | 'REPLACE' | 'DEACTIVATE' | 'REACTIVATE' | 'ARCHIVE'; reason?: string | null; notes?: string | null; created_by?: string | null; ip_address?: string | null; created_at?: string }
        Relationships: []
      }
      turnstile_status: {
        Row: { id: string; organization_id: string; terminal: string; status: 'online' | 'offline' | 'fault'; last_heartbeat: string | null; updated_at: string }
        Insert: { id?: string; organization_id: string; terminal: string; status?: 'online' | 'offline' | 'fault'; last_heartbeat?: string | null; updated_at?: string }
        Update: { id?: string; organization_id?: string; terminal?: string; status?: 'online' | 'offline' | 'fault'; last_heartbeat?: string | null; updated_at?: string }
        Relationships: []
      }
      manual_validations: {
        Row: { id: string; organization_id: string; member_id: string; user_id: string; reason: 'breakdown' | 'maintenance' | 'emergency' | 'test' | 'other'; reason_detail: string | null; terminal: string | null; validated_at: string }
        Insert: { id?: string; organization_id: string; member_id: string; user_id: string; reason: 'breakdown' | 'maintenance' | 'emergency' | 'test' | 'other'; reason_detail?: string | null; terminal?: string | null; validated_at?: string }
        Update: { id?: string; organization_id?: string; member_id?: string; user_id?: string; reason?: 'breakdown' | 'maintenance' | 'emergency' | 'test' | 'other'; reason_detail?: string | null; terminal?: string | null; validated_at?: string }
        Relationships: []
      }
      staff: {
        Row: { id: string; organization_id: string; user_id: string | null; first_name: string; last_name: string; email: string | null; phone: string | null; role: string | null; salary: number | null; rate_per_member: number | null; bonus: number | null; hire_date: string | null; is_active: boolean; rfid_uid: string | null; username: string | null; created_at: string }
        Insert: { id?: string; organization_id: string; user_id?: string | null; first_name: string; last_name: string; email?: string | null; phone?: string | null; role?: string | null; salary?: number | null; rate_per_member?: number | null; bonus?: number | null; hire_date?: string | null; is_active?: boolean; rfid_uid?: string | null; username?: string | null; created_at?: string }
        Update: { id?: string; organization_id?: string; user_id?: string | null; first_name?: string; last_name?: string; email?: string | null; phone?: string | null; role?: string | null; salary?: number | null; rate_per_member?: number | null; bonus?: number | null; hire_date?: string | null; is_active?: boolean; rfid_uid?: string | null; username?: string | null; created_at?: string }
        Relationships: []
      }
      staff_timesheet: {
        Row: { id: string; staff_id: string; organization_id: string; date: string; clock_in: string | null; clock_out: string | null; break_start: string | null; break_end: string | null; total_hours: number | null; notes: string | null }
        Insert: { id?: string; staff_id: string; organization_id: string; date: string; clock_in?: string | null; clock_out?: string | null; break_start?: string | null; break_end?: string | null; total_hours?: number | null; notes?: string | null }
        Update: { id?: string; staff_id?: string; organization_id?: string; date?: string; clock_in?: string | null; clock_out?: string | null; break_start?: string | null; break_end?: string | null; total_hours?: number | null; notes?: string | null }
        Relationships: []
      }
      staff_shifts: {
        Row: { id: string; staff_id: string; organization_id: string; date: string; start_time: string; end_time: string; notes: string | null; created_at: string }
        Insert: { id?: string; staff_id: string; organization_id: string; date: string; start_time: string; end_time: string; notes?: string | null; created_at?: string }
        Update: { id?: string; staff_id?: string; organization_id?: string; date?: string; start_time?: string; end_time?: string; notes?: string | null; created_at?: string }
        Relationships: []
      }
      staff_leaves: {
        Row: { id: string; staff_id: string; organization_id: string; start_date: string; end_date: string; type: 'vacation' | 'sick' | 'personal'; status: 'pending' | 'approved' | 'rejected'; reason: string | null; created_at: string }
        Insert: { id?: string; staff_id: string; organization_id: string; start_date: string; end_date: string; type: 'vacation' | 'sick' | 'personal'; status?: 'pending' | 'approved' | 'rejected'; reason?: string | null; created_at?: string }
        Update: { id?: string; staff_id?: string; organization_id?: string; start_date?: string; end_date?: string; type?: 'vacation' | 'sick' | 'personal'; status?: 'pending' | 'approved' | 'rejected'; reason?: string | null; created_at?: string }
        Relationships: []
      }
      coach_salary_history: {
        Row: { id: string; organization_id: string; coach_id: string; period: string; fixed_salary: number; rate_per_member: number; member_count: number; variable_amount: number; total_amount: number; created_at: string }
        Insert: { id?: string; organization_id: string; coach_id: string; period: string; fixed_salary: number; rate_per_member: number; member_count: number; variable_amount: number; total_amount: number; created_at?: string }
        Update: { id?: string; organization_id?: string; coach_id?: string; period?: string; fixed_salary?: number; rate_per_member?: number; member_count?: number; variable_amount?: number; total_amount?: number; created_at?: string }
        Relationships: []
      }
      staff_salary_payments: {
        Row: { id: string; organization_id: string; staff_id: string; amount: number; payment_date: string; payment_method: 'cash' | 'transfer' | 'check'; period: string; notes: string | null; created_by: string | null; created_at: string }
        Insert: { id?: string; organization_id: string; staff_id: string; amount: number; payment_date?: string; payment_method: 'cash' | 'transfer' | 'check'; period: string; notes?: string | null; created_by?: string | null; created_at?: string }
        Update: { id?: string; organization_id?: string; staff_id?: string; amount?: number; payment_date?: string; payment_method?: 'cash' | 'transfer' | 'check'; period?: string; notes?: string | null; created_by?: string | null; created_at?: string }
        Relationships: []
      }
      coach_sessions: {
        Row: { id: string; organization_id: string; coach_id: string; member_id: string; session_date: string; start_time: string; end_time: string | null; session_type: string | null; room: string | null; status: 'scheduled' | 'done' | 'cancelled' | 'no_show'; notes: string | null; created_by: string | null; created_at: string }
        Insert: { id?: string; organization_id: string; coach_id: string; member_id: string; session_date: string; start_time: string; end_time?: string | null; session_type?: string | null; room?: string | null; status?: 'scheduled' | 'done' | 'cancelled' | 'no_show'; notes?: string | null; created_by?: string | null; created_at?: string }
        Update: { id?: string; organization_id?: string; coach_id?: string; member_id?: string; session_date?: string; start_time?: string; end_time?: string | null; session_type?: string | null; room?: string | null; status?: 'scheduled' | 'done' | 'cancelled' | 'no_show'; notes?: string | null; created_by?: string | null; created_at?: string }
        Relationships: []
      }
      equipment: {
        Row: { id: string; organization_id: string; name: string; description: string | null; category: string | null; quantity: number; available_quantity: number; purchase_price: number | null; status: string | null; purchase_date: string | null; last_maintenance: string | null; brand: string | null; location: string | null; next_maintenance: string | null; notes: string | null; created_at: string }
        Insert: { id?: string; organization_id: string; name: string; description?: string | null; category?: string | null; quantity?: number; available_quantity?: number; purchase_price?: number | null; status?: string | null; purchase_date?: string | null; last_maintenance?: string | null; brand?: string | null; location?: string | null; next_maintenance?: string | null; notes?: string | null; created_at?: string }
        Update: { id?: string; organization_id?: string; name?: string; description?: string | null; category?: string | null; quantity?: number; available_quantity?: number; purchase_price?: number | null; status?: string | null; purchase_date?: string | null; last_maintenance?: string | null; brand?: string | null; location?: string | null; next_maintenance?: string | null; notes?: string | null; created_at?: string }
        Relationships: []
      }
      equipment_reservations: {
        Row: { id: string; organization_id: string; equipment_id: string; member_id: string; start_time: string; end_time: string; status: 'confirmed' | 'cancelled' | 'completed'; created_at: string }
        Insert: { id?: string; organization_id: string; equipment_id: string; member_id: string; start_time: string; end_time: string; status?: 'confirmed' | 'cancelled' | 'completed'; created_at?: string }
        Update: { id?: string; organization_id?: string; equipment_id?: string; member_id?: string; start_time?: string; end_time?: string; status?: 'confirmed' | 'cancelled' | 'completed'; created_at?: string }
        Relationships: []
      }
      inventory: {
        Row: { id: string; organization_id: string; name: string; category: string | null; quantity: number; stock_initial: number; unit: string | null; min_stock: number | null; price: number | null; product_id: string | null; equipment_id: string | null; consumable_id: string | null; image_url: string | null; created_at: string }
        Insert: { id?: string; organization_id: string; name: string; category?: string | null; quantity?: number; stock_initial?: number; unit?: string | null; min_stock?: number | null; price?: number | null; product_id?: string | null; equipment_id?: string | null; consumable_id?: string | null; image_url?: string | null; created_at?: string }
        Update: { id?: string; organization_id?: string; name?: string; category?: string | null; quantity?: number; stock_initial?: number; unit?: string | null; min_stock?: number | null; price?: number | null; product_id?: string | null; equipment_id?: string | null; consumable_id?: string | null; image_url?: string | null; created_at?: string }
        Relationships: []
      }
      consumables: {
        Row: { id: string; organization_id: string; name: string; category: 'entretien' | 'hygiene' | 'sanitaire' | 'bureau' | 'securite' | 'autre'; brand: string | null; unit: string | null; quantity: number; min_stock: number; cost: number | null; image_url: string | null; notes: string | null; is_active: boolean; created_at: string }
        Insert: { id?: string; organization_id: string; name: string; category?: 'entretien' | 'hygiene' | 'sanitaire' | 'bureau' | 'securite' | 'autre'; brand?: string | null; unit?: string | null; quantity?: number; min_stock?: number; cost?: number | null; image_url?: string | null; notes?: string | null; is_active?: boolean; created_at?: string }
        Update: { id?: string; organization_id?: string; name?: string; category?: 'entretien' | 'hygiene' | 'sanitaire' | 'bureau' | 'securite' | 'autre'; brand?: string | null; unit?: string | null; quantity?: number; min_stock?: number; cost?: number | null; image_url?: string | null; notes?: string | null; is_active?: boolean; created_at?: string }
        Relationships: []
      }
      stock_movements: {
        Row: { id: string; inventory_id: string; product_id: string | null; organization_id: string; type: 'in' | 'out'; quantity: number; unit_price: number | null; reference: string | null; movement_date: string; reason: string | null; reference_type: string | null; reference_id: string | null; notes: string | null; created_at: string }
        Insert: { id?: string; inventory_id: string; product_id?: string | null; organization_id: string; type: 'in' | 'out'; quantity: number; unit_price?: number | null; reference?: string | null; movement_date?: string; reason?: string | null; reference_type?: string | null; reference_id?: string | null; notes?: string | null; created_at?: string }
        Update: { id?: string; inventory_id?: string; product_id?: string | null; organization_id?: string; type?: 'in' | 'out'; quantity?: number; unit_price?: number | null; reference?: string | null; movement_date?: string; reason?: string | null; reference_type?: string | null; reference_id?: string | null; notes?: string | null; created_at?: string }
        Relationships: []
      }
      stock_anomalies: {
        Row: { id: string; organization_id: string; inventory_id: string; computed_stock: number; actual_stock: number; delta: number; status: 'open' | 'resolved'; detected_at: string; resolved_at: string | null; notes: string | null; created_at: string }
        Insert: { id?: string; organization_id: string; inventory_id: string; computed_stock: number; actual_stock: number; delta: number; status?: 'open' | 'resolved'; detected_at?: string; resolved_at?: string | null; notes?: string | null; created_at?: string }
        Update: { id?: string; organization_id?: string; inventory_id?: string; computed_stock?: number; actual_stock?: number; delta?: number; status?: 'open' | 'resolved'; detected_at?: string; resolved_at?: string | null; notes?: string | null; created_at?: string }
        Relationships: []
      }
      products: {
        Row: { id: string; organization_id: string; name: string; category: string | null; brand: string | null; sku: string | null; reference: string | null; price: number; cost: number | null; stock: number | null; stock_initial: number; image_url: string | null; barcode: string | null; is_active: boolean; created_at: string }
        Insert: { id?: string; organization_id: string; name: string; category?: string | null; brand?: string | null; sku?: string | null; reference?: string | null; price: number; cost?: number | null; stock?: number | null; stock_initial?: number; image_url?: string | null; barcode?: string | null; is_active?: boolean; created_at?: string }
        Update: { id?: string; organization_id?: string; name?: string; category?: string | null; brand?: string | null; sku?: string | null; reference?: string | null; price?: number; cost?: number | null; stock?: number | null; stock_initial?: number; image_url?: string | null; barcode?: string | null; is_active?: boolean; created_at?: string }
        Relationships: []
      }
      pos_sessions: {
        Row: { id: string; organization_id: string; staff_id: string | null; opened_at: string; closed_at: string | null; status: 'open' | 'closed'; total: number | null }
        Insert: { id?: string; organization_id: string; staff_id?: string | null; opened_at?: string; closed_at?: string | null; status?: 'open' | 'closed'; total?: number | null }
        Update: { id?: string; organization_id?: string; staff_id?: string | null; opened_at?: string; closed_at?: string | null; status?: 'open' | 'closed'; total?: number | null }
        Relationships: []
      }
      pos_transactions: {
        Row: { id: string; session_id: string; organization_id: string; member_id: string | null; items: Json; subtotal: number; discount: number | null; total: number; payment_method: string | null; payment_status: string | null; created_by: string | null; created_at: string; cancelled_at: string | null; cancelled_by: string | null; cancellation_reason: string | null }
        Insert: { id?: string; session_id: string; organization_id: string; member_id?: string | null; items: Json; subtotal: number; discount?: number | null; total: number; payment_method?: string | null; payment_status?: string | null; created_by?: string | null; created_at?: string; cancelled_at?: string | null; cancelled_by?: string | null; cancellation_reason?: string | null }
        Update: { id?: string; session_id?: string; organization_id?: string; member_id?: string | null; items?: Json; subtotal?: number; discount?: number | null; total?: number; payment_method?: string | null; payment_status?: string | null; created_by?: string | null; created_at?: string; cancelled_at?: string | null; cancelled_by?: string | null; cancellation_reason?: string | null }
        Relationships: []
      }
      badges: {
        Row: { id: string; organization_id: string; name: string; description: string | null; color: string | null; icon: string | null; is_active: boolean; created_at: string }
        Insert: { id?: string; organization_id: string; name: string; description?: string | null; color?: string | null; icon?: string | null; is_active?: boolean; created_at?: string }
        Update: { id?: string; organization_id?: string; name?: string; description?: string | null; color?: string | null; icon?: string | null; is_active?: boolean; created_at?: string }
        Relationships: []
      }
      member_badges: {
        Row: { id: string; member_id: string; badge_id: string; assigned_at: string }
        Insert: { id?: string; member_id: string; badge_id: string; assigned_at?: string }
        Update: { id?: string; member_id?: string; badge_id?: string; assigned_at?: string }
        Relationships: []
      }
      access_control: {
        Row: { id: string; organization_id: string; name: string; type: 'turnstile' | 'door' | 'barrier'; device_id: string | null; is_active: boolean; created_at: string }
        Insert: { id?: string; organization_id: string; name: string; type: 'turnstile' | 'door' | 'barrier'; device_id?: string | null; is_active?: boolean; created_at?: string }
        Update: { id?: string; organization_id?: string; name?: string; type?: 'turnstile' | 'door' | 'barrier'; device_id?: string | null; is_active?: boolean; created_at?: string }
        Relationships: []
      }
      access_logs: {
        Row: { id: string; access_control_id: string; member_id: string | null; status: 'granted' | 'denied'; timestamp: string }
        Insert: { id?: string; access_control_id: string; member_id?: string | null; status: 'granted' | 'denied'; timestamp?: string }
        Update: { id?: string; access_control_id?: string; member_id?: string | null; status?: 'granted' | 'denied'; timestamp?: string }
        Relationships: []
      }
      notifications: {
        Row: { id: string; organization_id: string; user_id: string | null; title: string; body: string | null; message: string; type: string; is_read: boolean; data: Json | null; created_at: string }
        Insert: { id?: string; organization_id: string; user_id?: string | null; title: string; body?: string | null; message: string; type: string; is_read?: boolean; data?: Json | null; created_at?: string }
        Update: { id?: string; organization_id?: string; user_id?: string | null; title?: string; body?: string | null; message?: string; type?: string; is_read?: boolean; data?: Json | null; created_at?: string }
        Relationships: []
      }
      licenses: {
        Row: { id: string; organization_id: string; license_key: string; type: string | null; issued_at: string; expires_at: string | null; is_active: boolean; created_at: string }
        Insert: { id?: string; organization_id: string; license_key: string; type?: string | null; issued_at?: string; expires_at?: string | null; is_active?: boolean; created_at?: string }
        Update: { id?: string; organization_id?: string; license_key?: string; type?: string | null; issued_at?: string; expires_at?: string | null; is_active?: boolean; created_at?: string }
        Relationships: []
      }
      settings: {
        Row: { id: string; organization_id: string; key: string; value: Json; created_at: string }
        Insert: { id?: string; organization_id: string; key: string; value: Json; created_at?: string }
        Update: { id?: string; organization_id?: string; key?: string; value?: Json; created_at?: string }
        Relationships: []
      }
      corporate: {
        Row: { id: string; organization_id: string; company_name: string; contact_name: string | null; email: string | null; phone: string | null; address: string | null; discount_rate: number | null; contract_start: string | null; contract_end: string | null; is_active: boolean; created_at: string }
        Insert: { id?: string; organization_id: string; company_name: string; contact_name?: string | null; email?: string | null; phone?: string | null; address?: string | null; discount_rate?: number | null; contract_start?: string | null; contract_end?: string | null; is_active?: boolean; created_at?: string }
        Update: { id?: string; organization_id?: string; company_name?: string; contact_name?: string | null; email?: string | null; phone?: string | null; address?: string | null; discount_rate?: number | null; contract_start?: string | null; contract_end?: string | null; is_active?: boolean; created_at?: string }
        Relationships: []
      }
      student_verifications: {
        Row: { id: string; organization_id: string; member_id: string; school_name: string; student_id: string | null; document_url: string | null; verified: boolean; verified_at: string | null; created_at: string }
        Insert: { id?: string; organization_id: string; member_id: string; school_name: string; student_id?: string | null; document_url?: string | null; verified?: boolean; verified_at?: string | null; created_at?: string }
        Update: { id?: string; organization_id?: string; member_id?: string; school_name?: string; student_id?: string | null; document_url?: string | null; verified?: boolean; verified_at?: string | null; created_at?: string }
        Relationships: []
      }
      recovery_codes: {
        Row: { user_id: string; code_hash: string; created_at: string; last_used_at: string | null }
        Insert: { user_id: string; code_hash: string; created_at?: string; last_used_at?: string | null }
        Update: { user_id?: string; code_hash?: string; created_at?: string; last_used_at?: string | null }
        Relationships: []
      }
recovery_code_logs: {
        Row: { id: string; user_id: string; attempted_at: string; success: boolean; action: string; ip_address: string | null; user_agent: string | null }
        Insert: { id?: string; user_id: string; attempted_at?: string; success: boolean; action?: string; ip_address?: string | null; user_agent?: string | null }
        Update: { id?: string; user_id?: string; attempted_at?: string; success?: boolean; action?: string; ip_address?: string | null; user_agent?: string | null }
        Relationships: []
      }
      expenses: {
        Row: { id: string; organization_id: string; category: 'rent' | 'salaries' | 'electricity' | 'water' | 'equipment' | 'maintenance' | 'marketing' | 'insurance' | 'taxes' | 'products'; description: string; amount: number; expense_date: string; created_by: string | null; reference_type: string | null; reference_id: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; organization_id: string; category: 'rent' | 'salaries' | 'electricity' | 'water' | 'equipment' | 'maintenance' | 'marketing' | 'insurance' | 'taxes' | 'products'; description: string; amount: number; expense_date?: string; created_by?: string | null; reference_type?: string | null; reference_id?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; organization_id?: string; category?: 'rent' | 'salaries' | 'electricity' | 'water' | 'equipment' | 'maintenance' | 'marketing' | 'insurance' | 'taxes' | 'products'; description?: string; amount?: number; expense_date?: string; created_by?: string | null; reference_type?: string | null; reference_id?: string | null; created_at?: string; updated_at?: string }
        Relationships: []
      }
      wedding_programs: {
        Row: { id: string; organization_id: string; name: string; description: string | null; duration_days: number; price: number; max_participants: number | null; is_active: boolean; created_at: string }
        Insert: { id?: string; organization_id: string; name: string; description?: string | null; duration_days: number; price: number; max_participants?: number | null; is_active?: boolean; created_at?: string }
        Update: { id?: string; organization_id?: string; name?: string; description?: string | null; duration_days?: number; price?: number; max_participants?: number | null; is_active?: boolean; created_at?: string }
        Relationships: []
      }
      investments: {
        Row: { id: string; organization_id: string; category: 'produits' | 'materiel' | 'travaux' | 'amenagement' | 'logiciels' | 'marketing' | 'publicite' | 'formation' | 'consommables' | 'autres'; description: string; amount: number; investment_date: string; notes: string | null; created_by: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; organization_id: string; category: 'produits' | 'materiel' | 'travaux' | 'amenagement' | 'logiciels' | 'marketing' | 'publicite' | 'formation' | 'consommables' | 'autres'; description?: string; amount?: number; investment_date?: string; notes?: string | null; created_by?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; organization_id?: string; category?: 'produits' | 'materiel' | 'travaux' | 'amenagement' | 'logiciels' | 'marketing' | 'publicite' | 'formation' | 'consommables' | 'autres'; description?: string; amount?: number; investment_date?: string; notes?: string | null; created_by?: string | null; created_at?: string; updated_at?: string }
        Relationships: []
      }
      profitability_objectives: {
        Row: { id: string; organization_id: string; period_type: 'monthly' | 'yearly'; period_label: string; revenue_target: number; profit_target: number; investment_budget: number; member_target: number; created_at: string; updated_at: string }
        Insert: { id?: string; organization_id: string; period_type: 'monthly' | 'yearly'; period_label: string; revenue_target?: number; profit_target?: number; investment_budget?: number; member_target?: number; created_at?: string; updated_at?: string }
        Update: { id?: string; organization_id?: string; period_type?: 'monthly' | 'yearly'; period_label?: string; revenue_target?: number; profit_target?: number; investment_budget?: number; member_target?: number; created_at?: string; updated_at?: string }
        Relationships: []
      }
      payment_changes: {
        Row: { id: string; organization_id: string; user_id: string | null; member_id: string | null; source: 'subscription' | 'pos'; payment_id: string | null; pos_transaction_id: string | null; action: 'modify' | 'cancel'; old_data: Json | null; new_data: Json | null; reason: string | null; created_at: string }
        Insert: { id?: string; organization_id: string; user_id?: string | null; member_id?: string | null; source: 'subscription' | 'pos'; payment_id?: string | null; pos_transaction_id?: string | null; action: 'modify' | 'cancel'; old_data?: Json | null; new_data?: Json | null; reason?: string | null; created_at?: string }
        Update: { id?: string; organization_id?: string; user_id?: string | null; member_id?: string | null; source?: 'subscription' | 'pos'; payment_id?: string | null; pos_transaction_id?: string | null; action?: 'modify' | 'cancel'; old_data?: Json | null; new_data?: Json | null; reason?: string | null; created_at?: string }
        Relationships: []
      }
      whatsapp_outbox: {
        Row: { id: string; organization_id: string; member_id: string | null; member_name: string | null; phone: string | null; template_key: string; message: string; status: 'ready' | 'sent_via_link' | 'queued' | 'sent' | 'failed'; created_by: string | null; sent_at: string | null; created_at: string }
        Insert: { id?: string; organization_id: string; member_id?: string | null; member_name?: string | null; phone?: string | null; template_key?: string; message?: string; status?: 'ready' | 'sent_via_link' | 'queued' | 'sent' | 'failed'; created_by?: string | null; sent_at?: string | null; created_at?: string }
        Update: { id?: string; organization_id?: string; member_id?: string | null; member_name?: string | null; phone?: string | null; template_key?: string; message?: string; status?: 'ready' | 'sent_via_link' | 'queued' | 'sent' | 'failed'; created_by?: string | null; sent_at?: string | null; created_at?: string }
        Relationships: []
      }
      audit_logs: {
        Row: { id: string; organization_id: string; user_id: string | null; action: 'INSERT' | 'UPDATE' | 'DELETE'; entity_type: string; entity_id: string; old_data: Json | null; new_data: Json | null; ip_address: string | null; created_at: string }
        Insert: { id?: string; organization_id: string; user_id?: string | null; action: 'INSERT' | 'UPDATE' | 'DELETE'; entity_type: string; entity_id: string; old_data?: Json | null; new_data?: Json | null; ip_address?: string | null; created_at?: string }
        Update: { id?: string; organization_id?: string; user_id?: string | null; action?: 'INSERT' | 'UPDATE' | 'DELETE'; entity_type?: string; entity_id?: string; old_data?: Json | null; new_data?: Json | null; ip_address?: string | null; created_at?: string }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type Organization = Tables<'organizations'>
export type UserRole = Tables<'user_roles'>
export type Member = Tables<'members'>
export type SubscriptionType = Tables<'subscription_types'>
export type MemberSubscription = Tables<'member_subscriptions'>
export type Payment = Tables<'payments'>
export type Class = Tables<'classes'>
export type Attendance = Tables<'attendance'>
export type Staff = Tables<'staff'>
export type StaffTimesheet = Tables<'staff_timesheet'>
export type StaffShift = Tables<'staff_shifts'>
export type StaffLeave = Tables<'staff_leaves'>
export type Equipment = Tables<'equipment'>
export type EquipmentReservation = Tables<'equipment_reservations'>
export type Inventory = Tables<'inventory'>
export type Consumable = Tables<'consumables'>
export type Product = Tables<'products'>
export type PosSession = Tables<'pos_sessions'>
export type PosTransaction = Tables<'pos_transactions'>
export type Badge = Tables<'badges'>
export type AccessControl = Tables<'access_control'>
export type Notification = Tables<'notifications'>
export type License = Tables<'licenses'>
export type Setting = Tables<'settings'>
export type Corporate = Tables<'corporate'>
export type RfidCard = Tables<'rfid_cards'>
export type RfidCardAudit = Tables<'rfid_audit_log'>
export type RfidReadLog = Tables<'rfid_read_logs'>
export type TurnstileStatus = Tables<'turnstile_status'>
export type ManualValidation = Tables<'manual_validations'>
export type Expense = Tables<'expenses'>
export type Investment = Tables<'investments'>
export type StaffSalaryPayment = Tables<'staff_salary_payments'>
export type CoachSession = Tables<'coach_sessions'>
export type PaymentChange = Tables<'payment_changes'>
export type WhatsappOutbox = Tables<'whatsapp_outbox'>
export type AuditLog = Tables<'audit_logs'>
