import * as crypto from "node:crypto";
import "jsr:@std/dotenv/load";
import { createClient } from 'jsr:@supabase/supabase-js@2'

const secret = Deno.env.get("SECRET");
const paystackSecretKey = Deno.env.get("PAYSTACK_SECRET_KEY");


if (!secret || !paystackSecretKey) {
    throw new Error("Please provide SECRET and PAYSTACK_SECRET_KEY environment variables");
}

// In-memory stores (use proper database in production)
const pendingPayments = new Map(); // Store payment attempts before completion
const authorizedSignups = new Map(); // Store authorized signup tokens
const users = new Map(); // Store registered users

Deno.serve(async (req) => {
    const url = new URL(req.url);
    const method = req.method;

    // Route handlers
    if (method === "POST" && url.pathname === "/initiate-payment") {
        return await initiatePayment(req);
    }
    
    if (method === "POST" && url.pathname === "/pay/webhook/url") {
        return await handleWebhook(req);
    }
    
    if (method === "POST" && url.pathname === "/signup") {
        return await handleSignup(req);
    }
    
    if (method === "GET" && url.pathname === "/check-payment-status") {
        return await checkPaymentStatus(req);
    }

    return Response.json({ message: "Payment-First Signup API" }, { status: 200 });
});

// Step 1: Initiate payment before allowing signup
async function initiatePayment(req) {
    try {
        const { email, amount, planType, metadata } = await req.json();
        
        if (!email || !amount || !planType) {
            return Response.json({ 
                error: "Email, amount, and planType are required" 
            }, { status: 400 });
        }

        // Generate unique reference for this payment
        const paymentReference = `pay_${Date.now()}_${crypto.randomUUID().substring(0, 8)}`;
        
        // Store pending payment details
        pendingPayments.set(paymentReference, {
            email,
            amount,
            planType,
            metadata: metadata || {},
            status: 'pending',
            createdAt: new Date().toISOString(),
            signupAllowed: false
        });

        // Initialize Paystack payment
        const paystackPayload = {
            email,
            amount: amount * 100, // Convert to kobo
            reference: paymentReference,
            metadata: {
                planType,
                ...metadata
            },
            callback_url: `${new URL(req.url).origin}/payment-callback`
        };

        const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${paystackSecretKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(paystackPayload)
        });

        const paystackData = await paystackResponse.json();

        if (!paystackData.status) {
            return Response.json({ 
                error: "Failed to initialize payment",
                details: paystackData.message 
            }, { status: 400 });
        }

        return Response.json({
            success: true,
            paymentUrl: paystackData.data.authorization_url,
            reference: paymentReference,
            message: "Complete payment to proceed with signup"
        });

    } catch (error) {
        console.error('Payment initiation error:', error);
        return Response.json({ 
            error: "Failed to initiate payment" 
        }, { status: 500 });
    }
}

