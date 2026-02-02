# Plan: Add ProductDiscount to PDF HTML Calculation

## Objective
Add ProductDiscount column to the tax invoice PDF HTML table and include it in the grand total calculation.

## Changes Required

### 1. Update Order Line Calculation (lines 575-590)
- Extract `ProductDiscount` from each OrderLine item
- Calculate total product discount across all order lines
- Store discount per line for display in table

### 2. Add Discount Column to Main Order Items Table
**Header (around line 693):**
- Add `<th style="padding: 12px 8px; text-align: right; ...">Discount</th>` after Name column

**Rows (lines 638-643):**
- Add `<td>` cell with discount value for each line item
- Format: `${formatCurrency(item.discount)}` or `-$XX.XX`

### 3. Add Discount Column to Backorder Table
**Header (around line 694):**
- Add `<th>Discount</th>` after Name column

**Rows (lines 664-671):**
- Add discount cell for each backorder line item

### 4. Update Grand Total Calculation (line 598)
**Current:**
```javascript
const grandTotal = productSubtotal + shippingTotal + gst - shippingDiscount;
```

**New:**
```javascript
const grandTotal = productSubtotal + shippingTotal + gst - shippingDiscount - totalProductDiscount;
```

### 5. Add Product Discount Row to Totals Section (around line 837-842)
Add new row similar to shipping discount:
```html
<tr>
  <td style="padding: 8px 0; color: #666; font-size: 13px; text-align: right; border-bottom: 1px solid #eee;">Product Discount:</td>
  <td style="padding: 8px 0 8px 15px; font-weight: 600; font-size: 13px; text-align: right; border-bottom: 1px solid #eee;">-${formatCurrency(totalProductDiscount)}</td>
</tr>
```

### 6. Update Column Spans
- Check if any cells use colspan that need adjustment due to new column
- The tracking table at line 125 uses `colspan="2"` - may need review

## Implementation Notes
- Use `ProductDiscount` field (absolute value like "28.32"), NOT `PercentDiscount`
- Discount column should appear before Subtotal column
- Display format: `-$XX.XX` for negative discount values
- Show only when totalProductDiscount > 0
