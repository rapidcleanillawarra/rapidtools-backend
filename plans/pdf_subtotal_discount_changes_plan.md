# Plan: PDF Product Subtotal & Discount Display Update

## Objective
Modify the `generateTaxInvoiceHTML` function in `netlify/functions/maropost_order_notification/maropost_order_notification.js` to:
1. Calculate product subtotal WITHOUT including discounts
2. Display total discounts separately below the product subtotal in the PDF HTML

## File Location
- **File**: `netlify/functions/maropost_order_notification/maropost_order_notification.js`
- **Function**: `generateTaxInvoiceHTML` (starts at line 551)
- **Key Sections**:
  - Lines 575-597: Product subtotal calculation logic
  - Lines 843-845: Product subtotal display in totals section
  - Lines 657-716: Backorder section (similar logic)

## Changes Required

### 1. Modify Product Subtotal Calculation (Lines 575-597)

**Current Code:**
```javascript
// Calculate line item subtotals and totals
let productSubtotal = 0;
let totalProductDiscount = 0;
const orderLineRows = orderLines.map(line => {
  const quantity = parseFloat(line.Quantity || line.Qty || 0);
  const unitPrice = parseFloat(line.UnitPrice || 0);
  const productDiscount = parseFloat(line.ProductDiscount || 0);
  const lineSubtotal = quantity * unitPrice;
  const discount = productDiscount;
  const discountedTotal = lineSubtotal - discount;
  productSubtotal += discountedTotal;
  totalProductDiscount += discount;

  return {
    quantity: quantity,
    sku: line.SKU || '',
    productName: line.ProductName || '',
    unitPrice: unitPrice,
    discount: discount,
    subtotal: discountedTotal,
    lineSubtotal: lineSubtotal // Keep original for display if needed
  };
});
```

**New Code:**
```javascript
// Calculate line item subtotals and totals
let productSubtotal = 0;
let totalProductDiscount = 0;
const orderLineRows = orderLines.map(line => {
  const quantity = parseFloat(line.Quantity || line.Qty || 0);
  const unitPrice = parseFloat(line.UnitPrice || 0);
  const productDiscount = parseFloat(line.ProductDiscount || 0);
  const lineSubtotal = quantity * unitPrice;
  const discount = productDiscount;
  const discountedTotal = lineSubtotal - discount;
  productSubtotal += lineSubtotal;  // Sum of original prices (no discount applied)
  totalProductDiscount += discount;  // Track total discounts separately

  return {
    quantity: quantity,
    sku: line.SKU || '',
    productName: line.ProductName || '',
    unitPrice: unitPrice,
    discount: discount,
    subtotal: discountedTotal,
    lineSubtotal: lineSubtotal
  };
});
```

**Change Summary:**
- Line 585: Changed from `productSubtotal += discountedTotal;` to `productSubtotal += lineSubtotal;`

### 2. Add Total Discounts Display in Totals Section (After Line 845)

**Current Code (Lines 843-845):**
```html
<tr>
  <td style="padding: 8px 0; color: #666; font-size: 13px; text-align: right; border-bottom: 1px solid #eee;">Product Subtotal:</td>
  <td style="padding: 8px 0 8px 15px; font-weight: 600; font-size: 13px; text-align: right; border-bottom: 1px solid #eee;">${formatCurrency(productSubtotal)}</td>
</tr>
```

**New Code (Insert after Line 845):**
```html
<tr>
  <td style="padding: 8px 0; color: #666; font-size: 13px; text-align: right; border-bottom: 1px solid #eee;">Product Subtotal:</td>
  <td style="padding: 8px 0 8px 15px; font-weight: 600; font-size: 13px; text-align: right; border-bottom: 1px solid #eee;">${formatCurrency(productSubtotal)}</td>
</tr>
<tr>
  <td style="padding: 8px 0; color: #d32f2f; font-size: 13px; text-align: right; border-bottom: 1px solid #eee;">Total Discounts:</td>
  <td style="padding: 8px 0 8px 15px; font-weight: 600; font-size: 13px; text-align: right; border-bottom: 1px solid #eee; color: #d32f2f;">-${formatCurrency(totalProductDiscount)}</td>
</tr>
```

**Change Summary:**
- Added new table row to display total product discounts in red color
- Format: `-${formatCurrency(totalProductDiscount)}` to show as a deduction

### 3. Backorder Section (Lines 669-682)

The backorder section uses similar logic. The individual line display should remain the same (showing discounted totals per line), but if needed, we can also add a discount summary there. For now, the backorder section will continue to show individual line discounts as it currently does.

**No changes required** to the backorder display logic as it correctly shows individual line discounts and subtotals.

## Impact Analysis

### Calculations Affected

| Field | Before | After | Impact |
|-------|--------|-------|--------|
| productSubtotal | Sum of (qty × unitPrice - discount) | Sum of (qty × unitPrice) | Increases by totalProductDiscount |
| totalProductDiscount | Tracked but not displayed | Displayed below subtotal | New display line |
| subtotalBeforeGst | productSubtotal + shippingTotal - shippingDiscount | Same formula | No change (productSubtotal now includes what was previously excluded) |
| GST | subtotalBeforeGst × 0.10 | Same formula | No change |
| Grand Total | subtotalBeforeGst + GST | Same formula | No change |

### Visual Impact in PDF

**Before:**
```
Freight:              $10.00
Product Subtotal:     $90.00
GST (10%):            $9.00
Grand Total:          $99.00
```

**After:**
```
Freight:              $10.00
Product Subtotal:     $100.00
Total Discounts:      -$10.00
GST (10%):            $9.00
Grand Total:          $99.00
```

## Testing Checklist

- [ ] Verify product subtotal shows full amount before discounts
- [ ] Verify total discounts line appears below product subtotal
- [ ] Verify GST calculation remains correct
- [ ] Verify grand total remains unchanged
- [ ] Test with orders containing product discounts
- [ ] Test with orders containing shipping discounts
- [ ] Test with orders having no discounts
- [ ] Test backorder section displays correctly

## Implementation Steps

1. **Modify productSubtotal calculation** (line 585)
2. **Add total discounts display** (after line 845)
3. **Verify calculations** are correct
4. **Test with sample data** if available

## Files Modified

- `netlify/functions/maropost_order_notification/maropost_order_notification.js`

## Related Functions

- [`generateDispatchEmailHTML`](netlify/functions/maropost_order_notification/maropost_order_notification.js:15) - Email HTML generation (no changes needed)
- Helper functions used:
  - [`formatCurrency`](netlify/functions/maropost_order_notification/maropost_order_notification.js:463) - Currency formatting
  - [`escapeHtml`](netlify/functions/maropost_order_notification/maropost_order_notification.js:2) - HTML escaping
