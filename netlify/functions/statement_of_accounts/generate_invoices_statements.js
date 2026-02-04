const { supabase } = require('../utils/supabaseInit');
const { filterCustomersByBalance, formatCustomerNameFromBillingAddress, fetchCustomerByUsername } = require('./customerUtils');
const { generateStatementHTML, generateEmailHTML } = require('./statementTemplates');

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

            // Generate PDF HTML and Email HTML for each customer
            const customersWithPdfHtml = resultCustomers.map(customer => {
                const pdfHtml = generateStatementHTML(customer, customer.invoices);
                const emailHtml = generateEmailHTML(customer, customer.invoices);
                return {
                    ...customer,
                    pdf_html: pdfHtml,
                    email_html: emailHtml
                };
            });

            console.log(`Returning ${customersWithPdfHtml.length} customers with their invoices, PDF HTML, and Email HTML`);

            const timestamp = new Date().toISOString();

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    message: 'Customer invoices fetched successfully with PDF and Email HTML',
                    customers: customersWithPdfHtml,
                    requested_customers: customers,
                    valid_customers: validCustomers,
                    timestamp
                })
            };
        } else if (action === 'start') {
            // 1. Get limit from request body, default to 5
            const limit = Math.min(parseInt(requestBody.limit || 5, 10), 50); // Max 50 to prevent abuse
            if (isNaN(limit) || limit <= 0) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        error: 'Invalid limit parameter',
                        message: 'Limit must be a positive integer'
                    })
                };
            }

            console.log(`Starting 'start' action with limit: ${limit}`);

            // 2. Fetch customers with positive balance (reuse customers_only logic)
            const API_URL = 'https://default61576f99244849ec8803974b47673f.57.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/ef89e5969a8f45778307f167f435253c/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=pPhk80gODQOi843ixLjZtPPWqTeXIbIt9ifWZP6CJfY';

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
                                "AccountBalance"
                            ]
                        },
                        action: "GetCustomer"
                    })
                });
            } catch (fetchError) {
                console.error('Customer API fetch error:', fetchError);
                throw new Error(`Failed to fetch customers from Power Automate API: ${fetchError.message}`);
            }

            if (!customerApiResponse.ok) {
                throw new Error(`Customer API request failed with status ${customerApiResponse.status}`);
            }

            const customerApiData = await customerApiResponse.json();
            let allCustomers = customerApiData?.Customer || [];
            console.log(`Fetched ${allCustomers.length} customers from API`);

            // Filter customers with positive balance
            const filteredCustomers = filterCustomersByBalance(allCustomers);
            const filteredCustomerUsernames = filteredCustomers.map(c => c.Username);
            console.log(`After balance filtering: ${filteredCustomerUsernames.length} customers remaining`);

            // 3. Query statement_of_accounts for today's records
            const today = new Date();
            const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
            const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString();

            console.log('Querying statement_of_accounts for today\'s records...');
            const { data: todayRecords, error: todayQueryError } = await supabase
                .from('statement_of_accounts')
                .select('customer_username')
                .gte('created_at', startOfDay)
                .lte('created_at', endOfDay)
                .in('customer_username', filteredCustomerUsernames);

            if (todayQueryError) {
                console.error('Supabase query error for today\'s records:', todayQueryError);
                throw new Error(`Failed to query today's records: ${todayQueryError.message}`);
            }

            const processedTodayUsernames = todayRecords?.map(r => r.customer_username) || [];
            console.log(`Found ${processedTodayUsernames.length} customers processed today`);

            // Filter out customers already processed today
            const unprocessedUsernames = filteredCustomerUsernames.filter(
                username => !processedTodayUsernames.includes(username)
            );
            console.log(`After removing today's processed customers: ${unprocessedUsernames.length} available`);

            // 4. Fetch orders with outstanding balance
            console.log('Fetching orders with outstanding balance...');
            let ordersApiResponse;

            try {
                ordersApiResponse = await fetch(API_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        Filter: {
                            PaymentStatus: ['Pending', 'PartialPaid'],
                            OutputSelector: [
                                'ID',
                                'Username',
                                'GrandTotal',
                                'OrderPayment'
                            ]
                        },
                        action: 'GetOrder'
                    })
                });
            } catch (fetchError) {
                console.error('Orders API fetch error:', fetchError);
                throw new Error(`Failed to fetch orders from Power Automate API: ${fetchError.message}`);
            }

            if (!ordersApiResponse.ok) {
                throw new Error(`Orders API request failed with status ${ordersApiResponse.status}`);
            }

            const ordersApiData = await ordersApiResponse.json();
            let orders = ordersApiData?.Order || [];
            console.log(`Fetched ${orders.length} orders from API`);

            // Filter orders with outstanding balance
            const customersWithBalance = orders.filter(order => {
                const grandTotal = parseFloat(order.GrandTotal || 0);
                const paymentsSum = order.OrderPayment?.reduce((sum, p) => sum + parseFloat(p.Amount || 0), 0) || 0;
                const outstandingAmount = grandTotal - paymentsSum;
                return outstandingAmount > 0;
            });

            const orderCustomerUsernames = [...new Set(customersWithBalance.map(o => o.Username))];
            console.log(`Found ${orderCustomerUsernames.length} customers with outstanding orders`);

            // 5. Filter out already-processed customers
            const availableUsernames = orderCustomerUsernames.filter(
                username => !processedTodayUsernames.includes(username)
            );
            console.log(`After removing today\'s processed customers: ${availableUsernames.length} available`);

            // Get all existing customer_username from statement_of_accounts
            console.log('Querying all existing records from statement_of_accounts...');
            const { data: existingRecords, error: existingQueryError } = await supabase
                .from('statement_of_accounts')
                .select('customer_username');

            if (existingQueryError) {
                console.error('Supabase query error for existing records:', existingQueryError);
                throw new Error(`Failed to query existing records: ${existingQueryError.message}`);
            }

            const existingUsernames = new Set(existingRecords?.map(r => r.customer_username) || []);
            console.log(`Found ${existingUsernames.size} existing customers in statement_of_accounts`);

            // Filter out customers already in statement_of_accounts
            const newUsernames = availableUsernames.filter(
                username => !existingUsernames.has(username)
            );
            console.log(`After removing existing customers: ${newUsernames.length} new customers available`);

            // Select exactly {limit} records
            const selectedUsernames = newUsernames.slice(0, limit);
            console.log(`Selected ${selectedUsernames.length} customers for processing`);

            // 6. Return response
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    customer_usernames: unprocessedUsernames.slice(0, limit),
                    total: Math.min(unprocessedUsernames.length, limit),
                    customers_count: filteredCustomers.length,
                    timestamp: new Date().toISOString()
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
                    message: 'Supported actions: "customers_only", "invoices", "start"'
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

module.exports = { handler, filterCustomersByBalance, generateStatementHTML, generateEmailHTML };

