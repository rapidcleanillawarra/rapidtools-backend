# Statement of Accounts Email Template - Implementation Plan

## Overview
Update the [`generateEmailHTML()`](netlify/functions/statement_of_accounts/generate_invoices_statements.js:440) function to match the visual appearance of the [`generateStatementHTML()`](netlify/functions/statement_of_accounts/generate_invoices_statements.js:96) PDF template while applying cross-email-client compatibility best practices from [`generateDispatchEmailHTML()`](netlify/functions/maropost_order_notification/maropost_order_notification.js:15).

---

## Analysis Summary

### PDF Template Styling Elements ([`generateStatementHTML()`](netlify/functions/statement_of_accounts/generate_invoices_statements.js:96))

#### 1. Header Section
- **Layout**: Flexbox-based header with logo on right, customer info left
- **Generated Date**: Formatted with time (e.g., "Feb 2, 2026, 8:35 AM")
- **Total Invoices**: Count displayed below date
- **Statement Title**: "Statement of Account for [CustomerName]"
- **Date Range**: "From: [min date] To: [max date]"
- **Company Logo**: `{{COMPANY_LOGO}}` placeholder, 200px width
- **Company Address**: Right-aligned, includes full address

#### 2. Table Structure
- **Columns**: 7 columns - #, Order #, Date Placed, Due Date, Order Total, Payments, Balance AUD
- **Header Styling**:
  - Padding: 8px
  - Background: #fff
  - Border-bottom: 2px solid #222
  - Font-weight: bold
  - Font-size: 16px
  - Text-align: left (right for numeric columns)
- **Row Styling**:
  - Padding: 8px
  - Border-bottom: 1px solid #e0e0e0
  - Font-size: 14px
- **Past Due Rows**: Background color `#fee2e2` (light red)
- **Right-aligned columns**: Order Total, Payments, Balance

#### 3. Summary Section (tfoot)
- **Grand Total Row**:
  - Label: "GRAND TOTAL AUD"
  - Value: Large bold text
  - Padding: 18px top/bottom
- **Balance Due Row**:
  - Background: `#fef2f2`
  - Label: "BALANCE DUE AUD" - Color: #dc2626, Font-size: 22px, Letter-spacing: 2px
  - Value: Color: #dc2626, Font-size: 28px

#### 4. Footer Section
- **Banking Details**: IMB Shellharbour City, BSB, Account number, Swiftcode
- **Stripe QR Code**: `{{STRIPE_QR}}` placeholder, 140x140px
- **Pay via Stripe Button**: Background #635bff, white text, border-radius 6px
- **Payment Advice Section**:
  - Cut line with scissors emoji (✂️)
  - Customer name, Total Invoices, Balance Due
  - Amount enclosed field with underline

#### 5. Calculations
```javascript
// Order Total: invoice.grandTotal
// Payments: sum of invoice.payments.reduce((sum, payment) => sum + parseFloat(payment.Amount || 0), 0)
// Balance: invoice.outstandingAmount
// Grand Total: sum of all invoice outstandingAmounts
// Balance Due: sum of past due invoice outstandingAmounts
```

---

### Current Email Template Issues ([`generateEmailHTML()`](netlify/functions/statement_of_accounts/generate_invoices_statements.js:440))

1. **Missing company branding** - No logo, no header banner
2. **Missing Payments column** - Only 5 columns instead of 7
3. **Missing row numbering** - No # column
4. **No past due highlighting** - Missing red background for overdue invoices
5. **No summary section** - Only basic Total Outstanding row
6. **No payment information** - No banking details, QR code, or payment button
7. **No date range** - Missing invoice date range
8. **Simple table styling** - No professional card design
9. **No responsive layout** - Missing max-width container
10. **Missing Payment Advice section**

---

### Maropost Best Practices ([`generateDispatchEmailHTML()`](netlify/functions/maropost_order_notification/maropost_order_notification.js:15))

1. **Table-based layout** - Nested tables for email client compatibility
2. **Inline CSS** - All styles inline, no external stylesheets
3. **Conservative CSS properties** - Avoid flexbox, use table layouts
4. **Fixed-width containers** - max-width: 700px for email body
5. **Brand colors** - Primary green #80BB3D, dark background #222222
6. **Card-style design** - Rounded corners (12px), box-shadow
7. **Vertical alignment** - `valign="top"` on table cells
8. **Image handling** - `display:block` to remove gaps, alt tags
9. **Status badges** - Styled spans with background colors
10. **Escape HTML function** - XSS prevention

---

## Implementation Plan

### Step 1: Restructure Email HTML with Maropost Patterns

```javascript
// Apply these structural patterns from maropost_order_notification:
const emailHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Statement of Account</title>
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;background-color:#f4f7fa;color:#333;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7fa;padding:20px 0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:700px;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.08);overflow:hidden;">
          <!-- Header Banner -->
          <tr>
            <td style="background:#222222;padding:30px 40px;text-align:center;">
              <img src="https://www.rapidsupplies.com.au/assets/images/company_logo_white.png" alt="RapidClean Illawarra" style="max-width:200px;height:auto;margin-bottom:20px;display:block;margin-left:auto;margin-right:auto;" />
              <h1 style="margin:0;color:#fff;font-size:24px;font-weight:600;">Statement of Account</h1>
              <p style="margin:12px 0 0;color:#80BB3D;font-size:18px;font-weight:700;">${customerName}</p>
            </td>
          </tr>
          <!-- Content sections... -->
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
```

