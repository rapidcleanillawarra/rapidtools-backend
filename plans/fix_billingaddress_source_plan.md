# Fix BillingAddress Source for PDF Generation

## Problem
Currently, the `invoices` action in [`statement_of_accounts/generate_invoices_statements.js`](netlify/functions/statement_of_accounts/generate_invoices_statements.js) uses `order.BillingAddress` to derive `pdf_customer_name`. This is incorrect - it should use the customer's current `BillingAddress` from the customer API.

## Solution
Modify the `invoices` action to:
1. First fetch customer data for each valid customer from the customer API
2. Store the customer's BillingAddress
3. Then fetch orders
4. Use the customer's BillingAddress (not order's) for PDF generation

## Implementation Steps

### Step 1: Create a helper function to fetch single customer
Add a function to fetch customer data by username from the customer API.

```javascript
/**
 * Fetch customer data by username from Power Automate API
 * @param {string} username - Customer username
 * @returns {Object|null} Customer data or null if not found
 */
const fetchCustomerByUsername = async (username) => {
    const API_URL = 'https://default61576f99244849ec8803974b47673f.57.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/ef89e5969a8f45778307f167f435253c/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=pPhk80gODQOi843ixLjZtPPWqTeXIbIt9ifWZP6CJfY';

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                Filter: {
                    Username: username,
                    OutputSelector: [
                        "Username",
                        "EmailAddress",
                        "BillingAddress",
                        "AccountBalance"
                    ]
                },
                action: "GetCustomer"
            })
        });

        if (!response.ok) {
            console.error(`Failed to fetch customer ${username}: ${response.status}`);
            return null;
        }

        const data = await response.json();
        const customers = data?.Customer || [];
        return customers.length > 0 ? customers[0] : null;
    } catch (error) {
        console.error(`Error fetching customer ${username}:`, error);
        return null;
    }
};
```

### Step 2: Modify the `invoices` action
Update the `invoices` action to fetch customer data before fetching orders:

