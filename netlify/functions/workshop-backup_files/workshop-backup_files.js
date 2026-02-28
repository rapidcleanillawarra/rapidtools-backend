const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
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
        const buffer = Buffer.concat(chunks);
        return {
            content: buffer.toString('base64'),
            contentType: response.ContentType || 'application/octet-stream'
        };
    } catch (err) {
        console.error('B2 download error:', key, err);
        return null;
    }
}

async function uploadToB2(buffer, key, contentType) {
    const client = getB2Client();
    const bucket = process.env.B2_BUCKET_NAME;
    if (!client || !bucket) return null;

    try {
        await client.send(new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: buffer,
            ContentType: contentType
        }));
        // Construct the B2 S3-style URL
        const endpoint = process.env.B2_ENDPOINT; // e.g. s3.us-west-004.backblazeb2.com
        return `https://${bucket}.${endpoint}/${key}`;
    } catch (err) {
        console.error('B2 upload error:', key, err);
        return null;
    }
}

async function withDisplayUrls(rows) {
    if (!Array.isArray(rows)) return [];
    return Promise.all(
        rows.map(async (row) => ({
            ...row,
            display_photo_urls: await getDisplayableUrlsWithPresigned(parseUrls(row?.photo_urls)),
            display_file_urls: await getDisplayableUrlsWithPresigned(parseUrls(row?.file_urls))
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

        if (action === 'backupUrl') {
            const url = body?.url;
            const orderId = body?.order_id;
            const type = body?.type; // 'photo' or 'file'

            if (!url || !orderId) {
                return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Missing url or order_id' }) };
            }

            console.log(`[backupUrl] Starting for order ${orderId}, type ${type}, url ${url}`);
            const startTime = Date.now();

            let buffer = null;
            let filename = null;
            let contentType = 'application/octet-stream';

            try {
                // Use fetch for download (more robust in Lambda for public URLs)
                const downloadStart = Date.now();
                const downloadRes = await fetch(url);
                if (!downloadRes.ok) {
                    throw new Error(`Download failed with status ${downloadRes.status}`);
                }
                const arrayBuffer = await downloadRes.arrayBuffer();
                buffer = Buffer.from(arrayBuffer);

                // Extract filename from URL (strip query params)
                const urlObj = new URL(url);
                filename = urlObj.pathname.split('/').pop() || 'unknown_file';
                contentType = downloadRes.headers.get('content-type') || 'application/octet-stream';

                console.log(`[backupUrl] Downloaded ${buffer.length} bytes in ${Date.now() - downloadStart}ms`);
            } catch (err) {
                console.error(`[backupUrl] Download error for ${url}:`, err.message);
                return { statusCode: 502, headers, body: JSON.stringify({ success: false, error: 'Download failed', message: err.message, url }) };
            }

            if (!buffer || !filename) {
                return { statusCode: 404, headers, body: JSON.stringify({ success: false, error: 'File content missing', url }) };
            }

            try {
                const folder = type === 'photo' ? 'photos' : 'files';
                const b2Key = `workshop/${orderId}/${folder}/${filename}`;
                console.log(`[backupUrl] Uploading to B2: ${b2Key}`);
                const uploadStart = Date.now();

                const backupUrl = await uploadToB2(buffer, b2Key, contentType);

                const uploadTime = Date.now() - uploadStart;
                console.log(`[backupUrl] B2 upload completed in ${uploadTime}ms (Total: ${Date.now() - startTime}ms)`);

                if (!backupUrl) {
                    return { statusCode: 502, headers, body: JSON.stringify({ success: false, error: 'B2 upload failed' }) };
                }

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ success: true, backup_url: backupUrl, original_url: url })
                };
            } catch (err) {
                console.error(`[backupUrl] B2 Upload error:`, err.message);
                return { statusCode: 502, headers, body: JSON.stringify({ success: false, error: 'B2 upload failed', message: err.message }) };
            }
        }

        if (action === 'saveBackupLinks') {
            const orderId = body?.order_id;
            const categorizedBackups = body?.categorizedBackups;

            if (!orderId || !categorizedBackups) {
                return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Missing order_id or categorizedBackups' }) };
            }

            const { error: updateError } = await supabase
                .from(WORKSHOP_TABLE)
                .update({ backup_files: categorizedBackups })
                .eq('order_id', orderId);

            if (updateError) {
                return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: 'Failed to update database', message: updateError.message }) };
            }

            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }

        if (action === 'backupToB2') {
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

            const photoBackupLinks = [];
            const fileBackupLinks = [];
            const debug = { photos: 0, files: 0, b2: 0, supabase: 0, skipped: 0 };

            async function processUrl(url, type) {
                let buffer = null;
                let filename = null;
                let contentType = 'application/octet-stream';

                if (isSupabaseStorageUrl(url)) {
                    const parsed = parseSupabaseStorageUrl(url);
                    if (parsed) {
                        const { data, error } = await supabase.storage.from(parsed.bucket).download(parsed.path);
                        if (!error && data) {
                            buffer = data instanceof Buffer ? data : Buffer.from(await data.arrayBuffer());
                            filename = parsed.path.split('/').pop();
                            contentType = data.type || 'application/octet-stream';
                            debug.supabase++;
                        }
                    }
                } else if (isB2Url(url)) {
                    const key = getKeyFromB2Url(url);
                    if (key) {
                        const result = await downloadB2FileAsBase64(key);
                        if (result) {
                            buffer = Buffer.from(result.content, 'base64');
                            filename = key.split('/').pop();
                            contentType = result.contentType;
                            debug.b2++;
                        }
                    }
                }

                if (buffer && filename) {
                    const folder = type === 'photo' ? 'photos' : 'files';
                    const b2Key = `workshop/${orderId}/${folder}/${filename}`;
                    const bUrl = await uploadToB2(buffer, b2Key, contentType);
                    if (bUrl) {
                        if (type === 'photo') photoBackupLinks.push(bUrl);
                        else fileBackupLinks.push(bUrl);
                        return true;
                    }
                }
                debug.skipped++;
                return false;
            }

            for (const url of rawPhotoUrls) {
                if (await processUrl(url, 'photo')) debug.photos++;
            }
            for (const url of rawFileUrls) {
                if (await processUrl(url, 'file')) debug.files++;
            }

            try {
                if (row?.id) {
                    const categorizedBackups = {
                        photos: photoBackupLinks,
                        files: fileBackupLinks
                    };
                    await supabase.from(WORKSHOP_TABLE).update({ backup_files: categorizedBackups }).eq('id', row.id);
                }

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        order_id: orderId,
                        debug,
                        photo_count: photoBackupLinks.length,
                        file_count: fileBackupLinks.length
                    })
                };
            } catch (fetchErr) {
                return {
                    statusCode: 502,
                    headers,
                    body: JSON.stringify({ success: false, error: 'Backup to B2 failed', debug })
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
