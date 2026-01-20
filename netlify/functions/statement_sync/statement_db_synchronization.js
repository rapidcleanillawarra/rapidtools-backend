const { supabase } = require('../utils/supabaseInit');

/**
 * Process customer statement data and prepare DB records
 * Extracted for easier testing
 */
const processCustomerData = (customers) => {
    const processedRecords = [];
    let totalOrders = 0;
    // Track customer balance stats
    let customersWithZeroBalance = 0;
    let customersWithBalance = 0;

    customers.forEach(customer => {
        const username = customer.customer_username;
        const email = customer.email || '';
        const companyName = customer.company_name || '';

        // Calculate total balance for this customer based on orders
        // Note: The API response provides 'total_balance' at the customer level, but we should probably 
        // calculate it from the processed orders to be consistent with our logic, 
        // OR trust the API's top level if we want to align with that. 
        // Let's sum up the 'outstandingAmount' of the orders we processed.

        let customerTotalOutstanding = 0;
        let hasOrders = false;

        // If no orders, we might still want to track the customer, but for now filtering as per original logic
        if (customer.orders && customer.orders.length > 0) {
            hasOrders = true;
            // Process each order for this customer
            customer.orders.forEach(order => {
                totalOrders++;

                const grandTotal = parseFloat(order.grandTotal || 0);
                const paymentsArray = order.payments || [];

                // Calculate payments sum
                const paymentsSum = paymentsArray.reduce((sum, payment) => {
                    return sum + parseFloat(payment.Amount || 0);
                }, 0);

                // Calculate outstanding amount: Grand Total - Payments
                const calculatedOutstandingFn = grandTotal - paymentsSum;

                // Get provided outstanding amount from API if available
                const providedOutstanding = order.outstandingAmount !== undefined ? parseFloat(order.outstandingAmount) : null;

                // Use provided outstanding amount if available, otherwise calculated
                // But checking for discrepancy is important
                let outstandingAmount = calculatedOutstandingFn;
                let discrepancy = false;

                if (providedOutstanding !== null) {
                    // Check for discrepancy (allow small floating point diff)
                    if (Math.abs(calculatedOutstandingFn - providedOutstanding) > 0.01) {
                        console.warn(`⚠️ DISCREPANCY for Order ${order.id} (${username}):`);
                        console.warn(`   Calculated: ${calculatedOutstandingFn.toFixed(2)}`);
                        console.warn(`   Provided:   ${providedOutstanding.toFixed(2)}`);
                        discrepancy = true;
                    }
                    // Trust the API provided value if available? 
                    // Usually safe to trust the source of truth, but good to know if math is off
                    outstandingAmount = providedOutstanding;
                }

                customerTotalOutstanding += outstandingAmount;

                // Determine payment status
                let paymentStatus;

                // Logic based on amounts
                if (grandTotal === 0) {
                    paymentStatus = "free";
                } else if (Math.abs(outstandingAmount) < 0.01) {
                    paymentStatus = "paid";
                } else if (outstandingAmount < 0) {
                    if (paymentsSum > grandTotal) {
                        paymentStatus = "overpaid";
                    } else {
                        paymentStatus = "unknown_error";
                    }
                } else if (paymentsSum > 0) {
                    paymentStatus = "partial";
                } else {
                    paymentStatus = "unpaid";
                }

                // Override status if overpaid check is needed and not covered by above simple math
                if (paymentsSum > grandTotal && Math.abs(outstandingAmount) > 0.01) {
                    paymentStatus = "overpaid";
                }

                // Log each record
                console.log(`\n--- Order ${order.id} (${username}) ---`);
                console.log(`Grand Total: $${grandTotal.toFixed(2)}`);
                console.log(`Payments: $${paymentsSum.toFixed(2)} (${paymentsArray.length} payment(s))`);
                console.log(`Outstanding: $${outstandingAmount.toFixed(2)}`);
                if (discrepancy) {
                    console.log(`⚠️ Calculated Outstanding: $${calculatedOutstandingFn.toFixed(2)} (Diff: ${(calculatedOutstandingFn - outstandingAmount).toFixed(2)})`);
                }
                console.log(`Status: ${paymentStatus}`);
                console.log(`Past Due: ${order.isPastDue ? 'YES ⚠️' : 'NO'}`);
            });
        } else {
            console.log(`Skipping ${username} - no orders`);
            // If no orders, balance is 0
        }

        // Prepare database record for this customer with accumulated balance
        const dbRecord = {
            customer_username: username,
            exists_in_statements_list: true,
            last_check: new Date().toISOString(),
            last_invoice_balance: customerTotalOutstanding
        };

        processedRecords.push(dbRecord);

        // Update counts
        // We consider a customer "with balance" if total outstanding > 0.01 (or < -0.01)
        // We track customers based on the API response list, even if they had no orders (balance 0)
        if (Math.abs(customerTotalOutstanding) < 0.01) {
            customersWithZeroBalance++;
        } else {
            customersWithBalance++;
        }
    });

    return {
        processedRecords,
        totalOrders,
        stats: {
            customersWithZeroBalance,
            customersWithBalance
        }
    };
};

