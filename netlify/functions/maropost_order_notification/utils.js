// Helper function to escape HTML to prevent XSS
const escapeHtml = (text) => {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
};

// Helper function to format date from "2026-01-20" or "2026-01-20 13:00:00" to "20 Jan 2026"
const formatInvoiceDate = (dateStr) => {
  if (!dateStr) return '';
  try {
    // Handle both date-only and datetime formats
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;

    const day = date.getDate();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  } catch (e) {
    return dateStr;
  }
};

// Helper function to format currency
const formatCurrency = (amount) => {
  if (amount === null || amount === undefined || isNaN(amount)) return '$0.00';
  return `$${Number(amount).toFixed(2)}`;
};

// Helper function to generate UUID
const generateDocumentId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback UUID generation for older environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Helper function to format date for folder name (january_24_2026)
const formatFolderDate = (date = new Date()) => {
  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'];
  const day = date.getDate();
  const month = monthNames[date.getMonth()];
  const year = date.getFullYear();
  return `${month}_${day}_${year}`;
};

// Helper function to format date for file name (24_01_2026)
const formatFileNameDate = (date = new Date()) => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}_${month}_${year}`;
};

// Helper function to format country code
const formatCountry = (countryCode) => {
  if (!countryCode) return 'Australia';
  if (countryCode.toUpperCase() === 'AU') return 'Australia';
  return countryCode;
};

// Helper function to format ship address
const formatShipAddress = (order) => {
  const parts = [];
  if (order.ShipStreetLine1) {
    const streetParts = [order.ShipStreetLine1];
    if (order.ShipStreetLine2) {
      streetParts.push(order.ShipStreetLine2);
    }
    parts.push(streetParts.join(', '));
  }
  const cityStatePostcode = [
    order.ShipCity,
    order.ShipState,
    order.ShipPostCode
  ].filter(Boolean).join(' ');
  if (cityStatePostcode) parts.push(cityStatePostcode);
  if (order.ShipCountry) {
    parts.push(formatCountry(order.ShipCountry));
  }
  return parts;
};

// Helper function to format bill address
const formatBillAddress = (order) => {
  const parts = [];
  if (order.BillStreetLine1) {
    const streetParts = [order.BillStreetLine1];
    if (order.BillStreetLine2) {
      streetParts.push(order.BillStreetLine2);
    }
    parts.push(streetParts.join(', '));
  }
  const cityStatePostcode = [
    order.BillCity,
    order.BillState,
    order.BillPostCode
  ].filter(Boolean).join(' ');
  if (cityStatePostcode) parts.push(cityStatePostcode);
  if (order.BillCountry) {
    parts.push(formatCountry(order.BillCountry));
  }
  return parts;
};

/**
 * Trace related order IDs from a links response (ID + RelatedOrderID).
 * Builds chains by following RelatedOrderID to root, then returns all order IDs in the same chain as currentOrderId.
 * @param {Array} orders - Array of { ID, RelatedOrderID } from first GetOrder call
 * @param {string} currentOrderId - The main order ID (e.g. payload.OrderID)
 * @returns {string[]} Order IDs in the same chain (including current)
 */
function traceRelatedOrderIds(orders, currentOrderId) {
  if (!orders || !Array.isArray(orders) || orders.length === 0 || !currentOrderId) return [];
  const idToParent = {};
  const allIds = new Set();
  orders.forEach((o) => {
    const id = o.ID || o.OrderID;
    if (id) allIds.add(id);
    const parent = o.RelatedOrderID;
    if (parent && String(parent).trim() !== '') idToParent[id] = parent;
  });
  const getRoot = (id) => {
    const seen = new Set();
    let current = id;
    while (current && idToParent[current] && !seen.has(current)) {
      seen.add(current);
      current = idToParent[current];
    }
    return current || id;
  };
  const root = getRoot(currentOrderId);
  const related = [];
  allIds.forEach((id) => {
    if (getRoot(id) === root) related.push(id);
  });
  return related;
}

// Helper function to extract sequence number from OrderLineID (format: "26-0011994-1")
const getOrderLineSequence = (orderLineId) => {
  if (!orderLineId || typeof orderLineId !== 'string') return 0;
  const parts = orderLineId.split('-');
  const lastPart = parts[parts.length - 1];
  return parseInt(lastPart) || 0;
};

module.exports = {
  escapeHtml,
  formatInvoiceDate,
  formatCurrency,
  generateDocumentId,
  formatFolderDate,
  formatFileNameDate,
  formatCountry,
  formatShipAddress,
  formatBillAddress,
  traceRelatedOrderIds,
  getOrderLineSequence
};
