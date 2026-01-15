const { supabase } = require('../utils/supabaseInit');

/**
 * Filter customers by account balance
 * @param {Array} customers - Array of customer objects from API
 * @returns {Array} Filtered array of customers with AccountBalance > 0
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
 * Statement of Accounts - Check Existing Customer Statement
 *
 * This function implements a synchronization workflow that:
 * 1. Fetches customers from Power Automate API and filters by balance
 * 2. Fetches orders from Power Automate Orders API (Dispatched orders with Pending/PartialPaid status)
 * 3. Extracts unique customer usernames from the orders
 * 4. Compares with existing Supabase statement_of_accounts records
 * 5. Synchronizes the database by updating/inserting records
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
        // Step 1: Fetch customers from Power Automate API
        console.log('Step 1: Fetching customers from Power Automate API...');

        const API_URL = 'https://default61576f99244849ec8803974b47673f.57.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/ef89e5969a8f45778307f167f435253c/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=pPhk80gODQOi843ixLjZtPPWqTeXIbIt9ifWZP6CJfY';

        const customerApiResponse = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                Filter: {
                    Active: true,
                    OutputSelector: [
                        "EmailAddress",
                        "Company",
                        "AccountBalance"
                    ]
                },
                action: "GetCustomer"
            })
        });

        if (!customerApiResponse.ok) {
            throw new Error(`Customer API request failed with status ${customerApiResponse.status}`);
        }

        const customerApiData = await customerApiResponse.json();
        let allCustomers = customerApiData?.Customer || [];

        console.log(`Fetched ${allCustomers.length} customers from API`);

        // Filter out customers with zero or negative account balance
        const filteredCustomers = filterCustomersByBalance(allCustomers);
        console.log(`After filtering: ${filteredCustomers.length} customers remaining (removed ${allCustomers.length - filteredCustomers.length} with zero/negative balance)`);

        // Create a lookup map of filtered customers by Username for balance matching
        const customerLookup = {};
        filteredCustomers.forEach(customer => {
            if (customer.Username) {
                customerLookup[customer.Username] = customer;
            }
        });

        // Step 2: Fetch orders from Power Automate API
        console.log('Step 2: Fetching orders from Power Automate API...');

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
                        'Email',
                        'GrandTotal',
                        'OrderPayment',
                        'DatePaymentDue'
                    ]
                },
                action: 'GetOrder'
            })
        });

        if (!apiResponse.ok) {
            throw new Error(`API request failed with status ${apiResponse.status}`);
        }

        const apiData = await apiResponse.json();
        let orders = apiData?.Order || [];

        console.log(`Fetched ${orders.length} orders from API`);

        // Step 2.5: Filter out orders where outstanding amount ≤ $0.01 if grandtotal is 0
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

        // Step 3: Extract unique customer usernames
        console.log('Step 3: Extracting unique customer usernames...');

        const usernameSet = new Set();
        orders.forEach(order => {
            if (order.Username) {
                usernameSet.add(order.Username);
            }
        });

        const currentApiUsernames = new Set(usernameSet);
        const uniqueCustomers = currentApiUsernames.size;

        console.log(`Found ${uniqueCustomers} unique customers`);

        // Step 4: Fetch existing Supabase records
        console.log('Step 4: Fetching existing records from Supabase...');

        const { data: allDbRecords, error: fetchError } = await supabase
            .from('statement_of_accounts')
            .select('id, customer_username');

        if (fetchError) {
            throw new Error(`Failed to fetch from Supabase: ${fetchError.message}`);
        }

        console.log(`Found ${allDbRecords?.length || 0} existing database records`);

        // Step 5: Compare and prepare updates/inserts
        console.log('Step 5: Preparing updates and inserts...');

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

        // Step 5.5: Calculate customer balances
        console.log('Step 5.5: Calculating customer balances...');

        const customerBalances = {};
        orders.forEach(order => {
            const username = order.Username;
            if (!username) return;

            const grandTotal = parseFloat(order.GrandTotal || 0);
            const paymentsSum = order.OrderPayment && Array.isArray(order.OrderPayment)
                ? order.OrderPayment.reduce((sum, payment) => sum + parseFloat(payment.Amount || 0), 0)
                : 0;
            const outstandingAmount = grandTotal - paymentsSum;

            if (!customerBalances[username]) {
                customerBalances[username] = {
                    customer_username: username,
                    email: order.Email || '',
                    total_orders: 0,
                    total_balance: 0,
                    orders: []
                };
            }

            customerBalances[username].total_orders += 1;
            customerBalances[username].total_balance += outstandingAmount;

            // Add order details
            customerBalances[username].orders.push({
                id: order.ID,
                grandTotal: grandTotal,
                payments: order.OrderPayment || [],
                outstandingAmount: outstandingAmount,
                datePaymentDue: order.DatePaymentDue || null
            });
        });

        const customerList = Object.values(customerBalances);
        console.log(`Calculated balances for ${customerList.length} customers`);

        // Step 5.6: Compare calculated balances with customer API AccountBalance
        console.log('Step 5.6: Comparing calculated balances with customer API AccountBalance...');

        customerList.forEach(customer => {
            const customerApiData = customerLookup[customer.customer_username];
            if (customerApiData) {
                const apiBalance = parseFloat(customerApiData.AccountBalance || 0);
                const calculatedBalance = customer.total_balance;
                // Use tolerance for floating point comparison
                const balanceMatches = Math.abs(calculatedBalance - apiBalance) < 0.01;
                customer.balance_matches = balanceMatches;
                customer.api_account_balance = apiBalance;
            } else {
                customer.balance_matches = false;
                customer.api_account_balance = null;
            }
        });

        console.log(`Balance matching completed for ${customerList.length} customers`);

        // Calculate balance matching statistics
        const matchedBalancesCount = customerList.filter(customer => customer.balance_matches).length;
        const unmatchedBalancesCount = customerList.filter(customer => !customer.balance_matches).length;
        const usernamesWithUnmatchedBalances = customerList
            .filter(customer => !customer.balance_matches)
            .map(customer => customer.customer_username);

        // Step 6: Execute database operations (DISABLED)
        console.log('Step 6: Database operations disabled - skipping synchronization...');

        const promises = [];
        let updatedCount = 0;
        let insertedCount = 0;

        // Database operations are disabled
        console.log(`Would have updated ${updates.length} records`);
        console.log(`Would have inserted ${inserts.length} records`);

        /*
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
        */

        // Success response with statistics
        const response = {
            success: true,
            message: 'Synchronization completed successfully',
            stats: {
                customer_api_usernames: filteredCustomers.length,
                order_api_unique_username: uniqueCustomers,
                matched_balances_count: matchedBalancesCount,
                unmatched_balances_count: unmatchedBalancesCount,
                usernames_with_unmatched_balances: usernamesWithUnmatchedBalances
            },
            customers: customerList,
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

module.exports = { handler, filterCustomersByBalance };
