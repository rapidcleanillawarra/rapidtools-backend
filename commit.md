feat(accounting-bot): Add production-ready Firestore integration with comprehensive validation

This commit implements robust Firestore data persistence with extensive validation,
error handling, and production-ready features for Netlify deployment.

### Files Modified:

#### 1. `netlify/functions/accounting_bot.js`
   - ADDED: Firestore integration using existing firebaseInit utility
   - ADDED: Comprehensive data validation for production safety
   - ADDED: CORS headers for cross-origin requests
   - ADDED: OPTIONS method handling for preflight requests
   - IMPROVED: Error handling with detailed logging
   - FIXED: Safe array/object access to prevent runtime errors
   - DIFF:
     ```diff
     + // Add CORS headers for production
     + const headers = {
     +   'Content-Type': 'application/json',
     +   'Access-Control-Allow-Origin': '*',
     +   'Access-Control-Allow-Headers': 'Content-Type',
     +   'Access-Control-Allow-Methods': 'POST, OPTIONS'
     + };
     
     + // Validate maropostData structure
     + if (!maropostData.Order || !Array.isArray(maropostData.Order) || maropostData.Order.length === 0) {
     +   return { statusCode: 400, headers, body: JSON.stringify({...}) };
     + }
     
     + // Safe access to order data
     + const order = maropostData.Order[0];
     + const maropostPaymentsSum = order.OrderPayment && Array.isArray(order.OrderPayment)
     +   ? order.OrderPayment.reduce((sum, payment) => sum + parseFloat(payment.Amount || 0), 0)
     +   : 0;
     ```

### Technical Improvements:
- BEFORE: Direct array access without bounds checking
- AFTER: Comprehensive validation with graceful error handling
- BEFORE: No CORS support for production API calls
- AFTER: Full CORS support with preflight handling
- BEFORE: Basic error logging
- AFTER: Structured error logging with context

### Production Safety Features:
1. **Data Validation**:
   - Request body existence check
   - Array bounds validation
   - Required field verification
   - Nested object safety checks

2. **Error Handling**:
   - Firestore operation isolation
   - Detailed error logging with context
   - Graceful fallbacks (e.g., 'unknown' for missing OrderStatus)

3. **CORS Support**:
   - Cross-origin request headers
   - OPTIONS preflight handling
   - Production-ready API access

### Firestore Document Structure:
```json
{
  "order_id": "MP12345",
  "order_status": "Fulfilled", // From maropostData.Order[0].OrderStatus
  "timestamp_utc": "2023-11-16T09:45:00Z",
  "maropost_total": "150.00",
  "maropost_paid_status": "partial",
  "xero_total": "150.00",
  "difference": "0.00",
  "xero_paid_status": "unpaid",
  "notes": "Amounts match but payment pending"
}
```

### Testing Instructions:
1. Test endpoint with valid data:
   ```bash
   curl -X POST https://your-netlify-url/.netlify/functions/accounting_bot \
     -H "Content-Type: application/json" \
     -d '{"maropostData": {"Order": [{"OrderID": "123", "OrderStatus": "Fulfilled"}]}, "xeroData": {"requestedItems": ["123"], "foundCount": 1, "invoices": []}}'
   ```

2. Test validation with invalid data:
   ```bash
   curl -X POST https://your-netlify-url/.netlify/functions/accounting_bot \
     -H "Content-Type: application/json" \
     -d '{"maropostData": {}, "xeroData": {}}'
   ```

3. Test CORS preflight:
   ```bash
   curl -X OPTIONS https://your-netlify-url/.netlify/functions/accounting_bot \
     -H "Access-Control-Request-Method: POST"
   ```

### Error Handling Improvements:
- Firestore failures are isolated and logged but don't break API responses
- Missing OrderStatus defaults to 'unknown' instead of causing errors
- All array accesses are bounds-checked
- Nested object properties are safely accessed

### Dependencies:
- Requires firebase-admin@^11.0.0 (already in package.json)
- Needs Firebase environment variables in Netlify:
  - FIREBASE_PROJECT_ID
  - FIREBASE_CLIENT_EMAIL
  - FIREBASE_PRIVATE_KEY
  - FIREBASE_DATABASE_URL

### Deployment Notes:
- No breaking changes - existing API responses remain identical
- Added CORS support for browser-based requests
- Enhanced error messages for easier debugging
- Production-ready validation prevents runtime crashes 