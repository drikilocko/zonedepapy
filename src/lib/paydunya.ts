import {
    FunctionsFetchError,
    FunctionsHttpError,
    FunctionsRelayError,
} from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface PayDunyaInvoiceResult {
    success: boolean;
    message?: string;
    amountXOF?: number;
    error?: string;
}

export async function initiatePayDunyaPayment(
    orderId: string,
    paymentMethod: 'tmoney' | 'flooz',
    paymentPhone: string
): Promise<PayDunyaInvoiceResult> {
    const { data, error } = await supabase.functions.invoke('paydunya-checkout', {
        body: { orderId, paymentMethod, paymentPhone },
    });

    if (error) {
        if (error instanceof FunctionsHttpError) {
            try {
                const responseBody = await error.context.json() as { error?: unknown };
                if (typeof responseBody.error === 'string') {
                    return { success: false, error: responseBody.error };
                }
            } catch {
                return {
                    success: false,
                    error: `Le service de paiement a répondu avec une erreur (HTTP ${error.context.status}).`,
                };
            }
            return {
                success: false,
                error: `Le service de paiement a répondu avec une erreur (HTTP ${error.context.status}).`,
            };
        }

        if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
            return {
                success: false,
                error: 'Impossible de joindre le service de paiement. Vérifiez votre connexion et que la fonction Supabase paydunya-checkout est déployée.',
            };
        }

        return { success: false, error: error.message };
    }

    if (typeof data?.message !== 'string' || typeof data?.amountXOF !== 'number') {
        return {
            success: false,
            error: 'Le service de paiement a renvoyé une réponse invalide.',
        };
    }

    return { success: true, message: data.message, amountXOF: data.amountXOF };
}

export function isValidTogoMobileNumber(phone: string): boolean {
    const digits = phone.replace(/\D/g, '');
    const localNumber = digits.startsWith('228') && digits.length === 11
        ? digits.slice(3)
        : digits;
    return /^\d{8}$/.test(localNumber);
}

/**
 * Convertit un montant USD en XOF (FCFA)
 * 1 USD ≈ 600 XOF
 */
export function usdToXOF(amountUSD: number): number {
    return Math.round(amountUSD * 600);
}
