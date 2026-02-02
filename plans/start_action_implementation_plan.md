# Implementation Plan: "start" Action for Statement of Accounts

## Overview
Create a new Netlify function action called "start" in `netlify/functions/statement_of_accounts/generate_invoices_statements.js` that selects customer usernames for new statement generation.

## Requirements Summary
- Accept JSON payload: `{"action": "start", "limit": 5}`
- Filter customers with positive account balance (same logic as "customers_only")
- Query Supabase `statement_of_accounts` table for today's records
- Fetch orders with outstanding balance
- Return up to `{limit}` customer usernames not yet in `statement_of_accounts`

## Supabase Table Schema
```sql
CREATE TABLE IF NOT EXISTS public.statement_of_accounts (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_username text NOT NULL UNIQUE,
    sent boolean NOT NULL DEFAULT false,
    pdf_link text,
    bounced boolean,
    customer_email text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS statement_of_accounts_customer_username_idx
    ON public.statement_of_accounts USING btree (customer_username);

CREATE INDEX IF NOT EXISTS statement_of_accounts_sent_idx
    ON public.statement_of_accounts USING btree (sent);
```

## Implementation Steps

### Step 1: Add "start" Action Handler
**Location:** `netlify/functions/statement_of_accounts/generate_invoices_statements.js` (after line 983)

**Code Structure:**
```javascript
} else if (action === 'start') {
    // 1. Get limit from request body, default to 5
    // 2. Fetch customers with positive balance (reuse customers_only logic)
    // 3. Query statement_of_accounts for today's records
    // 4. Fetch orders with outstanding balance
    // 5. Filter out already-processed customers
    // 6. Select exactly {limit} new customers
    // 7. Return array of customer usernames
}
```

### Step 2: Fetch & Filter Customers
**Reuse existing logic from customers_only action:**
- Call Power Automate API with `action: "GetCustomer"`
- Filter: `Active: true`, `OutputSelector: [Username, AccountBalance]`
- Apply `filterCustomersByBalance()` to keep only `AccountBalance > 0`
- Extract array of customer usernames

### Step 3: Query Today's Records
**Supabase Query:**
```javascript
const today = new Date();
const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString();

const { data: todayRecords } = await supabase
    .from('statement_of_accounts')
    .select('customer_username')
    .gte('created_at', startOfDay)
    .lte('created_at', endOfDay)
    .in('customer_username', filteredCustomerUsernames);

const processedTodayUsernames = todayRecords?.map(r => r.customer_username) || [];
```

### Step 4: Fetch Orders with Outstanding Balance
**Power Automate API Call:**
- Action: `GetOrder`
- Filter: `PaymentStatus: ['Pending', 'PartialPaid']`
- OutputSelector: `[ID, Username, GrandTotal, OrderPayment]`

**Filter Orders:**
```javascript
const customersWithBalance = orders.filter(order => {
    const grandTotal = parseFloat(order.GrandTotal || 0);
    const paymentsSum = order.OrderPayment?.reduce((sum, p) => sum + parseFloat(p.Amount || 0), 0) || 0;
    const outstandingAmount = grandTotal - paymentsSum;
    return outstandingAmount > 0;
});

const orderCustomerUsernames = [...new Set(customersWithBalance.map(o => o.Username))];
```

### Step 5: Filter & Select Customers
```javascript
// Remove customers already processed today
const availableUsernames = orderCustomerUsernames.filter(
    username => !processedTodayUsernames.includes(username)
);

// Get all existing customer_username from statement_of_accounts
const { data: existingRecords } = await supabase
    .from('statement_of_accounts')
    .select('customer_username');

const existingUsernames = new Set(existingRecords?.map(r => r.customer_username) || []);

// Filter out customers already in statement_of_accounts
const newUsernames = availableUsernames.filter(
    username => !existingUsernames.has(username)
);

// Select exactly {limit} records
const selectedUsernames = newUsernames.slice(0, limit);
```

### Step 6: Return Response
```javascript
return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
        success: true,
        customer_usernames: selectedUsernames,
        total: selectedUsernames.length,
        timestamp: new Date().toISOString()
    })
};
```

### Step 7: Update Error Message
**Location:** Line 991
```javascript
message: 'Supported actions: "customers_only", "invoices", "start"'
```

## Files to Modify
- `netlify/functions/statement_of_accounts/generate_invoices_statements.js`

## Testing Considerations
1. Test with limit=1, limit=5, limit=10
2. Verify customers with negative balance are excluded
3. Verify customers processed today are excluded
4. Verify customers already in statement_of_accounts are excluded
5. Verify only customers with outstanding orders are returned

## Error Handling
- Validate `limit` is a positive integer
- Handle Supabase connection errors
- Handle API fetch errors
- Return empty array if no customers match criteria
