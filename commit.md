feat(accounting-bot): Enhance invoice validation and HTML template styling

This commit introduces improvements to the invoice validation logic between Maropost and Xero, along with refined HTML template styling for better readability and user experience.

### Files Modified:

#### 1. `netlify/functions/accounting_bot.js`
   - ADDED: HTTP method validation (POST only)
   - ADDED: Input validation for required data fields (maropostData, xeroData)
   - ADDED: OrderID matching logic
   - ADDED: Invoice existence checks in Xero
   - ADDED: Payment status tracking (paid/free/partial/overpaid)
   - IMPROVED: HTML template styling (HEX to RGB, spacing, status formatting)
   - DIFF:
     ```diff
     - const maropost_paid_status_background = "#4CAF50";
     + const maropost_paid_status_background = "rgb(76, 175, 80)";
     ```

### Technical Improvements:
- BEFORE: Basic validation and unstyled HTML output
- AFTER: Robust validation and polished HTML template
- IMPACT: Improved error handling and user-friendly output

### Testing Instructions:
1. Send a POST request to `/accounting_bot` with valid maropostData and xeroData.
2. Verify the response includes correctly formatted HTML and status indicators.
3. Test edge cases (missing data, OrderID mismatch, etc.).

### Notes:
- No breaking changes introduced.
- Error handling now includes detailed debug information.
- Related issues: None
- Dependencies: None
- Deployment requirements: None 