import * as crypto from "node:crypto";
import "jsr:@std/dotenv/load";
import { Buffer } from "node:buffer";

const secret = Deno.env.get("SECRET");
if (!secret) {
    throw new Deno.errors.NotFound("Please Provide a secret");
}

Deno.serve(async (req) => {
    const url = new URL(req.url);

    // Handle non-webhook routes
    if (url.pathname !== '/pay/webhook/url') {
        return Response.json("Welcome to paystack payment Webhook", { status: 200 });
    }

    // Only handle POST requests for webhooks
    if (req.method !== 'POST') {
        return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    try {
        // Get raw body for signature verification
        if (!req.body) {
            return Response.json({ error: 'No request body' }, { status: 400 });
        }

        const rawBody = await req.text();
        
        if (!rawBody) {
            return Response.json({ error: 'Empty request body' }, { status: 400 });
        }

        // Verify signature using raw body
        const hash = crypto.createHmac('sha512', secret)
            .update(JSON.stringify(rawBody))
            .digest('hex');

        const paystackSignature = req.headers.get('x-paystack-signature');
        
        if (!paystackSignature) {
            console.log('Missing Paystack signature header');
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Compare signatures securely
        if (!crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(paystackSignature))) {
            console.log('Invalid signature');
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Parse the verified payload
        const event = JSON.parse(rawBody);
        
        console.log('Verified webhook event:', event.event);
        
        // Process the webhook event
        await processWebhookEvent(event);
        
        // Return success response (don't return sensitive data)
        return Response.json({ received: true }, { status: 200 });

    } catch (error) {
        console.error('Webhook processing error:', error);
        return Response.json({ error: 'Internal server error' }, { status: 500 });
    }
});

// Process different Paystack webhook events
async function processWebhookEvent(event) {
    const { event: eventType, data } = event;
    
    switch (eventType) {
        case 'charge.success':
            await handleSuccessfulPayment(data);
            break;
            
        case 'charge.failed':
            await handleFailedPayment(data);
            break;
            
            
        default:
            console.log(`Unhandled event type: ${eventType}`);
    }
}

// Event handlers
async function handleSuccessfulPayment(data) {
    console.log('Processing successful payment:', data.reference);
    
    try {
        // Update payment status in your database
        await updatePaymentStatus(data.reference, 'completed', {
            amount: data.amount / 100, // Paystack amounts are in kobo
            currency: data.currency,
            customer: data.customer,
            paymentMethod: data.authorization?.channel,
            transactionId: data.id,
            paidAt: data.paid_at
        });
        
        // Send confirmation email
        await sendPaymentConfirmation(data.customer.email, data);
        
        // Grant access to service/product
        await grantServiceAccess(data.customer.id, data.metadata);
        
    } catch (error) {
        console.error('Error processing successful payment:', error);
    }
}

async function handleFailedPayment(data) {
    console.log('Processing failed payment:', data.reference);
    
    try {
        await updatePaymentStatus(data.reference, 'failed', {
            failureReason: data.gateway_response,
            amount: data.amount / 100,
            currency: data.currency
        });
        
        // Notify customer of failed payment
        await notifyPaymentFailure(data.customer.email, data);
        
    } catch (error) {
        console.error('Error processing failed payment:', error);
    }
}

async function handleSuccessfulTransfer(data) {
    console.log('Processing successful transfer:', data.transfer_code);
    // Implement transfer success logic
}

async function handleFailedTransfer(data) {
    console.log('Processing failed transfer:', data.transfer_code);
    // Implement transfer failure logic
}

async function handleSubscriptionCreated(data) {
    console.log('Processing new subscription:', data.subscription_code);
    // Implement subscription creation logic
}

async function handleSubscriptionDisabled(data) {
    console.log('Processing disabled subscription:', data.subscription_code);
    // Implement subscription cancellation logic
}

async function handleInvoiceCreated(data) {
    console.log('Processing new invoice:', data.invoice_code);
    // Implement invoice creation logic
}

async function handleInvoicePaymentFailed(data) {
    console.log('Processing failed invoice payment:', data.invoice_code);
    // Implement invoice payment failure logic
}

// Placeholder functions - implement these based on your needs
async function updatePaymentStatus(reference, status, additionalData) {
    // Implement your payment status update logic here
    console.log(`Updating payment ${reference} to status: ${status}`);
}

async function sendPaymentConfirmation(email, paymentData) {
    // Implement email sending logic
    console.log(`Sending confirmation to: ${email}`);
}

async function grantServiceAccess(customerId, metadata) {
    // Implement service access granting logic
    console.log(`Granting access to customer: ${customerId}`);
}

async function notifyPaymentFailure(email, paymentData) {
    // Implement failure notification logic
    console.log(`Notifying payment failure to: ${email}`);
}