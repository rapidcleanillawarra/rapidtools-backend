# Modal PDF Display Logic Update Plan

## Overview
Fix the modal display logic in [`generate_invoices_statements.html`](generate_invoices_statements.html) to properly render the PDF HTML content that's already being returned from the backend function [`generate_invoices_statements.js`](netlify/functions/statement_of_accounts/generate_invoices_statements.js).

## Current State Analysis

### Backend ([`generate_invoices_statements.js`](netlify/functions/statement_of_accounts/generate_invoices_statements.js:750-757))
- The `invoices` action already generates `pdf_html` for each customer during the main data fetch
- Returns `customersWithPdfHtml` array with `pdf_html` property for each customer

### Frontend Issue ([`generate_invoices_statements.html`](generate_invoices_statements.html:605-667))
- [`loadPdfHtml()`](generate_invoices_statements.html:605-667) function has a critical bug:
  - Calls `action: 'generate_pdf_html'` which is NOT supported by the backend
  - Backend only supports `customers_only` and `invoices` actions
  - Should use the `pdf_html` already returned in `window.currentInvoiceData` from the `invoices` action

## Root Cause
The frontend is making an API call to an action that doesn't exist on the backend. The PDF HTML content is already being generated and returned when the `invoices` action is called, but the frontend ignores it and tries to fetch it again.

## Implementation Plan

### Step 1: Fix Frontend `loadPdfHtml()` Function

**File**: [`generate_invoices_statements.html`](generate_invoices_statements.html:605-667)

**Current Problematic Code**:
```javascript
async function loadPdfHtml(customerUsername) {
    // ... loading state setup ...
    
    try {
        // Finds customer data...
        const customerData = window.currentInvoiceData?.customers?.find(c => c.customer_username === customerUsername);
        
        // ISSUE: Makes redundant API call to unsupported action
        const response = await fetch('/.netlify/functions/generate_invoices_statements', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'generate_pdf_html',  // <-- ACTION DOESN'T EXIST
                customer: customerData,
                invoices: customerData.invoices
            })
        });
        
        const data = await response.json();
        const htmlContent = data.pdf_html;  // <-- IGNORES EXISTING pdf_html
        
        // ...
    }
}
```

**Fixed Code**:
```javascript
async function loadPdfHtml(customerUsername) {
    showModal();
    pdfLoading.style.display = 'block';
    pdfError.style.display = 'none';
    pdfContent.style.display = 'none';

    try {
        // Find the customer data from the current invoice results
        const customerData = window.currentInvoiceData?.customers?.find(c => c.customer_username === customerUsername);

        if (!customerData) {
            throw new Error('Customer data not found. Please refresh the page and try again.');
        }

        if (!customerData.pdf_html) {
            throw new Error('PDF content not available for this customer. Please regenerate the invoices.');
        }

        const htmlContent = customerData.pdf_html;

        // Display the HTML content in an iframe for safe rendering
        const iframe = document.createElement('iframe');
        iframe.srcdoc = htmlContent;
        iframe.style.width = '100%';
        iframe.style.height = '600px';
        iframe.style.border = 'none';

        pdfContent.innerHTML = '';
        pdfContent.appendChild(iframe);

        pdfLoading.style.display = 'none';
        pdfContent.style.display = 'block';

    } catch (error) {
        console.error('Error displaying PDF:', error);
        pdfErrorText.textContent = error.message;
        pdfLoading.style.display = 'none';
        pdfError.style.display = 'block';
    }
}
```

### Key Changes:
1. **Remove the `fetch` call** - No longer makes API call to unsupported action
2. **Use existing `pdf_html`** - Retrieves `pdf_html` directly from `customerData.pdf_html`
3. **Add error handling** - Checks if `pdf_html` exists before trying to display
4. **Simplified logic** - No redundant API calls

## Testing Checklist

- [ ] Modal opens correctly when "View PDF" button is clicked
- [ ] PDF content renders correctly in iframe
- [ ] Error messages display when `pdf_html` is missing
- [ ] Close button and overlay click close the modal
- [ ] Escape key closes the modal
- [ ] No console errors when loading PDF

## Files to Modify

1. [`generate_invoices_statements.html`](generate_invoices_statements.html) - Fix `loadPdfHtml()` function (lines 605-667)

## Summary

This is a focused fix that:
- Removes the unsupported API call
- Uses the PDF HTML content that's already being returned from the backend
- Simplifies the code and eliminates redundant network requests
- Maintains existing modal UI and functionality
