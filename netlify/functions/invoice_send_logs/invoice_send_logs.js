const { supabase } = require('../utils/supabaseInit');

/**
 * Invoice Send Logs - Netlify Function
 * 
 * This function:
 * 1. Receives invoice send data
 * 2. Validates required fields (order_id only, customer_email is optional)
 * 3. Saves the log to Supabase invoice_send_logs table (order_details is boolean)
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

        // customer_email is now optional (nullable in database)

        // Helper function to safely convert values to boolean
        const toBoolean = (value) => {
            if (typeof value === 'boolean') {
                return value;
            }
            if (typeof value === 'string') {
                const lowerValue = value.toLowerCase().trim();
                if (lowerValue === 'true') return true;
                if (lowerValue === 'false') return false;
                // If it's a JSON string, try to parse it
                try {
                    const parsed = JSON.parse(value);
                    return Boolean(parsed);
                } catch (e) {
                    return false;
                }
            }
            if (typeof value === 'number') {
                return value !== 0;
            }
            return Boolean(value);
        };

        // Process order_detail -> order_details mapping (now boolean field)
        let orderDetails = null;
        if (payload.order_detail !== undefined) {
            // Convert order_detail to boolean since order_details is now a boolean field
            orderDetails = toBoolean(payload.order_detail);
        }

        // Prepare database record
        const dbRecord = {
            order_id: payload.order_id,
            customer_email: payload.customer_email,
            order_details: orderDetails,
            document_id: payload.document_id || null,
            pdf_path: payload.pdf_path || null,
            pdf_exists: payload.pdf_exists !== undefined ? toBoolean(payload.pdf_exists) : false,
            email_sent: payload.email_sent !== undefined ? toBoolean(payload.email_sent) : false
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

        // Check if order_detail was provided as false (indicating order detail failed)
        if (orderDetails === false) {
            warnings.push('order_detail is false');
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
