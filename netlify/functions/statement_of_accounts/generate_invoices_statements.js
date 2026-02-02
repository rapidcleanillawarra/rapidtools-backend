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
 * Format customer name from BillingAddress
 * @param {Object} billingAddress - BillingAddress object from API
 * @returns {string} Formatted customer name: "BillFirstName BillLastName (BillCompany)"
 */
const formatCustomerNameFromBillingAddress = (billingAddress) => {
    if (!billingAddress) {
        return null;
    }

    const firstName = billingAddress.BillFirstName || '';
    const lastName = billingAddress.BillLastName || '';
    const company = billingAddress.BillCompany || '';

    // Format: "BillFirstName BillLastName (BillCompany)"
    const nameParts = [firstName, lastName].filter(part => part && part.trim() !== '');
    const fullName = nameParts.join(' ');

    if (company && fullName) {
        return `${fullName} (${company})`;
    } else if (fullName) {
        return fullName;
    } else if (company) {
        return company;
    }

    return null;
};

/**
 * Fetch customer data by username from Power Automate API
 * @param {string} username - Customer username
 * @returns {Object|null} Customer data or null if not found
 */
const fetchCustomerByUsername = async (username) => {
    const API_URL = 'https://default61576f99244849ec8803974b47673f.57.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/ef89e5969a8f45778307f167f435253c/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=pPhk80gODQOi843ixLjZtPPWqTeXIbIt9ifWZP6CJfY';

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                Filter: {
                    Username: username,
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

        if (!response.ok) {
            console.error(`Failed to fetch customer ${username}: ${response.status}`);
            return null;
        }

        const data = await response.json();
        const customers = data?.Customer || [];
        return customers.length > 0 ? customers[0] : null;
    } catch (error) {
        console.error(`Error fetching customer ${username}:`, error);
        return null;
    }
};

/**
 * Generate HTML statement template for a customer
 * @param {Object} customer - Customer data object with pdf_customer_name
 * @param {Array} invoices - Array of invoice objects
 * @returns {string} Complete HTML document for the PDF statement
 */
