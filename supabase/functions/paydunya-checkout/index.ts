import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (body: Record<string, unknown>, status: number) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

Deno.serve(async (request: Request) => {
    if (request.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }
    if (request.method !== 'POST') {
        return jsonResponse({ error: 'Méthode non autorisée.' }, 405);
    }

    const authorization = request.headers.get('Authorization');
    if (!authorization) {
        return jsonResponse({ error: 'Authentification requise.' }, 401);
    }

    let payload: unknown;
    try {
        payload = await request.json();
    } catch {
        return jsonResponse({ error: 'Requête JSON invalide.' }, 400);
    }
    if (!isRecord(payload)) {
        return jsonResponse({ error: 'Requête JSON invalide.' }, 400);
    }
    const orderId = payload.orderId;
    const paymentMethod = payload.paymentMethod;
    const paymentPhone = payload.paymentPhone;
    if (typeof orderId !== 'string' || !orderId.trim()) {
        return jsonResponse({ error: 'Identifiant de commande invalide.' }, 400);
    }
    if (paymentMethod !== 'tmoney' && paymentMethod !== 'flooz') {
        return jsonResponse({ error: 'Opérateur de paiement invalide.' }, 400);
    }
    if (paymentPhone !== undefined
        && (typeof paymentPhone !== 'string' || paymentPhone.length > 32)) {
        return jsonResponse({ error: 'Numéro de paiement invalide.' }, 400);
    }
    const phoneDigits = typeof paymentPhone === 'string' ? paymentPhone.replace(/\D/g, '') : '';
    const localPhone = phoneDigits.startsWith('228') && phoneDigits.length === 11
        ? phoneDigits.slice(3)
        : phoneDigits;
    if (!/^\d{8}$/.test(localPhone)) {
        return jsonResponse({ error: 'Saisis un numéro Togo valide de 8 chiffres.' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const masterKey = Deno.env.get('PAYDUNYA_MASTER_KEY');
    const token = Deno.env.get('PAYDUNYA_TOKEN');
    const privateKey = Deno.env.get('PAYDUNYA_PRIVATE_KEY');
    if (!supabaseUrl || !supabaseAnonKey || !masterKey || !token || !privateKey) {
        return jsonResponse({ error: 'Le service de paiement n’est pas configuré.' }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authorization } },
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return jsonResponse({ error: 'Session invalide. Reconnectez-vous.' }, 401);
    }

    const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('id, total, payment_method, shipping_address')
        .eq('id', orderId.trim())
        .eq('user_id', user.id)
        .maybeSingle();
    if (orderError) {
        return jsonResponse({ error: 'Impossible de vérifier la commande.' }, 500);
    }
    if (!order) {
        return jsonResponse({ error: 'Commande introuvable.' }, 404);
    }
    if (order.payment_method !== paymentMethod) {
        return jsonResponse({ error: 'Le mode de paiement ne correspond pas à la commande.' }, 400);
    }

    const amountXOF = Math.round(Number(order.total) * 600);
    if (!Number.isFinite(amountXOF) || amountXOF <= 0) {
        return jsonResponse({ error: 'Le montant de la commande est invalide.' }, 400);
    }

    const shippingAddress = order.shipping_address as {
        fullName?: string;
        address?: string;
        phone?: string;
    } | null;
    const invoiceBody = {
        invoice: {
            total_amount: amountXOF,
            description: `Commande ${order.id} - Zone de Papy`,
        },
        store: {
            name: 'Zone de Papy',
            tagline: 'Mode & Style Premium',
            phone_number: '+22890000000',
            postal_address: 'Lomé, Togo',
        },
        actions: {
            cancel_url: 'https://zonedepapy.com/cancel',
            return_url: 'https://zonedepapy.com/success',
            callback_url: 'https://zonedepapy.com/api/ipn',
        },
        custom_data: {
            order_id: order.id,
            customer_name: shippingAddress?.fullName || '',
            customer_phone: typeof paymentPhone === 'string' && paymentPhone.trim()
                ? paymentPhone.trim()
                : shippingAddress?.phone || '',
            customer_email: user.email || '',
        },
    };

    let response: Response;
    try {
        response = await fetch('https://app.paydunya.com/api/v1/checkout-invoice/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'PAYDUNYA-MASTER-KEY': masterKey,
                'PAYDUNYA-PRIVATE-KEY': privateKey,
                'PAYDUNYA-TOKEN': token,
            },
            body: JSON.stringify(invoiceBody),
        });
    } catch {
        return jsonResponse({ error: 'Impossible de joindre PayDunya. Veuillez réessayer.' }, 502);
    }

    let paydunyaResponse: {
        response_code?: string;
        response_text?: string;
        token?: string;
        description?: string;
    };
    try {
        paydunyaResponse = await response.json();
    } catch {
        return jsonResponse({ error: 'PayDunya a renvoyé une réponse invalide.' }, 502);
    }

    if (!response.ok || paydunyaResponse.response_code !== '00' || !paydunyaResponse.token) {
        return jsonResponse({
            error: paydunyaResponse.description
                || paydunyaResponse.response_text
                || `PayDunya a refusé la demande (HTTP ${response.status}).`,
        }, 502);
    }

    const softPayBody = paymentMethod === 'tmoney'
        ? {
            name_t_money: shippingAddress?.fullName || user.email || 'Client',
            email_t_money: user.email || '',
            phone_t_money: localPhone,
            payment_token: paydunyaResponse.token,
        }
        : {
            moov_togo_customer_fullname: shippingAddress?.fullName || user.email || 'Client',
            moov_togo_email: user.email || '',
            moov_togo_customer_address: shippingAddress?.address || 'Lomé, Togo',
            moov_togo_phone_number: localPhone,
            payment_token: paydunyaResponse.token,
        };

    let softPayResponse: Response;
    try {
        softPayResponse = await fetch(
            `https://app.paydunya.com/api/v1/softpay/${paymentMethod === 'tmoney' ? 't-money-togo' : 'moov-togo'}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'PAYDUNYA-MASTER-KEY': masterKey,
                    'PAYDUNYA-PRIVATE-KEY': privateKey,
                    'PAYDUNYA-TOKEN': token,
                },
                body: JSON.stringify(softPayBody),
            }
        );
    } catch {
        return jsonResponse({
            error: 'La facture a été créée, mais PayDunya est injoignable pour lancer le paiement mobile. Réessaie ou contacte le support.',
        }, 502);
    }

    let softPayResult: unknown;
    try {
        softPayResult = await softPayResponse.json();
    } catch {
        return jsonResponse({
            error: `PayDunya a renvoyé une réponse invalide pour le paiement mobile (HTTP ${softPayResponse.status}).`,
        }, 502);
    }

    if (!softPayResponse.ok || !isRecord(softPayResult) || softPayResult.success !== true) {
        const providerMessage = isRecord(softPayResult)
            ? [softPayResult.message, softPayResult.error, softPayResult.errors]
                .find((value) => typeof value === 'string')
            : undefined;
        return jsonResponse({
            error: typeof providerMessage === 'string'
                ? providerMessage
                : `PayDunya n’a pas pu lancer le paiement mobile (HTTP ${softPayResponse.status}).`,
        }, 502);
    }

    return jsonResponse({
        message: typeof softPayResult.message === 'string'
            ? softPayResult.message
            : 'Demande de paiement envoyée. Valide-la sur ton téléphone.',
        amountXOF,
    }, 200);
});
