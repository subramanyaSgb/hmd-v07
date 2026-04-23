
export interface User {
  id: number;
  username: string;
  role: 'admin' | 'producer' | 'consumer';
  user_id: string;
  is_active: boolean;
}

export interface AuthUser extends User {
  access_token: string;
  token_type: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export type TripStatus = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export const TripStatusLabels: Record<TripStatus, string> = {
  0: 'Pending',
  1: 'Assigned',
  2: 'P_Entered',
  3: 'P_Loading',
  4: 'P_Loaded',
  5: 'P_Exited',
  6: 'C_Entered',
  7: 'C_Unloading',
  8: 'C_Unloaded',
  9: 'Completed',
};

export interface Trip {
  id: number;
  torpedo_id: string | null;
  producer_id: string;
  consumer_id: string;
  status: TripStatus;
  created_at: string;
  last_updated: string;
  assigned_at?: string;
  p_entered_at?: string;
  p_loading_start_at?: string;
  p_loading_end_at?: string;
  p_exited_at?: string;
  c_entered_at?: string;
  c_unloading_start_at?: string;
  c_unloading_end_at?: string;
  c_exited_at?: string;
  expected_p_enter_at?: string;
  expected_p_loading_start_at?: string;
  expected_p_loading_end_at?: string;
  expected_p_exit_at?: string;
  expected_c_enter_at?: string;
  expected_c_unloading_start_at?: string;
  expected_c_unloading_end_at?: string;
  expected_c_exit_at?: string;
  cycle_time_minutes?: number;
  shift?: 'day' | 'night' | 'afternoon';
  assignment_id?: number;
}

export type PlanStatus = 'Primary' | 'Revised' | 'Confirmed';

export interface DailyPlan {
  id: number;
  date: string;
  user_id: string;
  role: 'producer' | 'consumer';
  capacity: number;
  status: PlanStatus;
  created_at: string;
  last_updated: string;
}

export interface DistributionAssignment {
  id: number;
  date: string;
  producer_id: string;
  consumer_id: string;
  quantity: number;
  trip_count: number;
  status: string;
}

export type FleetStatus = 'Operating' | 'Maintenance' | 'Assigned';

export interface Fleet {
  id: number;
  fleet_id: string;
  type: 'torpedo';
  status: FleetStatus;
  capacity: number;
  last_updated: string;
}

export type NodeType = 'producer' | 'consumer' | 'main_plant';
export type NodeStatus = 'Operating' | 'Maintenance' | 'Shutdown';

export interface Location {
  id: number;
  user_id: string;
  location_name: string;
  type: NodeType;
  status: NodeStatus;
  x: number;
  y: number;
  is_visible: boolean;
}

export interface MaintenanceSchedule {
  id: number;
  node_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  created_at: string;
}

export interface Notification {
  id: number;
  user_id: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  is_read: boolean;
  link?: string;
  created_at: string;
}

export interface ActivityLog {
  id: number;
  user_id: number;
  username: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  old_value?: string;
  new_value?: string;
  description?: string;
  ip_address?: string;
  timestamp: string;
}

export interface DeviationThreshold {
  warning_minutes: number;
  alert_minutes: number;
  critical_minutes: number;
}

export interface LiveTrip extends Trip {
  deviation_minutes?: number;
  deviation_status?: 'early' | 'on_time' | 'warning' | 'alert' | 'critical';
  current_phase?: string;
  eta?: string;
}

export interface TrendDataPoint {
  date: string;
  displayDate: string;
  production: number;
  consumption: number;
  plannedProduction: number;
  plannedConsumption: number;
  efficiency: number;
  movingAvg?: number | null;
}

export interface DeviationSummary {
  total_trips: number;
  early_count: number;
  on_time_count: number;
  warning_count: number;
  alert_count: number;
  critical_count: number;
  avg_deviation_minutes: number;
  min_deviation_minutes: number;
  max_deviation_minutes: number;
}

export interface TripTimeConfig {
  id: number;
  source_user_id: string;
  destination_user_id: string;
  travel_time_minutes: number;
}

export interface SystemConfig {
  config_key: string;
  config_value: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface ActivityLogsResponse {
  logs: ActivityLog[];
  total: number;
}

export interface DashboardSummary {
  summary: {
    total_production: number;
    total_consumption: number;
    net: number;
  };
  individual: DailyPlan[];
  assignments: DistributionAssignment[];
}

export interface ApiRequestOptions extends RequestInit {
  timeout?: number;
  retries?: number;
}

export interface ApiError extends Error {
  status?: number;
}
