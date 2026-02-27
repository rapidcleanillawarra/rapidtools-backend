const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { supabase } = require('../utils/supabaseInit');
const { getDisplayableMediaUrls } = require('../utils/workshopPhotoUrls');
const { getDisplayableUrlsWithPresigned, isB2Url, getKeyFromB2Url, getB2Client } = require('../utils/b2Presigned');

// Table and storage bucket names
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

/**
 * Robustly parses URLs from a value that might be a string, a JSON string, 
 * or a nested JSON string (common in file_urls).
 */
function parseUrls(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.flat().filter(Boolean);
    if (typeof value !== 'string') return [];

    let current = value.trim();
    // Repeatedly parse if it looks like a JSON string
    while (typeof current === 'string' && (current.startsWith('[') || current.startsWith('"['))) {
        try {
            const parsed = JSON.parse(current);
            if (Array.isArray(parsed)) {
                return parsed.flat().map(v => parseUrls(v)).flat().filter(Boolean);
            }
            current = parsed;
        } catch (e) {
            break;
        }
    }
    return typeof current === 'string' ? [current] : [];
}

async function downloadFileAsBase64(supabaseClient, bucket, path) {
    const { data, error } = await supabaseClient.storage.from(bucket).download(path);
    if (error || !data) return null;
    const buf = data instanceof Buffer ? data : Buffer.from(await data.arrayBuffer());
    return buf.toString('base64');
}

async function downloadB2FileAsBase64(key) {
    const client = getB2Client();
    const bucket = process.env.B2_BUCKET_NAME;
    if (!client || !bucket) return null;
    try {
        const command = new GetObjectCommand({ Bucket: bucket, Key: key });
        const response = await client.send(command);
        const stream = response.Body;
        if (!stream) return null;

        // Convert stream to buffer
        const chunks = [];
        for await (const chunk of stream) {
            chunks.push(chunk);
        }
        return Buffer.concat(chunks).toString('base64');
    } catch (err) {
        console.error('B2 download error:', key, err);
        return null;
    }
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
                .select('status, photo_urls, file_urls, order_id, backup_files')
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
                    body: JSON.stringify({ success: false, error: 'Missing order_id' })
                };
            }
            const { data: row, error: rowError } = await supabase
                .from(WORKSHOP_TABLE)
                .select('id, photo_urls, file_urls, order_id, backup_files')
                .eq('order_id', orderId)
                .single();

            if (rowError || !row) {
                return {
                    statusCode: rowError?.code === 'PGRST116' ? 404 : 500,
                    headers,
                    body: JSON.stringify({ success: false, error: 'Workshop not found', message: rowError?.message })
                };
            }

            const rawPhotoUrls = parseUrls(row.photo_urls);
            const rawFileUrls = parseUrls(row.file_urls);

            const files = [];
            const debug = { photos: 0, files: 0, b2: 0, supabase: 0, skipped: 0 };

            async function processUrl(url, prefix) {
                let content = null;
                let filename = null;

                if (isSupabaseStorageUrl(url)) {
                    const parsed = parseSupabaseStorageUrl(url);
                    if (parsed) {
                        content = await downloadFileAsBase64(supabase, parsed.bucket, parsed.path);
                        filename = prefix + parsed.path.replace(/\//g, '_');
                        debug.supabase++;
                    }
                } else if (isB2Url(url)) {
                    const key = getKeyFromB2Url(url);
                    if (key) {
                        content = await downloadB2FileAsBase64(key);
                        filename = prefix + key.replace(/\//g, '_');
                        debug.b2++;
                    }
                }

                if (content && filename) {
                    files.push({ filename, content });
                    return true;
                }
                debug.skipped++;
                return false;
            }

            for (const url of rawPhotoUrls) {
                if (await processUrl(url, 'photo_')) debug.photos++;
            }
            for (const url of rawFileUrls) {
                if (await processUrl(url, 'file_')) debug.files++;
            }

            const file_path = `order_${orderId}`;
            const POWERAUTOMATE_BACKUP_URL = 'https://default61576f99244849ec8803974b47673f.57.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/c6b1e8fc11c54175900f6a4351512e6d/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=WgKHWKrOdlnotSsnHFVrth-wkReqll_kvmSdN7aK7Pw';

            try {
                const res = await fetch(POWERAUTOMATE_BACKUP_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ files, file_path })
                });

                const powerAutomateStatus = res.status;
                const text = await res.text();
                let powerAutomateBody;
                try { powerAutomateBody = JSON.parse(text); } catch (_) { powerAutomateBody = text; }

                const backupLinks = Array.isArray(powerAutomateBody) ? powerAutomateBody : [];

                if (powerAutomateStatus === 200 && row?.id) {
                    const categorizedBackups = {
                        photos: backupLinks.filter(l => l.toLowerCase().includes('photo_')),
                        files: backupLinks.filter(l => l.toLowerCase().includes('file_'))
                    };
                    if (backupLinks.length > 0 && categorizedBackups.photos.length === 0 && categorizedBackups.files.length === 0) {
                        categorizedBackups.files = backupLinks;
                    }
                    await supabase.from(WORKSHOP_TABLE).update({ backup_files: categorizedBackups }).eq('id', row.id);
                }

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        order_id: orderId,
                        debug,
                        powerAutomateStatus,
                        powerAutomateBody
                    })
                };
            } catch (fetchErr) {
                return {
                    statusCode: 502,
                    headers,
                    body: JSON.stringify({ success: false, error: 'Power Automate failed', debug })
                };
            }
        }

        // Workshop table
        const { data: workshopRows, error: workshopError } = await supabase
            .from(WORKSHOP_TABLE)
            .select('status, photo_urls, file_urls, order_id, backup_files')
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
