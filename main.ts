import * as crypto from "node:crypto"
import "jsr:@std/dotenv/load";
//import { createClient } from 'jsr:@supabase/supabase-js@2'


interface PaymentNotification {
    sent_at: string; // ISO 8601 datetime string
    channel: 'email' | 'sms' | 'webhook' | string; // Common channels, extensible
}

// Line item interface for itemized billing
interface LineItem {
    name: string;
    amount: number;
    quantity?: number;
    description?: string;
}

// Tax information interface
interface TaxInfo {
    name: string;
    amount: number;
    rate?: number; // Tax rate as percentage
}

// Main payment request data interface
interface PaymentRequestData {
    id: number;
    domain: string;
    amount: number; // Amount in smallest currency unit (kobo for NGN)
    currency: string; // ISO 4217 currency code
    due_date: string | null; // ISO 8601 datetime string or null
    has_invoice: boolean;
    invoice_number: string | null;
    description: string;
    pdf_url: string | null; // URL to PDF invoice/receipt
    line_items: LineItem[]; // Array of itemized charges
    tax: TaxInfo[]; // Array of tax information
    request_code: string; // Unique payment request identifier
    status: 'pending' | 'success' | 'failed' | 'cancelled' | string; // Payment status
    paid: boolean;
    paid_at: string | null; // ISO 8601 datetime string or null
    // deno-lint-ignore no-explicit-any
    metadata: Record<string, any> | null; // Flexible metadata object
    notifications: PaymentNotification[]; // Array of sent notifications
    offline_reference: string; // Internal reference number
    customer: number; // Customer ID reference
    created_at: string; // ISO 8601 datetime string
}
interface PaymentRequestWebhookEvent {
    event: 'paymentrequest.success' | 'paymentrequest.failed' | 'paymentrequest.pending' | string;
    data: PaymentRequestData;
}

const secret = Deno.env.get("PAYSTACK_SECRET_KEY")
if (secret == undefined) {
    throw new Deno.errors.NotFound("Please provide a Paystack Secret Key")
}


Deno.serve(async (req) => {
    try {
        const url = new URL(req.url);
        // const supabase = createClient(
        //     Deno.env.get('SUPABASE_URL') ?? '',
        //     Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        //     { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        // )
        if (url.pathname != '/pay/webhook/url' || req.method != "POST") {
            return Response.json("Welcome to paystack payment Webhook", { status: 200 });

        }

        let event: PaymentRequestWebhookEvent | undefined

        if (req.body) {
            event = await req.json()


        }

        const hash = crypto.createHmac('sha512', secret).update(JSON.stringify(event)).digest('hex')

        // console.log(hash);

        if (hash == req.headers.get('x-paystack-signature')) {
            //Use the event after validating the request
            console.log(event);
            return Response.json(event, { status: 200 });

        }

        return Response.json('unauthorized request', { status: 401 });

    } catch (error) {
        console.error(error)
        return Response.json(error, { status: 500 })
    }

});