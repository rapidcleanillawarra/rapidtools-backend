# PDF HTML Generation Refactoring Plan

## Objective
Transfer the PDF HTML generation logic from `generate_invoices_statements.html` (client-side JavaScript) to `netlify/functions/statement_of_accounts/generate_invoices_statements.js` (server-side Netlify function).

## Current State
- `generate_invoices_statements.html` contains a `generateStatementHTML()` function (lines 637-961) that generates the PDF statement HTML
- The HTML page calls this function client-side when user clicks "View PDF" button
- The Netlify function only handles fetching customer and invoice data

## Target State
- `generate_invoices_statements.js` will have a `generateStatementHTML()` function that generates the PDF HTML
- A new `generate_pdf_html` action will be added to the handler
- The HTML page will call the Netlify function to get the pre-generated HTML and only display it

## Implementation Steps

### Step 1: Add `generateStatementHTML()` function to the Netlify function

Add a new function `generateStatementHTML(customer, invoices)` that:
- Takes customer data and invoices array as parameters
- Uses `pdf_customer_name` from customer data for the customer name
- Uses `datePaymentDue` for order dates
- Generates the complete HTML document with:
  - Header with company logo placeholder (`{{COMPANY_LOGO}}`)
  - Customer information section
  - Invoice table with Order #, Date Placed, Due Date, Order Total, Payments, Balance
  - Summary section showing GRAND TOTAL and BALANCE DUE
  - Banking details section with Stripe QR placeholder (`{{STRIPE_QR}}`)
  - Payment advice section with cut line

### Step 2: Add `generate_pdf_html` action to the handler

Add a new action handler that:
- Accepts request body with:
  - `action`: "generate_pdf_html"
  - `customer`: customer data object
  - `invoices`: array of invoice objects
- Calls `generateStatementHTML(customer, invoices)`
- Returns response with:
  - `success`: boolean
  - `pdf_html`: the generated HTML string
  - `timestamp`: ISO timestamp

### Step 3: Update the HTML file

Modify `generate_invoices_statements.html`:
1. Remove the `generateStatementHTML()` function from client-side JavaScript
2. Update `loadPdfHtml()` function to:
   - Call the Netlify function with `action: 'generate_pdf_html'`
   - Pass the customer data and invoices array
   - Display the returned `pdf_html` in the iframe

## Data Structure

### Customer object passed to `generateStatementHTML()`:
```javascript
{
  customer_username: string,
  pdf_customer_name: string,
  email: string,
  billing_address: object,
  total_orders: number,
  total_balance: number,
  due_invoice_balance: number
}
```

### Invoice object:
```javascript
{
  id: string,
  grandTotal: number,
  payments: array,
  outstandingAmount: number,
  datePlaced: string,
  datePaymentDue: string,
  isPastDue: boolean
}
```

## Response Format

The new `generate_pdf_html` action will return:
```javascript
{
  success: true,
  pdf_html: "<!DOCTYPE html><html>...</html>",
  timestamp: "2026-02-02T02:00:00.000Z"
}
```

## Files to Modify
1. `netlify/functions/statement_of_accounts/generate_invoices_statements.js`
2. `generate_invoices_statements.html`

## Files NOT to Modify (per user request)
- `netlify/functions/statement_sync/statement_file_generation.js`
