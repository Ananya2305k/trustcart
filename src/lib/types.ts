export type OrderStatus =
  | "Placed"
  | "Confirmed"
  | "Shipped"
  | "Delivered"
  | "Cancelled";

export interface TrackingEvent {
  status: OrderStatus;
  message: string;
  timestamp: string;
  recordedBy?: "system" | "customer" | "admin";
}

export interface OrderItem {
  product: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string;
}

export interface Order {
  _id: string;
  items: OrderItem[];
  subtotal: number;
  shippingFee: number;
  total: number;
  shippingAddress: {
    fullName: string;
    phone: string;
    addressLine: string;
    city: string;
    state: string;
    postalCode: string;
    country?: string;
  };
  estimatedDelivery?: { from?: string; to?: string };
  estimateHistory?: {
    from: string;
    to: string;
    reason: string;
    timestamp: string;
    recordedBy: "system" | "admin";
  }[];
  estimateSource?: "default" | "history";
  estimateBasis?: number;
  carrier?: string;
  trackingNumber?: string;
  paymentMethod: string;
  paymentStatus: "Pending" | "Paid" | "Failed" | "Refunded";
  orderStatus: OrderStatus;
  trackingHistory: TrackingEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface PersonRef {
  _id: string;
  name: string;
  email: string;
}

export interface AdminOrder extends Omit<Order, "items"> {
  items: OrderItem[];
  user: PersonRef | null;
}

export type RefundStatus =
  | "Requested"
  | "Under review"
  | "Approved"
  | "Rejected"
  | "Refunded";

export interface Refund {
  _id: string;
  reason: string;
  details: string;
  amount: number;
  status: RefundStatus;
  adminNote?: string;
  history: {
    status: RefundStatus;
    message: string;
    timestamp: string;
    recordedBy: "customer" | "admin";
  }[];
  order: {
    _id: string;
    total: number;
    createdAt?: string;
    items?: { name: string }[];
    orderStatus?: string;
    paymentStatus?: string;
  } | null;
  user?: PersonRef | null;
  createdAt: string;
}

export type TicketStatus = "Open" | "In progress" | "Resolved" | "Closed";

export interface TicketAi {
  category: string;
  categoryConfidence: number;
  sentiment: string;
  sentimentScore: number;
  urgency: "low" | "medium" | "high";
  urgencySignals: string[];
  suggestedReply: string;
  replySource: string;
  modelVersion: string;
}

export interface Ticket {
  _id: string;
  subject: string;
  category: string;
  status: TicketStatus;
  order?: string | { _id: string; total: number; orderStatus: string } | null;
  messages: { author: "customer" | "admin"; text: string; timestamp: string }[];
  statusHistory: { status: TicketStatus; timestamp: string }[];
  ai?: TicketAi;
  user?: PersonRef | null;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  _id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  imageUrl: string;
  stock: number;
  isActive: boolean;
}

export interface AdminStats {
  orders: Partial<Record<OrderStatus, number>>;
  deliveredRevenue: number;
  openTickets: number;
  urgentTickets: number;
  pendingRefunds: number;
  lowStockProducts: number;
  lowStockThreshold: number;
}

export interface DeliveryPromiseResponse {
  stats: {
    sample: number;
    keptOriginalPct: number | null;
    keptLatestPct: number | null;
    revisedPct: number | null;
    avgDaysLateWhenLate: number | null;
    simulatedPct: number | null;
  };
  enoughData: boolean;
  minSample: number;
  currentWindow: {
    fromDays: number;
    toDays: number;
    source: "default" | "history";
    basis: number;
  };
}
