const POWER_AUTOMATE_ENDPOINT = 'https://default61576f99244849ec8803974b47673f.57.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/ef89e5969a8f45778307f167f435253c/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=pPhk80gODQOi843ixLjZtPPWqTeXIbIt9ifWZP6CJfY';

/**
 * Netlify Function: statement_table_calculation
 * Accepts a customer username and fetches dispatched orders from Maropost via Power Automate.
 */
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
        const body = JSON.parse(event.body || '{}');
        const { customer_username } = body;

        if (!customer_username) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    success: false,
                    error: 'Bad Request',
                    message: 'customer_username is required'
                })
            };
        }

        console.log(`Fetching dispatched orders for customer: ${customer_username}`);

        const payload = {
            Filter: {
                Username: customer_username,
                OrderStatus: ['Dispatched'],
                PaymentStatus: ['Pending', 'PartialPaid'],
                OutputSelector: [
                    'ID',
                    'OrderID',
                    'DatePlaced',
                    'DateInvoiced',
                    'GrandTotal',
                    'OrderStatus',
                    'DatePaymentDue',
                    'PurchaseOrderNumber',
                    'OrderPayment',
                    'OrderPayment.PaymentType',
                    'OrderPayment.Amount'
                ]
            },
            action: 'GetOrder'
        };

        const response = await fetch(POWER_AUTOMATE_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
        }

        const data = await response.json();
        
        if (data.Ack !== 'Success') {
            console.error('API Error Response:', data);
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

        const rawOrders = data.Order || [];

        // Process orders to calculate paid and outstanding amounts (logic from generate_invoices_statements)
        const orders = rawOrders.map(order => {
            const grandTotal = parseFloat(order.GrandTotal || 0);
            const paymentsSum = order.OrderPayment && Array.isArray(order.OrderPayment)
                ? order.OrderPayment.reduce((sum, p) => sum + parseFloat(p.Amount || 0), 0)
                : 0;
            const outstandingAmount = grandTotal - paymentsSum;

            return {
                ...order,
                paidAmount: paymentsSum,
                outstandingAmount: outstandingAmount
            };
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                count: orders.length,
                orders: orders
            })
        };

    } catch (err) {
        console.error('statement_table_calculation error:', err);
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

module.exports = { handler };
