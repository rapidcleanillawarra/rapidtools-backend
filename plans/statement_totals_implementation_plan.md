# Statement of Accounts - Balance Due & Grand Total Implementation Plan

## Overview
This plan outlines the changes needed to:
1. Add a "Grand Total" showing the sum of all invoices
2. Update "Balance Due" to show only past due invoices
3. Make Balance Due more visually emphasized

## Current Behavior
- Only one total is displayed: "BALANCE DUE AUD"
- Uses `total_balance` (sum of all outstanding invoices)
- Standard styling (bold, 20px font)

## Desired Behavior
| Field | Calculation | Display |
|-------|-------------|---------|
| **Grand Total** | Sum of ALL invoices | Standard styling |
| **Balance Due** | Sum of PAST DUE invoices only | **Emphasized styling** (bold, larger, red color) |

## Implementation Details

### File: [`generate_invoices_statements.html`](generate_invoices_statements.html)

#### 1. Update Variable Declarations (line ~609)
**Current:**
```javascript
const totalBalance = customer.total_balance ? customer.total_balance.toFixed(2) : '0.00';
```

**Add:**
```javascript
const dueInvoiceBalance = customer.due_invoice_balance ? customer.due_invoice_balance.toFixed(2) : '0.00';
const grandTotal = totalBalance; // Rename for clarity
```

#### 2. Update Summary Section (lines ~850-855)
**Current:**
```html
<tfoot>
    <tr class="summary-row">
        <td colspan="5" class="summary-label">BALANCE DUE AUD</td>
        <td class="summary-value right">$${totalBalance}</td>
    </tr>
</tfoot>
```

**New:**
```html
<tfoot>
    <tr class="summary-row">
        <td colspan="5" class="summary-label">GRAND TOTAL AUD</td>
        <td class="summary-value right">$${grandTotal}</td>
    </tr>
    <tr class="summary-row balance-due-row">
        <td colspan="5" class="summary-label balance-due-label">BALANCE DUE AUD</td>
        <td class="summary-value right balance-due-value">$${dueInvoiceBalance}</td>
    </tr>
</tfoot>
```

#### 3. Add Emphasized Styling for Balance Due (line ~776 area)
**Add to style block:**
```css
.balance-due-row td {
    background: #fef2f2 !important;
}

.balance-due-label {
    color: #dc2626;
    font-size: 22px;
    letter-spacing: 2px;
}

.balance-due-value {
    color: #dc2626;
    font-size: 28px;
}
```

#### 4. Update Payment Advice Section (lines ~892-895)
**Current:**
```html
<tr>
    <td style="font-weight: bold;">Total AUD Due</td>
    <td>$${totalBalance}</td>
</tr>
```

**New:**
```html
<tr>
    <td style="font-weight: bold;">Total AUD Due</td>
    <td>$${dueInvoiceBalance}</td>
</tr>
```

## Visual Mockup

```
┌─────────────────────────────────────────────────────────────────────┐
│  GRAND TOTAL AUD                              $1,234.56              │
│  ─────────────────────────────────────────────────────────────      │
│                                                                      │
│  ⚠ BALANCE DUE AUD                          $567.89                 │
│     (Past Due Invoices Only)                                        │
└─────────────────────────────────────────────────────────────────────┘
```

## Testing Checklist
- [ ] Verify Grand Total equals sum of all invoice outstanding amounts
- [ ] Verify Balance Due equals sum of only past due invoices
- [ ] Check visual styling is applied correctly
- [ ] Verify Payment Advice section uses correct total
- [ ] Test with customers having both current and past due invoices
- [ ] Test with customers having only past due invoices
- [ ] Test with customers having no past due invoices

## No Backend Changes Required
The backend function already calculates and returns both values:
- `total_balance` - sum of all outstanding invoices
- `due_invoice_balance` - sum of past due invoices only

## Execution Order
1. Add CSS styles for emphasized Balance Due
2. Update variable declarations in `generateStatementHTML()`
3. Update summary section HTML to show both totals
4. Update Payment Advice section
5. Test with sample data
