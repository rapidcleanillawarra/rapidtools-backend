# Statement DB Synchronization Function

## Purpose

This function processes accounting bot responses to prepare data for the `statement_of_accounts` Supabase table. It calculates invoice totals and deducts payments to determine outstanding balances.

## Function: `statement_db_synchronization`

### Location
`netlify/functions/statement_sync/statement_db_synchronization.js`

### Input

The function expects an accounting bot response object with the following structure:

```javascript
{
  maropostData: {
    Order: [{
      OrderID: string,
      Username: string,
      Email: string,
      OrderStatus: string,
      GrandTotal: string | number,
      DatePaymentDue: string (optional),
      OrderPayment: [
        { Amount: string | number }
      ]
    }]
  },
  xeroData: {
    foundCount: number,
    invoices: [{
      total: string | number,
      amountPaid: string | number,
      amountDue: string | number
    }]
  }
}
```

### Calculation Formula

**Outstanding Amount = Grand Total - Payments Sum**

Example:
- Grand Total: $1,500.00
- Payment 1: $500.00
- Payment 2: $300.00
- **Outstanding Amount: $700.00**

### Output

Returns an object with:
- `success`: boolean
- `message`: string
- `record`: prepared database record object

### Database Record Structure

```javascript
{
  order_id: string,
  customer_username: string,
  email: string,
  order_status: string,
  grand_total: number,
  payments_sum: number,
  outstanding_amount: number,        // Grand Total - Payments Sum
  payment_status: string,            // paid, unpaid, partial, overpaid, free
  date_payment_due: string,
  is_past_due: boolean,
  exported_to_xero: boolean,
  xero_total: number,
  xero_amount_paid: number,
  xero_amount_due: number,
  xero_payment_status: string,
  balance_mismatch: boolean,         // True if Maropost != Xero
  last_updated: timestamp
}
```

## Usage

```javascript
const { statement_db_synchronization } = require('./statement_db_synchronization');

// Example usage
const accountingBotResponse = {
  maropostData: { /* ... */ },
  xeroData: { /* ... */ }
};

const result = await statement_db_synchronization(accountingBotResponse);

if (result.success) {
  console.log('Record prepared:', result.record);
} else {
  console.error('Error:', result.error);
}
```

## Current Status

**Database saving is currently DISABLED** (console logging only).

To enable database saving:
1. Open `statement_db_synchronization.js`
2. Uncomment lines ~200-215 (the database insert code)
3. Ensure Supabase environment variables are configured

## Testing

Run the test file to verify calculations:

```bash
node netlify/functions/statement_sync/test_statement_sync.js
```

## Features

✅ Calculates invoice totals minus payments  
✅ Determines payment status automatically  
✅ Compares Maropost vs Xero data  
✅ Detects balance mismatches  
✅ Checks for past due invoices  
✅ Detailed console logging for verification  
⏸️ Database saving (currently disabled)  

## Payment Status Logic

| Status | Condition |
|--------|-----------|
| `free` | Grand total is $0 |
| `paid` | Payments sum equals grand total |
| `overpaid` | Payments sum exceeds grand total |
| `partial` | Some payment made but incomplete |
| `unpaid` | No payments made |

## Balance Mismatch Detection

The function compares the outstanding amount calculated from Maropost data with the Xero amount due. If the difference is greater than $0.01, it flags a balance mismatch for investigation.
