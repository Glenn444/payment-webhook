import * as crypto from "node:crypto"
import "jsr:@std/dotenv/load";
import { PaystackWebhookEvent } from "./types.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2'

const secret = Deno.env.get("PAYSTACK_SECRET_KEY")
if (!secret) {
    throw new Error("Please provide a Paystack Secret Key")
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')

if (!supabaseUrl || !supabaseKey) {
    throw new Error("Please provide Supabase URL and Anon Key")
}
const supabase = createClient(supabaseUrl, supabaseKey)

Deno.serve(async (req) => {
    try {
        const url = new URL(req.url);
       
        if (url.pathname !== '/pay/webhook/url' || req.method !== "POST") {
            return Response.json("Welcome to paystack payment Webhook", { status: 200 });
        }

        // Get raw body for signature verification
        const rawBody =  await req.json();
        
        if (!rawBody) {
            return Response.json('No request body', { status: 400 });
        }

        // Verify webhook signature
        const hash = crypto.createHmac('sha512', secret).update(JSON.stringify(rawBody)).digest('hex');
        const signature = req.headers.get('x-paystack-signature');

        if (hash !== signature) {
            console.log('Signature mismatch:', { hash, signature });
            return Response.json('Unauthorized request', { status: 401 });
        }

        // Parse the event after signature verification
        const event: PaystackWebhookEvent = rawBody;
        
        // Insert into Supabase
        const {  error } = await supabase
            .from("payment_webhooks")
            .insert({
                event_type: event?.event,
                transaction_reference: event?.data?.reference,
                customer_email: event?.data?.customer?.email,
                customer_fname: event?.data?.metadata.user.first_name,
                customer_lname:event?.data.metadata.user.last_name,
                services:event.data.metadata.user.services,
                customer_phone:event.data.metadata.user.phone
            });

        if (error) {
            console.error('Supabase error:', error);
            return Response.json({ error: 'Database insertion failed' }, { status: 500 });
        }

        
        return Response.json({success:true} ,{ status: 200 });

    // deno-lint-ignore no-explicit-any
    } catch (error:any) {
        console.error('Webhook error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});