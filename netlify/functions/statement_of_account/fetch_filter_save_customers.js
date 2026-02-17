const { supabase } = require('../utils/supabaseInit');
const { filterCustomersByBalance } = require('../generate_invoices_statements/customerUtils');

const API_URL = 'https://default61576f99244849ec8803974b47673f.57.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/ef89e5969a8f45778307f167f435253c/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=pPhk80gODQOi843ixLjZtPPWqTeXIbIt9ifWZP6CJfY';

/**
 * Get UTC range for the current calendar day in Australia/Sydney.
 * Used to query statement_of_accounts for "today" in Sydney (duplicate check).
 * @returns {{ startUTC: string, endUTC: string }} ISO strings for Supabase .gte/.lte
 */
function getSydneyTodayUtcRange() {
    const now = new Date();
    const sydneyDateStr = now.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
    const [y, m, d] = sydneyDateStr.split('-').map(Number);

    const utcNoon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
    const sydneyHour = parseInt(
        utcNoon.toLocaleString('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', hour12: false }),
        10
    );
    const offsetHours = sydneyHour - 12;

    const startUTC = new Date(
        Date.UTC(y, m - 1, d, 0, 0, 0, 0) - offsetHours * 60 * 60 * 1000
    );
    const endUTC = new Date(startUTC.getTime() + 24 * 60 * 60 * 1000 - 1);

    return {
        startUTC: startUTC.toISOString(),
        endUTC: endUTC.toISOString()
    };
}

const handler = async (event) => {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({
                success: false,
                error: 'Method Not Allowed',
                message: 'This endpoint only accepts POST requests'
            })
        };
    }

    try {
        if (!supabase) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({
                    success: false,
                    error: 'Supabase not initialized',
                    message: 'Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY)'
                })
            };
        }

        // 1. Fetch customers from Power Automate API (Username + AccountBalance only)
        let response;
        try {
            response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    Filter: {
                        Active: true,
                        OutputSelector: ['Username', 'AccountBalance']
                    },
                    action: 'GetCustomer'
                })
            });
        } catch (fetchError) {
            console.error('Customer API fetch error:', fetchError);
            return {
                statusCode: 502,
                headers,
                body: JSON.stringify({
                    success: false,
                    error: 'API Error',
                    message: `Failed to fetch customers: ${fetchError.message}`
                })
            };
        }

        if (!response.ok) {
            return {
                statusCode: 502,
                headers,
                body: JSON.stringify({
                    success: false,
                    error: 'API Error',
                    message: `Customer API returned ${response.status}`
                })
            };
        }

        const data = await response.json();
        if (data.Ack !== 'Success') {
            return {
                statusCode: 502,
                headers,
                body: JSON.stringify({
                    success: false,
                    error: 'API Error',
                    message: data.Ack || 'API did not return Success'
                })
            };
        }

        const allCustomers = data.Customer || [];
        const filtered = filterCustomersByBalance(allCustomers);

        if (filtered.length === 0) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    inserted: 0,
                    message: 'No customers with positive balance to save'
                })
            };
        }

        const usernamesToSave = filtered.map((c) => String(c.Username));

        // 2. Duplicate check: rows with same customer_username and created_at on same Sydney day
        const { startUTC, endUTC } = getSydneyTodayUtcRange();

        const { data: todayRecords, error: todayError } = await supabase
            .from('statement_of_accounts')
            .select('customer_username')
            .gte('created_at', startUTC)
            .lte('created_at', endUTC)
            .in('customer_username', usernamesToSave);

        if (todayError) {
            console.error('Supabase today-query error:', todayError);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({
                    success: false,
                    error: 'Database Error',
                    message: todayError.message
                })
            };
        }

        const alreadyToday = new Set((todayRecords || []).map((r) => r.customer_username));
        const toInsert = filtered.filter((c) => !alreadyToday.has(String(c.Username)));

        if (toInsert.length === 0) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    inserted: 0,
                    message: 'All candidates already have a row for today (Sydney)'
                })
            };
        }

        // 3. Batch insert (customer_username, balance; created_at from DB default)
        const rows = toInsert.map((c) => ({
            customer_username: String(c.Username),
            balance: parseFloat(c.AccountBalance || 0)
        }));

        const { data: inserted, error: insertError } = await supabase
            .from('statement_of_accounts')
            .insert(rows)
            .select('id, customer_username, balance, created_at');

        if (insertError) {
            console.error('Supabase insert error:', insertError);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({
                    success: false,
                    error: 'Database Error',
                    message: insertError.message
                })
            };
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                inserted: (inserted || []).length,
                rows: inserted || []
            })
        };
    } catch (err) {
        console.error('fetch_filter_save_customers error:', err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: 'Internal Error',
                message: err.message
            })
        };
    }
};

module.exports = { handler, getSydneyTodayUtcRange };
