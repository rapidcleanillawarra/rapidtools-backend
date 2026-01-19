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

                // Prepare database record
                const dbRecord = {
                    order_id: order.id,
                    customer_username: username,
                    email: email,
                    company_name: companyName,
                    grand_total: grandTotal,
                    payments_sum: paymentsSum,
                    outstanding_amount: outstandingAmount,
                    payment_status: paymentStatus,
                    date_payment_due: order.datePaymentDue || null,
                    is_past_due: order.isPastDue || false,
                    last_updated: new Date().toISOString(),
                    discrepancy_detected: discrepancy
                };

                processedRecords.push(dbRecord);

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
        // Step 1: Call check_existing_customer_statement API to get customer data
        console.log('Step 1: Fetching customer statement data...');

        const checkStatementUrl = process.env.CHECK_STATEMENT_URL ||
            'https://default61576f99244849ec8803974b47673f.57.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/ef89e5969a8f45778307f167f435253c/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=pPhk80gODQOi843ixLjZtPPWqTeXIbIt9ifWZP6CJfY';

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

        // Step 2: Process each customer's orders
        console.log('Step 2: Processing customer orders...');

        const { processedRecords, totalOrders, stats } = processCustomerData(statementData.customers);

        console.log(`\n=== PROCESSING COMPLETE ===`);
        console.log(`Total Customers: ${statementData.customers.length}`);
        console.log(`Total Orders Processed: ${totalOrders}`);
        console.log(`Records Prepared: ${processedRecords.length}`);
        console.log(`Customers with Zero Balance: ${stats.customersWithZeroBalance}`);
        console.log(`Customers with Balance: ${stats.customersWithBalance}`);

        // Step 3: Database save (currently disabled)
        console.log('\n=== DATABASE SAVE DISABLED ===');
        console.log('Records prepared but not saved to database (as requested)');
        console.log('To enable saving, uncomment the database insert code below');
        console.log('========================\n');

        /*
        // Uncomment to enable database saving
        if (!supabase) {
            throw new Error('Supabase client not initialized');
        }

        console.log('Step 3: Saving records to database...');
        
        const { data, error } = await supabase
            .from('statement_of_accounts')
            .insert(processedRecords)
            .select();

        if (error) {
            throw new Error(`Failed to insert records: ${error.message}`);
        }

        console.log(`Successfully saved ${data.length} records to database`);
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'Records synchronized successfully',
                stats: {
                    customers: statementData.customers.length,
                    orders_processed: totalOrders,
                    records_saved: data.length
                },
                records: data
            })
        };
        */

        // Return success response with limited data as requested
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'Records prepared successfully (not saved to database)',
                version: '1.2.0', // Debug version to confirm code update
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
