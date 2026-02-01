const { supabase } = require('../utils/supabaseInit');

/**
 * Filter customers by account balance
 * @param {Array} customers - Array of customer objects from API
 * @returns {Array} Filtered array of customers with AccountBalance > 0 (excludes negative balances)
 */
const filterCustomersByBalance = (customers) => {
    if (!Array.isArray(customers)) {
        return [];
    }

    return customers.filter(customer => {
        const balance = parseFloat(customer.AccountBalance || 0);
        return balance > 0;
    });
};

/**
 * Generate Invoices Statements - Fetch Customer Data and Invoices
 *
 * This function accepts different payload actions:
 * - "customers_only": Fetches customer data from Power Automate API, filtering out customers
 *   with negative or zero account balances. Returns filtered customer data with positive balances only.
 * - "invoices": Fetches invoices/orders for specified customers with optional limit.
 *   Returns customers with their outstanding invoices (Dispatched orders with Pending/PartialPaid status).
 */

const handler = async (event) => {
    console.log('=== Generate Invoices Statements Function Invoked ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('HTTP Method:', event.httpMethod);

    // CORS headers
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    // Validate HTTP method
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
        // Parse request body
        let requestBody = {};
        console.log('Raw event.body:', event.body);
        console.log('event.body type:', typeof event.body);
        console.log('event.body length:', event.body ? event.body.length : 0);

        if (event.body) {
            try {
                requestBody = JSON.parse(event.body);
                console.log('Parsed request body successfully:', requestBody);
            } catch (parseError) {
                console.error('Failed to parse request body:', parseError);
                console.error('Raw body content:', event.body);
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        error: 'Invalid JSON in request body',
                        message: 'Request body must be valid JSON',
                        raw_body: event.body
                    })
                };
            }
        } else {
            console.log('No request body provided');
        }

        const { action } = requestBody;
        console.log('Request action:', action);
        console.log('Full request body:', JSON.stringify(requestBody, null, 2));

        // Validate Supabase initialization
        console.log('Validating Supabase connection...');
        if (!supabase) {
            console.error('Supabase client is null or undefined');
            throw new Error('Supabase client not initialized. Please check environment variables: SUPABASE_URL and SUPABASE_ANON_KEY');
        }
        console.log('Supabase validation passed');

        // Handle customers_only action
        if (action === 'customers_only') {
            const API_URL = 'https://default61576f99244849ec8803974b47673f.57.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/ef89e5969a8f45778307f167f435253c/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=pPhk80gODQOi843ixLjZtPPWqTeXIbIt9ifWZP6CJfY';

            // Fetch customers from Power Automate API
            console.log('Fetching customers from Power Automate API...');

            let customerApiResponse;

            try {
                customerApiResponse = await fetch(API_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        Filter: {
                            Active: true,
                            OutputSelector: [
                                "Username",
                                "EmailAddress",
                                "BillingAddress",
                                "AccountBalance"
                            ]
                        },
                        action: "GetCustomer"
                    })
                });
            } catch (fetchError) {
                console.error('API fetch error:', fetchError);
                throw new Error(`Failed to fetch data from Power Automate API: ${fetchError.message}`);
            }

            // Process customer response
            if (!customerApiResponse.ok) {
                throw new Error(`Customer API request failed with status ${customerApiResponse.status}`);
            }

            const customerApiData = await customerApiResponse.json();
            let allCustomers = customerApiData?.Customer || [];

            console.log(`Fetched ${allCustomers.length} customers from API`);

            // Filter out customers with negative or zero account balance (only include positive balances)
            const filteredCustomers = filterCustomersByBalance(allCustomers);
            console.log(`After filtering: ${filteredCustomers.length} customers remaining (removed ${allCustomers.length - filteredCustomers.length} with negative or zero balance)`);

            const timestamp = new Date().toISOString();

            console.log('Customer data fetching completed successfully');

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    message: 'Customer data fetched successfully',
                    customers: filteredCustomers,
                    total_customers: filteredCustomers.length,
                    timestamp
                })
            };
        } else if (action === 'invoices') {
            const { customers = [] } = requestBody;

            console.log('Invoices action - customers received:', customers);

            // Validate customers array
            if (!Array.isArray(customers) || customers.length === 0) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        error: 'Invalid customers parameter',
                        message: 'customers must be a non-empty array of usernames'
                    })
                };
            }

            // Filter out invalid usernames
            const validCustomers = customers.filter(username =>
                username && typeof username === 'string' && username.trim() !== '' && username !== 'N/A'
            );

            console.log('Valid customers after filtering:', validCustomers);

            if (validCustomers.length === 0) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        error: 'No valid customers',
                        message: 'All provided usernames were invalid or N/A'
                    })
                };
            }

            const API_URL = 'https://default61576f99244849ec8803974b47673f.57.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/ef89e5969a8f45778307f167f435253c/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=pPhk80gODQOi843ixLjZtPPWqTeXIbIt9ifWZP6CJfY';

            // Fetch orders for specified customers
            console.log(`Fetching orders for customers: ${validCustomers.join(', ')}`);

            let ordersApiResponse;

            try {
                ordersApiResponse = await fetch(API_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        Filter: {
                            Username: validCustomers, // Filter by specific usernames
                            OrderStatus: ['Dispatched'],
                            PaymentStatus: ['Pending', 'PartialPaid'],
                            OutputSelector: [
                                'ID',
                                'Username',
                                'Email',
                                'GrandTotal',
                                'OrderPayment',
                                'DatePaymentDue'
                            ]
                        },
                        action: 'GetOrder'
                    })
                });
            } catch (fetchError) {
                console.error('Orders API fetch error:', fetchError);
                throw new Error(`Failed to fetch orders from Power Automate API: ${fetchError.message}`);
            }

            // Process orders response
            if (!ordersApiResponse.ok) {
                throw new Error(`Orders API request failed with status ${ordersApiResponse.status}`);
            }

            const ordersApiData = await ordersApiResponse.json();
            let orders = ordersApiData?.Order || [];

            console.log(`Fetched ${orders.length} orders from API`);

            // Filter orders by outstanding amount (similar to check_existing_customer_statement.js)
            orders = orders.filter(order => {
                const grandTotal = parseFloat(order.GrandTotal || 0);
                const paymentsSum = order.OrderPayment && Array.isArray(order.OrderPayment)
                    ? order.OrderPayment.reduce((sum, payment) => sum + parseFloat(payment.Amount || 0), 0)
                    : 0;
                const outstandingAmount = grandTotal - paymentsSum;

                // Filter out orders where grandtotal is 0 and outstanding amount ≤ $0.01
                if (grandTotal === 0 && outstandingAmount <= 0.01) {
                    return false;
                }
                return true;
            });

            console.log(`After filtering: ${orders.length} orders remaining`);

            // Group orders by customer and apply limit
            const customersWithInvoices = {};
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Set to start of day for date comparison

            orders.forEach(order => {
                const username = order.Username;
                if (!username || !customers.includes(username)) return;

                if (!customersWithInvoices[username]) {
                    customersWithInvoices[username] = {
                        customer_username: username,
                        email: order.Email || '',
                        total_orders: 0,
                        total_balance: 0,
                        due_invoice_balance: 0,
                        invoices: []
                    };
                }

                const grandTotal = parseFloat(order.GrandTotal || 0);
                const paymentsSum = order.OrderPayment && Array.isArray(order.OrderPayment)
                    ? order.OrderPayment.reduce((sum, payment) => sum + parseFloat(payment.Amount || 0), 0)
                    : 0;
                const outstandingAmount = grandTotal - paymentsSum;

                // Check if order is past due
                let isPastDue = false;
                if (order.DatePaymentDue) {
                    const dueDate = new Date(order.DatePaymentDue);
                    dueDate.setHours(0, 0, 0, 0);
                    isPastDue = dueDate < today;
                }

                customersWithInvoices[username].total_orders += 1;
                customersWithInvoices[username].total_balance += outstandingAmount;

                if (isPastDue) {
                    customersWithInvoices[username].due_invoice_balance += outstandingAmount;
                }

                customersWithInvoices[username].invoices.push({
                    id: order.ID,
                    grandTotal: grandTotal,
                    payments: order.OrderPayment || [],
                    outstandingAmount: outstandingAmount,
                    datePaymentDue: order.DatePaymentDue || null,
                    isPastDue: isPastDue
                });
            });

            // Convert to array (no limit applied)
            const resultCustomers = Object.values(customersWithInvoices).map(customer => ({
                ...customer,
                invoices: customer.invoices
            }));

            console.log(`Returning ${resultCustomers.length} customers with their invoices`);

            const timestamp = new Date().toISOString();

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    message: 'Customer invoices fetched successfully',
                    customers: resultCustomers,
                    requested_customers: customers,
                    valid_customers: validCustomers,
                    timestamp
                })
            };
        } else {
            // Handle unsupported actions
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    success: false,
                    error: 'Invalid action',
                    message: 'Supported actions: "customers_only", "invoices"'
                })
            };
        }

    } catch (error) {
        console.error('=== ERROR OCCURRED ===');
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        console.error('Error type:', error.constructor.name);
        console.error('Environment check:', {
            hasSupabaseUrl: !!process.env.SUPABASE_URL,
            hasSupabaseKey: !!process.env.SUPABASE_ANON_KEY,
            nodeVersion: process.version
        });

        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: error.message,
                details: error.stack,
                message: 'An error occurred while fetching customer data',
                timestamp: new Date().toISOString()
            })
        };
    }
};

module.exports = { handler, filterCustomersByBalance };