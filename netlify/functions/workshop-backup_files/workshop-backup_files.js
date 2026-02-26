const { supabase } = require('../utils/supabaseInit');
const { getDisplayableMediaUrls } = require('../utils/workshopPhotoUrls');

// Table and storage bucket names
// photo_urls and file_urls may contain Supabase or Backblaze B2 URLs; both can be displayed as-is (<img src={url}>).
const WORKSHOP_TABLE = 'workshop';
const BUCKET_FILES = 'workshop-files';
const BUCKET_PHOTOS = 'workshop-photos';

function withDisplayUrls(rows) {
    if (!Array.isArray(rows)) return [];
    return rows.map((row) => ({
        ...row,
        display_photo_urls: getDisplayableMediaUrls(row?.photo_urls ?? []),
        display_file_urls: getDisplayableMediaUrls(row?.file_urls ?? [])
    }));
}

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

    let body = {};
    if (event.body) {
        try {
            body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
        } catch (_) {
            body = {};
        }
    }

    const action = body?.action;
    const limit = Math.min(Math.max(1, parseInt(body?.limit, 10) || 2), 1000);

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

        if (action === 'getCompletedAndScrapped') {
            const { data: rows, error } = await supabase
                .from(WORKSHOP_TABLE)
                .select('status, photo_urls, file_urls, order_id')
                .in('status', ['completed', 'to_be_scrapped'])
                .limit(limit);

            if (error) {
                return {
                    statusCode: 500,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        error: 'Workshop query error',
                        message: error.message
                    })
                };
            }
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    action: 'getCompletedAndScrapped',
                    rows: withDisplayUrls(rows ?? []),
                    count: (rows ?? []).length,
                    note: 'photo_urls and file_urls may include Supabase or Backblaze B2 URLs; display_photo_urls and display_file_urls are filtered for display (<img src> or link href).'
                })
            };
        }

        // Workshop table
        const { data: workshopRows, error: workshopError } = await supabase
            .from(WORKSHOP_TABLE)
            .select('status, photo_urls, file_urls, order_id')
            .limit(limit);

        if (workshopError) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({
                    success: false,
                    error: 'Workshop table error',
                    message: workshopError.message,
                    hint: 'Ensure the "workshop" table exists in your Supabase schema.'
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
                note: 'photo_urls and file_urls may include Supabase or Backblaze B2 URLs; display_photo_urls and display_file_urls are filtered for display (<img src> or link href).',
                workshop: {
                    table: WORKSHOP_TABLE,
                    count: workshopRows?.length ?? 0,
                    rows: withDisplayUrls(workshopRows ?? [])
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
