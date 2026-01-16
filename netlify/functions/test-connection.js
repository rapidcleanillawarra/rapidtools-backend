/**
 * Diagnostic endpoint to test environment variables and connections
 */
const handler = async (event) => {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        console.log('=== Diagnostic Test Started ===');
        
        // Check environment variables
        const hasSupabaseUrl = !!process.env.SUPABASE_URL;
        const hasSupabaseKey = !!process.env.SUPABASE_ANON_KEY;
        
        console.log('Environment check:', { hasSupabaseUrl, hasSupabaseKey });
        
        // Try to import and initialize Supabase
        let supabaseStatus = 'not_loaded';
        let supabaseError = null;
        
        try {
            const { supabase } = require('./utils/supabaseInit');
            if (supabase) {
                supabaseStatus = 'initialized';
                
                // Try a simple query to test connection
                try {
                    const { data, error } = await supabase
                        .from('statement_of_accounts')
                        .select('count')
                        .limit(1);
                    
                    if (error) {
                        supabaseStatus = 'initialized_but_query_failed';
                        supabaseError = error.message;
                    } else {
                        supabaseStatus = 'working';
                    }
                } catch (queryError) {
                    supabaseStatus = 'initialized_but_query_error';
                    supabaseError = queryError.message;
                }
            } else {
                supabaseStatus = 'initialized_but_null';
            }
        } catch (importError) {
            supabaseStatus = 'import_failed';
            supabaseError = importError.message;
        }
        
        const response = {
            success: true,
            environment: {
                hasSupabaseUrl,
                hasSupabaseKey,
                urlPrefix: process.env.SUPABASE_URL ? process.env.SUPABASE_URL.substring(0, 20) + '...' : null,
                nodeVersion: process.version
            },
            supabase: {
                status: supabaseStatus,
                error: supabaseError
            },
            timestamp: new Date().toISOString()
        };
        
        console.log('Diagnostic results:', response);
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(response, null, 2)
        };
        
    } catch (error) {
        console.error('Diagnostic test error:', error);
        
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: error.message,
                stack: error.stack,
                environment: {
                    hasSupabaseUrl: !!process.env.SUPABASE_URL,
                    hasSupabaseKey: !!process.env.SUPABASE_ANON_KEY,
                    nodeVersion: process.version
                }
            }, null, 2)
        };
    }
};

module.exports = { handler };
