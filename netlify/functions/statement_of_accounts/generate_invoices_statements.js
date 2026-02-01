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
 * Generate Invoices Statements - Fetch Customer Data
 *
 * This function accepts a payload with action "customers_only" and fetches customer data
 * from Power Automate API, filtering out customers with negative or zero account balances.
 * Returns filtered customer data with positive balances only.
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
        if (event.body) {
            try {
                requestBody = JSON.parse(event.body);
            } catch (parseError) {
                console.error('Failed to parse request body:', parseError);
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        error: 'Invalid JSON in request body',
                        message: 'Request body must be valid JSON'
                    })
                };
            }
        }

        const { action } = requestBody;
        console.log('Request action:', action);

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
        } else {
            // Handle unsupported actions
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    success: false,
                    error: 'Invalid action',
                    message: 'Supported action: "customers_only"'
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