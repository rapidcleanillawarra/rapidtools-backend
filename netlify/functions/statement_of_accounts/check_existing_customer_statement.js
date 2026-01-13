const { supabase } = require('../utils/supabaseInit');

/**
 * Statement of Accounts - Check Existing Customer Statement
 * 
 * This function implements a synchronization workflow that:
 * 1. Fetches orders from Power Automate Orders API (Dispatched orders with Pending/PartialPaid status)
 * 2. Extracts unique customer usernames from the orders
 * 3. Compares with existing Supabase statement_of_accounts records
 * 4. Synchronizes the database by updating/inserting records
 */

const handler = async (event) => {
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
        // Step 1: Fetch orders from Power Automate API
        console.log('Step 1: Fetching orders from Power Automate API...');

        const API_URL = 'https://default61576f99244849ec8803974b47673f.57.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/ef89e5969a8f45778307f167f435253c/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=pPhk80gODQOi843ixLjZtPPWqTeXIbIt9ifWZP6CJfY';

        const apiResponse = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                Filter: {
                    OrderStatus: ['Dispatched'],
                    PaymentStatus: ['Pending', 'PartialPaid'],
                    OutputSelector: [
                        'ID',
                        'Username',
                        'Email'
                    ]
                },
                action: 'GetOrder'
            })
        });

        if (!apiResponse.ok) {
            throw new Error(`API request failed with status ${apiResponse.status}`);
        }

        const apiData = await apiResponse.json();
        const orders = apiData?.Order || [];

        console.log(`Fetched ${orders.length} orders from API`);

        // Step 2: Extract unique customer usernames
        console.log('Step 2: Extracting unique customer usernames...');

        const usernameSet = new Set();
        orders.forEach(order => {
            if (order.Username) {
                usernameSet.add(order.Username);
            }
        });

        const currentApiUsernames = new Set(usernameSet);
        const uniqueCustomers = currentApiUsernames.size;

        console.log(`Found ${uniqueCustomers} unique customers`);

        // Step 3: Fetch existing Supabase records
        console.log('Step 3: Fetching existing records from Supabase...');

        const { data: allDbRecords, error: fetchError } = await supabase
            .from('statement_of_accounts')
            .select('id, customer_username');

        if (fetchError) {
            throw new Error(`Failed to fetch from Supabase: ${fetchError.message}`);
        }

        console.log(`Found ${allDbRecords?.length || 0} existing database records`);

        // Step 4: Compare and prepare updates/inserts
        console.log('Step 4: Preparing updates and inserts...');

        const updates = [];
        const inserts = [];
        const processedUsernames = new Set();
        const timestamp = new Date().toISOString();

        // Process existing database records
        if (allDbRecords && allDbRecords.length > 0) {
            allDbRecords.forEach(record => {
                updates.push({
                    id: record.id,
                    customer_username: record.customer_username,
                    exists_in_statements_list: currentApiUsernames.has(record.customer_username),
                    last_check: timestamp
                });
                processedUsernames.add(record.customer_username);
            });
        }

        // Process new customers from API (not in database yet)
        currentApiUsernames.forEach(username => {
            if (!processedUsernames.has(username)) {
                inserts.push({
                    customer_username: username,
                    exists_in_statements_list: true,
                    last_check: timestamp
                });
            }
        });

        console.log(`Prepared ${updates.length} updates and ${inserts.length} inserts`);

        // Step 5: Execute database operations
        console.log('Step 5: Executing database synchronization...');

        const promises = [];
        let updatedCount = 0;
        let insertedCount = 0;

        // Execute updates
        if (updates.length > 0) {
            const { error: updateError } = await supabase
                .from('statement_of_accounts')
                .upsert(updates);

            if (updateError) {
                throw new Error(`Failed to update records: ${updateError.message}`);
            }
            updatedCount = updates.length;
            console.log(`Updated ${updatedCount} records`);
        }

        // Execute inserts
        if (inserts.length > 0) {
            const { error: insertError } = await supabase
                .from('statement_of_accounts')
                .insert(inserts);

            if (insertError) {
                throw new Error(`Failed to insert records: ${insertError.message}`);
            }
            insertedCount = inserts.length;
            console.log(`Inserted ${insertedCount} records`);
        }

        // Success response with statistics
        const response = {
            success: true,
            message: 'Synchronization completed successfully',
            stats: {
                api_orders_fetched: orders.length,
                unique_customers: uniqueCustomers,
                records_updated: updatedCount,
                records_inserted: insertedCount,
                total_processed: updatedCount + insertedCount
            },
            timestamp
        };

        console.log('Synchronization completed successfully:', response.stats);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(response)
        };

    } catch (error) {
        console.error('Error during synchronization:', error);

        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: error.message,
                details: error.stack,
                message: 'An error occurred during synchronization'
            })
        };
    }
};

module.exports = { handler };
