const { supabase } = require('../utils/supabaseInit');

// Cache for statement_records data (persists across warm invocations)
let statementRecordsCache = {
    data: null,
    cacheDate: null  // Sydney date string "YYYY-MM-DD"
};

/**
 * Get today's date in Australia/Sydney timezone normalized to start of day
 */
const getTodaySydney = () => {
    const sydneyDate = new Date().toLocaleString('en-US', { timeZone: 'Australia/Sydney' });
    const todaySydney = new Date(sydneyDate);
    todaySydney.setHours(0, 0, 0, 0);
    return todaySydney;
};

/**
 * Format currency value with commas and 2 decimal places
 */
const formatCurrency = (amount) => {
    return parseFloat(amount || 0).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
};

/**
 * Format date as "MMM DD, YYYY"
 */
const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
};

/**
 * Get statement records with day-level caching
 */
const getStatementRecords = async () => {
    // Get today's date in Sydney timezone as "YYYY-MM-DD"
    const todayDateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
    
    // Check if cache is valid for today
    if (statementRecordsCache.data && statementRecordsCache.cacheDate === todayDateStr) {
        console.log('Using cached statement_records data');
        return statementRecordsCache.data;
    }
    
    // Fetch fresh data
    console.log('Fetching fresh statement_records data from database...');
    const { data: latestRecord, error: recordError } = await supabase
        .from('statement_records')
        .select('data, created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (recordError) {
        throw new Error(`Failed to fetch statement_records: ${recordError.message}`);
    }

    if (!latestRecord) {
        throw new Error('No statement records found');
    }

    // Validate record is from today (Sydney timezone)
    const recordDateStr = new Date(latestRecord.created_at).toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
    
    if (recordDateStr !== todayDateStr) {
        throw new Error(`Statement records data is not up to date. Latest record created at: ${latestRecord.created_at} (Sydney time: ${recordDateStr}). Today is ${todayDateStr}. Please run statement synchronization first.`);
    }

    // Update cache
    statementRecordsCache = {
        data: latestRecord,
        cacheDate: todayDateStr
    };
    
    console.log('Statement records cached successfully');
    return latestRecord;
};

/**
 * Generate HTML statement template for a customer
 */
