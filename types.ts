// Paystack Webhook Event Types
export interface PaystackWebhookEvent {
  event: string;
  data: PaystackChargeData;
}
type FlexibleMetadata={
    user:{
      first_name:string,
      last_name?:string,
      services:string[],
      phone?:string
    }
}
export interface PaystackChargeData {
  id: number;
  domain: string;
  status: string;
  reference: string;
  amount: number;
  message: string | null;
  gateway_response: string;
  paid_at: string;
  created_at: string;
  channel: string;
  currency: string;
  ip_address: string;
  metadata: FlexibleMetadata;
  log: PaystackTransactionLog;
  fees: number | null;
  customer: PaystackCustomer;
  authorization: PaystackAuthorization;
  plan: Record<string, any>;
}

export interface PaystackTransactionLog {
  time_spent: number;
  attempts: number;
  authentication: string;
  errors: number;
  success: boolean;
  mobile: boolean;
  input: any[];
  channel: string | null;
  history: PaystackLogHistoryItem[];
}

export interface PaystackLogHistoryItem {
  type: string;
  message: string;
  time: number;
}

export interface PaystackCustomer {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  customer_code: string;
  phone: string | null;
  metadata: FlexibleMetadata;
  risk_action: string;
}

export interface PaystackAuthorization {
  authorization_code: string;
  bin: string;
  last4: string;
  exp_month: string;
  exp_year: string;
  card_type: string;
  bank: string;
  country_code: string;
  brand: string;
  account_name: string;
}