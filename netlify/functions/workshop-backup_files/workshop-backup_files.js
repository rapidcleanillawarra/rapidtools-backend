const { supabase } = require('../utils/supabaseInit');

// Table and storage bucket names
const WORKSHOP_TABLE = 'workshops';
const BUCKET_FILES = 'workshop-files';
const BUCKET_PHOTOS = 'workshop-photos';

const handler = async (event) => {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({
                success: false,
                error: 'Method Not Allowed',
                message: 'Use GET or POST'
            })
        };
    }

    try {
        if (!supabase) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({
                    success: false,
                    error: 'Supabase not initialized',
                    message: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY)'
                })
            };
        }

        // Workshop table
        const { data: workshopRows, error: workshopError } = await supabase
            .from(WORKSHOP_TABLE)
            .select('*')
            .limit(100);

        if (workshopError) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({
                    success: false,
                    error: 'Workshop table error',
                    message: workshopError.message,
                    hint: 'Ensure the "workshops" table exists in your Supabase schema.'
                })
            };
        }

        // Storage: workshop-files
        const { data: filesList, error: filesError } = await supabase
            .storage
            .from(BUCKET_FILES)
            .list('', { limit: 100 });

        if (filesError) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({
                    success: false,
                    error: 'Storage workshop-files error',
                    message: filesError.message,
                    hint: 'Ensure the "workshop-files" bucket exists in Storage.'
                })
            };
        }

        // Storage: workshop-photos
        const { data: photosList, error: photosError } = await supabase
            .storage
            .from(BUCKET_PHOTOS)
            .list('', { limit: 100 });

        if (photosError) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({
                    success: false,
                    error: 'Storage workshop-photos error',
                    message: photosError.message,
                    hint: 'Ensure the "workshop-photos" bucket exists in Storage.'
                })
            };
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                workshop: {
                    table: WORKSHOP_TABLE,
                    count: workshopRows?.length ?? 0,
                    rows: workshopRows ?? []
                },
                storage: {
                    [BUCKET_FILES]: { files: filesList ?? [], count: (filesList ?? []).length },
                    [BUCKET_PHOTOS]: { files: photosList ?? [], count: (photosList ?? []).length }
                }
            })
        };
    } catch (err) {
        console.error('workshop-backup_files error:', err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: 'Server error',
                message: err?.message ?? String(err)
            })
        };
    }
};

module.exports = { handler };