const generateStatementHTML = (customer, orders) => {
    const customerName = customer.company_name || customer.customer_username;
    const totalInvoices = customer.total_orders || orders.length;
    const totalBalance = formatCurrency(customer.total_balance);
    const printedDate = new Date().toLocaleString('en-US', {
        month: 'numeric',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });

    // Calculate date range from orders using DatePlaced
    let dateRange = '';
    if (orders.length > 0) {
        const dates = orders.map(order => new Date(order.DatePlaced)).filter(date => !isNaN(date));
        if (dates.length > 0) {
            const minDate = new Date(Math.min(...dates));
            const maxDate = new Date(Math.max(...dates));
            const minFormatted = formatDate(minDate);
            const maxFormatted = formatDate(maxDate);
            dateRange = `From: ${minFormatted}<br>To: ${maxFormatted}`;
        }
    }

    // Sort orders by DatePlaced ascending
    const sortedOrders = [...orders].sort((a, b) => new Date(a.DatePlaced) - new Date(b.DatePlaced));
    
    // Generate order rows
    const orderRows = sortedOrders.map(order => {
        const orderId = order.id;
        const datePlaced = formatDate(order.DatePlaced);
        const dueDate = formatDate(order.datePaymentDue);
        const orderTotal = formatCurrency(order.grandTotal);
        const payments = formatCurrency(order.payments.reduce((sum, payment) => sum + parseFloat(payment.Amount || 0), 0));
        const balance = formatCurrency(order.outstandingAmount);
        const rowClass = order.isPastDue ? 'style="background-color: #fee2e2;"' : '';

        return `
            <tr ${rowClass}>
                <td>${orderId}</td>
                <td>${datePlaced}</td>
                <td>${dueDate}</td>
                <td class="right">${orderTotal}</td>
                <td class="right">${payments}</td>
                <td class="right">${balance}</td>
            </tr>`;
    }).join('');

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Statement of Account - ${customerName}</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    margin: 20px;
                    background: #fafbfc;
                }
                .header {
                    margin-bottom: 20px;
                }
                .header-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 15px;
                }
                .header-content {
                    flex: 1;
                }
                .header-logo {
                    width: 200px;
                    height: auto;
                }
                .second-row {
                    display: grid;
                    grid-template-columns: 1fr 1fr 1fr;
                    gap: 20px;
                    margin-top: 15px;
                }
                .statement-title {
                    font-size: 18px;
                    font-weight: bold;
                    color: #1a1a1a;
                }
                .address {
                    text-align: right;
                    font-size: 14px;
                    color: #1a1a1a;
                    line-height: 1.4;
                }
                .header h1 {
                    margin: 0;
                    color: #1a1a1a;
                }
                .header p {
                    margin: 5px 0;
                    color: #666;
                }
                .print-table-container {
                    display: flex;
                    justify-content: center;
                    margin-top: 30px;
                }
                table {
                    background: #fff;
                    width: 100%;
                    max-width: 100%;
                    border-collapse: separate;
                    border-spacing: 0;
                    margin: 0 auto;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.03);
                }
                th, td {
                    padding: 8px 8px;
                }
                th {
                    border-bottom: 2px solid #222;
                    font-weight: bold;
                    background: #fff;
                    text-align: left;
                    font-size: 16px;
                }
                td {
                    border-bottom: 1px solid #e0e0e0;
                    font-size: 14px;
                }
                td.right, th.right {
                    text-align: right;
                }
                tr:last-child td {
                    border-bottom: 2px solid #222;
                }
                .summary-row td {
                    border: none;
                    font-size: 18px;
                    font-weight: bold;
                    background: #fff;
                    padding-top: 18px;
                    padding-bottom: 18px;
                }
                .summary-label {
                    text-align: right;
                    padding-right: 20px;
                    font-size: 18px;
                    font-weight: bold;
                    letter-spacing: 1px;
                }
                .summary-value {
                    font-size: 20px;
                    font-weight: bold;
                    color: #222;
                    text-align: right;
                    min-width: 120px;
                }
                @media print {
                    body {
                        margin: 0;
                        padding: 5mm 5mm 5mm 5mm;
                        background: #fff;
                    }
                    .print-table-container {
                        margin-top: 0;
                    }
                    table {
                        box-shadow: none;
                        width: 100% !important;
                        max-width: 100% !important;
                    }
                    th, td {
                        padding: 4px 4px !important;
                        font-size: 12px !important;
                    }
                }
                .date-range {
                    text-align: center;
                    font-size: 14px;
                    color: #1a1a1a;
                    line-height: 1.4;
                }
                .date-range-label {
                    font-weight: bold;
                    margin-bottom: 5px;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="header-row">
                    <div class="header-content">
                        <p>Printed on: ${printedDate}</p>
                        <p>Total Invoices: ${totalInvoices}</p>
                    </div>
                    <img src="{{COMPANY_LOGO}}" alt="Rapid Supplies Logo" class="header-logo">
                </div>
                <div class="second-row">
                    <div class="statement-title">
                        Statement of Account for ${customerName}
                    </div>
                    <div class="date-range">
                        <div class="date-range-label">Date Range:</div>
                        ${dateRange}
                    </div>
                    <div class="address">
                        Rapid Illawarra Pty Ltd<br>
                        112a Industrial Road<br>
                        OAK FLATS NSW 2529<br>
                        AUSTRALIA
                    </div>
                </div>
            </div>
            <div class="print-table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Order #</th>
                            <th>Date Placed</th>
                            <th>Due Date</th>
                            <th class="right">Order Total</th>
                            <th class="right">Payments</th>
                            <th class="right">Balance AUD</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${orderRows}
                    </tbody>
                    <tfoot>
                        <tr class="summary-row">
                            <td colspan="5" class="summary-label">BALANCE DUE AUD</td>
                            <td class="summary-value right">${totalBalance}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
            <div style="margin-top: 30px; padding: 20px; border-top: 1px solid #e0e0e0; display: flex; justify-content: space-between; align-items: flex-start; gap: 40px;">
                <div style="flex: 1; min-width: 220px;">
                    <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #1a1a1a;">Banking Details:</h3>
                    <p style="margin: 5px 0; font-size: 14px; color: #1a1a1a;">IMB Shellharbour City</p>
                    <p style="margin: 5px 0; font-size: 14px; color: #1a1a1a;">BSB: 641-800</p>
                    <p style="margin: 5px 0; font-size: 14px; color: #1a1a1a;">A/C: 200839104</p>
                    <p style="margin: 5px 0; font-size: 14px; color: #1a1a1a;">Name: Rapid Illawarra Pty Ltd</p>
                    <p style="margin: 5px 0; font-size: 14px; color: #1a1a1a;">Swiftcode: ASLLAU2C</p>
                </div>
                <div style="flex: 1; min-width: 220px; display: flex; flex-direction: column; align-items: center; justify-content: flex-start;">
                    <img src='{{STRIPE_QR}}' alt='Stripe Payment QR' style='width: 140px; height: 140px; margin-bottom: 10px; border: 1px solid #eee; padding: 4px; background: #fff;' />
                    <a href='https://buy.stripe.com/dRm9AUexncD0fQacewaZi00' target='_blank' style='display: inline-block; margin-top: 8px; padding: 8px 18px; background: #635bff; color: #fff; border-radius: 6px; text-decoration: none; font-size: 15px; font-weight: 500;'>Pay via Stripe</a>
                    <div style='margin-top: 6px; font-size: 12px; color: #888; text-align: center;'>Scan to pay online</div>
                </div>
            </div>
            <div style="margin-top: 40px;">
                <div style="border-top: 3px dashed #000; position: relative; margin-bottom: 20px;">
                    <span style="position: absolute; left: -18px; top: -16px; font-size: 22px; background: #fff;">✂️</span>
                </div>
                <div style="display: flex; align-items: flex-start; justify-content: space-between;">
                    <div style="flex: 1; min-width: 220px;">
                        <div style="font-size: 32px; font-weight: 500; letter-spacing: 2px; margin-bottom: 10px;">PAYMENT ADVICE</div>
                        <div style="font-size: 12px; margin-bottom: 10px;">To: Rapid Illawarra Pty Ltd<br>112a Industrial Road<br>OAK FLATS NSW 2529<br>AUSTRALIA</div>
                    </div>
                    <div style="flex: 1.2; margin-left: 40px;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 18px;">
                            <tr>
                                <td style="font-weight: bold; border-bottom: 1px solid #aaa; padding-bottom: 4px;">Customer</td>
                                <td style="border-bottom: 1px solid #aaa; padding-bottom: 4px;">${customerName}</td>
                            </tr>
                            <tr>
                                <td style="font-weight: bold; padding-top: 10px;">Total Invoices</td>
                                <td style="padding-top: 10px;">${totalInvoices}</td>
                            </tr>
                            <tr>
                                <td style="font-weight: bold;">Total AUD Due</td>
                                <td>${totalBalance}</td>
                            </tr>
                            <tr>
                                <td style="font-weight: bold; padding-top: 18px;">Amount Enclosed</td>
                                <td style="padding-top: 18px; border-bottom: 2px solid #222;">
                                    <span style="display: block; height: 24px;"></span>
                                </td>
                            </tr>
                            <tr>
                                <td></td>
                                <td style="color: #888; font-size: 14px;">Enter the amount you are paying above</td>
                            </tr>
                        </table>
                    </div>
                </div>
            </div>
        </body>
        </html>`;
};

/**
 * Process a single customer for PDF generation
 */
const processCustomer = async (customer, statementCustomers) => {
    try {
        // Find matching customer data
        const customerData = statementCustomers.find(sc => sc.customer_username === customer.customer_username);
        if (!customerData) {
            throw new Error(`Customer data not found for ${customer.customer_username}`);
        }

        // Generate file names
        const today = new Date().toISOString().split('T')[0];
        const fileName = `Statement_${customer.customer_username}_${today}`;
        const monthName = new Date().toLocaleString('en-US', { month: 'long', timeZone: 'Australia/Sydney' });
        const day = new Date().toLocaleString('en-US', { day: 'numeric', timeZone: 'Australia/Sydney' });
        const year = new Date().toLocaleString('en-US', { year: 'numeric', timeZone: 'Australia/Sydney' });
        const folderName = `Statement_${monthName}_${day}_${year}`;

        // Generate HTML
        const htmlContent = generateStatementHTML(customerData, customerData.orders);

        // Call PDF generation API
        const pdfResponse = await fetch('https://default61576f99244849ec8803974b47673f.57.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/b7ca6010fbe647cc81c80314b9b680c2/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=lJi8nh7QIBUj40phbYeZW7MqQwhKg3TRhVTXGQ_q9Es', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                pdf: htmlContent,
                file_name: fileName,
                folder_name: folderName,
                customer_username: customer.customer_username,
                created_by: "marketing@rapidcleanillawarra.com.au"
            })
        });

        if (!pdfResponse.ok) {
            throw new Error(`PDF API request failed: ${pdfResponse.status} ${pdfResponse.statusText}`);
        }

        const pdfResult = await pdfResponse.json();

        // Save PDF metadata to database
        const { data: pdfFileRecord, error: pdfFileError } = await supabase
            .from('statement_of_accounts_pdf_files')
            .insert({
                file_name: pdfResult.file_name,
                folder_path: pdfResult.folder_path,
                created_at: pdfResult.created_at,
                created_by: pdfResult.created_by,
                onedrive_id: pdfResult.onedrive_id,
                customer_username: pdfResult.customer_username
            })
            .select('id')
            .single();

        if (pdfFileError) {
            throw new Error(`Failed to save PDF file metadata: ${pdfFileError.message}`);
        }

        // Update statement_of_accounts table
        const { error: updateError } = await supabase
            .from('statement_of_accounts')
            .update({
                statement_of_accounts_pdf_files_id: pdfFileRecord.id,
                last_file_generation: new Date().toISOString()
            })
            .eq('customer_username', customer.customer_username);

        if (updateError) {
            throw new Error(`Failed to update statement_of_accounts: ${updateError.message}`);
        }

        console.log(`Successfully processed customer: ${customer.customer_username}`);
        return {
            success: true,
            customer_username: customer.customer_username,
            pdf_file_id: pdfFileRecord.id,
            pdf_html: htmlContent
        };

    } catch (error) {
        console.error(`Error processing customer ${customer.customer_username}:`, error.message);
        return {
            success: false,
            customer_username: customer.customer_username,
            error: error.message,
            pdf_html: null
        };
    }
};

/**
 * Statement File Generation - Netlify Function
 */
const handler = async (event) => {
    console.log('=== Statement File Generation Function Started ===');
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
        // Step 1: Fetch and validate statement_records (with caching)
        console.log('Step 1: Fetching latest statement_records...');

        const latestRecord = await getStatementRecords();

        console.log('Statement records validated - data is up to date');

        // Extract customer data
        const statementData = latestRecord.data;
        if (!statementData || !statementData.customers) {
            throw new Error('Invalid statement records data structure');
        }

        // Step 2: Query statement_of_accounts for ONE unprocessed customer
        console.log('Step 2: Querying statement_of_accounts for next unprocessed customer...');

        const todaySydneyStart = getTodaySydney();
        const tomorrowSydney = new Date(todaySydneyStart);
        tomorrowSydney.setDate(tomorrowSydney.getDate() + 1);

        // Parse request body for parameters
        let requestBody = {};
        try {
            requestBody = event.body ? JSON.parse(event.body) : {};
        } catch (parseError) {
            console.warn('Failed to parse request body, proceeding without parameters');
        }

        // Query for only 1 customer that hasn't been processed today
        const { data: customerToProcess, error: queryError } = await supabase
            .from('statement_of_accounts')
            .select('*')
            .eq('exists_in_statements_list', true)
            .gte('last_check', todaySydneyStart.toISOString())
            .lt('last_check', tomorrowSydney.toISOString())
            .or('last_file_generation.is.null,last_file_generation.lt.' + todaySydneyStart.toISOString())
            .limit(1)
            .single();

        if (queryError) {
            // If no customer found, check if there are any remaining customers
            if (queryError.code === 'PGRST116') {
                // Check count of remaining unprocessed customers
                const { count: remainingCount } = await supabase
                    .from('statement_of_accounts')
                    .select('*', { count: 'exact', head: true })
                    .eq('exists_in_statements_list', true)
                    .gte('last_check', todaySydneyStart.toISOString())
                    .lt('last_check', tomorrowSydney.toISOString())
                    .or('last_file_generation.is.null,last_file_generation.lt.' + todaySydneyStart.toISOString());

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        message: 'No unprocessed customers found',
                        has_more: false,
                        remaining_count: remainingCount || 0,
                        stats: {
                            customers_processed: 0,
                            successful_generations: 0,
                            failed_generations: 0
                        },
                        timestamp: new Date().toISOString()
                    })
                };
            }
            throw new Error(`Failed to query statement_of_accounts: ${queryError.message}`);
        }

        if (!customerToProcess) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    message: 'No customers found matching criteria',
                    has_more: false,
                    stats: {
                        customers_processed: 0,
                        successful_generations: 0,
                        failed_generations: 0
                    },
                    timestamp: new Date().toISOString()
                })
            };
        }

        console.log(`Processing single customer: ${customerToProcess.customer_username}`);

        // Step 3: Process the single customer
        console.log('Step 3: Processing single customer...');
        const result = await processCustomer(customerToProcess, statementData.customers);

        // Check if there are more customers remaining
        const { count: remainingCount } = await supabase
            .from('statement_of_accounts')
            .select('*', { count: 'exact', head: true })
            .eq('exists_in_statements_list', true)
            .gte('last_check', todaySydneyStart.toISOString())
            .lt('last_check', tomorrowSydney.toISOString())
            .or('last_file_generation.is.null,last_file_generation.lt.' + todaySydneyStart.toISOString());

        const hasMore = (remainingCount || 0) > 0;

        console.log(`=== Processing Complete ===`);
        console.log(`Customer processed: ${result.success ? 'SUCCESS' : 'FAILED'}`);
        console.log(`Remaining customers: ${remainingCount || 0}`);

        // If auto_continue is enabled and there are more customers, trigger next iteration
        if (requestBody.auto_continue === true && hasMore) {
            console.log('Auto-continue enabled: Triggering next iteration...');
            // Get the function URL from the event
            const functionUrl = event.headers['x-forwarded-proto']
                ? `${event.headers['x-forwarded-proto']}://${event.headers.host}/.netlify/functions/statement_file_generation`
                : `https://${event.headers.host}/.netlify/functions/statement_file_generation`;

            // Add delay before triggering next call to avoid rate limiting
            setTimeout(() => {
                fetch(functionUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ auto_continue: true })
                }).catch(err => {
                    console.error('Failed to trigger next iteration:', err.message);
                });
            }, 2000); // 2 second delay
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: result.success
                    ? `File generation completed for ${customerToProcess.customer_username}`
                    : `File generation failed for ${customerToProcess.customer_username}`,
                has_more: hasMore,
                remaining_count: remainingCount || 0,
                stats: {
                    customers_processed: 1,
                    successful_generations: result.success ? 1 : 0,
                    failed_generations: result.success ? 0 : 1
                },
                result: result,
                pdf_html: result.pdf_html,
                timestamp: new Date().toISOString()
            })
        };

    } catch (error) {
        console.error('=== ERROR in statement_file_generation ===');
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);

        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: error.message,
                details: error.stack,
                message: 'An error occurred during file generation',
                timestamp: new Date().toISOString()
            })
        };
    }
};

module.exports = { handler };