const GET_ORDERS_ENDPOINT = 'https://default61576f99244849ec8803974b47673f.57.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/ef89e5969a8f45778307f167f435253c/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=pPhk80gODQOi843ixLjZtPPWqTeXIbIt9ifWZP6CJfY';
const GEN_PDF_ENDPOINT = 'https://default61576f99244849ec8803974b47673f.57.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/b7ca6010fbe647cc81c80314b9b680c2/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=lJi8nh7QIBUj40phbYeZW7MqQwhKg3TRhVTXGQ_q9Es';

const { generateStatementHTML } = require('../generate_invoices_statements/statementTemplates');
const { formatCustomerNameFromBillingAddress, fetchCustomerByUsername } = require('../generate_invoices_statements/customerUtils');
const { supabase } = require('../utils/supabaseInit');

/**
 * Netlify Function: statement_table_calculation
 * 
 * Actions:
 * 1. calculate (default): Fetches dispatched orders and returns PDF HTML preview.
 * 2. generate_pdf: Calls Power Automate to generate the actual PDF file.
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
            body: JSON.stringify({ success: false, error: 'Method Not Allowed' })
        };
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const { customer_username, action = 'calculate' } = body;

        if (!customer_username) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ success: false, error: 'customer_username is required' })
            };
        }

        console.log(`Action: ${action} for customer: ${customer_username}`);

        // Common logic: Fetch data and generate HTML
        const orderPayload = {
            Filter: {
                Username: customer_username,
                OrderStatus: ['Dispatched'],
                PaymentStatus: ['Pending', 'PartialPaid'],
                OutputSelector: [
                    'ID', 'OrderID', 'DatePlaced', 'DateInvoiced', 'GrandTotal',
                    'OrderStatus', 'DatePaymentDue', 'PurchaseOrderNumber',
                    'OrderPayment', 'OrderPayment.PaymentType', 'OrderPayment.Amount'
                ]
            },
            action: 'GetOrder'
        };

        const orderRes = await fetch(GET_ORDERS_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderPayload)
        });

        if (!orderRes.ok) throw new Error(`Orders API returned ${orderRes.status}`);
        const orderData = await orderRes.json();
       
        if (orderData.Ack !== 'Success') {
            return {
                statusCode: 502,
                headers,
                body: JSON.stringify({ success: false, error: 'API Error', message: orderData.Ack })
            };
        }

        const rawOrders = orderData.Order || [];
        let orders = rawOrders.map(order => {
            const grandTotal = parseFloat(order.GrandTotal || 0);
            const paymentsSum = order.OrderPayment && Array.isArray(order.OrderPayment)
                ? order.OrderPayment.reduce((sum, p) => sum + parseFloat(p.Amount || 0), 0)
                : 0;
            return {
                ...order,
                grandTotal,
                paymentsSum,
                outstandingAmount: grandTotal - paymentsSum,
                paidAmount: paymentsSum
            };
        }).filter(o => !(o.grandTotal === 0 && o.outstandingAmount <= 0.01));

        const totalGrandTotal = rawOrders.reduce((sum, order) => {
            return sum + parseFloat(order.GrandTotal || 0);
        }, 0);

        const customerData = await fetchCustomerByUsername(customer_username);
        const billingAddress = customerData?.BillingAddress || {};
        const pdfCustomerName = formatCustomerNameFromBillingAddress(billingAddress) || customer_username;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const invoices = orders.map(order => {
            let isPastDue = false;
            if (order.DatePaymentDue) {
                const dueDate = new Date(order.DatePaymentDue);
                dueDate.setHours(0, 0, 0, 0);
                isPastDue = dueDate < today;
            }
            return {
                id: order.ID,
                grandTotal: order.grandTotal,
                payments: order.OrderPayment || [],
                outstandingAmount: order.outstandingAmount,
                datePlaced: order.DatePlaced || null,
                datePaymentDue: order.DatePaymentDue || null,
                isPastDue
            };
        });

        const total_balance = orders.reduce((sum, o) => sum + o.outstandingAmount, 0);
        const due_invoice_balance = invoices
            .filter(inv => inv.isPastDue)
            .reduce((sum, inv) => sum + inv.outstandingAmount, 0);

        const customer = {
            customer_username,
            pdf_customer_name: pdfCustomerName,
            total_orders: orders.length,
            total_balance,
            due_invoice_balance,
            invoices
        };

        let pdfHtml = generateStatementHTML(customer, invoices);
        pdfHtml = pdfHtml.replace(/<p>Generated On:[^<]*<\/p>\s*/i, '');

        if (action === 'calculate') {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    count: orders.length,
                    orders: orders,
                    pdf_html: pdfHtml
                })
            };
        } else if (action === 'generate_pdf') {
            // If there are no orders, or the total GrandTotal is 0, 
            // we don't generate a PDF and instead store a descriptive pdf_link.
            if (!rawOrders.length || totalGrandTotal === 0) {
                const pdfLinkFallback = !rawOrders.length ? 'No Orders' : 'Grand Total is 0';

                try {
                    if (!supabase) {
                        console.error('Supabase client not initialized in statement_table_calculation');
                    } else {
                        const pdfGeneratedAt = new Date().toISOString();

                        const { error: updateError } = await supabase
                            .from('statement_of_accounts')
                            .update({
                                pdf_link: pdfLinkFallback,
                                pdf_generated_at: pdfGeneratedAt
                            })
                            .eq('customer_username', customer_username)
                            .is('pdf_link', null);

                        if (updateError) {
                            console.error('Failed to update statement_of_accounts with fallback PDF info:', updateError);
                        } else {
                            console.log('Updated statement_of_accounts with fallback PDF info for', customer_username, {
                                pdf_link: pdfLinkFallback,
                                pdf_generated_at: pdfGeneratedAt
                            });
                        }
                    }
                } catch (dbErr) {
                    console.error('Error while updating statement_of_accounts with fallback PDF info:', dbErr);
                }

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        message: pdfLinkFallback
                    })
                };
            }

            console.log('Routing to PDF Generation Power Automate');
            
            const dateStr = new Intl.DateTimeFormat('en-US', { 
                month: 'long', 
                day: 'numeric', 
                year: 'numeric' 
            }).format(new Date());

            const firstName = billingAddress.BillFirstName || '';
            const lastName = billingAddress.BillLastName || '';
            const company = billingAddress.BillCompany || '';
            const fullName = [firstName, lastName].filter(p => p.trim()).join(' ');
            
            let customFileName = fullName || customer_username;
            if (company) {
                customFileName = `${customFileName}-(${company})`;
            }

            // Avoid double .pdf – Power Automate will handle extension if needed
            if (customFileName.toLowerCase().endsWith('.pdf')) {
                customFileName = customFileName.slice(0, -4);
            }

            const pdfPayload = {
                pdf: pdfHtml,
                file_name: customFileName,
                folder_name: `Statements/${dateStr}`,
                customer_username: customer_username,
                created_by: 'RapidTools Backend'
            };

            const pdfRes = await fetch(GEN_PDF_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(pdfPayload)
            });

            const pdfResultText = await pdfRes.text();
            let pdfResultData;
            try { pdfResultData = JSON.parse(pdfResultText); } catch (e) { pdfResultData = pdfResultText; }

            // If PDF generation succeeded, update statement_of_accounts with pdf_link and pdf_generated_at
            if (pdfRes.ok && pdfResultData && typeof pdfResultData === 'object' && !Array.isArray(pdfResultData)) {
                try {
                    if (!supabase) {
                        console.error('Supabase client not initialized in statement_table_calculation');
                    } else {
                        const folderPath = pdfResultData.folder_path || '';
                        const fileName = pdfResultData.file_name || '';
                        // Build a public-style link based on folder_path; adjust if you have a direct sharing URL instead
                        const pdfLink = pdfResultData.onedrive_id || folderPath || null;

                        const pdfGeneratedAt = pdfResultData.created_at || new Date().toISOString();

                        const { error: updateError } = await supabase
                            .from('statement_of_accounts')
                            .update({
                                pdf_link: pdfLink,
                                pdf_generated_at: pdfGeneratedAt
                            })
                            .eq('customer_username', customer_username)
                            .is('pdf_link', null);

                        if (updateError) {
                            console.error('Failed to update statement_of_accounts with PDF info:', updateError);
                        } else {
                            console.log('Updated statement_of_accounts with PDF info for', customer_username, {
                                pdf_link: pdfLink,
                                pdf_generated_at: pdfGeneratedAt
                            });
                        }
                    }
                } catch (dbErr) {
                    console.error('Error while updating statement_of_accounts with PDF info:', dbErr);
                }
            }

            return {
                statusCode: pdfRes.status,
                headers,
                body: JSON.stringify({
                    success: pdfRes.ok,
                    power_automate_response: pdfResultData
                })
            };
        }

        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ success: false, error: 'Invalid action' })
        };

    } catch (err) {
        console.error('statement_table_calculation error:', err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, error: 'Internal Error', message: err.message })
        };
    }
};

module.exports = { handler };