### Step 2: Add Customer Info Section

```javascript
// Replace plain text greeting with styled section:
<tr>
  <td style="padding:30px 40px 20px;">
    <p style="margin:0 0 15px;font-size:16px;line-height:1.6;color:#333;">
      Dear <strong>${customerName}</strong>,
    </p>
    <p style="margin:0 0 15px;font-size:15px;line-height:1.6;color:#555;">
      Please find attached your Open Statement as at ${statementDate}.
    </p>
  </td>
</tr>
```

### Step 3: Add Date Range and Invoice Summary

```javascript
// Add before the table:
<tr>
  <td style="padding:0 40px 20px;">
    <div style="background:#f8f9fa;border-radius:8px;padding:15px 20px;">
      <table cellpadding="0" cellspacing="0" style="width:100%;">
        <tr>
          <td style="padding:5px 0;font-size:14px;color:#666;">Statement Date:</td>
          <td style="padding:5px 0;font-size:14px;font-weight:600;text-align:right;color:#333;">${statementDate}</td>
        </tr>
        <tr>
          <td style="padding:5px 0;font-size:14px;color:#666;">Date Range:</td>
          <td style="padding:5px 0;font-size:14px;font-weight:600;text-align:right;color:#333;">${dateRange || 'All outstanding invoices'}</td>
        </tr>
        <tr>
          <td style="padding:5px 0;font-size:14px;color:#666;">Total Invoices:</td>
          <td style="padding:5px 0;font-size:14px;font-weight:600;text-align:right;color:#333;">${totalInvoices}</td>
        </tr>
      </table>
    </div>
  </td>
</tr>
```

### Step 4: Update Invoice Table to Match PDF (7 columns)

```javascript
// Table with all PDF columns + row numbering:
const tableRows = sortedInvoices.map((invoice, index) => {
  const orderId = invoice.id;
  const datePlaced = formatDate(invoice.datePlaced);
  const dueDate = formatDate(invoice.datePaymentDue);
  const orderTotal = formatCurrency(invoice.grandTotal);
  const payments = invoice.payments && Array.isArray(invoice.payments)
    ? formatCurrency(invoice.payments.reduce((sum, payment) => sum + parseFloat(payment.Amount || 0), 0))
    : '$0.00';
  const balance = formatCurrency(invoice.outstandingAmount);
  const rowStyle = invoice.isPastDue 
    ? 'style="background-color: #fee2e2;"' 
    : `style="background-color: ${index % 2 === 0 ? '#fff' : '#f9fbfa'};"`;

  return `
    <tr ${rowStyle}>
      <td style="padding:12px 8px;text-align:center;vertical-align:middle;font-size:14px;color:#444;">${index + 1}</td>
      <td style="padding:12px 8px;vertical-align:middle;font-size:14px;color:#333;font-weight:500;">${orderId}</td>
      <td style="padding:12px 8px;vertical-align:middle;font-size:14px;color:#666;">${datePlaced}</td>
      <td style="padding:12px 8px;vertical-align:middle;font-size:14px;color:${invoice.isPastDue ? '#dc2626' : '#666'};">${dueDate}${invoice.isPastDue ? ' <span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;font-size:11px;margin-left:5px;">Overdue</span>' : ''}</td>
      <td style="padding:12px 8px;text-align:right;vertical-align:middle;font-size:14px;color:#333;">${orderTotal}</td>
      <td style="padding:12px 8px;text-align:right;vertical-align:middle;font-size:14px;color:#666;">${payments}</td>
      <td style="padding:12px 8px;text-align:right;vertical-align:middle;font-size:14px;color:#333;font-weight:600;">${balance}</td>
    </tr>`;
}).join('');
```

### Step 5: Add Summary Section (Grand Total & Balance Due)

```javascript
// Add after table body:
<tfoot>
  <tr style="background:#f8f9fa;">
    <td colspan="6" style="padding:15px 8px;text-align:right;font-size:16px;font-weight:600;color:#333;border-top:2px solid #222;">GRAND TOTAL AUD</td>
    <td style="padding:15px 8px;text-align:right;font-size:18px;font-weight:700;color:#222;border-top:2px solid #222;">$${grandTotal}</td>
  </tr>
  <tr style="background:#fef2f2;">
    <td colspan="6" style="padding:18px 8px;text-align:right;font-size:18px;font-weight:600;color:#dc2626;letter-spacing:1px;">BALANCE DUE AUD</td>
    <td style="padding:18px 8px;text-align:right;font-size:22px;font-weight:700;color:#dc2626;">$${dueInvoiceBalance}</td>
  </tr>
</tfoot>
```

