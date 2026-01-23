---
name: Tax Invoice HTML Template
overview: Create a new HTML template function for Tax Invoice PDF generation that matches the invoice design, using proper variables from the JSON data structure. Update the fetchOrderData function to include UnitPrice for main order items.
todos:
  - id: update_output_selector
    content: Add 'OrderLine.UnitPrice' to OutputSelector in fetchOrderData function
    status: completed
  - id: create_date_formatter
    content: Create date formatting helper function (YYYY-MM-DD to Day Mon Year format)
    status: completed
  - id: create_currency_formatter
    content: Create currency formatting helper function
    status: completed
  - id: create_address_formatter
    content: Create address formatting helper functions for Ship To and Bill To
    status: completed
  - id: create_invoice_html_function
    content: Create generateTaxInvoiceHTML function with header, addresses, dates, and instructions sections
    status: completed
  - id: add_order_items_table
    content: Add order line items table with QTY, SKU, Name, Unit Price, and Subtotal columns
    status: completed
  - id: add_financial_summary
    content: Add financial summary section with subtotals, GST calculation, grand total, and balance due
    status: completed
  - id: add_backorder_section
    content: Add backorder items section with same table structure as main order
    status: completed
  - id: add_payment_options
    content: Add payment options section at the bottom with banking details
    status: completed
  - id: apply_styling
    content: Apply professional styling matching the invoice design (colors, spacing, borders)
    status: completed
isProject: false
---

# Tax Invoice HTML Template Generation

## Overview

Create a new function `generateTaxInvoiceHTML` that generates a professional Tax Invoice HTML template matching the design shown in the image. This will be used for PDF generation and must use all proper variables from the JSON data structure.

## Key Components

### 1. Update Order Data Fetching

- **File**: `netlify/functions/maropost_order_notification/maropost_order_notification.js`
- **Change**: Add `"OrderLine.UnitPrice"` to the `OutputSelector` array in the `fetchOrderData` function (around line 555)
- This ensures unit prices are available for main order items, not just backorders

### 2. Create Tax Invoice HTML Generator Function

- **Location**: Same file, after `generateDispatchEmailHTML` function
- **Function Name**: `generateTaxInvoiceHTML(orderDetails, productImages, relatedBackorders)`
- **Purpose**: Generate HTML matching the Tax Invoice design

### 3. Template Structure (matching image design)

#### Header Section

- **Invoice Title**: "Tax Invoice #" with order ID in green (`order_details.Order[0].ID `or `order_id`)
- **PO Number**: Display `order_details.Order[0].PurchaseOrderNumber` below invoice number
- **Company Logo**: Top right - "RapidClean ILLAWARRA" logo
- **Company Details**: ABN: 88 631 494 418, ACN: 631 494 418 (static)

#### Address Section (Two Columns)

- **Ship To** (Left):
- Company: `order_details.Order[0].ShipCompany`
- Name: `order_details.Order[0].ShipFirstName` + `order_details.Order[0].ShipLastName`
- Address: `ShipStreetLine1` + `ShipStreetLine2` (comma-separated)
- City, State, Postcode: `ShipCity`, `ShipState`, `ShipPostCode`
- Country: `ShipCountry` (format as "Australia" if "AU")

- **Billed To** (Right):
- Company: `order_details.Order[0].BillCompany`
- Name: `order_details.Order[0].BillFirstName` + `order_details.Order[0].BillLastName`
- Address: `BillStreetLine1`
- City, State, Postcode: `BillCity`, `BillState`, `BillPostCode`
- Country: `BillCountry` (format as "Australia" if "AU")

- **Invoice Dates** (Right column, below Billed To):
- Payment Terms: "Due 30 days after EOM" (red text, static or from `PaymentTerms`)
- Date Due: `order_details.Order[0].DatePaymentDue` (format: "Day Mon Year", e.g., "2 Mar 2026")
- Date Placed: `order_details.Order[0].DatePlaced` (format: "Day Mon Year")
- Date Invoiced: `order_details.Order[0].DateInvoiced` (format: "Day Mon Year")

#### Instructions Section

- Light yellow-brown box with border
- Heading: "Instructions:"
- Content: `order_details.Order[0].DeliveryInstruction`

#### Order Line Items Table

- **Columns**: QTY, SKU, Name, Unit Price (Ex GST), Subtotal
- **Data Source**: `order_details.Order[0].OrderLine[]`
- **For each item**:
- QTY: `OrderLine[i].Quantity`
- SKU: `OrderLine[i].SKU`
- Name: `OrderLine[i].ProductName`
- Unit Price: `OrderLine[i].UnitPrice` (now available after adding to OutputSelector)
- Subtotal: Calculate as `Quantity * UnitPrice`

#### Financial Summary (Right-aligned)

- **Freight Local**: $0.00 (static or from data if available)
- **Product Subtotal**: Sum of all line item subtotals
- **GST**: Calculate as `Product Subtotal * 0.10` (10% GST rate)
- **Grand Total**: `Product Subtotal + GST`
- **Amount Paid**: $0.00 (static or from data if available)
- **Balance Due**: `Grand Total - Amount Paid` (displayed in bold green)

#### Backorder Items Section

- **Heading**: "Items on backorder"
- **Table**: Same structure as main order table
- **Data Source**: `related_backorders.Order[0].OrderLine[]`
- **For each backorder item**:
- QTY: `OrderLine[i].Quantity`
- SKU: `OrderLine[i].SKU`
- Name: `OrderLine[i].ProductName`
- Unit Price: `OrderLine[i].UnitPrice` (already available)
- Subtotal: Calculate as `Quantity * UnitPrice`

#### Payment Options Section (Bottom)

- **Heading**: "Payment Options"
- **Name**: "RAPID ILLAWARRA PTY LTD" (static)
- **Account Details**: "Acc #: 200839104 - BSB: 641800 - Ph: 02 4227 2833" (static)

### 4. Helper Functions Needed

- **Date Formatting**: Convert dates from "2026-01-20" format to "20 Jan 2026" format
- **Currency Formatting**: Format numbers as currency (e.g., `$28.14`, `$281.40`)
- **Country Formatting**: Convert "AU" to "Australia"
- **Address Formatting**: Combine street lines appropriately

### 5. Styling Requirements

- Professional, clean layout matching the invoice design
- Green accent color for invoice number and balance due (#80BB3D or similar)
- Proper table styling with borders and spacing
- Print-friendly CSS (for PDF generation)
- Responsive layout that works for PDF rendering

### 6. Data Validation

- Handle missing fields gracefully
- Provide fallbacks for optional data
- Validate calculations (prevent division by zero, etc.)

## Implementation Steps

1. **Update fetchOrderData**: Add `"OrderLine.UnitPrice"` to OutputSelector
2. **Create generateTaxInvoiceHTML function**: Build the complete HTML template
3. **Add helper functions**: Date formatting, currency formatting, address formatting
4. **Test with provided JSON data**: Ensure all variables map correctly
5. **Style matching**: Ensure visual design matches the invoice image

## Files to Modify

- `netlify/functions/maropost_order_notification/maropost_order_notification.js`
- Add `OrderLine.UnitPrice` to OutputSelector (line ~555)
- Add `generateTaxInvoiceHTML` function (after line ~439)
- Export or make available for use in handler if needed

## Notes

- The template should be self-contained HTML with inline styles for PDF generation compatibility
- Use the same `escapeHtml` helper function for XSS protection
- Ensure all calculations are accurate (GST at 10%, subtotals, totals)
- Match the exact layout and styling from the invoice image