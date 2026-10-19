export const statusLabels = {
  pending: "Pendente",
  confirmed: "Confirmada",
  declined: "Recusada",
  cancelled: "Cancelada",
  completed: "Concluída",
} as const;
export type ReservationStatus = keyof typeof statusLabels;
export const statusTransitions: Record<ReservationStatus, ReservationStatus[]> =
  {
    pending: ["confirmed", "declined", "cancelled"],
    confirmed: ["cancelled", "completed"],
    declined: [],
    cancelled: [],
    completed: [],
  };
export type Customer = {
  id: string;
  name: string;
  phone: string;
  normalized_phone: string;
  email: string | null;
  birthday: string | null;
  vip: boolean;
  source: "website" | "manual";
  notes: string;
  revision: number;
  created_at: string;
  updated_at: string;
  reservation_count: number;
  completed_visits: number;
  last_reservation: string | null;
};
export type Reservation = {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  normalized_phone: string;
  vip: boolean;
  contact_name: string;
  contact_phone: string;
  contact_normalized_phone: string;
  contact_email: string | null;
  date: string;
  time: string;
  guests: number;
  occasion: string;
  customer_notes: string;
  internal_notes: string;
  status: ReservationStatus;
  source: "website" | "manual";
  revision: number;
  created_at: string;
  updated_at: string;
};
export type ReservationList = {
  items: Reservation[];
  total: number;
  page: number;
  stats: {
    today: number;
    pending: number;
    confirmed: number;
    completed: number;
  };
};
export type CustomerList = { items: Customer[]; total: number; page: number };
export type CustomerDetail = {
  customer: Customer;
  reservations: Reservation[];
};
export type ReservationDetail = {
  reservation: Reservation;
  audit: {
    action: string;
    actor_name: string | null;
    created_at: string;
    metadata: Record<string, unknown>;
  }[];
};
