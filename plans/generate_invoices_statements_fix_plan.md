# Fix Plan: generate_invoices_statements.js

## Overview
This plan documents the required fixes for the file `netlify/functions/statement_of_accounts/generate_invoices_statements.js`

## Issues Identified

### Issue 1: Incorrect dateplaced variable reference
**Location**: Line 135 in `generateStatementHTML` function  
**Problem**: The "Date Placed" column displays `invoice.datePaymentDue` instead of `invoice.datePlaced`  
**Impact**: Wrong date is shown in the "Date Placed" column of the PDF

### Issue 2: Missing row counter column
**Location**: Order rows generation in `generateStatementHTML` function (lines 132-161)  
**Problem**: The PDF table doesn't have a sequential row number column  
**Impact**: No row numbering in the generated PDF statements

### Issue 3: Invoices not sorted by date
**Location**: Order rows generation in `generateStatementHTML` function (line 132)  
**Problem**: Invoices are not sorted before displaying in the PDF  
**Impact**: Invoices appear in random order instead of chronological order by Date Placed

## Required Changes

### Change 1: Sort invoices by datePlaced (ascending)
**File**: `netlify/functions/statement_of_accounts/generate_invoices_statements.js`  
**Line**: 132

**Current code**:
```javascript
// Generate order rows
const orderRows = invoices.map(invoice => {
```

**Updated code**:
```javascript
// Sort invoices by datePlaced in ascending order (oldest first)
const sortedInvoices = [...invoices].sort((a, b) => {
    const dateA = a.datePlaced ? new Date(a.datePlaced).getTime() : 0;
    const dateB = b.datePlaced ? new Date(b.datePlaced).getTime() : 0;
    return dateA - dateB;
});

// Generate order rows
const orderRows = sortedInvoices.map((invoice, index) => {
```

### Change 2: Fix dateplaced variable reference
**File**: `netlify/functions/statement_of_accounts/generate_invoices_statements.js`  
**Line**: 135

**Current code**:
```javascript
const datePlaced = invoice.datePaymentDue ? new Date(invoice.datePaymentDue).toLocaleDateString('en-US', {
```

**Updated code**:
```javascript
const datePlaced = invoice.datePlaced ? new Date(invoice.datePlaced).toLocaleDateString('en-US', {
```

### Change 3: Add row counter column header
**File**: `netlify/functions/statement_of_accounts/generate_invoices_statements.js`  
**Line**: 343

**Current code**:
```html
<tr>
    <th>Order #</th>
    <th>Date Placed</th>
```

**Updated code**:
```html
<tr>
    <th>#</th>
    <th>Order #</th>
    <th>Date Placed</th>
```

### Change 4: Add row counter to order rows
**File**: `netlify/functions/statement_of_accounts/generate_invoices_statements.js`  
**Lines**: 153-154

**Current code** (lines 153-154):
```html
return `
    <tr ${rowClass}>
        <td>${orderId}</td>
```

**Updated code** (lines 153-154):
```html
return `
    <tr ${rowClass}>
        <td>${index + 1}</td>
        <td>${orderId}</td>
```

### Change 5: Update table footer colspan
**File**: `netlify/functions/statement_of_accounts/generate_invoices_statements.js`  
**Lines**: 356, 360

**Current code** (line 356):
```html
<td colspan="5" class="summary-label">GRAND TOTAL AUD</td>
```

**Updated code** (line 356):
```html
<td colspan="6" class="summary-label">GRAND TOTAL AUD</td>
```

**Current code** (line 360):
```html
<td colspan="5" class="summary-label balance-due-label">BALANCE DUE AUD</td>
```

**Updated code** (line 360):
```html
<td colspan="6" class="summary-label balance-due-label">BALANCE DUE AUD</td>
```

## Summary of Changes

| Change | Line(s) | Description |
|--------|---------|-------------|
| 1 | 132 | Sort invoices by datePlaced in ascending order before generating rows |
| 2 | 135 | Fix dateplaced variable reference from `datePaymentDue` to `datePlaced` |
| 3 | 343 | Add "#" column header before "Order #" |
| 4 | 153-154 | Add row counter `<td>${index + 1}</td>` as first column |
| 5 | 356, 360 | Update colspan from 5 to 6 to account for new column |

## Verification Steps

1. After implementing changes, verify that:
   - The "Date Placed" column now displays the actual order placement date (from `invoice.datePlaced`)
   - The PDF table has a sequential row number starting from 1 as the first column
   - The invoices are sorted in ascending order by Date Placed (oldest first)
   - The table footer spans all columns correctly (colspan="6")

2. Test with sample invoice data to confirm the fixes work as expected