### Step 6: Add Payment Information Section

```javascript
// Add after the main table:
<tr>
  <td style="padding:30px 40px;">
    <div style="border:1px solid #e0e6ed;border-radius:8px;overflow:hidden;">
      <div style="background:#222222;padding:15px 20px;">
        <h2 style="margin:0;color:#fff;font-size:16px;font-weight:600;">Payment Information</h2>
      </div>
      <table cellpadding="0" cellspacing="0" style="width:100%;">
        <tr>
          <td style="padding:25px;vertical-align:top;width:50%;border-right:1px solid #eee;">
            <h3 style="margin:0 0 15px;font-size:15px;color:#80BB3D;font-weight:600;">Banking Details</h3>
            <div style="font-size:14px;line-height:1.8;color:#444;">
              <strong>IMB Shellharbour City</strong><br>
              BSB: 641-800<br>
              A/C: 200839104<br>
              Name: Rapid Illawarra Pty Ltd<br>
              Swiftcode: ASLLAU2C
            </div>
          </td>
          <td style="padding:25px;vertical-align:top;width:50%;text-align:center;">
            <a href="https://buy.stripe.com/dRm9AUexncD0fQacewaZi00" style="display:block;margin-bottom:15px;">
              <img src="{{STRIPE_QR}}" alt="Stripe Payment QR" style="width:140px;height:140px;border:1px solid #eee;padding:4px;background:#fff;display:block;margin-left:auto;margin-right:auto;">
            </a>
            <a href="https://buy.stripe.com/dRm9AUexncD0fQacewaZi00" style="background-color:#635bff;color:#fff;text-decoration:none;padding:10px 24px;border-radius:6px;font-weight:600;font-size:14px;display:inline-block;">Pay via Stripe</a>
            <div style="font-size:12px;color:#888;margin-top:8px;">Scan QR or click to pay online</div>
          </td>
        </tr>
      </table>
    </div>
  </td>
</tr>
```

### Step 7: Add Contact Information

```javascript
// Add before footer:
<tr>
  <td style="padding:0 40px 20px;">
    <div style="background:#f8f9fa;border-radius:8px;padding:20px;text-align:center;">
      <p style="margin:0 0 10px;font-size:14px;color:#555;line-height:1.6;">
        If you need copies of any invoices, remittance details, or have any questions, please contact us:
      </p>
      <p style="margin:0;font-size:14px;">
        <strong>Email:</strong> <a href="mailto:accounts@rapidcleanillawarra.com.au" style="color:#80BB3D;text-decoration:underline;">accounts@rapidcleanillawarra.com.au</a>
        &nbsp;&nbsp;|&nbsp;&nbsp;
        <strong>Phone:</strong> (02) 4256 4477
      </p>
    </div>
  </td>
</tr>
```

### Step 8: Add Footer

```javascript
// Final footer section:
<tr>
  <td style="background:#f5f7fa;padding:25px 40px;border-top:1px solid #e0e6ed;">
    <p style="margin:0;font-size:13px;color:#777;text-align:center;">
      Thank you for your business.
    </p>
    <p style="margin:10px 0 0;font-size:11px;color:#999;text-align:center;">
      <strong style="color:#80BB3D;">RapidClean Illawarra</strong> | 112a Industrial Road, Oak Flats NSW 2529
    </p>
  </td>
</tr>
```

---

## Required Helper Functions

```javascript
// Add to generateEmailHTML function:
const formatDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  } catch (e) {
    return 'N/A';
  }
};

// Already exists - verify formatCurrency:
const formatCurrency = (amount) => {
  if (amount === null || amount === undefined) return '$0.00';
  const num = parseFloat(amount);
  if (isNaN(num)) return '$0.00';
  return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
```

---

## Summary of Changes

| Aspect | Current Email | New Email |
|--------|--------------|-----------|
| **Layout** | Plain HTML | Card-style with shadows |
| **Header** | None | Branded banner with logo |
| **Greeting** | Plain text | Styled paragraph |
| **Columns** | 5 columns | 7 columns (includes # and Payments) |
| **Past Due** | No highlighting | Red background + "Overdue" badge |
| **Summary** | Basic total | Grand Total + Balance Due (red) |
| **Payment Info** | None | Banking details + Stripe QR |
| **Contact** | Plain text | Styled contact section |
| **Footer** | Plain text | Professional branded footer |

---

## Files to Modify

- [`netlify/functions/statement_of_accounts/generate_invoices_statements.js`](netlify/functions/statement_of_accounts/generate_invoices_statements.js) - Update [`generateEmailHTML()`](netlify/functions/statement_of_accounts/generate_invoices_statements.js:440) function

---

## Testing Checklist

- [ ] Render consistently in Outlook, Gmail, Apple Mail
- [ ] Table columns align properly
- [ ] Past due invoices highlighted correctly
- [ ] Currency formatting with commas
- [ ] Links work (Stripe payment, email)
- [ ] Mobile responsiveness (max-width container)
- [ ] All data from PDF template is represented
- [ ] Calculations match PDF (Grand Total, Balance Due)