const generateStatementHTML = (customer, invoices) => {
    const customerName = customer.pdf_customer_name || customer.customer_username || 'Customer';
    const totalInvoices = customer.total_orders || invoices.length;
    const totalBalance = customer.total_balance ? customer.total_balance.toFixed(2) : '0.00';
    const dueInvoiceBalance = customer.due_invoice_balance ? customer.due_invoice_balance.toFixed(2) : '0.00';
    const grandTotal = totalBalance;
    const printedDate = new Date().toLocaleString('en-US', {
        month: 'numeric',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });

    // Calculate date range from invoices
    let dateRange = '';
    if (invoices.length > 0) {
        const dates = invoices.map(invoice => new Date(invoice.datePaymentDue)).filter(date => !isNaN(date));
        if (dates.length > 0) {
            const minDate = new Date(Math.min(...dates));
            const maxDate = new Date(Math.max(...dates));
            const minFormatted = minDate.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
            const maxFormatted = maxDate.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
            dateRange = `From: ${minFormatted}<br>To: ${maxFormatted}`;
        }
    }

    // Generate order rows
    const orderRows = invoices.map(invoice => {
        const orderId = invoice.id;
        const datePlaced = invoice.datePaymentDue ? new Date(invoice.datePaymentDue).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        }) : 'N/A';
        const dueDate = invoice.datePaymentDue ? new Date(invoice.datePaymentDue).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        }) : 'N/A';
        const orderTotal = invoice.grandTotal ? invoice.grandTotal.toFixed(2) : '0.00';
        const payments = invoice.payments && Array.isArray(invoice.payments)
            ? invoice.payments.reduce((sum, payment) => sum + parseFloat(payment.Amount || 0), 0).toFixed(2)
            : '0.00';
        const balance = invoice.outstandingAmount ? invoice.outstandingAmount.toFixed(2) : '0.00';
        const rowClass = invoice.isPastDue ? 'style="background-color: #fee2e2;"' : '';

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
                .balance-due-row td {
                    background: #fef2f2 !important;
                }
                .balance-due-label {
                    color: #dc2626;
                    font-size: 22px;
                    letter-spacing: 2px;
                }
                .balance-due-value {
                    color: #dc2626;
                    font-size: 28px;
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
                            <td colspan="5" class="summary-label">GRAND TOTAL AUD</td>
                            <td class="summary-value right">${grandTotal}</td>
                        </tr>
                        <tr class="summary-row balance-due-row">
                            <td colspan="5" class="summary-label balance-due-label">BALANCE DUE AUD</td>
                            <td class="summary-value right balance-due-value">${dueInvoiceBalance}</td>
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
                                <td style="font-weight: bold;">Balance Due</td>
                                <td style="color: #dc2626; font-weight: bold;">${dueInvoiceBalance}</td>
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
            
            // Add pdf_customer_name field to each customer based on BillingAddress
            const customersWithPdfName = filteredCustomers.map(customer => {
                const pdfCustomerName = formatCustomerNameFromBillingAddress(customer.BillingAddress);
                return {
                    ...customer,
                    pdf_customer_name: pdfCustomerName
                };
            });
            
            console.log(`After filtering: ${customersWithPdfName.length} customers remaining (removed ${allCustomers.length - customersWithPdfName.length} with negative or zero balance)`);

            const timestamp = new Date().toISOString();

            console.log('Customer data fetching completed successfully');

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    message: 'Customer data fetched successfully',
                    customers: customersWithPdfName,
                    total_customers: customersWithPdfName.length,
                    timestamp
                })
            };
        } else if (action === 'invoices') {
            const API_URL = 'https://default61576f99244849ec8803974b47673f.57.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/ef89e5969a8f45778307f167f435253c/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=pPhk80gODQOi843ixLjZtPPWqTeXIbIt9ifWZP6CJfY';
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

            // Fetch customer data for each valid customer (to get current BillingAddress)
            console.log('Fetching customer data for each customer...');
            const customerDataMap = {};
            
            for (const username of validCustomers) {
                const customerData = await fetchCustomerByUsername(username);
                if (customerData) {
                    customerDataMap[username] = customerData;
                    console.log(`Fetched customer data for: ${username}`);
                } else {
                    console.warn(`No customer data found for: ${username}`);
                }
            }

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
                                'DatePaymentDue',
                                'DatePlaced'
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

                // Get BillingAddress from customer API data, not from order
                const customerApiData = customerDataMap[username];
                const billingAddress = customerApiData?.BillingAddress || {};
                
                // Use customer API's BillingAddress for pdf_customer_name
                const pdfCustomerName = formatCustomerNameFromBillingAddress(billingAddress);

                if (!customersWithInvoices[username]) {
                    customersWithInvoices[username] = {
                        customer_username: username,
                        email: customerApiData?.EmailAddress || order.Email || '',
                        billing_address: billingAddress,
                        pdf_customer_name: pdfCustomerName,
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
                    datePlaced: order.DatePlaced || null,
                    datePaymentDue: order.DatePaymentDue || null,
                    isPastDue: isPastDue
                });
            });

            // Convert to array (no limit applied)
            const resultCustomers = Object.values(customersWithInvoices).map(customer => ({
                ...customer,
                invoices: customer.invoices
            }));

            // Generate PDF HTML for each customer
            const customersWithPdfHtml = resultCustomers.map(customer => {
                const pdfHtml = generateStatementHTML(customer, customer.invoices);
                return {
                    ...customer,
                    pdf_html: pdfHtml
                };
            });

            console.log(`Returning ${customersWithPdfHtml.length} customers with their invoices and PDF HTML`);

            const timestamp = new Date().toISOString();

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    message: 'Customer invoices fetched successfully',
                    customers: customersWithPdfHtml,
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

module.exports = { handler, filterCustomersByBalance, generateStatementHTML };