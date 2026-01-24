const { supabase } = require('../utils/supabaseInit');

/**
 * Invoice Send Logs - Netlify Function
 * 
 * This function:
 * 1. Receives invoice send data
 * 2. Validates required fields (order_id, customer_email)
 * 3. Saves the log to Supabase invoice_send_logs table
 * 4. Returns response indicating which boolean fields are false (if any)
 */
const handler = async (event) => {
    console.log('=== Invoice Send Logs Function Started ===');
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
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    success: false,
                    error: 'Invalid JSON',
                    details: parseError.message
                })
            };
        }

        console.log('Received payload:', JSON.stringify(payload));

        // Validate required fields
        if (!payload.order_id) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    success: false,
                    error: 'Validation Error',
                    details: 'order_id is required'
                })
            };
        }

        if (!payload.customer_email) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    success: false,
                    error: 'Validation Error',
                    details: 'customer_email is required'
                })
            };
        }

        // Process order_detail -> order_details mapping
        let orderDetails = null;
        if (payload.order_detail !== undefined) {
            if (typeof payload.order_detail === 'boolean') {
                // If it's a boolean, store as an object with the boolean value
                orderDetails = { order_detail: payload.order_detail };
            } else if (typeof payload.order_detail === 'string') {
                // If it's a string, try to parse it as JSON
                try {
                    orderDetails = JSON.parse(payload.order_detail);
                } catch (e) {
                    // If parsing fails, store as a string value
                    orderDetails = { order_detail: payload.order_detail };
                }
            } else if (typeof payload.order_detail === 'object' && payload.order_detail !== null) {
                // If it's already an object, use it as-is
                orderDetails = payload.order_detail;
            }
        }

        // Prepare database record
        const dbRecord = {
            order_id: payload.order_id,
            customer_email: payload.customer_email,
            order_details: orderDetails,
            document_id: payload.document_id || null,
            pdf_path: payload.pdf_path || null,
            pdf_exists: payload.pdf_exists !== undefined ? Boolean(payload.pdf_exists) : false,
            email_sent: payload.email_sent !== undefined ? Boolean(payload.email_sent) : false
        };

        console.log('Prepared database record:', JSON.stringify(dbRecord));

        // Insert into Supabase
        const { data, error } = await supabase
            .from('invoice_send_logs')
            .insert(dbRecord)
            .select('id, pdf_exists, email_sent, email_bounced')
            .single();

        if (error) {
            console.error('Database insertion error:', error);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({
                    success: false,
                    error: 'Database Error',
                    details: error.message
                })
            };
        }

        console.log('Successfully inserted record with ID:', data.id);

        // Check for false boolean values
        const warnings = [];
        if (data.pdf_exists === false) {
            warnings.push('pdf_exists is false');
        }
        if (data.email_sent === false) {
            warnings.push('email_sent is false');
        }
        if (data.email_bounced === true) {
            warnings.push('email_bounced is true');
        }

        // Build response
        const response = {
            success: true,
            message: 'Invoice send log saved successfully',
            id: data.id
        };

        // Add warnings if any false values exist
        if (warnings.length > 0) {
            response.warnings = warnings;
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(response)
        };

    } catch (error) {
        console.error('=== ERROR OCCURRED ===');
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);

        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: 'Internal Server Error',
                details: error.message
            })
        };
    }
};

module.exports = { handler };