/**
 * Statement DB Synchronization - Netlify Function
 * 
 * This function:
 * 1. Calls the check_existing_customer_statement API to fetch customer order data
 * 2. Processes each customer's orders
 * 3. Calculates: Invoice Total - Payments = Outstanding Amount
 * 4. Prepares records for the statement_of_accounts table
 * 5. Logs calculations to console (database save currently disabled)
 */
const handler = async (event) => {
    console.log('=== Statement DB Synchronization Function Started ===');
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
        // Parse request payload
        let payload = {};
        try {
            payload = JSON.parse(event.body || '{}');
        } catch (parseError) {
            console.warn('Failed to parse request body, using default payload:', parseError.message);
        }

        // Extract db_save parameter with default value of true
        const dbSave = payload.db_save !== undefined ? payload.db_save : true;
        console.log('Database save enabled:', dbSave);

        // Extract joeven_testing parameter with default value of false
        const joevenTesting = payload.joeven_testing !== undefined ? payload.joeven_testing : false;
        console.log('Joeven testing mode enabled:', joevenTesting);

        // Step 1: Call check_existing_customer_statement API to get customer data
        console.log('Step 1: Fetching customer statement data...');

        // Default to local function URL if env var is not set. 
        // In production on Netlify, process.env.URL is available.
        const baseUrl = process.env.URL || 'http://localhost:8888';
        const checkStatementUrl = process.env.CHECK_STATEMENT_URL ||
            `${baseUrl}/.netlify/functions/check_existing_customer_statement`;

        console.log(`Using Check Statement URL: ${checkStatementUrl}`);

        const response = await fetch(checkStatementUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch customer statement data: ${response.status} ${response.statusText}`);
        }

        const statementData = await response.json();

        // Debugging: Log the structure we received
        console.log('Received upstream response keys:', Object.keys(statementData));
        if (statementData.customers) {
            console.log('Customers array length:', statementData.customers.length);
        } else {
            console.log('❌ "customers" key IS MISSING in upstream response');
        }

        if (!statementData.success || !statementData.customers) {
            console.error('Full Invalid Response:', JSON.stringify(statementData).substring(0, 1000)); // Log first 1000 chars
            throw new Error('Invalid response from check_existing_customer_statement');
        }

        console.log(`Received data for ${statementData.customers.length} customers`);

        // Apply joeven_testing limit if enabled
        let customersToProcess = statementData.customers;
        if (joevenTesting) {
            customersToProcess = statementData.customers.slice(0, 10);
            console.log(`Joeven testing mode: Limiting to first 10 customers (${customersToProcess.length} customers to process)`);
        }

        // Step 2: Process each customer's orders
        console.log('Step 2: Processing customer orders...');

        const { processedRecords, totalOrders, stats } = processCustomerData(customersToProcess);

        console.log(`\n=== PROCESSING COMPLETE ===`);
        console.log(`Total Customers Received: ${statementData.customers.length}`);
        console.log(`Customers Processed: ${customersToProcess.length}${joevenTesting ? ' (limited by joeven_testing)' : ''}`);
        console.log(`Total Orders Processed: ${totalOrders}`);
        console.log(`Records Prepared: ${processedRecords.length}`);
        console.log(`Customers with Zero Balance: ${stats.customersWithZeroBalance}`);
        console.log(`Customers with Balance: ${stats.customersWithBalance}`);

        // Step 3: Database save (conditional based on payload)
        if (dbSave) {
            console.log('\n=== DATABASE SAVE ENABLED ===');

            if (!supabase) {
                throw new Error('Supabase client not initialized');
            }

            console.log('Step 3: Saving records to database...');

            // Get all existing customer usernames from the database
            const { data: existingCustomers, error: fetchError } = await supabase
                .from('statement_of_accounts')
                .select('customer_username');

            if (fetchError) {
                throw new Error(`Failed to fetch existing customers: ${fetchError.message}`);
            }

            // Extract unique customer usernames from API response
            const apiCustomerUsernames = new Set(processedRecords.map(r => r.customer_username));
            const dbCustomerUsernames = new Set(existingCustomers.map(c => c.customer_username));

            // Find customers that exist in DB but not in API response
            const customersToMarkInactive = [...dbCustomerUsernames].filter(username => !apiCustomerUsernames.has(username));

            console.log(`API customers to process: ${apiCustomerUsernames.size}`);
            console.log(`Existing DB customers: ${dbCustomerUsernames.size}`);
            console.log(`Customers to mark inactive: ${customersToMarkInactive.length}`);

            // Update customers not in API response to exists_in_statements_list = false
            if (customersToMarkInactive.length > 0) {
                const { error: updateError } = await supabase
                    .from('statement_of_accounts')
                    .update({
                        exists_in_statements_list: false,
                        last_check: new Date().toISOString()
                    })
                    .in('customer_username', customersToMarkInactive);

                if (updateError) {
                    throw new Error(`Failed to update inactive customers: ${updateError.message}`);
                }

                console.log(`Marked ${customersToMarkInactive.length} customers as inactive`);
            }

            // Upsert the processed records (API customers)
            const { data, error } = await supabase
                .from('statement_of_accounts')
                .upsert(processedRecords, {
                    onConflict: 'customer_username'
                })
                .select();

            if (error) {
                throw new Error(`Failed to upsert records: ${error.message}`);
            }

            console.log(`Successfully upserted ${data.length} records to database`);

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    message: 'Records synchronized and saved to database successfully',
                    db_save: true,
                    version: '1.4.0', // Updated version to reflect db_save and joeven_testing functionality
                    stats: {
                        customer_api_usernames: statementData.customers.length,
                        order_api_unique_username: new Set(processedRecords.map(r => r.customer_username)).size,
                        orders_processed: totalOrders,
                        records_saved: data.length,
                        customers_with_zero_balance: stats.customersWithZeroBalance,
                        customers_with_balance: stats.customersWithBalance,
                        customers_marked_inactive: customersToMarkInactive.length
                    },
                    timestamp: new Date().toISOString()
                })
            };
        } else {
            console.log('\n=== DATABASE SAVE DISABLED ===');
            console.log('Records prepared but not saved to database (db_save: false)');

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    message: 'Records prepared successfully (not saved to database)',
                    db_save: false,
                    version: '1.4.0', // Updated version to reflect db_save and joeven_testing functionality
                    stats: {
                        customer_api_usernames: statementData.customers.length,
                        order_api_unique_username: new Set(processedRecords.map(r => r.customer_username)).size,
                        orders_processed: totalOrders,
                        records_prepared: processedRecords.length,
                        customers_with_zero_balance: stats.customersWithZeroBalance,
                        customers_with_balance: stats.customersWithBalance
                    },
                    timestamp: new Date().toISOString()
                })
            };
        }

        // Return success response with limited data as requested
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'Records prepared successfully (not saved to database)',
                version: '1.4.0', // Updated version to reflect db_save and joeven_testing functionality
                stats: {
                    customer_api_usernames: statementData.customers.length, // Keeping this as a total count
                    order_api_unique_username: new Set(processedRecords.map(r => r.customer_username)).size, // Count of matched customers we found orders for
                    orders_processed: totalOrders,
                    records_prepared: processedRecords.length,
                    customers_with_zero_balance: stats.customersWithZeroBalance,
                    customers_with_balance: stats.customersWithBalance
                },
                // Removed detail arrays as requested
                timestamp: new Date().toISOString()
            })
        };

    } catch (error) {
        console.error('=== ERROR in statement_db_synchronization ===');
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);

        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: error.message,
                details: error.stack,
                message: 'An error occurred during synchronization',
                timestamp: new Date().toISOString()
            })
        };
    }
};

module.exports = { handler, processCustomerData };