// Step 2: Handle successful payment webhook
async function handleWebhook(req) {
    try {
        if (!req.body) {
            return Response.json({ error: 'No request body' }, { status: 400 });
        }

        const rawBody = await req.text();
        const hash = crypto.createHmac('sha512', secret)
            .update(rawBody, 'utf8')
            .digest('hex');

        const paystackSignature = req.headers.get('x-paystack-signature');
        
        if (!paystackSignature || !crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(paystackSignature))) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const event = JSON.parse(rawBody);
        
        if (event.event === 'charge.success') {
            await processSuccessfulPayment(event.data);
        } else if (event.event === 'charge.failed') {
            await processFailedPayment(event.data);
        }
        
        return Response.json({ received: true }, { status: 200 });

    } catch (error) {
        console.error('Webhook processing error:', error);
        return Response.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// Process successful payment and authorize signup
async function processSuccessfulPayment(paymentData) {
    const reference = paymentData.reference;
    const pendingPayment = pendingPayments.get(reference);
    
    if (!pendingPayment) {
        console.error(`No pending payment found for reference: ${reference}`);
        return;
    }

    // Update payment status
    pendingPayment.status = 'completed';
    pendingPayment.completedAt = new Date().toISOString();
    pendingPayment.signupAllowed = true;
    pendingPayment.transactionId = paymentData.id;
    
    pendingPayments.set(reference, pendingPayment);

    // Generate signup authorization token
    const signupToken = crypto.randomUUID();
    authorizedSignups.set(signupToken, {
        email: pendingPayment.email,
        planType: pendingPayment.planType,
        paymentReference: reference,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutes
        used: false
    });

    console.log(`Payment successful for ${pendingPayment.email}. Signup authorized with token: ${signupToken}`);
    
    // Here you could send an email with the signup link containing the token
    await sendSignupAuthorizationEmail(pendingPayment.email, signupToken);
}

async function processFailedPayment(paymentData) {
    const reference = paymentData.reference;
    const pendingPayment = pendingPayments.get(reference);
    
    if (pendingPayment) {
        pendingPayment.status = 'failed';
        pendingPayment.failureReason = paymentData.gateway_response;
        pendingPayments.set(reference, pendingPayment);
    }
    
    console.log(`Payment failed for reference: ${reference}`);
}

// Step 3: Handle signup (only after successful payment)
async function handleSignup(req) {
    try {
        const { signupToken, userData } = await req.json();
        
        if (!signupToken) {
            return Response.json({ 
                error: "Signup token required. Please complete payment first." 
            }, { status: 400 });
        }

        const authData = authorizedSignups.get(signupToken);
        
        if (!authData) {
            return Response.json({ 
                error: "Invalid or expired signup token" 
            }, { status: 401 });
        }

        if (authData.used) {
            return Response.json({ 
                error: "Signup token already used" 
            }, { status: 401 });
        }

        if (new Date() > new Date(authData.expiresAt)) {
            return Response.json({ 
                error: "Signup token expired" 
            }, { status: 401 });
        }

        // Validate required user data
        const { fullName, password, phone } = userData || {};
        
        if (!fullName || !password) {
            return Response.json({ 
                error: "Full name and password are required" 
            }, { status: 400 });
        }

        // Check if user already exists
        if (users.has(authData.email)) {
            return Response.json({ 
                error: "User already exists" 
            }, { status: 400 });
        }

        // Create user account
        const userId = crypto.randomUUID();
        const user = {
            id: userId,
            email: authData.email,
            fullName,
            phone: phone || null,
            planType: authData.planType,
            paymentReference: authData.paymentReference,
            createdAt: new Date().toISOString(),
            status: 'active'
        };

        // Hash password (in production, use proper password hashing)
        user.passwordHash = crypto.createHash('sha256').update(password).digest('hex');

        // Save user
        users.set(authData.email, user);

        // Mark token as used
        authData.used = true;
        authorizedSignups.set(signupToken, authData);

        console.log(`User created successfully: ${authData.email}`);

        return Response.json({
            success: true,
            message: "Account created successfully",
            user: {
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                planType: user.planType
            }
        });

    } catch (error) {
        console.error('Signup error:', error);
        return Response.json({ 
            error: "Failed to create account" 
        }, { status: 500 });
    }
}

// Check payment status endpoint
async function checkPaymentStatus(req) {
    const url = new URL(req.url);
    const reference = url.searchParams.get('reference');
    
    if (!reference) {
        return Response.json({ 
            error: "Payment reference required" 
        }, { status: 400 });
    }

    const payment = pendingPayments.get(reference);
    
    if (!payment) {
        return Response.json({ 
            error: "Payment not found" 
        }, { status: 404 });
    }

    const response = {
        reference,
        status: payment.status,
        signupAllowed: payment.signupAllowed,
        email: payment.email,
        planType: payment.planType
    };

    if (payment.signupAllowed) {
        // Find the signup token for this payment
        for (const [token, authData] of authorizedSignups.entries()) {
            if (authData.paymentReference === reference && !authData.used) {
                response.signupToken = token;
                break;
            }
        }
    }

    return Response.json(response);
}

// Mock email function (implement with your email service)
async function sendSignupAuthorizationEmail(email, signupToken) {
    console.log(`Mock email sent to ${email}:`);
    console.log(`Signup authorized! Use this token to complete registration: ${signupToken}`);
    console.log(`Signup URL: /signup?token=${signupToken}`);
}

// Utility function to clean up expired tokens (run periodically)
function cleanupExpiredTokens() {
    const now = new Date();
    for (const [token, authData] of authorizedSignups.entries()) {
        if (new Date(authData.expiresAt) < now) {
            authorizedSignups.delete(token);
        }
    }
}

// Clean up expired tokens every hour
setInterval(cleanupExpiredTokens, 60 * 60 * 1000);