/**
 * Generate presigned GET URLs for private Backblaze B2 objects (S3-compatible API).
 * Also supports proxy URLs for same-origin loading (avoids ORB/CORS).
 * Requires env: B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_NAME, B2_ENDPOINT, B2_REGION.
 */

const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { isWorkshopMediaUrl } = require('./workshopPhotoUrls');

const BACKBLAZE_S3_PATTERN = /\.s3\.[\w-]+\.backblazeb2\.com\//;
const BACKBLAZE_S3_HOST_PATTERN = /\.s3\.[\w-]+\.backblazeb2\.com$/;
const B2_IMAGE_PROXY_PATH = '/.netlify/functions/b2-image';

/** @type {import('@aws-sdk/client-s3').S3Client|null} */
let s3Client = null;

function getB2Client() {
    if (s3Client) return s3Client;
    const keyId = process.env.B2_KEY_ID;
    const appKey = process.env.B2_APPLICATION_KEY;
    const endpoint = process.env.B2_ENDPOINT;
    const region = process.env.B2_REGION || 'us-west-004';
    if (!keyId || !appKey || !endpoint) return null;
    const endpointUrl = endpoint.startsWith('http') ? endpoint : `https://${endpoint}`;
    s3Client = new S3Client({
        region,
        endpoint: endpointUrl,
        credentials: { accessKeyId: keyId, secretAccessKey: appKey },
        forcePathStyle: true
    });
    return s3Client;
}

/**
 * Extract object key from a B2 S3-style URL.
 * e.g. https://bucket.s3.region.backblazeb2.com/workshop-photos/foo.jpg -> workshop-photos/foo.jpg
 * @param {string} url
 * @returns {string|null}
 */
function getKeyFromB2Url(url) {
    if (!url || typeof url !== 'string') return null;
    try {
        const u = new URL(url.trim());
        if (!BACKBLAZE_S3_HOST_PATTERN.test(u.hostname)) return null;
        const path = u.pathname.replace(/^\//, '');
        return path || null;
    } catch {
        return null;
    }
}

/**
 * Returns true if the URL is a Backblaze B2 URL (we can try to sign it).
 * @param {string} url
 * @returns {boolean}
 */
function isB2Url(url) {
    if (!url || typeof url !== 'string') return false;
    return BACKBLAZE_S3_PATTERN.test(url.trim());
}

/**
 * Get a presigned GET URL for a private B2 object. If the URL is not B2 or B2 is not
 * configured, returns the original URL.
 * @param {string} url - Full B2 object URL (e.g. https://bucket.s3.region.backblazeb2.com/...)
 * @param {number} [expiresIn=3600] - Expiry in seconds (default 1 hour)
 * @returns {Promise<string>} - Presigned URL or original URL
 */
async function getPresignedUrl(url, expiresIn = 3600) {
    if (!url || typeof url !== 'string') return url;
    const key = getKeyFromB2Url(url);
    if (!key) return url;
    const client = getB2Client();
    const bucket = process.env.B2_BUCKET_NAME;
    if (!client || !bucket) return url;
    try {
        const command = new GetObjectCommand({ Bucket: bucket, Key: key });
        return await getSignedUrl(client, command, { expiresIn });
    } catch (err) {
        console.error('B2 presign error for', key, err?.message || err);
        return url;
    }
}

/**
 * Get a same-origin proxy URL for a B2 object (avoids ORB/CORS when used in img src).
 * @param {string} url - Full B2 object URL
 * @returns {string} - Proxy URL or original URL if not B2
 */
function getB2ProxyUrl(url) {
    if (!url || typeof url !== 'string') return url;
    const key = getKeyFromB2Url(url);
    if (!key) return url;
    const encoded = Buffer.from(key, 'utf8').toString('base64url');
    return `${B2_IMAGE_PROXY_PATH}?key=${encoded}`;
}

/**
 * Convert an array of workshop media URLs to display-ready URLs: B2 URLs become
 * proxy URLs (same-origin, avoids ORB); others are returned as-is.
 * @param {string[]} urls
 * @returns {Promise<string[]>}
 */
async function getDisplayableUrlsWithPresigned(urls) {
    if (!Array.isArray(urls)) return [];
    const filtered = urls.filter((u) => isWorkshopMediaUrl(u));
    if (filtered.length === 0) return [];
    return filtered.map((u) => (isB2Url(u) ? getB2ProxyUrl(u) : u));
}

module.exports = {
    getB2Client,
    getKeyFromB2Url,
    isB2Url,
    getPresignedUrl,
    getB2ProxyUrl,
    getDisplayableUrlsWithPresigned
};
