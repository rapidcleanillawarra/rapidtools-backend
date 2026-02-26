/**
 * Workshop photo and file URLs may come from two origins. Both can be used
 * as-is for display (e.g. <img src={url}> or <a href={url}>).
 *
 * - Supabase Storage: https://<project>.supabase.co/storage/v1/object/public/workshop-photos/...
 * - Backblaze B2:     https://<bucket>.s3.<region>.backblazeb2.com/workshop-photos/...
 */

const SUPABASE_STORAGE_PATH = '/storage/v1/object/public/';
const BACKBLAZE_S3_PATTERN = /\.s3\.[\w-]+\.backblazeb2\.com\//;

/**
 * Returns true if the URL is a known workshop photo/file URL (Supabase or Backblaze).
 * Use this when validating or filtering photo_urls / file_urls.
 *
 * @param {string} url
 * @returns {boolean}
 */
function isWorkshopMediaUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const u = url.trim();
    if (!u.startsWith('https://')) return false;
    return (
        u.includes(SUPABASE_STORAGE_PATH) ||
        BACKBLAZE_S3_PATTERN.test(u)
    );
}

/**
 * Filters an array of URLs to only valid workshop media URLs (Supabase or Backblaze).
 * Safe for mixed arrays. Use for display lists.
 *
 * @param {string[]} urls
 * @returns {string[]}
 */
function getDisplayableMediaUrls(urls) {
    if (!Array.isArray(urls)) return [];
    return urls.filter(isWorkshopMediaUrl);
}

module.exports = {
    isWorkshopMediaUrl,
    getDisplayableMediaUrls
};