```javascript
} else if (action === 'invoices') {
    const { customers = [] } = requestBody;

    console.log('Invoices action - customers received:', customers);

    // Validate customers array
    if (!Array.isArray(customers) || customers.length === 0) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                success: false,
                error: 'Invalid customers parameter',
                message: 'customers must be a non-empty array of usernames'
            })
        };
    }

    // Filter out invalid usernames
    const validCustomers = customers.filter(username =>
        username && typeof username === 'string' && username.trim() !== '' && username !== 'N/A'
    );

    console.log('Valid customers after filtering:', validCustomers);

    if (validCustomers.length === 0) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                success: false,
                error: 'No valid customers',
                message: 'All provided usernames were invalid or N/A'
            })
        };
    }

    // NEW: Fetch customer data for each valid customer
    console.log('Fetching customer data for each customer...');
    const customerDataMap = {};
    
    for (const username of validCustomers) {
        const customerData = await fetchCustomerByUsername(username);
        if (customerData) {
            customerDataMap[username] = customerData;
            console.log(`Fetched customer data for: ${username}`);
        } else {
            console.warn(`No customer data found for: ${username}`);
        }
    }

    // Fetch orders for specified customers
    const API_URL = 'https://default61576f99244849ec8803974b47673f.57.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/ef89e5969a8f45778307f167f435253c/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=pPhk80gODQOi843ixLjZtPPWqTeXIbIt9ifWZP6CJfY';

    console.log(`Fetching orders for customers: ${validCustomers.join(', ')}`);

    let ordersApiResponse;

    try {
        ordersApiResponse = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                Filter: {
                    Username: validCustomers,
                    OrderStatus: ['Dispatched'],
                    PaymentStatus: ['Pending', 'PartialPaid'],
                    OutputSelector: [
                        'ID',
                        'Username',
                        'Email',
                        'GrandTotal',
                        'OrderPayment',
                        'DatePaymentDue',
                        'BillingAddress'
                    ]
                },
                action: 'GetOrder'
            })
        });
    } catch (fetchError) {
        console.error('Orders API fetch error:', fetchError);
        throw new Error(`Failed to fetch orders from Power Automate API: ${fetchError.message}`);
    }

    // Process orders response
    if (!ordersApiResponse.ok) {
        throw new Error(`Orders API request failed with status ${ordersApiResponse.status}`);
    }

    const ordersApiData = await ordersApiResponse.json();
    let orders = ordersApiData?.Order || [];

    console.log(`Fetched ${orders.length} orders from API`);

    // Filter orders by outstanding amount
    orders = orders.filter(order => {
        const grandTotal = parseFloat(order.GrandTotal || 0);
        const paymentsSum = order.OrderPayment && Array.isArray(order.OrderPayment)
            ? order.OrderPayment.reduce((sum, payment) => sum + parseFloat(payment.Amount || 0), 0)
            : 0;
        const outstandingAmount = grandTotal - paymentsSum;

        if (grandTotal === 0 && outstandingAmount <= 0.01) {
            return false;
        }
        return true;
    });

    console.log(`After filtering: ${orders.length} orders remaining`);

    // Group orders by customer and apply limit
    const customersWithInvoices = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    orders.forEach(order => {
        const username = order.Username;
        if (!username || !customers.includes(username)) return;

        // NEW: Get BillingAddress from customer API data, not from order
        const customerApiData = customerDataMap[username];
        const billingAddress = customerApiData?.BillingAddress || {};
        
        // NEW: Use customer API's BillingAddress for pdf_customer_name
        const pdfCustomerName = formatCustomerNameFromBillingAddress(billingAddress);

        if (!customersWithInvoices[username]) {
            customersWithInvoices[username] = {
                customer_username: username,
                email: customerApiData?.EmailAddress || order.Email || '',
                billing_address: billingAddress,
                pdf_customer_name: pdfCustomerName,
                total_orders: 0,
                total_balance: 0,
                due_invoice_balance: 0,
                invoices: []
            };
        }

        const grandTotal = parseFloat(order.GrandTotal || 0);
        const paymentsSum = order.OrderPayment && Array.isArray(order.OrderPayment)
            ? order.OrderPayment.reduce((sum, payment) => sum + parseFloat(payment.Amount || 0), 0)
            : 0;
        const outstandingAmount = grandTotal - paymentsSum;

        let isPastDue = false;
        if (order.DatePaymentDue) {
            const dueDate = new Date(order.DatePaymentDue);
            dueDate.setHours(0, 0, 0, 0);
            isPastDue = dueDate < today;
        }

        customersWithInvoices[username].total_orders += 1;
        customersWithInvoices[username].total_balance += outstandingAmount;

        if (isPastDue) {
            customersWithInvoices[username].due_invoice_balance += outstandingAmount;
        }

        customersWithInvoices[username].invoices.push({
            id: order.ID,
            grandTotal: grandTotal,
            payments: order.OrderPayment || [],
            outstandingAmount: outstandingAmount,
            datePaymentDue: order.DatePaymentDue || null,
            isPastDue: isPastDue
        });
    });

    // Convert to array
    const resultCustomers = Object.values(customersWithInvoices).map(customer => ({
        ...customer,
        invoices: customer.invoices
    }));

    console.log(`Returning ${resultCustomers.length} customers with their invoices`);

    const timestamp = new Date().toISOString();

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            success: true,
            message: 'Customer invoices fetched successfully',
            customers: resultCustomers,
            requested_customers: customers,
            valid_customers: validCustomers,
            timestamp
        })
    };
}
```

## Summary of Changes

| Location | Before | After |
|----------|--------|-------|
| `pdf_customer_name` source | `order.BillingAddress` | `customerApiData.BillingAddress` |
| `billing_address` source | `order.BillingAddress` | `customerApiData.BillingAddress` |
| `email` source | `order.Email` | `customerApiData.EmailAddress` \|\| `order.Email` |
| API calls | Only order API | Customer API first, then order API |

## Testing Checklist
- [ ] Verify BillingAddress is now coming from customer API
- [ ] Verify pdf_customer_name is correctly formatted from customer BillingAddress
- [ ] Verify email is from customer API
- [ ] Test with customers that have incomplete BillingAddress
- [ ] Test with customers that have no orders
