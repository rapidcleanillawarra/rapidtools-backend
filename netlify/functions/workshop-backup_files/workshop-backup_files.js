const { supabase } = require('../utils/supabaseInit');
const { getDisplayableMediaUrls } = require('../utils/workshopPhotoUrls');
const { getDisplayableUrlsWithPresigned } = require('../utils/b2Presigned');

// Table and storage bucket names
// photo_urls and file_urls may contain Supabase or Backblaze B2 URLs. B2 private bucket URLs
// are converted to presigned URLs for display; others are used as-is (<img src={url}>).
const WORKSHOP_TABLE = 'workshop';
const BUCKET_FILES = 'workshop-files';
const BUCKET_PHOTOS = 'workshop-photos';

const SUPABASE_PUBLIC_PREFIX = '/storage/v1/object/public/';

function isSupabaseStorageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return url.trim().includes(SUPABASE_PUBLIC_PREFIX);
}

function parseSupabaseStorageUrl(url) {
    if (!url || typeof url !== 'string') return null;
    const u = url.trim();
    const i = u.indexOf(SUPABASE_PUBLIC_PREFIX);
    if (i === -1) return null;
    const after = u.slice(i + SUPABASE_PUBLIC_PREFIX.length);
    const firstSlash = after.indexOf('/');
    if (firstSlash === -1) return null;
    const bucket = after.slice(0, firstSlash);
    const path = after.slice(firstSlash + 1);
    return bucket && path ? { bucket, path } : null;
}

async function downloadFileAsBase64(supabaseClient, bucket, path) {
    const { data, error } = await supabaseClient.storage.from(bucket).download(path);
    if (error || !data) return null;
    const buf = data instanceof Buffer ? data : Buffer.from(await data.arrayBuffer());
    return buf.toString('base64');
}

async function withDisplayUrls(rows) {
    if (!Array.isArray(rows)) return [];
    return Promise.all(
        rows.map(async (row) => ({
            ...row,
            display_photo_urls: await getDisplayableUrlsWithPresigned(row?.photo_urls ?? []),
            display_file_urls: await getDisplayableUrlsWithPresigned(row?.file_urls ?? [])
        }))
    );
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
                    rows: await withDisplayUrls(rows ?? []),
                    count: (rows ?? []).length,
                    note: 'photo_urls and file_urls may include Supabase or Backblaze B2 URLs; display_photo_urls and display_file_urls are filtered and B2 URLs are presigned for private bucket access.'
                })
            };
        }

        if (action === 'backupToPowerAutomate') {
            const orderId = body?.order_id;
            if (orderId == null || String(orderId).trim() === '') {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        error: 'Missing order_id',
                        message: 'Provide order_id in the request body for backup.'
                    })
                };
            }
            const powerAutomateUrl = process.env.POWERAUTOMATE_BACKUP_URL;
            if (!powerAutomateUrl || !powerAutomateUrl.trim()) {
                return {
                    statusCode: 500,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        error: 'Power Automate not configured',
                        message: 'Set POWERAUTOMATE_BACKUP_URL in the environment.'
                    })
                };
            }
            const { data: row, error: rowError } = await supabase
                .from(WORKSHOP_TABLE)
                .select('photo_urls, file_urls, order_id')
                .eq('order_id', orderId)
                .single();
            if (rowError || !row) {
                return {
                    statusCode: rowError?.code === 'PGRST116' ? 404 : 500,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        error: 'Workshop not found',
                        message: rowError?.message || `No workshop row for order_id: ${orderId}`
                    })
                };
            }
            const allUrls = [
                ...(Array.isArray(row.photo_urls) ? row.photo_urls : []),
                ...(Array.isArray(row.file_urls) ? row.file_urls : [])
            ].filter(isSupabaseStorageUrl);
            const files = [];
            for (const url of allUrls) {
                const parsed = parseSupabaseStorageUrl(url);
                if (!parsed) continue;
                const content = await downloadFileAsBase64(supabase, parsed.bucket, parsed.path);
                if (content == null) continue;
                const filename = parsed.path.replace(/\//g, '_');
                files.push({ filename, content });
            }
            const file_path = `order_${orderId}`;
            const payload = { files, file_path };
            let powerAutomateStatus;
            let powerAutomateBody;
            try {
                const res = await fetch(powerAutomateUrl.trim(), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                powerAutomateStatus = res.status;
                const text = await res.text();
                try {
                    powerAutomateBody = JSON.parse(text);
                } catch (_) {
                    powerAutomateBody = text;
                }
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        action: 'backupToPowerAutomate',
                        order_id: orderId,
                        files_sent: files.length,
                        file_path,
                        powerAutomateStatus,
                        powerAutomateBody
                    })
                };
            } catch (fetchErr) {
                console.error('Power Automate fetch error:', fetchErr);
                return {
                    statusCode: 502,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        error: 'Power Automate request failed',
                        message: fetchErr?.message ?? String(fetchErr),
                        order_id: orderId,
                        files_prepared: files.length
                    })
                };
            }
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
                note: 'photo_urls and file_urls may include Supabase or Backblaze B2 URLs; display_photo_urls and display_file_urls are filtered and B2 URLs are presigned for private bucket access.',
                workshop: {
                    table: WORKSHOP_TABLE,
                    count: workshopRows?.length ?? 0,
                    rows: await withDisplayUrls(workshopRows ?? [])
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
